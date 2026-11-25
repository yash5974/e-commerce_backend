import bcrypt from "bcrypt";
import crypto from "crypto";
import { Request, Response } from "express";
import mongoose from "mongoose";
import { RefreshPayload } from "../config/types/auth.interface.js";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../errors/domain.errors.js";
import { RefreshTokenModel } from "../model/refreshToken.model.js";
import { UserModel, UserRole } from "../model/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CacheService } from "../utils/cache.js";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { generateOtp, hashOtp } from "../utils/otp.utils.js";
import { EmailService } from "../services/email.service.js";

export const adminRegister = asyncHandler(
  async (req: Request, res: Response) => {
    // 🔥 Index-covered query
    const existingUser = await UserModel.findOne({
      email: "admin@gmail.com",
    }).select("_id");

    if (existingUser) throw new Error("Admin already exists");

    // 🔒 Hash password
    const passwordHash = await bcrypt.hash("Admin@123", 12);

    const user = await UserModel.create({
      name: "Admin",
      email: "admin@gmail.com",
      role: UserRole.ADMIN,
      passwordHash,
    });
    if (!user) throw new Error("User not registered");

    res.status(201).json({
      success: true,
      data: user,
    });
  },
);

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

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!email) {
      throw new ValidationError("Email is required.");
    }

    const genericResponse = {
      status: 200,
      message:
        "If an account exists with this email, a password reset OTP will be sent.",
    };

    // Find the registered user.
    const user = await UserModel.findOne({ email })
      .select("_id name email")
      .lean()
      .exec();

    // Do not reveal whether an account exists.
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Generate a cryptographically secure OTP.
    const otp = generateOtp();
    const hashedOtp = hashOtp(otp);

    const otpExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

    // Store only the hashed OTP.
    const updatedUser = await UserModel.findOneAndUpdate(
      {
        _id: user._id,
        email: user.email,
      },
      {
        $set: {
          otp: hashedOtp,
          otpExpiresAt,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    )
      .select("_id email")
      .lean()
      .exec();

    if (!updatedUser) {
      throw new Error("Unable to generate password reset OTP.");
    }

    // Send OTP to the registered email address.
    try {
      await EmailService.sendPasswordResetOtpEmail({
        email: updatedUser.email,
        customerName: user.name || "Customer",
        otp,
        expiresInMinutes: 2,
      });
    } catch (error: unknown) {
      // Invalidate the OTP if email delivery fails.
      await UserModel.findOneAndUpdate(
        {
          _id: user._id,
          otp: hashedOtp,
        },
        {
          $unset: {
            otp: 1,
            otpExpiresAt: 1,
          },
        },
        { returnDocument: "after" },
      );

      console.error("Password reset OTP email failed:", error);

      throw new Error("Unable to send password reset email.");
    }

    return res.status(200).json(genericResponse);
  },
);

// export const resetPassword = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const { email, otp } = req.body;

//     if (typeof email !== "string" || !email.trim()) {
//       throw new ValidationError("Email is required.");
//     }

//     if (!Number.isInteger(otp) || otp < 100000 || otp > 999999) {
//       throw new ValidationError("OTP must be a valid 6-digit integer.");
//     }

//     const normalizedEmail = email.trim().toLowerCase();

//     const user = await UserModel.findOne({
//       email: normalizedEmail,
//       isActive: true,
//     })
//       .select("_id email otp otpExpiresAt")
//       .lean()
//       .exec();

//     if (!user) {
//       throw new NotFoundError("User");
//     }

//     if (!user.otp) {
//       throw new ValidationError(
//         "No OTP is available. Please request a new OTP.",
//       );
//     }

//     if (!user.otpExpiresAt || new Date() >= user.otpExpiresAt) {
//       throw new ValidationError("OTP is expired.");
//     }

//     if (otp !== user.otp) {
//       throw new ValidationError("OTP does not match");
//     }

