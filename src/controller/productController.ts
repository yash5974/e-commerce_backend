import crypto from "crypto";
import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import slugify from "slugify";
import { redisClient } from "../config/redis.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors/domain.errors.js";
import { CategoryModel } from "../model/category.model.js";
import {
  InventoryLogModel,
  InventoryLogType,
} from "../model/inventoryLog.model.js";
import { OrderModel, OrderStatus } from "../model/order.model.js";
import { IProduct, ProductModel } from "../model/product.model.js";
import {
  revenueAnalyticsSchema,
  topProductsAnalyticsSchema,
} from "../schema/revenue.schema.js";
import { CacheService } from "../utils/cache.js";
import { SuccessResponse } from "../utils/successResponse.js";

export interface UpdateInventoryParams {
  productId: string;
}

type ProductCache = SuccessResponse<IProduct[]>;

export const getProducts = async (req: Request, res: Response) => {
  const page = Math.max(Number(req.query.page) || 1, 1);

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  if (Number.isNaN(page) || Number.isNaN(limit)) {
    throw new ForbiddenError("Invalid pagination values");
  }

  const {
    search,
    categoryId,
    brand,
    minPrice,
    maxPrice,
    minRating,
    inStock,
    tags,
    sort,
  } = req.query;

  const filter: any = {
    isActive: true,
  };

  if (categoryId) {
    if (!mongoose.Types.ObjectId.isValid(String(categoryId))) {
      throw new ForbiddenError("Invalid category id");
    }

    filter.categoryId = categoryId;
  }

  if (search) {
    const keyword = String(search).trim();

    if (keyword.length > 100) {
      throw new ForbiddenError("Search keyword too long");
    }

    filter.$text = {
      $search: keyword,
    };
  }

  if (brand) {
    filter.brand = String(brand).trim();
  }

  if (minPrice || maxPrice) {
    filter.price = {};

    if (minPrice) {
      const min = Number(minPrice);

      if (Number.isNaN(min) || min < 0) {
        throw new ForbiddenError("Invalid minimum price");
      }

      filter.price.$gte = min;
    }

    if (maxPrice) {
      const max = Number(maxPrice);

      if (Number.isNaN(max) || max < 0) {
        throw new ForbiddenError("Invalid maximum price");
      }

      filter.price.$lte = max;
    }

    if (
      filter.price.$gte &&
      filter.price.$lte &&
      filter.price.$gte > filter.price.$lte
    ) {
      throw new ForbiddenError("Minimum price cannot exceed maximum price");
    }
  }

  if (minRating) {
    const rating = Number(minRating);

    if (Number.isNaN(rating) || rating < 0 || rating > 5) {
      throw new ForbiddenError("Rating must be between 0 and 5");
    }

    filter.rating = {
      $gte: rating,
    };
  }

  if (inStock === "true") {
    filter.stock = {
      $gt: 0,
    };
  }

  if (inStock === "false") {
    filter.stock = 0;
  }

  if (tags) {
    const tagList = String(tags)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (tagList.length) {
      filter.tags = {
        $in: tagList,
      };
    }
  }

  let sortOption: any = {
    createdAt: -1,
  };

  switch (sort) {
    case "price_asc":
      sortOption = {
        price: 1,
      };
      break;

    case "price_desc":
      sortOption = {
        price: -1,
      };
      break;

    case "rating":
      sortOption = {
        rating: -1,
      };
      break;

    case "name":
      sortOption = {
        name: 1,
      };
      break;

    case "discount":
      sortOption = {
        discountPrice: -1,
      };
      break;

    default:
      break;
  }

  const cacheKey = `products:list:${crypto
    .createHash("md5")
    .update(
      JSON.stringify({
        filter,
        page,
        limit,
        sortOption,
      }),
    )
    .digest("hex")}`;

  const cached = await CacheService.get<ProductCache>(cacheKey);

  if (cached) {
    return res.status(200).json(cached);
  }

  const skip = (page - 1) * limit;

  const [products, totalProducts] = await Promise.all([
    ProductModel.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .select(
        "_id name slug brand price discountPrice stock mainImage rating reviewCount",
      )
      .lean(),

    ProductModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalProducts / limit);

  const response = {
    data: products,

    meta: {
      page,
      limit,
      totalProducts,
      totalPages,

      hasNextPage: page < totalPages,

      hasPreviousPage: page > 1,
    },
  };

  await CacheService.set(cacheKey, response, 120);

  return res.status(200).json({
    success: true,
    message: "Products fetched successfully",
    data: products,
    meta: response.meta,
  });
};

export const getProductDetails = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError("Product id is required.");
  }

  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError("Invalid product id.");
  }

  const cacheKey = `product:details:${id}`;

  const cachedProduct = await CacheService.get(cacheKey);

  if (cachedProduct) {
    res.status(200).json({
      success: true,
      message: "Product fetched successfully.",
      data: cachedProduct,
    });
    return;
  }

  const product = await ProductModel.findOne({
    _id: id,
    isActive: true,
  }).lean();

  if (!product) {
    throw new NotFoundError("Product not found.");
  }

  await CacheService.set(cacheKey, product, 300);

  res.status(200).json({
    success: true,
    message: "Product fetched successfully.",
    data: product,
  });
};

