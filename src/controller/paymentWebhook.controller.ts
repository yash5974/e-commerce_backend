import { NextFunction, Request, Response } from "express";
import mongoose, { Types } from "mongoose";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/domain.errors.js";

import {
  createGatewayIntent,
  createGatewayRetryIntent,
  refundPayment,
} from "../gateways/payment.gateway.js";

import { OrderModel, OrderStatus } from "../model/order.model.js";

import {
  PaymentModel,
  PaymentProvider,
  PaymentStatus,
} from "../model/payment.model.js";

import { RefundModel, RefundStatus } from "../model/refund.model.js";

import {
  createPaymentIntentSchema,
  getPaymentParamsSchema,
  getPaymentStatusParamsSchema,
  idempotencyKeySchema,
  refundPaymentBodySchema,
  refundPaymentParamsSchema,
  retryPaymentBodySchema,
  retryPaymentParamsSchema,
} from "../schema/payment.schema.js";

function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

function fromMinorUnits(amount: number): number {
  return amount / 100;
}

function isDuplicateKeyError(
  error: unknown,
): error is mongoose.mongo.MongoServerError {
  return (
    error instanceof mongoose.mongo.MongoServerError && error.code === 11000
  );
}

export const createPaymentIntent = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const bodyResult = createPaymentIntentSchema.safeParse(req.body);

    if (!bodyResult.success) {
      throw new ValidationError(
        "Invalid payment intent request",
        bodyResult.error.flatten().fieldErrors,
      );
    }

    const keyResult = idempotencyKeySchema.safeParse(
      req.header("Idempotency-Key"),
    );

    if (!keyResult.success) {
      throw new ValidationError("A valid Idempotency-Key header is required");
    }

    const { orderId, provider } = bodyResult.data;
    const idempotencyKey = keyResult.data;
    const userId = new Types.ObjectId(req.user.userId);

    const existingPayment = await PaymentModel.findOne({
      userId,
      idempotencyKey,
    })
      .select(
        "_id orderId provider providerPaymentId providerOrderId " +
          "providerClientSecret status amount createdAt",
      )
      .lean();

    if (existingPayment) {
      if (
        existingPayment.orderId.toString() !== orderId ||
        existingPayment.provider !== provider
      ) {
        throw new ConflictError(
          "Idempotency-Key was already used for a different payment request",
        );
      }

      res.status(200).json({
        success: true,
        message: "Payment intent already exists",
        data: existingPayment,
      });

      return;
    }

    const order = await OrderModel.findOne({
      _id: orderId,
      userId,
    })
      .select("_id userId status totalAmount paymentId")
      .lean();

    if (!order) {
      throw new NotFoundError("Order");
    }

    if (order.status === OrderStatus.PAID) {
      throw new ConflictError("Order has already been paid");
    }

    if (
      order.status === OrderStatus.FAILED ||
      order.status === OrderStatus.SHIPPED
    ) {
      throw new ConflictError("Payment cannot be initialized for this order");
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictError("Order is not eligible for payment");
    }

    /*
     * A CREATED payment already exists for this order.
     * Do not create another payment attempt.
     */
    if (order.paymentId) {
      const activePayment = await PaymentModel.findOne({
        _id: order.paymentId,
        status: PaymentStatus.CREATED,
      })
        .select(
          "_id orderId provider providerPaymentId providerOrderId " +
            "providerClientSecret status amount createdAt",
        )
        .lean();

      if (activePayment) {
        throw new ConflictError(
          "A payment is already in progress for this order",
        );
      }
    }

    if (!Number.isFinite(order.totalAmount) || order.totalAmount <= 0) {
      throw new ConflictError("Order has an invalid payment amount");
    }

    const gatewayIntent = await createGatewayIntent(provider, {
      amount: order.totalAmount,
      orderId: order._id.toString(),
      idempotencyKey,
    });

    if (!gatewayIntent.providerPaymentId && !gatewayIntent.providerOrderId) {
      throw new Error("Payment gateway returned an invalid payment identifier");
    }

    if (
      provider === PaymentProvider.STRIPE &&
      !gatewayIntent.providerPaymentId
    ) {
      throw new Error("Stripe returned an invalid payment identifier");
    }

    if (
      provider === PaymentProvider.RAZORPAY &&
      !gatewayIntent.providerOrderId
    ) {
      throw new Error("Razorpay returned an invalid order identifier");
    }

    const session = await mongoose.startSession();

    try {
      const createdPayment = await session.withTransaction(async () => {
        const payments = await PaymentModel.create(
          [
            {
              orderId: order._id,
              provider,
              providerPaymentId: gatewayIntent.providerPaymentId,
              providerOrderId: gatewayIntent.providerOrderId,
              providerClientSecret: gatewayIntent.providerClientSecret,
              status: PaymentStatus.CREATED,
              amount: order.totalAmount,
              idempotencyKey,
              userId,
            },
          ],
          { session },
        );

        const payment = payments[0];

        if (!payment) {
          throw new Error("Payment creation failed");
        }

        const orderUpdate = await OrderModel.updateOne(
          {
            _id: order._id,
            userId,
            status: OrderStatus.PENDING,
            $or: [{ paymentId: { $exists: false } }, { paymentId: null }],
          },
          {
            $set: {
              paymentId: payment._id,
            },
          },
          { session },
        );

        if (orderUpdate.modifiedCount !== 1) {
          throw new ConflictError("Order payment state changed concurrently");
        }

        return payment;
      });

      res.status(201).json({
        success: true,
        message: "Payment intent created successfully",
        data: {
          paymentId: createdPayment._id,
          orderId: createdPayment.orderId,
          provider: createdPayment.provider,
          providerPaymentId: createdPayment.providerPaymentId,
          providerOrderId: createdPayment.providerOrderId,
          providerClientSecret: createdPayment.providerClientSecret,
          status: createdPayment.status,
          amount: createdPayment.amount,
          createdAt: createdPayment.createdAt,
        },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const concurrentPayment = await PaymentModel.findOne({
          userId,
          idempotencyKey,
        })
          .select(
            "_id orderId provider providerPaymentId " +
              "providerOrderId providerClientSecret status amount createdAt",
          )
          .lean();

        if (
          concurrentPayment &&
          concurrentPayment.orderId.toString() === orderId &&
          concurrentPayment.provider === provider
        ) {
          res.status(200).json({
            success: true,
            message: "Payment intent already exists",
            data: concurrentPayment,
          });

          return;
        }

        throw new ConflictError(
          "Payment request conflicts with an existing payment",
        );
      }

      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    next(error);
  }
};