//     res.status(200).json({
//       success: true,
//       message: "OTP verified successfully.",
//       result: { userId: user._id },
//     });
//   },
// );

export const resetPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { email, otp } = req.body;

    // Validate email
    if (typeof email !== "string" || !email.trim()) {
      throw new ValidationError("Email is required.");
    }

    // Validate OTP
    const normalizedOtp =
      typeof otp === "string" ? otp.trim() : String(otp ?? "");

    if (!/^\d{6}$/.test(normalizedOtp)) {
      throw new ValidationError("OTP must be a valid 6-digit code.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Hash submitted OTP
    const hashedOtp = hashOtp(normalizedOtp);

    // Atomically verify and consume OTP
    const user = await UserModel.findOneAndUpdate(
      {
        email: normalizedEmail,
        isActive: true,
        otp: hashedOtp,
        otpExpiresAt: { $gt: new Date() },
      },
      {
        $unset: {
          otp: 1,
          otpExpiresAt: 1,
        },
      },
      {
        new: true,
      },
    )
      .select("_id email")
      .lean()
      .exec();

    if (!user) {
      throw new ValidationError(
        "Invalid or expired OTP. Please request a new OTP.",
      );
    }

    res.status(200).json({
      success: true,
      message: "OTP verified successfully.",
      result: {
        userId: user._id,
      },
    });
  },
);

export const newPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId, newPassword, confirmPassword } = req.body;
    if (!userId) {
      throw new ValidationError("User Id is required");
    }

    if (typeof newPassword !== "string" || !newPassword) {
      throw new ValidationError("New password is required.");
    }

    if (typeof confirmPassword !== "string" || !confirmPassword) {
      throw new ValidationError("Confirm password is required.");
    }

    if (newPassword !== confirmPassword) {
      throw new ValidationError("Passwords do not match.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    /*
     * Atomic password update.
     */
    const user = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        isActive: true,
      },
      {
        $set: {
          passwordHash,
          otp: null,
          expiresAt: null,
        },
      },
      {
        returnDocument: "after",
        projection: {
          _id: 1,
        },
      },
    )
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedError("User not found.");
    }

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully.",
    });
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
      .select("email role isActive name")
      .lean();
    console.log("user: ", user);

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

export const updateProfile = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required.");
    }

    const { userId } = req.user;

    if (!mongoose.isValidObjectId(userId)) {
      throw new UnauthorizedError("Invalid authentication payload.");
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new ValidationError("A valid JSON request body is required.");
    }

    const allowedFields = new Set(["name", "email"]);
    const keys = Object.keys(req.body);

    if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
      throw new ValidationError(
        "Provide name or email. Unsupported fields are not allowed.",
      );
    }

    const updates: { name?: string; email?: string } = {};

    if (req.body.name !== undefined) {
      if (
        typeof req.body.name !== "string" ||
        req.body.name.trim().length < 2 ||
        req.body.name.trim().length > 80
      ) {
        throw new ValidationError(
          "Name must contain between 2 and 80 characters.",
        );
      }

      updates.name = req.body.name.trim();
    }

    if (req.body.email !== undefined) {
      if (
        typeof req.body.email !== "string" ||
        req.body.email.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())
      ) {
        throw new ValidationError("A valid email address is required.");
      }

      updates.email = req.body.email.trim().toLowerCase();
    }

    const cacheKey = `user:profile:${userId}`;

    const user = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        isActive: true,
      },
      {
        $set: updates,
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .select("_id name email role isActive")
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundError("Active user not found.");
    }

    try {
      await CacheService.set(
        cacheKey,
        {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
        300,
      );
    } catch (error: unknown) {
      console.error("Failed to refresh profile cache.", error);
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: user,
    });
  },
);

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new Error("Refresh token required");

  const result = await RefreshTokenModel.deleteMany({
    userId: req.user.userId,
  });

  if (!result) {
    throw new Error("Invalid or already logged out");
  }

  res.json({ success: true, message: "User logged out successfully" });
});
