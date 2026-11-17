// import type { Request, Response } from "express";
// import mongoose from "mongoose";
// import Stripe from "stripe";

// import { ValidationError } from "../errors/domain.errors.js";
// import { verifyRazorpayWebhookSignature } from "../gateways/razorpay.gateway.js";
// import { constructStripeWebhookEvent } from "../gateways/stripe.gateway.js";
// import { OrderModel, OrderStatus } from "../model/order.model.js";
// import {
//   PaymentModel,
//   PaymentProvider,
//   PaymentStatus,
// } from "../model/payment.model.js";
// import {
//   WebhookEventModel,
//   WebhookEventStatus,
//   WebhookProvider,
// } from "../model/webhook-event.model.js";

// function toMinorUnits(value: number): number {
//   return Math.round(value * 100);
// }

// export async function stripeWebhook(
//   req: Request,
//   res: Response,
// ): Promise<Response> {
//   const signature = req.header("Stripe-Signature");

//   if (!signature) {
//     throw new ValidationError("Missing Stripe-Signature header");
//   }

//   if (!Buffer.isBuffer(req.body)) {
//     throw new ValidationError("Stripe webhook requires the raw request body");
//   }

//   let event: Stripe.Event;

//   try {
//     event = constructStripeWebhookEvent(req.body, signature);
//   } catch {
//     throw new ValidationError("Invalid Stripe webhook signature");
//   }

//   const supportedEvents = new Set([
//     "payment_intent.succeeded",
//     "payment_intent.payment_failed",
//   ]);

//   if (!supportedEvents.has(event.type)) {
//     try {
//       await WebhookEventModel.create({
//         provider: WebhookProvider.STRIPE,
//         eventId: event.id,
//         eventType: event.type,
//         status: WebhookEventStatus.PROCESSED,
//       });
//     } catch (error) {
//       if (
//         error instanceof mongoose.mongo.MongoServerError &&
//         error.code === 11000
//       ) {
//         return res.status(200).json({ received: true });
//       }

//       throw error;
//     }

//     return res.status(200).json({ received: true });
//   }

//   const session = await mongoose.startSession();

//   try {
//     let alreadyProcessed = false;

//     await session.withTransaction(async () => {
//       try {
//         await WebhookEventModel.create(
//           [
//             {
//               provider: WebhookProvider.STRIPE,
//               eventId: event.id,
//               eventType: event.type,
//               status: WebhookEventStatus.PROCESSED,
//             },
//           ],
//           { session },
//         );
//       } catch (error) {
//         if (
//           error instanceof mongoose.mongo.MongoServerError &&
//           error.code === 11000
//         ) {
//           alreadyProcessed = true;
//           return;
//         }

//         throw error;
//       }

//       if (alreadyProcessed) {
//         return;
//       }

//       const paymentIntent = event.data.object as Stripe.PaymentIntent;
//       const providerPaymentId = paymentIntent.id;

//       const payment = await PaymentModel.findOne({
//         provider: PaymentProvider.STRIPE,
//         providerPaymentId,
//       })
//         .select("_id orderId userId provider providerPaymentId status amount")
//         .session(session)
//         .lean();

//       if (!payment) {
//         return;
//       }

//       /*
//        * -----------------------------------------------
//        * STRIPE SUCCESS
//        * -----------------------------------------------
//        */
//       if (event.type === "payment_intent.succeeded") {
//         const stripeAmountMinor = paymentIntent.amount_received;
//         const localAmountMinor = toMinorUnits(payment.amount);

//         if (stripeAmountMinor !== localAmountMinor) {
//           throw new ValidationError(
//             "Stripe payment amount does not match local payment amount",
//           );
//         }

//         const updatedPayment = await PaymentModel.findOneAndUpdate(
//           {
//             _id: payment._id,
//             provider: PaymentProvider.STRIPE,
//             providerPaymentId,
//             status: {
//               $in: [PaymentStatus.CREATED, PaymentStatus.SUCCESS],
//             },
//           },
//           {
//             $set: {
//               status: PaymentStatus.SUCCESS,
//             },
//           },
//           {
//             session,
//             new: true,
//           },
//         )
//           .select("_id orderId status")
//           .lean();