export const getPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsedParams = getPaymentParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      throw new ValidationError(
        parsedParams.error.issues[0]?.message ?? "Invalid payment ID",
      );
    }

    const { paymentId } = parsedParams.data;

    const query: {
      _id: string;
      userId?: Types.ObjectId;
    } = {
      _id: paymentId,
    };

    if (req.user.role === "USER") {
      query.userId = new Types.ObjectId(req.user.userId);
    }

    const payment = await PaymentModel.findOne(query)
      .select(
        "_id orderId provider providerPaymentId providerOrderId " +
          "providerClientSecret status amount refundedAmount " +
          "createdAt updatedAt",
      )
      .lean();

    if (!payment) {
      throw new NotFoundError("Payment");
    }

    res.status(200).json({
      success: true,
      data: {
        payment: {
          paymentId: payment._id,
          orderId: payment.orderId,
          provider: payment.provider,
          providerPaymentId: payment.providerPaymentId,
          providerOrderId: payment.providerOrderId,
          providerClientSecret:
            payment.status === PaymentStatus.CREATED
              ? payment.providerClientSecret
              : undefined,
          status: payment.status,
          amount: payment.amount,
          refundedAmount: payment.refundedAmount,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsedParams = getPaymentStatusParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      throw new ValidationError(
        parsedParams.error.issues[0]?.message ?? "Invalid payment ID",
      );
    }

    const { paymentId } = parsedParams.data;

    const userId = new Types.ObjectId(req.user.userId);

    const payment = await PaymentModel.findOne({
      _id: paymentId,
      userId,
    })
      .select("_id orderId status")
      .lean();

    if (!payment) {
      throw new NotFoundError("Payment");
    }

    res.status(200).json({
      success: true,
      data: {
        paymentId: payment._id,
        orderId: payment.orderId,
        status: payment.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const retryPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsedParams = retryPaymentParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      throw new ValidationError(
        parsedParams.error.issues[0]?.message ?? "Invalid payment ID",
      );
    }

    const parsedBody = retryPaymentBodySchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new ValidationError(
        parsedBody.error.issues[0]?.message ?? "Invalid payment request",
      );
    }

    const parsedIdempotencyKey = idempotencyKeySchema.safeParse(
      req.header("Idempotency-Key"),
    );

    if (!parsedIdempotencyKey.success) {
      throw new ValidationError("A valid Idempotency-Key header is required");
    }

    const { paymentId } = parsedParams.data;
    const { provider } = parsedBody.data;
    const idempotencyKey = parsedIdempotencyKey.data;

    const userId = new Types.ObjectId(req.user.userId);

    const payment = await PaymentModel.findOne({
      _id: paymentId,
      userId,
    })
      .select("_id orderId provider status amount")
      .lean();

    if (!payment) {
      throw new NotFoundError("Payment");
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      throw new ConflictError("Successful payments cannot be retried");
    }

    if (payment.status === PaymentStatus.CREATED) {
      throw new ConflictError("Payment is already in progress");
    }

    if (payment.status !== PaymentStatus.FAILED) {
      throw new ConflictError("Payment cannot be retried in its current state");
    }

    const existingRetry = await PaymentModel.findOne({
      userId,
      idempotencyKey,
    })
      .select(
        "_id orderId provider providerPaymentId providerOrderId " +
          "providerClientSecret status amount createdAt updatedAt",
      )
      .lean();

    if (existingRetry) {
      if (
        existingRetry.orderId.toString() !== payment.orderId.toString() ||
        existingRetry.provider !== provider
      ) {
        throw new ConflictError(
          "Idempotency-Key has already been used for another payment",
        );
      }

      res.status(200).json({
        success: true,
        data: {
          payment: {
            paymentId: existingRetry._id,
            id: existingRetry._id,
            orderId: existingRetry.orderId,
            provider: existingRetry.provider,
            providerPaymentId: existingRetry.providerPaymentId,
            providerOrderId: existingRetry.providerOrderId,
            providerClientSecret: existingRetry.providerClientSecret,
            status: existingRetry.status,
            amount: existingRetry.amount,
            createdAt: existingRetry.createdAt,
            updatedAt: existingRetry.updatedAt,
          },
        },
      });

      return;
    }

    const order = await OrderModel.findOne({
      _id: payment.orderId,
      userId,
    })
      .select("_id userId status totalAmount paymentId")
      .lean();

    if (!order) {
      throw new NotFoundError("Order");
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictError("Order is no longer available for payment retry");
    }

    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new ConflictError("Payment amount is invalid");
    }

    /*
     * The retry amount comes from the original
     * server-side payment amount.
     */
    const gatewayIntent = await createGatewayRetryIntent({
      provider,
      amount: payment.amount,
      orderId: payment.orderId.toString(),
      idempotencyKey,
    });

    if (
      provider === PaymentProvider.RAZORPAY &&
      !gatewayIntent.providerOrderId
    ) {
      throw new Error("Razorpay returned an invalid order identifier");
    }

    if (
      provider === PaymentProvider.STRIPE &&
      !gatewayIntent.providerPaymentId
    ) {
      throw new Error("Stripe returned an invalid payment identifier");
    }

    const session = await mongoose.startSession();

    try {
      const createdPayment = await session.withTransaction(async () => {
        const paymentDocs = await PaymentModel.create(
          [
            {
              orderId: payment.orderId,
              provider,
              providerPaymentId: gatewayIntent.providerPaymentId,
              providerOrderId: gatewayIntent.providerOrderId,
              providerClientSecret: gatewayIntent.providerClientSecret,
              status: PaymentStatus.CREATED,
              amount: payment.amount,
              idempotencyKey,
              userId,
            },
          ],
          { session },
        );

        const retry = paymentDocs[0];

        if (!retry) {
          throw new Error("Failed to create retry payment");
        }

        const orderUpdate = await OrderModel.updateOne(
          {
            _id: payment.orderId,
            userId,
            status: OrderStatus.PENDING,
            paymentId: payment._id,
          },
          {
            $set: {
              paymentId: retry._id,
            },
          },
          { session },
        );

        if (orderUpdate.modifiedCount !== 1) {
          throw new ConflictError("Order payment state changed during retry");
        }

        return retry;
      });

      res.status(201).json({
        success: true,
        data: {
          payment: {
            paymentId: createdPayment._id,
            id: createdPayment._id,
            orderId: createdPayment.orderId,
            provider: createdPayment.provider,
            providerPaymentId: createdPayment.providerPaymentId,
            providerOrderId: createdPayment.providerOrderId,
            providerClientSecret: createdPayment.providerClientSecret,
            status: createdPayment.status,
            amount: createdPayment.amount,
            createdAt: createdPayment.createdAt,
            updatedAt: createdPayment.updatedAt,
          },
        },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const existing = await PaymentModel.findOne({
          userId,
          idempotencyKey,
        })
          .select(
            "_id orderId provider providerPaymentId " +
              "providerOrderId providerClientSecret status amount " +
              "createdAt updatedAt",
          )
          .lean();

        if (
          existing &&
          existing.orderId.toString() === payment.orderId.toString() &&
          existing.provider === provider
        ) {
          res.status(200).json({
            success: true,
            data: {
              payment: {
                paymentId: existing._id,
                id: existing._id,
                orderId: existing.orderId,
                provider: existing.provider,
                providerPaymentId: existing.providerPaymentId,
                providerOrderId: existing.providerOrderId,
                providerClientSecret: existing.providerClientSecret,
                status: existing.status,
                amount: existing.amount,
                createdAt: existing.createdAt,
                updatedAt: existing.updatedAt,
              },
            },
          });

          return;
        }

        throw new ConflictError("Payment retry already exists");
      }

      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    next(error);
  }
};

export const refundPaymentController = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const paramsResult = refundPaymentParamsSchema.safeParse(req.params);

  if (!paramsResult.success) {
    throw new ValidationError(
      paramsResult.error.issues[0]?.message ?? "Invalid paymentId",
    );
  }

  const bodyResult = refundPaymentBodySchema.safeParse(req.body);

  if (!bodyResult.success) {
    throw new ValidationError(
      bodyResult.error.issues[0]?.message ?? "Invalid refund request",
    );
  }

  const idempotencyResult = idempotencyKeySchema.safeParse(
    req.header("Idempotency-Key"),
  );

  if (!idempotencyResult.success) {
    throw new ValidationError("A valid Idempotency-Key header is required");
  }

  const { paymentId } = paramsResult.data;
  const { amount: requestedAmount, reason } = bodyResult.data;

  const idempotencyKey = idempotencyResult.data;

  if (!mongoose.isValidObjectId(paymentId)) {
    throw new ValidationError("Invalid paymentId");
  }

  const payment = await PaymentModel.findById(paymentId)
    .select(
      "_id orderId userId provider providerPaymentId " +
        "status amount refundedAmount",
    )
    .lean();

  if (!payment) {
    throw new NotFoundError("Payment");
  }

  const existingRefund = await RefundModel.findOne({
    userId: payment.userId,
    idempotencyKey,
  })
    .select(
      "_id paymentId orderId provider providerRefundId " +
        "amount reason status createdAt updatedAt",
    )
    .lean();

  if (existingRefund) {
    const sameRequest =
      existingRefund.paymentId.equals(new Types.ObjectId(paymentId)) &&
      toMinorUnits(existingRefund.amount) ===
        toMinorUnits(requestedAmount ?? existingRefund.amount) &&
      existingRefund.reason === reason;

    if (!sameRequest) {
      throw new ConflictError(
        "Idempotency-Key was already used for a different refund request",
      );
    }

    if (existingRefund.status === RefundStatus.SUCCESS) {
      return res.status(200).json({
        success: true,
        data: existingRefund,
      });
    }

    if (existingRefund.status === RefundStatus.PENDING) {
      return res.status(202).json({
        success: true,
        data: existingRefund,
      });
    }

    throw new ConflictError(
      "This idempotency key already belongs to a failed refund",
    );
  }

  if (payment.status !== PaymentStatus.SUCCESS) {
    throw new ConflictError("Only successful payments can be refunded");
  }

  if (!payment.providerPaymentId) {
    throw new ConflictError(
      "Payment does not have a valid provider payment ID",
    );
  }

  const order = await OrderModel.findById(payment.orderId)
    .select("_id userId status totalAmount")
    .lean();

  if (!order) {
    throw new NotFoundError("Order");
  }

  const paymentAmountMinor = toMinorUnits(payment.amount);

  const alreadyRefundedMinor = toMinorUnits(payment.refundedAmount ?? 0);

  const remainingMinor = paymentAmountMinor - alreadyRefundedMinor;

  if (remainingMinor <= 0) {
    throw new ConflictError("Payment has already been fully refunded");
  }

  const refundAmountMinor =
    requestedAmount === undefined
      ? remainingMinor
      : toMinorUnits(requestedAmount);

  if (refundAmountMinor <= 0) {
    throw new ValidationError("Refund amount must be greater than zero");
  }

  if (refundAmountMinor > remainingMinor) {
    throw new ConflictError(
      `Refund amount exceeds the remaining refundable amount of ${fromMinorUnits(
        remainingMinor,
      )}`,
    );
  }

  const refundAmount = fromMinorUnits(refundAmountMinor);

  /*
   * Atomically reserve the amount.
   */
  const reservedPayment = await PaymentModel.findOneAndUpdate(
    {
      _id: payment._id,
      status: PaymentStatus.SUCCESS,
      $expr: {
        $lte: [
          {
            $add: [
              {
                $ifNull: ["$refundedAmount", 0],
              },
              refundAmount,
            ],
          },
          "$amount",
        ],
      },
    },
    {
      $inc: {
        refundedAmount: refundAmount,
      },
    },
    {
      new: true,
    },
  )
    .select("_id")
    .lean();

  if (!reservedPayment) {
    throw new ConflictError("Refund amount is no longer available");
  }

  let refund;

  try {
    refund = await RefundModel.create({
      paymentId: payment._id,
      orderId: payment.orderId,
      userId: payment.userId,
      provider: payment.provider,
      amount: refundAmount,
      reason,
      status: RefundStatus.PENDING,
      idempotencyKey,
    });
  } catch (error) {
    await PaymentModel.updateOne(
      {
        _id: payment._id,
      },
      {
        $inc: {
          refundedAmount: -refundAmount,
        },
      },
    );

    if (isDuplicateKeyError(error)) {
      const duplicate = await RefundModel.findOne({
        userId: payment.userId,
        idempotencyKey,
      })
        .select(
          "_id paymentId orderId provider providerRefundId " +
            "amount reason status createdAt updatedAt",
        )
        .lean();

      if (duplicate) {
        return res
          .status(duplicate.status === RefundStatus.SUCCESS ? 200 : 202)
          .json({
            success: true,
            data: duplicate,
          });
      }
    }

    throw error;
  }

  try {
    const gatewayResult = await refundPayment({
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      amount: refundAmount,
      idempotencyKey,
      reason,
    });

    const completedRefund = await RefundModel.findOneAndUpdate(
      {
        _id: refund._id,
        status: RefundStatus.PENDING,
      },
      {
        $set: {
          status: RefundStatus.SUCCESS,
          providerRefundId: gatewayResult.providerRefundId,
        },
      },
      {
        new: true,
      },
    )
      .select(
        "_id paymentId orderId provider providerRefundId " +
          "amount reason status createdAt updatedAt",
      )
      .lean();

    if (!completedRefund) {
      /*
       * Provider already succeeded.
       * Never issue another refund.
       * Keep local reservation intact.
       */
      throw new Error(
        "Refund succeeded at provider but local refund state could not be updated",
      );
    }

    return res.status(201).json({
      success: true,
      data: completedRefund,
    });
  } catch (error) {
    /*
     * Keep PENDING for an ambiguous provider error.
     * This prevents accidentally issuing a second refund.
     */
    if (
      error instanceof Error &&
      error.message.includes("local refund state could not be updated")
    ) {
      throw error;
    }

    /*
     * Provider errors are intentionally not automatically
     * converted to FAILED here because a network timeout
     * cannot prove that the provider did not process the
     * refund.
     *
     * The PENDING record protects the operation from a
     * second refund.
     */
    throw error;
  }
};
