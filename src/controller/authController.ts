import bcrypt from "bcrypt";
import crypto from "crypto";
import { Request, Response } from "express";
import JWT from "jsonwebtoken";
import mongoose from "mongoose";
import { jwtConfig } from "../config/jwt.config.js";
import { RefreshPayload } from "../config/types/auth.interface.js";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../errors/domain.errors.js";
import { RefreshTokenModel } from "../model/refreshToken.model.js";
import { UserModel } from "../model/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CacheService } from "../utils/cache.js";
import { hashToken, signAccessToken, signRefreshToken } from "../utils/jwt.js";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  // 🔒 Validation
  if (!name) throw new Error("Name is required");
  if (!email) throw new Error("Email is required");
  if (!password) throw new Error("Password is required");

  // 🔒 Normalize email (index consistency)
  const normalizedEmail = email.toLowerCase().trim();

  // 🔥 Index-covered query
  const existingUser = await UserModel.findOne({
    email: normalizedEmail,
  }).select("_id");

  if (existingUser) throw new Error("User already exists");

  // 🔒 Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await UserModel.create({
    name,
    email: normalizedEmail,
    passwordHash,
  });
  if (!user) throw new Error("User not registered");

  res.status(201).json({
    success: true,
    data: user,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email) throw new Error("Email Not found");
  if (!password) throw new Error("Password Not found");

  const user = await UserModel.findOne({ email }).select(
    "_id role passwordHash",
  );
  if (!user) throw new Error("User Not found");

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  const userId = user._id.toString();

  const accessToken = signAccessToken({
    userId,
    role: user.role,
  });

  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({
    userId,
    tokenId,
  });

  const tokenHash = hashToken(refreshToken);

  // ✅ Store refresh token
  await RefreshTokenModel.create({
    userId: userId,
    tokenId,
    tokenHash,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.json({
    success: true,
    data: { accessToken, refreshToken },
  });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new Error("Refresh token required");

  let payload: RefreshPayload;

  try {
    payload = JWT.verify(refreshToken, jwtConfig.publicKey, {
      algorithms: ["RS256"],
    }) as RefreshPayload;
  } catch {
    throw new Error("Invalid refresh token");
  }

  const tokenHash = hashToken(refreshToken);
  const userId = new mongoose.Types.ObjectId(payload.userId);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ INDEX-COVERED QUERY
    const existingToken = await RefreshTokenModel.findOne({
      tokenHash,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    })
      .select("_id tokenId userId")
      .session(session);

    if (!existingToken) {
      // ✅ REVOKE ONLY ACTIVE TOKENS (index: userId + isRevoked)
      await RefreshTokenModel.updateMany(
        { userId, isRevoked: false },
        { $set: { isRevoked: true } },
        { session },
      );
      throw new Error("Token reuse detected or expired");
    }

    // ✅ STRICT MATCH (anti-tampering)
    if (existingToken.tokenId !== payload.tokenId) {
      await RefreshTokenModel.updateMany(
        { userId, isRevoked: false },
        { $set: { isRevoked: true } },
        { session },
      );
      throw new Error("Token tampering detected");
    }

    // ✅ ROTATE (atomic revoke)
    const revokeResult = await RefreshTokenModel.updateOne(
      { _id: existingToken._id, isRevoked: false },
      { $set: { isRevoked: true } },
      { session },
    );

    // ✅ IDEMPOTENCY SAFE
    if (revokeResult.modifiedCount === 0) {
      throw new Error("Token already used");
    }

    // ✅ CREATE NEW TOKEN
    const newTokenId = crypto.randomUUID();

    const newRefreshToken = signRefreshToken({
      userId: userId.toString(),
      tokenId: newTokenId,
    });

    const newHash = hashToken(newRefreshToken);

    await RefreshTokenModel.create(
      [
        {
          userId,
          tokenId: newTokenId,
          tokenHash: newHash,
          isRevoked: false,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ],
      { session },
    );

    // ✅ GET USER INSIDE TRANSACTION (CONSISTENCY)
    const user = await UserModel.findById(userId)
      .select("role")
      .session(session);

    if (!user) throw new Error("User not found");

    await session.commitTransaction();

    const newAccessToken = signAccessToken({
      userId: userId.toString(),
      role: user.role,
    });

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

export const getCurrentUser = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { userId } = req.user;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new UnauthorizedError("Invalid authentication payload");
    }

    const cacheKey = `user:profile:${userId}`;

    const cachedUser = await CacheService.get(cacheKey);

    if (cachedUser) {
      return res.status(200).json({
        success: true,
        message: "Current user fetched successfully",
        data: cachedUser,
      });
    }

    const user = await UserModel.findById(userId)
      .select("_id fullName email role isActive createdAt updatedAt")
      .lean();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!user.isActive) {
      throw new ForbiddenError("Account is inactive");
    }

    await CacheService.set(cacheKey, user, 300);

    return res.status(200).json({
      success: true,
      message: "Current user fetched successfully",
      data: user,
    });
  },
);

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new Error("Refresh token required");

  const tokenHash = hashToken(refreshToken);

  const result = await RefreshTokenModel.updateOne(
    { tokenHash, isRevoked: false, expiresAt: { $gt: new Date() } },
    { $set: { isRevoked: true } },
  );

  if (result.modifiedCount === 0) {
    throw new Error("Invalid or already logged out");
  }

  res.json({ success: true });
});
