import crypto from "crypto";
import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../errors/domain.errors.js";
import {
  InventoryLogModel,
  InventoryLogType,
} from "../model/inventoryLog.model.js";
import { OrderModel, OrderStatus } from "../model/order.model.js";
import {
  PaymentModel,
  PaymentProvider,
  PaymentStatus,
} from "../model/payment.model.js";
import { ProductModel } from "../model/product.model.js";
import { EmailService } from "../utils/email.service.js";
import { PaymentGateway } from "../utils/jwt.js";

export const createPaymentIntent = async (req: Request, res: Response) => {
  const { orderId } = req.body;

  const order = await OrderModel.findById(orderId);

  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  if (!order.userId.equals(req.user!.userId)) {
    throw new ForbiddenError("Access denied.");
  }

  if (order.status === OrderStatus.PAID) {
    throw new ForbiddenError("Order is already paid.");
  }

  /**
   * Reuse existing CREATED payment.
   */
  const existingPayment = await PaymentModel.findOne({
    orderId: order._id,
    status: PaymentStatus.CREATED,
  });

  if (existingPayment) {
    return res.status(200).json({
      success: true,
      message: "Payment intent fetched successfully.",
      data: {
        paymentId: existingPayment._id,
        provider: existingPayment.provider,
        providerPaymentId: existingPayment.providerPaymentId,
        amount: existingPayment.amount,
        clientSecret: existingPayment.idempotencyKey,
      },
    });
  }

  /**
   * Mock gateway
   */
  const gateway = await PaymentGateway.createIntent(order.totalAmount);

  const payment = await PaymentModel.create({
    orderId: order._id,
    provider: PaymentProvider.STRIPE,
    providerPaymentId: gateway.providerPaymentId,
    status: PaymentStatus.CREATED,
    amount: order.totalAmount,
    idempotencyKey: crypto.randomUUID(),
    userId: order.userId,
  });

  return res.status(201).json({
    success: true,
    message: "Payment intent created successfully.",
    data: {
      paymentId: payment._id,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      amount: payment.amount,
      clientSecret: gateway.clientSecret,
    },
  });
};

export const paymentWebhook = async (req: Request, res: Response) => {
  const { provider, providerPaymentId, amount, signature } = req.body;

  /**
   * Replace this with the real gateway secret.
   */
  const secret =
    provider === PaymentProvider.STRIPE
      ? process.env.STRIPE_WEBHOOK_SECRET!
      : process.env.RAZORPAY_WEBHOOK_SECRET!;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${providerPaymentId}:${amount}`)
    .digest("hex");

  if (expectedSignature !== signature) {
    throw new ForbiddenError("Invalid webhook signature.");
  }

  const session = await mongoose.startSession();

  let orderEmailUserId: string | null = null;
  let orderAmount = 0;

  try {
    await session.withTransaction(async () => {
      const payment = await PaymentModel.findOne({
        providerPaymentId,
        provider,
      }).session(session);

      if (!payment) {
        throw new NotFoundError("Payment not found.");
      }

      /**
       * Idempotency
       */
      if (payment.status === PaymentStatus.SUCCESS) {
        return;
      }

      if (payment.amount !== amount) {
        throw new ConflictError("Payment amount mismatch.");
      }

      const order = await OrderModel.findById(payment.orderId).session(session);

      if (!order) {
        throw new NotFoundError("Order not found.");
      }

      /**
       * Mark payment SUCCESS
       */
      payment.status = PaymentStatus.SUCCESS;
      await payment.save({ session });

      /**
       * Mark order PAID
       */
      order.status = OrderStatus.PAID;
      order.paymentId = payment._id;

      await order.save({ session });

      /**
       * Update Inventory
       */
      for (const item of order.items) {
        const updated = await ProductModel.updateOne(
          {
            _id: item.productId,
            stock: { $gte: item.quantity },
          },
          {
            $inc: {
              stock: -item.quantity,
            },
          },
          {
            session,
          },
        );

        if (updated.modifiedCount === 0) {
          throw new ConflictError(
            `Insufficient inventory for product ${item.productId}`,
          );
        }
      }

      /**
       * Inventory Logs
       */
      await InventoryLogModel.insertMany(
        order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          type: InventoryLogType.ORDER,
        })),
        {
          session,
        },
      );

      orderEmailUserId = order.userId.toString();
      orderAmount = order.totalAmount;
    });
  } finally {
    await session.endSession();
  }

  /**
   * Email should never rollback payment.
   */
  if (orderEmailUserId) {
    try {
      await EmailService.sendOrderPaidEmail({
        userId: orderEmailUserId,
        amount: orderAmount,
      });
    } catch (err) {
      console.error("Failed to send payment email", err);
    }
  }

  return res.status(200).json({
    success: true,
    message: "Payment verified successfully.",
    data: null,
  });
};
