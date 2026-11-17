import { PaymentProvider } from "../model/payment.model.js";

export interface CreateGatewayIntentInput {
  amount: number;
  orderId: string;
  idempotencyKey: string;
}

export interface CreateRetryIntentInput {
  provider: PaymentProvider;
  amount: number;
  orderId: string;
  idempotencyKey: string;
}

export interface GatewayIntentResult {
  providerPaymentId?: string;
  providerOrderId?: string;
  providerClientSecret?: string;
}

export interface RefundPaymentInput {
  provider: PaymentProvider;
  providerPaymentId: string;
  amount: number;
  idempotencyKey: string;
  reason: string;
}

export interface RefundPaymentResult {
  providerRefundId: string;
}
