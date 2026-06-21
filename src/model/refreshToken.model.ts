import { Document, model, Schema, Types } from "mongoose";

export interface IRefreshToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  tokenId: string;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Types.ObjectId,
      required: true,
      ref: "User",
    },

    tokenHash: {
      type: String,
      required: true,
    },

    isRevoked: {
      type: Boolean,
      default: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
    tokenId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// INDEX
refreshTokenSchema.index({
  tokenHash: 1,
  isRevoked: 1,
  expiresAt: 1,
});
refreshTokenSchema.index({
  userId: 1,
  isRevoked: 1,
});
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ tokenId: 1 }, { unique: true });

export const RefreshTokenModel = model<IRefreshToken>(
  "RefreshToken",
  refreshTokenSchema,
);
