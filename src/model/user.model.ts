import { Schema, model, Document } from "mongoose";
import { BaseDocument, SoftDelete } from "./base.types.js";

export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}

export interface IUser extends BaseDocument, SoftDelete, Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// INDEX
userSchema.index({ email: 1 }, { unique: true });

export const UserModel = model<IUser>("User", userSchema);