//         if (!updatedPayment) {
//           throw new ValidationError(
//             "Payment state cannot transition to SUCCESS",
//           );
//         }

//         /*
//          * PENDING → PAID.
//          */
//         await OrderModel.updateOne(
//           {
//             _id: payment.orderId,
//             userId: payment.userId,
//             status: OrderStatus.PENDING,
//           },
//           {
//             $set: {
//               status: OrderStatus.PAID,
//               paymentId: payment._id,
//             },
//           },
//           { session },
//         );
//       }

//       /*
//        * -----------------------------------------------
//        * STRIPE FAILURE
//        * -----------------------------------------------
//        *
//        * Payment → FAILED
//        * Order remains PENDING so payment can be retried.
//        */
//       if (event.type === "payment_intent.payment_failed") {
//         await PaymentModel.updateOne(
//           {
//             _id: payment._id,
//             provider: PaymentProvider.STRIPE,
//             providerPaymentId,
//             status: PaymentStatus.CREATED,
//           },
//           {
//             $set: {
//               status: PaymentStatus.FAILED,
//             },
//           },
//           { session },
//         );

//         /*
//          * IMPORTANT:
//          * Do NOT change OrderStatus.PENDING → FAILED.
//          *
//          * The order must remain PENDING so retryPayment()
//          * can create another payment attempt.
//          */
//       }
//     });

//     return res.status(200).json({
//       received: true,
//     });
//   } finally {
//     await session.endSession();
//   }
// }

// function getRazorpayPaymentObject(
//   payload: Record<string, unknown>,
// ): Record<string, unknown> | null {
//   const payloadObject = payload.payload;

//   if (!payloadObject || typeof payloadObject !== "object") {
//     return null;
//   }

//   const payment = (payloadObject as Record<string, unknown>).payment;

//   if (!payment || typeof payment !== "object") {
//     return null;
//   }

//   const entity = (payment as Record<string, unknown>).entity;

//   if (!entity || typeof entity !== "object") {
//     return null;
//   }

//   return entity as Record<string, unknown>;
// }

// export async function razorpayWebhook(
//   req: Request,
//   res: Response,
// ): Promise<Response> {
//   const signature = req.header("X-Razorpay-Signature");

//   if (!signature) {
//     throw new ValidationError("Missing X-Razorpay-Signature header");
//   }

//   if (!Buffer.isBuffer(req.body)) {
//     throw new ValidationError("Razorpay webhook requires the raw request body");
//   }

//   const isValidSignature = verifyRazorpayWebhookSignature(req.body, signature);

//   if (!isValidSignature) {
//     throw new ValidationError("Invalid Razorpay webhook signature");
//   }

//   let payload: Record<string, unknown>;

//   try {
//     payload = JSON.parse(req.body.toString("utf8")) as Record<string, unknown>;
//   } catch {
//     throw new ValidationError("Invalid Razorpay webhook payload");
//   }

//   const eventId = payload.id;
//   const eventType = payload.event;

//   if (typeof eventId !== "string" || eventId.length === 0) {
//     throw new ValidationError("Razorpay webhook event ID is missing");
//   }

//   if (typeof eventType !== "string" || eventType.length === 0) {
//     throw new ValidationError("Razorpay webhook event type is missing");
//   }

//   const supportedEvents = new Set(["payment.captured", "payment.failed"]);

//   if (!supportedEvents.has(eventType)) {
//     try {
//       await WebhookEventModel.create({
//         provider: WebhookProvider.RAZORPAY,
//         eventId,
//         eventType,
//         status: WebhookEventStatus.PROCESSED,
//       });
//     } catch (error) {
//       if (
//         error instanceof mongoose.mongo.MongoServerError &&
//         error.code === 11000
//       ) {
//         return res.status(200).json({ received: true });
//       }

