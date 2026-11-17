import { PaymentProvider } from "../model/payment.model.js";

import {
  createStripeIntent,
  createStripeRetryIntent,
  refundStripePayment,
} from "./stripe.gateway.js";

import {
  createRazorpayIntent,
  createRazorpayRetryIntent,
  refundRazorpayPayment,
} from "./razorpay.gateway.js";

import type {
  CreateGatewayIntentInput,
  CreateRetryIntentInput,
  GatewayIntentResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from "./payment.gateway.types.js";

export type {
  CreateGatewayIntentInput,
  CreateRetryIntentInput,
  GatewayIntentResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from "./payment.gateway.types.js";

export async function createGatewayIntent(
  provider: PaymentProvider,
  input: CreateGatewayIntentInput,
): Promise<GatewayIntentResult> {
  switch (provider) {
    case PaymentProvider.STRIPE:
      return createStripeIntent(input);

    case PaymentProvider.RAZORPAY:
      return createRazorpayIntent(input);

    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}

export async function createGatewayRetryIntent(
  input: CreateRetryIntentInput,
): Promise<GatewayIntentResult> {
  switch (input.provider) {
    case PaymentProvider.STRIPE:
      return createStripeRetryIntent(input);

    case PaymentProvider.RAZORPAY:
      return createRazorpayRetryIntent(input);

    default:
      throw new Error(`Unsupported payment provider: ${input.provider}`);
  }
}

export async function refundPayment(
  input: RefundPaymentInput,
): Promise<RefundPaymentResult> {
  switch (input.provider) {
    case PaymentProvider.STRIPE:
      return refundStripePayment(input);

    case PaymentProvider.RAZORPAY:
      return refundRazorpayPayment(input);

    default:
      throw new Error(`Unsupported payment provider: ${input.provider}`);
  }
}
