import Stripe from "stripe";

import { environment } from "../config/env.js";
import { ConflictError } from "../errors/domain.errors.js";
import { PaymentProvider } from "../model/payment.model.js";
import { toPaise } from "./razorpay.gateway.js";

import type {
  CreateGatewayIntentInput,
  CreateRetryIntentInput,
  GatewayIntentResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from "./payment.gateway.types.js";

const stripeSecretKey = environment.stripe_secret_key;
const stripeWebhookSecret = environment.stripe_webhook_secret;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is not configured");
}

if (!stripeWebhookSecret) {
  throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2026-07-29.dahlia",
});

export async function createStripeIntent(
  input: CreateGatewayIntentInput,
): Promise<GatewayIntentResult> {
  const { amount, orderId, idempotencyKey } = input;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ConflictError("Invalid payment amount");
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: toPaise(amount),
      currency: "inr",
      metadata: {
        orderId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    },
    {
      idempotencyKey,
    },
  );

  if (!intent.id) {
    throw new Error("Stripe returned an invalid payment intent");
  }

  return {
    providerPaymentId: intent.id,
    providerClientSecret: intent.client_secret ?? undefined,
  };
}

export async function createStripeRetryIntent(
  input: CreateRetryIntentInput,
): Promise<GatewayIntentResult> {
  const { amount, orderId, idempotencyKey } = input;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ConflictError("Invalid payment amount");
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: toPaise(amount),
      currency: "inr",
      metadata: {
        orderId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    },
    {
      idempotencyKey,
    },
  );

  if (!intent.id) {
    throw new Error("Stripe returned an invalid payment intent");
  }

  return {
    providerPaymentId: intent.id,
    providerClientSecret: intent.client_secret ?? undefined,
  };
}

export function constructStripeWebhookEvent(
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    stripeWebhookSecret,
  );
}

export async function refundStripePayment(
  input: RefundPaymentInput,
): Promise<RefundPaymentResult> {
  const refund = await stripe.refunds.create(
    {
      payment_intent: input.providerPaymentId,
      amount: toPaise(input.amount),
      metadata: {
        reason: input.reason,
      },
    },
    {
      idempotencyKey: input.idempotencyKey,
    },
  );

  if (!refund.id) {
    throw new Error("Stripe returned an invalid refund");
  }

  return {
    providerRefundId: refund.id,
  };
}

export const stripeProvider = PaymentProvider.STRIPE;