//       throw error;
//     }

//     return res.status(200).json({ received: true });
//   }

//   const paymentEntity = getRazorpayPaymentObject(payload);

//   if (!paymentEntity) {
//     throw new ValidationError("Razorpay payment entity is missing");
//   }

//   const providerPaymentId = paymentEntity.id;
//   const providerOrderId = paymentEntity.order_id;
//   const razorpayAmount = paymentEntity.amount;

//   if (typeof providerPaymentId !== "string" || providerPaymentId.length === 0) {
//     throw new ValidationError("Razorpay payment ID is missing");
//   }

//   if (typeof providerOrderId !== "string" || providerOrderId.length === 0) {
//     throw new ValidationError("Razorpay order ID is missing");
//   }

//   if (
//     typeof razorpayAmount !== "number" ||
//     !Number.isSafeInteger(razorpayAmount) ||
//     razorpayAmount <= 0
//   ) {
//     throw new ValidationError("Invalid Razorpay payment amount");
//   }

//   const session = await mongoose.startSession();

//   try {
//     let duplicateEvent = false;

//     await session.withTransaction(async () => {
//       try {
//         await WebhookEventModel.create(
//           [
//             {
//               provider: WebhookProvider.RAZORPAY,
//               eventId,
//               eventType,
//               status: WebhookEventStatus.PROCESSING,
//             },
//           ],
//           { session },
//         );
//       } catch (error) {
//         if (
//           error instanceof mongoose.mongo.MongoServerError &&
//           error.code === 11000
//         ) {
//           duplicateEvent = true;
//           return;
//         }

//         throw error;
//       }

//       if (duplicateEvent) {
//         return;
//       }

//       /*
//        * IMPORTANT:
//        *
//        * providerPaymentId is NOT available when the Razorpay
//        * order is initially created.
//        *
//        * providerOrderId IS available.
//        */
//       const payment = await PaymentModel.findOne({
//         provider: PaymentProvider.RAZORPAY,
//         providerOrderId,
//       })
//         .select(
//           "_id orderId userId provider providerPaymentId providerOrderId status amount",
//         )
//         .session(session)
//         .lean();

//       if (!payment) {
//         await WebhookEventModel.updateOne(
//           {
//             provider: WebhookProvider.RAZORPAY,
//             eventId,
//           },
//           {
//             $set: {
//               status: WebhookEventStatus.PROCESSED,
//             },
//           },
//           { session },
//         );

//         return;
//       }

//       const localAmountMinor = toMinorUnits(payment.amount);

//       if (localAmountMinor !== razorpayAmount) {
//         throw new ValidationError(
//           "Razorpay payment amount does not match local payment amount",
//         );
//       }

//       /*
//        * -----------------------------------------------
//        * RAZORPAY SUCCESS
//        * -----------------------------------------------
//        */
//       if (eventType === "payment.captured") {
//         const updatedPayment = await PaymentModel.findOneAndUpdate(
//           {
//             _id: payment._id,
//             provider: PaymentProvider.RAZORPAY,
//             providerOrderId,
//             status: {
//               $in: [PaymentStatus.CREATED, PaymentStatus.SUCCESS],
//             },
//           },
//           {
//             $set: {
//               status: PaymentStatus.SUCCESS,
//               providerPaymentId,
//             },
//           },
//           {
//             new: true,
//             session,
//           },
//         )
//           .select("_id orderId status")
//           .lean();

//         if (!updatedPayment) {
//           throw new ValidationError(
//             "Payment state cannot transition to SUCCESS",
//           );
//         }

//         /*
//          * PENDING → PAID.
//          */
//         await OrderModel.updateOne(
//           {
//             _id: payment.orderId,
//             userId: payment.userId,
//             status: OrderStatus.PENDING,
//           },
//           {
//             $set: {
//               status: OrderStatus.PAID,
//               paymentId: payment._id,
//             },
//           },
//           { session },
//         );
//       }

