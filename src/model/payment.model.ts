import { Schema, model, Document } from "mongoose";
import { BaseDocument, ObjectId } from "./base.types.js";

export enum PaymentProvider {
  STRIPE = "stripe",
  RAZORPAY = "razorpay",
}

export enum PaymentStatus {
  CREATED = "CREATED",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export interface IPayment extends BaseDocument, Document {
  orderId: ObjectId;
  provider: PaymentProvider;
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  idempotencyKey: string;
  userId: ObjectId;
}

const paymentSchema = new Schema<IPayment>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
    },
    providerPaymentId: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      required: true,
    },
    amount: { type: Number, required: true },
    idempotencyKey: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// INDEXES
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ providerPaymentId: 1 });
paymentSchema.index({ idempotencyKey: 1, userId: 1 });

export const PaymentModel = model<IPayment>("Payment", paymentSchema);
