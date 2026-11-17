import { Types } from "mongoose";
import { z } from "zod";
import { PaymentProvider } from "../model/payment.model.js";

export const createPaymentIntentSchema = z
  .object({
    orderId: z
      .string()
      .trim()
      .refine((value) => Types.ObjectId.isValid(value), "Invalid orderId"),

    provider: z.enum([PaymentProvider.STRIPE, PaymentProvider.RAZORPAY]),
  })
  .strict();

export type CreatePaymentIntentInput = z.infer<
  typeof createPaymentIntentSchema
>;

export const getPaymentParamsSchema = z.object({
  paymentId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid payment ID"),
});

export type GetPaymentParams = z.infer<typeof getPaymentParamsSchema>;

export const getPaymentStatusParamsSchema = z.object({
  paymentId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid payment ID"),
});

export type GetPaymentStatusParams = z.infer<
  typeof getPaymentStatusParamsSchema
>;

export const retryPaymentParamsSchema = z.object({
  paymentId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid payment ID"),
});

export const retryPaymentBodySchema = z
  .object({
    provider: z.enum(
      Object.values(PaymentProvider) as [PaymentProvider, ...PaymentProvider[]],
    ),
  })
  .strict();

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, "Idempotency-Key is required")
  .max(266, "Idempotency-Key is too long");

export const refundPaymentParamsSchema = z
  .object({
    paymentId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid paymentId"),
  })
  .strict();

export const refundPaymentBodySchema = z
  .object({
    amount: z
      .number()
      .positive("Refund amount must be greater than zero")
      .refine(
        (value) => Number.isInteger(value * 100),
        "Refund amount must have at most 2 decimal places",
      )
      .optional(),

    reason: z
      .string()
      .trim()
      .min(1, "Refund reason is required")
      .max(500, "Refund reason cannot exceed 500 characters"),
  })
  .strict();
