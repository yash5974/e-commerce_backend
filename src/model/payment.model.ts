import { Document, Schema, model } from "mongoose";
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
  providerPaymentId?: string;
  providerOrderId?: string;
  providerClientSecret?: string;
  status: PaymentStatus;
  amount: number;
  refundedAmount: number;
  idempotencyKey: string;
  userId: ObjectId;
}

const paymentSchema = new Schema<IPayment>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
    },

    providerPaymentId: {
      type: String,
    },

    providerOrderId: {
      type: String,
    },

    providerClientSecret: {
      type: String,
    },

    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    refundedAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    idempotencyKey: {
      type: String,
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

/*
 * Provider payment ID is optional for Razorpay until
 * the payment is actually captured.
 */
paymentSchema.index(
  {
    provider: 1,
    providerPaymentId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      providerPaymentId: {
        $exists: true,
        $type: "string",
      },
    },
  },
);

paymentSchema.index(
  {
    userId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  },
);

/*
 * Only one active CREATED payment attempt can exist
 * for an order.
 */
paymentSchema.index(
  {
    orderId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: PaymentStatus.CREATED,
    },
  },
);

/*
 * Razorpay order ID exists before Razorpay payment ID.
 */
paymentSchema.index(
  {
    provider: 1,
    providerOrderId: 1,
  },
  {
    unique: true,
    sparse: true,
  },
);

export const PaymentModel = model<IPayment>("Payment", paymentSchema);