//       /*
//        * -----------------------------------------------
//        * RAZORPAY FAILURE
//        * -----------------------------------------------
//        *
//        * Payment → FAILED
//        * Order remains PENDING.
//        */
//       if (eventType === "payment.failed") {
//         await PaymentModel.findOneAndUpdate(
//           {
//             _id: payment._id,
//             provider: PaymentProvider.RAZORPAY,
//             providerOrderId,
//             status: PaymentStatus.CREATED,
//           },
//           {
//             $set: {
//               status: PaymentStatus.FAILED,
//               providerPaymentId,
//             },
//           },
//           {
//             new: true,
//             session,
//           },
//         );
//       }

//       /*
//        * Only mark webhook processed after all payment
//        * operations have completed successfully.
//        */
//       await WebhookEventModel.updateOne(
//         {
//           provider: WebhookProvider.RAZORPAY,
//           eventId,
//         },
//         {
//           $set: {
//             status: WebhookEventStatus.PROCESSED,
//           },
//         },
//         { session },
//       );
//     });

//     return res.status(200).json({
//       received: true,
//     });
//   } finally {
//     await session.endSession();
//   }
// }

import type { Request, Response } from "express";

import mongoose from "mongoose";
import Stripe from "stripe";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/domain.errors.js";

import { verifyRazorpayWebhookSignature } from "../gateways/razorpay.gateway.js";

import { constructStripeWebhookEvent } from "../gateways/stripe.gateway.js";

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

import {
  WebhookEventModel,
  WebhookEventStatus,
  WebhookProvider,
} from "../model/webhook-event.model.js";

import { EmailService } from "../utils/email.service.js";

function toMinorUnits(value: number): number {
  return Math.round(value * 100);
}

function isDuplicateKeyError(
  error: unknown,
): error is mongoose.mongo.MongoServerError {
  return (
    error instanceof mongoose.mongo.MongoServerError && error.code === 11000
  );
}

/*
 * Handles:
 *
 * CREATED → SUCCESS
 * Order PENDING → PAID
 * Inventory decrement
 * Inventory logs
 *
 * Returns true only when this webhook actually
 * completed a new successful payment.
 */
