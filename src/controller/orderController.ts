import { Request, Response } from "express";
import mongoose from "mongoose";

import { NotFoundError, ValidationError } from "../errors/domain.errors.js";

import { OrderModel, OrderStatus } from "../model/order.model.js";
import { ProductModel } from "../model/product.model.js";
import { salesAnalyticsSchema } from "../schema/sales.schema.js";

export interface CreateOrderItemDto {
  productId: string;
  quantity: number;
}

export interface CreateOrderDto {
  items: CreateOrderItemDto[];
}

export const createOrder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const body = req.body as CreateOrderDto;

    const productIds = body.items.map((item) => item.productId);

    const products = await ProductModel.find({
      _id: { $in: productIds },
      isActive: true,
    })
      .select({
        name: 1,
        price: 1,
        discountPrice: 1,
        stock: 1,
      })
      .lean()
      .session(session);

    if (products.length !== productIds.length) {
      throw new NotFoundError("One or more requested products");
    }

    const productMap = new Map(
      products.map((product) => [product._id.toString(), product]),
    );

    let totalAmount = 0;

    const orderItems = body.items.map((item) => {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new NotFoundError("Product");
      }

      if (product.stock < item.quantity) {
        throw new ValidationError(`Insufficient stock for "${product.name}"`);
      }

      const unitPrice =
        product.discountPrice > 0 ? product.discountPrice : product.price;

      totalAmount += unitPrice * item.quantity;

      return {
        productId: product._id,
        name: product.name,
        price: unitPrice,
        quantity: item.quantity,
      };
    });

    const [order] = await OrderModel.create(
      [
        {
          userId: req.user!.userId,
          status: OrderStatus.PENDING,
          totalAmount,
          items: orderItems,
        },
      ],
      {
        session,
      },
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Order created successfully.",
      data: order,
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const getMyOrders = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const orders = await OrderModel.find({
    userId: req.user!.userId,
  })
    .sort({
      createdAt: -1,
    })
    .lean();

  res.status(200).json({
    success: true,
    message: "Orders fetched successfully.",
    data: orders,
  });
};

export const getOrderDetails = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const order = await OrderModel.findOne({
    _id: req.params.id,
    userId: req.user!.userId,
  }).lean();

  if (!order) {
    throw new NotFoundError("Order");
  }

  res.status(200).json({
    success: true,
    message: "Order fetched successfully.",
    data: order,
  });
};

export const getAllOrders = async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);

  const skip = (page - 1) * limit;

  const match: Record<string, unknown> = {};

  if (req.query.status) {
    match.status = req.query.status as OrderStatus;
  }

  const [orders, total] = await Promise.all([
    OrderModel.aggregate([
      {
        $match: match,
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $project: {
          userId: 1,
          status: 1,
          totalAmount: 1,
          paymentId: 1,
          items: 1,
          createdAt: 1,
        },
      },
    ]),
    OrderModel.countDocuments(match),
  ]);

  return res.status(200).json({
    success: true,
    message: "Orders fetched successfully.",
    data: orders,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.FAILED],
    [OrderStatus.PAID]: [OrderStatus.SHIPPED],
    [OrderStatus.FAILED]: [],
    [OrderStatus.SHIPPED]: [],
  };

  const existingOrder = await OrderModel.findById(id).select("status").lean();

  if (!existingOrder) {
    throw new NotFoundError("Order");
  }

  if (
    !allowedTransitions[existingOrder.status as OrderStatus].includes(status)
  ) {
    throw new ValidationError(
      `Cannot change order status from ${existingOrder.status} to ${status}`,
    );
  }

  const updatedOrder = await OrderModel.findOneAndUpdate(
    {
      _id: id,
    },
    {
      $set: {
        status,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return res.status(200).json({
    success: true,
    message: "Order status updated successfully.",
    data: updatedOrder,
  });
};

export const getSalesAnalytics = async (req: Request, res: Response) => {
  const parsed = salesAnalyticsSchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { from, to } = parsed.data;

  const match: Record<string, unknown> = {};

  if (from || to) {
    match.createdAt = {};

    if (from) {
      (match.createdAt as Record<string, Date>).$gte = new Date(from);
    }

    if (to) {
      (match.createdAt as Record<string, Date>).$lte = new Date(to);
    }
  }

  const result = await OrderModel.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: null,

        totalSales: {
          $sum: {
            $cond: [{ $eq: ["$status", OrderStatus.PAID] }, "$totalAmount", 0],
          },
        },

        totalOrders: {
          $sum: 1,
        },

        paidOrders: {
          $sum: {
            $cond: [{ $eq: ["$status", OrderStatus.PAID] }, 1, 0],
          },
        },

        pendingOrders: {
          $sum: {
            $cond: [{ $eq: ["$status", OrderStatus.PENDING] }, 1, 0],
          },
        },

        failedOrders: {
          $sum: {
            $cond: [{ $eq: ["$status", OrderStatus.FAILED] }, 1, 0],
          },
        },

        shippedOrders: {
          $sum: {
            $cond: [{ $eq: ["$status", OrderStatus.SHIPPED] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalSales: 1,
        totalOrders: 1,
        paidOrders: 1,
        pendingOrders: 1,
        failedOrders: 1,
        shippedOrders: 1,
        averageOrderValue: {
          $cond: [
            {
              $eq: ["$paidOrders", 0],
            },
            0,
            {
              $divide: ["$totalSales", "$paidOrders"],
            },
          ],
        },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    message: "Sales analytics fetched successfully",
    data: result[0] ?? {
      totalSales: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      paidOrders: 0,
      pendingOrders: 0,
      failedOrders: 0,
      shippedOrders: 0,
    },
  });
};
