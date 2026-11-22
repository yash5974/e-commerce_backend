import express from "express";
import {
  deleteProduct,
  getCategories,
  getProductDetails,
  getProducts,
  getRevenueAnalytics,
  getTopProductsAnalytics,
  updateInventory,
} from "../controller/productController.js";
import { authMiddleware } from "../middleware/middleware.js";
import { asyncHandler } from "./../utils/asyncHandler.js";
const router = express.Router();

router.get("/products", asyncHandler(getProducts));
router.get(
  "/admin/categories",
  authMiddleware("ADMIN"),
  asyncHandler(getCategories),
);
router.get("/products/:id", asyncHandler(getProductDetails));
router.delete(
  "/admin/products/:id",
  authMiddleware("ADMIN"),
  asyncHandler(deleteProduct),
);
router.patch(
  "/admin/inventory/:productId",
  authMiddleware("ADMIN"),
  asyncHandler(updateInventory),
);
router.get(
  "/admin/analytics/revenue",
  authMiddleware("ADMIN"),
  asyncHandler(getRevenueAnalytics),
);
router.get(
  "/admin/analytics/top-products",
  authMiddleware("ADMIN"),
  asyncHandler(getTopProductsAnalytics),
);

export default router;
