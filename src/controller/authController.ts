import bcrypt from "bcrypt";
import crypto from "crypto";
import { Request, Response } from "express";
import mongoose from "mongoose";
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
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";

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
    "_id role passwordHash name email",
  );
  if (!user) throw new Error("User Not found");

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  const userId = user._id.toString();

  const accessToken = signAccessToken({
    userId,
    role: user.role,
    type: "ACCESS",
  });

  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({
    userId,
    tokenId,
    type: "REFRESH",
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

  const activeuser = await UserModel.findByIdAndUpdate(user._id, {
    isActive: true,
  });

  if (!activeuser) throw new Error("Error while logging in");

  const userInfo = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  res.json({
    success: true,
    data: { accessToken, refreshToken, user: userInfo },
    message: "User logged in successfully",
  });
});

export const refreshToken = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as {
      refreshToken?: unknown;
    };

    if (typeof refreshToken !== "string" || refreshToken.trim().length === 0) {
      throw new UnauthorizedError("Refresh token is required.");
    }

    let payload: RefreshPayload;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token.");
    }

    if (payload.type !== "REFRESH") {
      throw new UnauthorizedError("Invalid refresh token.");
    }

    if (!payload.userId || !payload.tokenId) {
      throw new UnauthorizedError("Invalid refresh token payload.");
    }

    if (!mongoose.isValidObjectId(payload.userId)) {
      throw new UnauthorizedError("Invalid refresh token payload.");
    }

    const userId = new mongoose.Types.ObjectId(payload.userId);

    const tokenHash = hashToken(refreshToken);

    const session = await mongoose.startSession();

    try {
      let newAccessToken: string = "";
      let newRefreshToken: string = "";

      await session.withTransaction(async () => {
        /**
         * Find the exact active refresh token.
         *
         * Required index:
         * { tokenHash: 1, isRevoked: 1, expiresAt: 1 }
         */
        const existingToken = await RefreshTokenModel.findOne({
          tokenHash,
          isRevoked: false,
          expiresAt: {
            $gt: new Date(),
          },
        })
          .select("_id tokenId userId")
          .session(session)
          .lean();

        /**
         * Token does not exist, is revoked,
         * or has expired.
         *
         * Revoke all active sessions for this user
         * because this may represent token reuse.
         */
        if (!existingToken) {
          await RefreshTokenModel.updateMany(
            {
              userId,
              isRevoked: false,
            },
            {
              $set: {
                isRevoked: true,
              },
            },
            {
              session,
            },
          );

          throw new UnauthorizedError(
            "Refresh token is invalid or has already been used.",
          );
        }

        /**
         * Ensure the JWT tokenId matches
         * the database token record.
         */
        if (existingToken.tokenId !== payload.tokenId) {
          await RefreshTokenModel.updateMany(
            {
              userId,
              isRevoked: false,
            },
            {
              $set: {
                isRevoked: true,
              },
            },
            {
              session,
            },
          );

          throw new UnauthorizedError("Refresh token is invalid.");
        }

        /**
         * Atomically revoke the current token.
         *
         * This protects against concurrent refresh requests.
         */
        const revokeResult = await RefreshTokenModel.updateOne(
          {
            _id: existingToken._id,
            isRevoked: false,
          },
          {
            $set: {
              isRevoked: true,
            },
          },
          {
            session,
          },
        );

        if (revokeResult.modifiedCount !== 1) {
          throw new UnauthorizedError("Refresh token has already been used.");
        }

        /**
         * Get the current user state inside
         * the same transaction.
         */
        const user = await UserModel.findById(userId)
          .select("_id role isActive isDeleted")
          .session(session)
          .lean();

        if (!user || !user.isActive) {
          throw new UnauthorizedError("User account is unavailable.");
        }

        /**
         * Generate rotated refresh token.
         */
        const newTokenId = crypto.randomUUID();

        newRefreshToken = signRefreshToken({
          userId: userId.toString(),
          tokenId: newTokenId,
          type: "REFRESH",
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
          {
            session,
          },
        );

        /**
         * Access token is generated from the
         * current user role.
         */
        newAccessToken = signAccessToken({
          userId: userId.toString(),
          role: user.role,
          type: "ACCESS",
        });
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } finally {
      await session.endSession();
    }
  },
);

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