export const createProduct = async (req: Request, res: Response) => {
  const {
    name,
    description,
    categoryId,
    brand,
    price,
    discountPrice = 0,
    stock,
    mainImage,
    galleryImages = [],
    tags = [],
  } = req.body;

  if (discountPrice > price) {
    throw new ValidationError("Discount price cannot be greater than price");
  }

  const categoryExists = await CategoryModel.exists({
    _id: categoryId,
  });

  if (!categoryExists) {
    throw new NotFoundError("Category");
  }

  const product = await ProductModel.create({
    name: name.trim(),
    slug: slugify(name, {
      lower: true,
      strict: true,
      trim: true,
    }),
    description: description.trim(),
    categoryId,
    brand: brand.trim(),
    price,
    discountPrice,
    stock,
    mainImage,
    galleryImages,
    tags,
    rating: 0,
    reviewCount: 0,
    isActive: true,
  });

  if (redisClient.isOpen) {
    try {
      const keys = await redisClient.keys("products:*");

      if (keys.length) {
        await redisClient.del(keys);
      }
    } catch {
      // Cache invalidation failure should not fail the request.
    }
  }

  return res.status(201).json({
    success: true,
    message: "Product created successfully.",
    data: product,
  });
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  const {
    name,
    description,
    categoryId,
    brand,
    price,
    discountPrice,
    stock,
    mainImage,
    galleryImages,
    tags,
    isActive,
  } = req.body;

  if (
    price !== undefined &&
    discountPrice !== undefined &&
    discountPrice > price
  ) {
    throw new ValidationError("Discount price cannot be greater than price");
  }

  if (categoryId) {
    const categoryExists = await CategoryModel.exists({
      _id: categoryId,
    });

    if (!categoryExists) {
      throw new NotFoundError("Category");
    }
  }

  const updateData: Record<string, unknown> = {};

  if (name !== undefined) {
    updateData.name = name.trim();
    updateData.slug = slugify(name, {
      lower: true,
      strict: true,
      trim: true,
    });
  }

  if (description !== undefined) {
    updateData.description = description.trim();
  }

  if (categoryId !== undefined) {
    updateData.categoryId = categoryId;
  }

  if (brand !== undefined) {
    updateData.brand = brand.trim();
  }

  if (price !== undefined) {
    updateData.price = price;
  }

  if (discountPrice !== undefined) {
    updateData.discountPrice = discountPrice;
  }

  if (stock !== undefined) {
    updateData.stock = stock;
  }

  if (mainImage !== undefined) {
    updateData.mainImage = mainImage;
  }

  if (galleryImages !== undefined) {
    updateData.galleryImages = galleryImages;
  }

  if (tags !== undefined) {
    updateData.tags = tags;
  }

  if (isActive !== undefined) {
    updateData.isActive = isActive;
  }

  const product = await ProductModel.findOneAndUpdate(
    {
      _id: id,
    },
    {
      $set: updateData,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!product) {
    throw new NotFoundError("Product");
  }

  return res.status(200).json({
    success: true,
    message: "Product updated successfully.",
    data: product,
  });
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  const product = await ProductModel.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
    },
    {
      $set: {
        isActive: false,
      },
    },
    {
      new: true,
    },
  );

  if (!product) {
    throw new NotFoundError("Product");
  }

  return res.status(200).json({
    success: true,
    message: "Product deleted successfully.",
    data: null,
  });
};

