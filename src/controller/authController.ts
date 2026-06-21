import crypto from "crypto";
import { Request, Response } from "express";
import JWT from "jsonwebtoken";
import mongoose from "mongoose";
import { jwtConfig } from "../config/jwt.config";
import { RefreshPayload } from "../config/types/auth.interface";
import { RefreshTokenModel } from "../modal/refreshToken.model";
import { UserModel } from "../modal/user.model";
import { asyncHandler } from "../utils/asyncHandler";
import { hashToken, signAccessToken, signRefreshToken } from "../utils/jwt";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req;
  if (!user) throw new Error("User Not found");

  const accessToken = signAccessToken({
    userId: user.userId,
    role: user.role,
  });

  const tokenId = crypto.randomUUID();

  const refreshToken = signRefreshToken({
    userId: user.userId,
    tokenId,
  });

  const tokenHash = hashToken(refreshToken);

  // 🔥 Idempotent device login (remove old session for same device)
  await RefreshTokenModel.deleteMany({
    userId: user.userId,
  });

  await RefreshTokenModel.create({
    userId: user.userId,
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
    payload = JWT.verify(refreshToken, jwtConfig.publicKey) as RefreshPayload;
  } catch {
    throw new Error("Invalid refresh token");
  }

  const tokenHash = hashToken(refreshToken);
  const userId = new mongoose.Types.ObjectId(payload.userId);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingToken = await RefreshTokenModel.findOne({
      tokenHash,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    })
      .select("_id tokenId userId")
      .session(session);

    // 🔥 Reuse / expired → revoke all sessions
    if (!existingToken) {
      await RefreshTokenModel.updateMany(
        { userId: userId },
        { $set: { isRevoked: true } },
        { session },
      );
      throw new Error("Token reuse detected or expired");
    }

    // 🔥 Anti-replay check
    if (existingToken.tokenId !== payload.tokenId) {
      await RefreshTokenModel.updateMany(
        { userId: userId },
        { $set: { isRevoked: true } },
        { session },
      );
      throw new Error("Token tampering detected");
    }

    // 🔥 Rotate (revoke old)
    await RefreshTokenModel.updateOne(
      { _id: existingToken._id },
      { $set: { isRevoked: true } },
      { session },
    );

    const newTokenId = crypto.randomUUID();

    const newRefreshToken = signRefreshToken({
      userId: userId.toString(),
      tokenId: newTokenId,
    });

    const newHash = hashToken(newRefreshToken);

    await RefreshTokenModel.create(
      [
        {
          userId: userId,
          tokenId: newTokenId,
          tokenHash: newHash,
          isRevoked: false,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ],
      { session },
    );

    await session.commitTransaction();

    // 🔥 RBAC (index-covered)
    const user = await UserModel.findById(payload.userId).select("role");
    if (!user) throw new Error("User not found");

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

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new Error("Refresh token required");

  const tokenHash = hashToken(refreshToken);

  await RefreshTokenModel.updateOne(
    { tokenHash, isRevoked: false },
    { $set: { isRevoked: true } },
  );

  res.json({ success: true });
});
