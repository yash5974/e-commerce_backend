import crypto from "node:crypto";
import Razorpay from "razorpay";

import { environment } from "../config/env.js";
import { ConflictError } from "../errors/domain.errors.js";
import { PaymentProvider } from "../model/payment.model.js";

import type {
  CreateGatewayIntentInput,
  CreateRetryIntentInput,
  GatewayIntentResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from "./payment.gateway.types.js";

const razorpayKeyId = environment.razorpay_key_id;
const razorpayKeySecret = environment.razorpay_key_secret;
const razorpayWebhookSecret = environment.razorpay_webhook_secret;

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error("RAZORPAY credentials are not configured");
}

if (!razorpayWebhookSecret) {
  throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured");
}

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

export function toPaise(amountInRupees: number): number {
  if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
    throw new ConflictError("Invalid payment amount");
  }

  const paise = Math.round(amountInRupees * 100);

  if (
    !Number.isSafeInteger(paise) ||
    Math.abs(amountInRupees * 100 - paise) > 1e-7
  ) {
    throw new ConflictError(
      "Payment amount must have at most 2 decimal places",
    );
  }

  return paise;
}

function createRazorpayReceipt(
  orderId: string,
  idempotencyKey?: string,
): string {
  const value = idempotencyKey ? `${orderId}:${idempotencyKey}` : orderId;

  return `pay_${crypto
    .createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)}`;
}

export async function createRazorpayIntent(
  input: CreateGatewayIntentInput,
): Promise<GatewayIntentResult> {
  const { amount, orderId, idempotencyKey } = input;

  const order = await razorpay.orders.create({
    amount: toPaise(amount),
    currency: "INR",
    receipt: createRazorpayReceipt(orderId, idempotencyKey),
    notes: {
      orderId,
      idempotencyKeyHash: crypto
        .createHash("sha256")
        .update(idempotencyKey)
        .digest("hex"),
    },
  });

  if (!order.id) {
    throw new Error("Razorpay returned an invalid order");
  }

  return {
    providerOrderId: order.id,
  };
}

export async function createRazorpayRetryIntent(
  input: CreateRetryIntentInput,
): Promise<GatewayIntentResult> {
  const { amount, orderId, idempotencyKey } = input;

  const idempotencyKeyHash = crypto
    .createHash("sha256")
    .update(idempotencyKey)
    .digest("hex");

  const order = await razorpay.orders.create({
    amount: toPaise(amount),
    currency: "INR",
    receipt: createRazorpayReceipt(orderId, idempotencyKey),
    notes: {
      orderId,
      idempotencyKeyHash,
    },
  });

  if (!order.id) {
    throw new Error("Razorpay returned an invalid order");
  }

  return {
    providerOrderId: order.id,
  };
}

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string,
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", razorpayWebhookSecret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function refundRazorpayPayment(
  input: RefundPaymentInput,
): Promise<RefundPaymentResult> {
  const refund = await razorpay.payments.refund(input.providerPaymentId, {
    amount: toPaise(input.amount),
    notes: {
      reason: input.reason,
      idempotencyKeyHash: crypto
        .createHash("sha256")
        .update(input.idempotencyKey)
        .digest("hex"),
    },
  });

  if (!refund.id) {
    throw new Error("Razorpay returned an invalid refund");
  }

  return {
    providerRefundId: refund.id,
  };
}

export const razorpayProvider = PaymentProvider.RAZORPAY;
