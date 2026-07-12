// utils/paymentWebhookSignature.ts

import crypto from "crypto";
import { PaymentProvider } from "../model/payment.model.js";

export const verifyWebhookSignature = ({
  provider,
  providerPaymentId,
  amount,
  signature,
}: {
  provider: PaymentProvider;
  providerPaymentId: string;
  amount: number;
  signature: string;
}) => {
  const secret =
    provider === PaymentProvider.STRIPE
      ? process.env.STRIPE_WEBHOOK_SECRET!
      : process.env.RAZORPAY_WEBHOOK_SECRET!;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${providerPaymentId}:${amount}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature),
  );
};
