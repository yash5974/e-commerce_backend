import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../errors/domain.errors.js";
import { CartModel } from "../model/cart.model.js";
import { ProductModel } from "../model/product.model.js";
import { CacheService } from "../utils/cache.js";

export const addToCart = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { productId, quantity } = req.body;

  if (!productId) {
    throw new ValidationError("Product ID is required.");
  }

  if (quantity === undefined) {
    throw new ValidationError("Quantity is required.");
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ValidationError("Invalid product ID.");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ValidationError("Quantity must be a positive integer.");
  }

  const objectProductId = new mongoose.Types.ObjectId(productId);

  const product = await ProductModel.findOne({
    _id: objectProductId,
  })
    .select("_id stock")
    .lean();

  if (!product) {
    throw new NotFoundError("Product");
  }

  if (product.stock < quantity) {
    throw new ValidationError("Requested quantity exceeds available stock.");
  }

  let cart = await CartModel.findOne({ userId }).select("_id userId items");

  if (!cart) {
    cart = await CartModel.create({
      userId,
      items: [
        {
          productId: objectProductId,
          quantity,
        },
      ],
    });
  } else {
    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId,
    );

    if (existingItem) {
      const updatedQuantity = existingItem.quantity + quantity;

      if (updatedQuantity > product.stock) {
        throw new ValidationError(
          "Requested quantity exceeds available stock.",
        );
      }

      existingItem.quantity = updatedQuantity;
    } else {
      cart.items.push({
        productId: objectProductId,
        quantity,
      });
    }

    await cart.save({
      validateModifiedOnly: true,
    });
  }

  res.status(200).json({
    success: true,
    message: "Product added to cart successfully.",
    data: cart,
  });
};

export const getCart = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new UnauthorizedError("Authentication required.");
  }

  const cart = await CartModel.findOne({ userId })
    .populate({
      path: "items.productId",
      select: "_id name slug mainImage price discountPrice stock",
    })
    .select("_id userId items createdAt")
    .lean();

  if (!cart) {
    throw new NotFoundError("Cart");
  }

  cart.items = cart.items.filter((item: any) => item.productId !== null);

  res.status(200).json({
    success: true,
    message: "Cart fetched successfully.",
    data: cart,
  });
};

export const updateCartItem = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.userId;
  const { productId } = req.params;
  const { quantity } = req.body;

  if (!userId) {
    throw new UnauthorizedError("Authentication required.");
  }

  if (!productId) {
    throw new NotFoundError("Product");
  }

  const cart = await CartModel.findOneAndUpdate(
    {
      userId,
      "items.productId": productId,
    },
    {
      $set: {
        "items.$.quantity": quantity,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .populate({
      path: "items.productId",
      select: "_id name slug mainImage price discountPrice stock",
    })
    .select("_id userId items createdAt updatedAt")
    .lean();

  if (!cart) {
    throw new NotFoundError("Product not found in cart");
  }

  // Remove cart items whose products no longer exist.
  cart.items = cart.items.filter((item) => item.productId !== null);

  // Best-effort cache invalidation.
  try {
    await CacheService.del(`cart:${userId}`);
  } catch {
    // Redis failure must not fail the cart update.
  }

  res.status(200).json({
    success: true,
    message: "Cart updated successfully.",
    data: cart,
  });
};

export const removeCartItem = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { productId } = req.params;
  const userId = req.user!.userId;

  const updatedCart = await CartModel.findOneAndUpdate(
    {
      userId,
      "items.productId": productId,
    },
    {
      $pull: {
        items: {
          productId,
        },
      },
      $set: {
        updatedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
    },
  )
    .populate({
      path: "items.productId",
      select: "_id name slug mainImage price discountPrice stock",
    })
    .select("_id userId items createdAt updatedAt")
    .lean();

  if (!updatedCart) {
    const cartExists = await CartModel.exists({ userId });

    if (!cartExists) {
      throw new NotFoundError("Cart not found");
    }

    throw new NotFoundError("Product not found in cart");
  }

  try {
    await CacheService.del(`cart:${userId}`);
  } catch {
    // Ignore Redis failures
  }

  res.status(200).json({
    success: true,
    message: "Cart item removed successfully",
    data: updatedCart,
  });
};

export const clearCart = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const updatedCart = await CartModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        items: [],
        updatedAt: new Date(),
      },
    },
    {
      new: true,
    },
  );

  if (!updatedCart) {
    throw new NotFoundError("Cart not found");
  }

  try {
    await CacheService.del(`cart:${userId}`);
  } catch {
    // Cache failure should never fail the request
  }

  res.status(200).json({
    success: true,
    message: "Cart cleared successfully",
    data: updatedCart,
  });
};