export const updateInventory = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { quantity, type } = req.body;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const increment = type === InventoryLogType.RESTOCK ? quantity : -quantity;

    const product = await ProductModel.findOneAndUpdate(
      {
        _id: productId,
        isActive: true,
        ...(type === InventoryLogType.ORDER && {
          stock: { $gte: quantity },
        }),
      },
      {
        $inc: {
          stock: increment,
        },
      },
      {
        new: true,
        runValidators: true,
        session,
      },
    );

    if (!product) {
      throw new ValidationError(
        type === InventoryLogType.ORDER
          ? "Product not found or insufficient stock"
          : "Product not found",
      );
    }

    const inventoryLog = {
      productId: new Types.ObjectId(productId as string),
      quantity,
      type,
    };

    await InventoryLogModel.create([inventoryLog], {
      session,
    });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully.",
      data: {
        productId: product._id,
        stock: product.stock,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const getRevenueAnalytics = async (req: Request, res: Response) => {
  const parsed = revenueAnalyticsSchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { from, to } = parsed.data;

  const match: Record<string, unknown> = {
    status: OrderStatus.PAID,
  };

  if (from || to) {
    match.createdAt = {};

    if (from) {
      (match.createdAt as Record<string, Date>).$gte = new Date(from);
    }

    if (to) {
      (match.createdAt as Record<string, Date>).$lte = new Date(to);
    }
  }

  const [analytics] = await OrderModel.aggregate([
    {
      $match: match,
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$totalAmount",
              },
              totalPaidOrders: {
                $sum: 1,
              },
              highestOrderValue: {
                $max: "$totalAmount",
              },
              lowestOrderValue: {
                $min: "$totalAmount",
              },
            },
          },
          {
            $project: {
              _id: 0,
              totalRevenue: 1,
              totalPaidOrders: 1,
              highestOrderValue: 1,
              lowestOrderValue: 1,
              averageRevenuePerOrder: {
                $cond: [
                  {
                    $eq: ["$totalPaidOrders", 0],
                  },
                  0,
                  {
                    $divide: ["$totalRevenue", "$totalPaidOrders"],
                  },
                ],
              },
            },
          },
        ],

        dailyRevenue: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              revenue: {
                $sum: "$totalAmount",
              },
              orders: {
                $sum: 1,
              },
            },
          },
          {
            $sort: {
              _id: 1,
            },
          },
          {
            $project: {
              _id: 0,
              date: "$_id",
              revenue: 1,
              orders: 1,
            },
          },
        ],
      },
    },
  ]);

  const summary = analytics.summary[0] ?? {
    totalRevenue: 0,
    totalPaidOrders: 0,
    averageRevenuePerOrder: 0,
    highestOrderValue: 0,
    lowestOrderValue: 0,
  };

  res.status(200).json({
    success: true,
    message: "Revenue analytics fetched successfully",
    data: {
      ...summary,
      dailyRevenue: analytics.dailyRevenue,
    },
  });
};

export const getTopProductsAnalytics = async (req: Request, res: Response) => {
  const parsed = topProductsAnalyticsSchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { from, to, limit } = parsed.data;

  const match: Record<string, unknown> = {
    status: OrderStatus.PAID,
  };

  if (from || to) {
    match.createdAt = {};

    if (from) {
      (match.createdAt as Record<string, Date>).$gte = new Date(from);
    }

    if (to) {
      (match.createdAt as Record<string, Date>).$lte = new Date(to);
    }
  }

  const products = await OrderModel.aggregate([
    {
      $match: match,
    },
    {
      $unwind: "$items",
    },
    {
      $group: {
        _id: "$items.productId",
        productName: {
          $first: "$items.name",
        },
        totalQuantitySold: {
          $sum: "$items.quantity",
        },
        totalRevenue: {
          $sum: {
            $multiply: ["$items.price", "$items.quantity"],
          },
        },
        totalOrders: {
          $sum: 1,
        },
      },
    },
    {
      $sort: {
        totalQuantitySold: -1,
        totalRevenue: -1,
      },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 0,
        productId: "$_id",
        productName: 1,
        totalQuantitySold: 1,
        totalRevenue: 1,
        totalOrders: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    message: "Top products analytics fetched successfully",
    data: products,
  });
};
