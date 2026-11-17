import { Document, Schema, model } from "mongoose";
import { BaseDocument, ObjectId } from "./base.types.js";

export enum RefundStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export interface IRefund extends BaseDocument, Document {
  paymentId: ObjectId;
  orderId: ObjectId;
  userId: ObjectId;

  provider: string;
  providerRefundId?: string;

  amount: number;
  reason: string;

  status: RefundStatus;

  idempotencyKey: string;
}

const refundSchema = new Schema<IRefund>(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      required: true,
    },

    providerRefundId: {
      type: String,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: Object.values(RefundStatus),
      required: true,
    },

    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
  },
  {
    timestamps: true,
  },
);

// One idempotent operation per admin/user + key.
refundSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

// Useful for payment refund history.
refundSchema.index({ paymentId: 1, createdAt: -1 });

// Useful for reconciliation.
refundSchema.index({ status: 1, createdAt: 1 });

export const RefundModel = model<IRefund>("Refund", refundSchema);