async function completeSuccessfulPayment(
  paymentId: mongoose.Types.ObjectId,
  providerPaymentId: string,
  provider: PaymentProvider,
  expectedAmountMinor: number,
  session: mongoose.ClientSession,
): Promise<{
  completed: boolean;
  userId: string | null;
  orderAmount: number;
}> {
  const payment = await PaymentModel.findOne({
    _id: paymentId,
    provider,
  })
    .select("_id orderId userId provider providerPaymentId " + "status amount")
    .session(session)
    .lean();

  if (!payment) {
    throw new NotFoundError("Payment");
  }

  const localAmountMinor = toMinorUnits(payment.amount);

  if (localAmountMinor !== expectedAmountMinor) {
    throw new ValidationError(
      `${provider} payment amount does not match local payment amount`,
    );
  }

  /*
   * Already successful payment:
   *
   * This can happen if the gateway sends another
   * success event with a different event ID.
   *
   * Do NOT touch inventory again.
   */
  if (payment.status === PaymentStatus.SUCCESS) {
    const order = await OrderModel.findById(payment.orderId)
      .select("_id userId status totalAmount paymentId items")
      .session(session)
      .lean();

    if (!order) {
      throw new NotFoundError("Order");
    }

    if (
      order.status === OrderStatus.PAID &&
      order.paymentId?.toString() === payment._id.toString()
    ) {
      return {
        completed: false,
        userId: null,
        orderAmount: order.totalAmount,
      };
    }

    throw new ConflictError(
      "Payment is SUCCESS but order state is inconsistent",
    );
  }

  if (payment.status !== PaymentStatus.CREATED) {
    throw new ConflictError("Payment cannot transition to SUCCESS");
  }

  /*
   * First make sure the order is still pending.
   */
  const order = await OrderModel.findOne({
    _id: payment.orderId,
    userId: payment.userId,
  })
    .select("_id userId status totalAmount paymentId items")
    .session(session)
    .lean();

  if (!order) {
    throw new NotFoundError("Order");
  }

  if (
    order.status === OrderStatus.PAID &&
    order.paymentId?.toString() === payment._id.toString()
  ) {
    /*
     * Order was already completed by this payment.
     * Mark payment success if needed, but don't
     * deduct inventory.
     */
    await PaymentModel.updateOne(
      {
        _id: payment._id,
        status: PaymentStatus.CREATED,
      },
      {
        $set: {
          status: PaymentStatus.SUCCESS,
          providerPaymentId,
        },
      },
      { session },
    );

    return {
      completed: false,
      userId: null,
      orderAmount: order.totalAmount,
    };
  }

  if (order.status !== OrderStatus.PENDING) {
    throw new ConflictError(
      "Order is no longer eligible for payment completion",
    );
  }

  /*
   * Payment → SUCCESS.
   */
  const updatedPayment = await PaymentModel.findOneAndUpdate(
    {
      _id: payment._id,
      provider,
      status: PaymentStatus.CREATED,
    },
    {
      $set: {
        status: PaymentStatus.SUCCESS,
        providerPaymentId,
      },
    },
    {
      new: true,
      session,
    },
  )
    .select("_id status")
    .lean();

  if (!updatedPayment) {
    /*
     * Another transaction may have completed it.
     * Re-check state rather than deducting inventory.
     */
    const currentPayment = await PaymentModel.findById(payment._id)
      .select("_id status providerPaymentId")
      .session(session)
      .lean();

    if (currentPayment?.status === PaymentStatus.SUCCESS) {
      return {
        completed: false,
        userId: null,
        orderAmount: order.totalAmount,
      };
    }

    throw new ConflictError("Payment state cannot transition to SUCCESS");
  }

  /*
   * Order → PAID.
   */
  const updatedOrder = await OrderModel.findOneAndUpdate(
    {
      _id: order._id,
      userId: order.userId,
      status: OrderStatus.PENDING,
    },
    {
      $set: {
        status: OrderStatus.PAID,
        paymentId: payment._id,
      },
    },
    {
      new: true,
      session,
    },
  )
    .select("_id userId status totalAmount paymentId items")
    .lean();

  if (!updatedOrder) {
    throw new ConflictError("Order could not be marked as PAID");
  }

  /*
   * Inventory is changed in the same transaction.
   */
  for (const item of updatedOrder.items) {
    const updated = await ProductModel.updateOne(
      {
        _id: item.productId,
        stock: {
          $gte: item.quantity,
        },
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

    if (updated.modifiedCount !== 1) {
      throw new ConflictError(
        `Insufficient inventory for product ${item.productId}`,
      );
    }
  }

  /*
   * Inventory logs are part of the same transaction.
   */
  if (updatedOrder.items.length > 0) {
    await InventoryLogModel.insertMany(
      updatedOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        type: InventoryLogType.ORDER,
      })),
      {
        session,
      },
    );
  }

  return {
    completed: true,
    userId: updatedOrder.userId.toString(),
    orderAmount: updatedOrder.totalAmount,
  };
}

export async function stripeWebhook(
  req: Request,
  res: Response,
): Promise<Response> {
  const signature = req.header("Stripe-Signature");

  if (!signature) {
    throw new ValidationError("Missing Stripe-Signature header");
  }

  if (!Buffer.isBuffer(req.body)) {
    throw new ValidationError("Stripe webhook requires the raw request body");
  }

  let event: Stripe.Event;

  try {
    event = constructStripeWebhookEvent(req.body, signature);
  } catch {
    throw new ValidationError("Invalid Stripe webhook signature");
  }

  const supportedEvents = new Set([
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
  ]);

  if (!supportedEvents.has(event.type)) {
    try {
      await WebhookEventModel.create({
        provider: WebhookProvider.STRIPE,
        eventId: event.id,
        eventType: event.type,
        status: WebhookEventStatus.PROCESSED,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return res.status(200).json({
          received: true,
        });
      }

      throw error;
    }

    return res.status(200).json({
      received: true,
    });
  }

  const session = await mongoose.startSession();

  let emailUserId: string | null = null;
  let emailAmount = 0;

  try {
    let alreadyProcessed = false;

    await session.withTransaction(async () => {
      try {
        await WebhookEventModel.create(
          [
            {
              provider: WebhookProvider.STRIPE,
              eventId: event.id,
              eventType: event.type,
              status: WebhookEventStatus.PROCESSING,
            },
          ],
          { session },
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          alreadyProcessed = true;
          return;
        }

        throw error;
      }

      if (alreadyProcessed) {
        return;
      }

      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const providerPaymentId = paymentIntent.id;

      const payment = await PaymentModel.findOne({
        provider: PaymentProvider.STRIPE,
        providerPaymentId,
      })
        .select("_id orderId userId provider providerPaymentId status amount")
        .session(session)
        .lean();

      /*
       * Do NOT mark the webhook as processed
       * when local payment is not found.
       *
       * Throw so the provider can retry.
       */
      if (!payment) {
        throw new NotFoundError("Payment");
      }

      if (event.type === "payment_intent.succeeded") {
        const result = await completeSuccessfulPayment(
          payment._id,
          providerPaymentId,
          PaymentProvider.STRIPE,
          paymentIntent.amount_received,
          session,
        );

        if (result.completed) {
          emailUserId = result.userId;
          emailAmount = result.orderAmount;
        }
      }

      if (event.type === "payment_intent.payment_failed") {
        await PaymentModel.updateOne(
          {
            _id: payment._id,
            provider: PaymentProvider.STRIPE,
            providerPaymentId,
            status: PaymentStatus.CREATED,
          },
          {
            $set: {
              status: PaymentStatus.FAILED,
            },
          },
          { session },
        );

        /*
         * IMPORTANT:
         * Order remains PENDING.
         */
      }

      await WebhookEventModel.updateOne(
        {
          provider: WebhookProvider.STRIPE,
          eventId: event.id,
        },
        {
          $set: {
            status: WebhookEventStatus.PROCESSED,
          },
        },
        { session },
      );
    });

    if (emailUserId) {
      try {
        await EmailService.sendOrderPaidEmail({
          userId: emailUserId,
          amount: emailAmount,
        });
      } catch (error) {
        console.error("Failed to send payment email", error);
      }
    }

    return res.status(200).json({
      received: true,
    });
  } finally {
    await session.endSession();
  }
}

function getRazorpayPaymentObject(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const payloadObject = payload.payload;

  if (!payloadObject || typeof payloadObject !== "object") {
    return null;
  }

  const payment = (payloadObject as Record<string, unknown>).payment;

  if (!payment || typeof payment !== "object") {
    return null;
  }

  const entity = (payment as Record<string, unknown>).entity;

  if (!entity || typeof entity !== "object") {
    return null;
  }

  return entity as Record<string, unknown>;
}

export async function razorpayWebhook(
  req: Request,
  res: Response,
): Promise<Response> {
  const signature = req.header("X-Razorpay-Signature");

  if (!signature) {
    throw new ValidationError("Missing X-Razorpay-Signature header");
  }

  if (!Buffer.isBuffer(req.body)) {
    throw new ValidationError("Razorpay webhook requires the raw request body");
  }

  const isValidSignature = verifyRazorpayWebhookSignature(req.body, signature);

  if (!isValidSignature) {
    throw new ValidationError("Invalid Razorpay webhook signature");
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(req.body.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ValidationError("Invalid Razorpay webhook payload");
  }

  const eventId = payload.id;
  const eventType = payload.event;

  if (typeof eventId !== "string" || eventId.length === 0) {
    throw new ValidationError("Razorpay webhook event ID is missing");
  }

  if (typeof eventType !== "string" || eventType.length === 0) {
    throw new ValidationError("Razorpay webhook event type is missing");
  }

  const supportedEvents = new Set(["payment.captured", "payment.failed"]);

  if (!supportedEvents.has(eventType)) {
    try {
      await WebhookEventModel.create({
        provider: WebhookProvider.RAZORPAY,
        eventId,
        eventType,
        status: WebhookEventStatus.PROCESSED,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return res.status(200).json({
          received: true,
        });
      }

      throw error;
    }

    return res.status(200).json({
      received: true,
    });
  }

  const paymentEntity = getRazorpayPaymentObject(payload);

  if (!paymentEntity) {
    throw new ValidationError("Razorpay payment entity is missing");
  }

  const providerPaymentId = paymentEntity.id;

  const providerOrderId = paymentEntity.order_id;

  const razorpayAmount = paymentEntity.amount;

  if (typeof providerPaymentId !== "string" || providerPaymentId.length === 0) {
    throw new ValidationError("Razorpay payment ID is missing");
  }

  if (typeof providerOrderId !== "string" || providerOrderId.length === 0) {
    throw new ValidationError("Razorpay order ID is missing");
  }

  if (
    typeof razorpayAmount !== "number" ||
    !Number.isSafeInteger(razorpayAmount) ||
    razorpayAmount <= 0
  ) {
    throw new ValidationError("Invalid Razorpay payment amount");
  }

  const session = await mongoose.startSession();

  let emailUserId: string | null = null;
  let emailAmount = 0;

  try {
    let duplicateEvent = false;

    await session.withTransaction(async () => {
      try {
        await WebhookEventModel.create(
          [
            {
              provider: WebhookProvider.RAZORPAY,
              eventId,
              eventType,
              status: WebhookEventStatus.PROCESSING,
            },
          ],
          { session },
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          duplicateEvent = true;
          return;
        }

        throw error;
      }

      if (duplicateEvent) {
        return;
      }

      /*
       * Razorpay initially gives us providerOrderId.
       * providerPaymentId becomes available after
       * the customer payment is created.
       */
      const payment = await PaymentModel.findOne({
        provider: PaymentProvider.RAZORPAY,
        providerOrderId,
      })
        .select(
          "_id orderId userId provider providerPaymentId providerOrderId status amount",
        )
        .session(session)
        .lean();

      /*
       * Never permanently process an event that has
       * no local payment yet.
       */
      if (!payment) {
        throw new NotFoundError("Payment");
      }

      const localAmountMinor = toMinorUnits(payment.amount);

      if (localAmountMinor !== razorpayAmount) {
        throw new ValidationError(
          "Razorpay payment amount does not match local payment amount",
        );
      }

      if (eventType === "payment.captured") {
        const result = await completeSuccessfulPayment(
          payment._id,
          providerPaymentId,
          PaymentProvider.RAZORPAY,
          razorpayAmount,
          session,
        );

        if (result.completed) {
          emailUserId = result.userId;
          emailAmount = result.orderAmount;
        }
      }

      if (eventType === "payment.failed") {
        await PaymentModel.findOneAndUpdate(
          {
            _id: payment._id,
            provider: PaymentProvider.RAZORPAY,
            providerOrderId,
            status: PaymentStatus.CREATED,
          },
          {
            $set: {
              status: PaymentStatus.FAILED,
              providerPaymentId,
            },
          },
          {
            new: true,
            session,
          },
        );

        /*
         * Order intentionally remains PENDING
         * so retryPayment() can be used.
         */
      }

      await WebhookEventModel.updateOne(
        {
          provider: WebhookProvider.RAZORPAY,
          eventId,
        },
        {
          $set: {
            status: WebhookEventStatus.PROCESSED,
          },
        },
        { session },
      );
    });

    if (emailUserId) {
      try {
        await EmailService.sendOrderPaidEmail({
          userId: emailUserId,
          amount: emailAmount,
        });
      } catch (error) {
        console.error("Failed to send payment email", error);
      }
    }

    return res.status(200).json({
      received: true,
    });
  } finally {
    await session.endSession();
  }
}
