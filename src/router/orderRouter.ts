import express from "express";
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrderDetails,
  getSalesAnalytics,
  updateOrderStatus,
} from "../controller/orderController.js";
import { authMiddleware } from "../middleware/middleware.js";
import { asyncHandler } from "./../utils/asyncHandler.js";
const router = express.Router();

router.post("/orders", authMiddleware("USER"), asyncHandler(createOrder));
router.get("/orders", authMiddleware("USER"), asyncHandler(getMyOrders));
router.get(
  "/orders/:id",
  authMiddleware("USER"),
  asyncHandler(getOrderDetails),
);
router.get(
  "/admin/orders",
  authMiddleware("ADMIN"),
  asyncHandler(getAllOrders),
);
router.patch(
  "/admin/orders/:id",
  authMiddleware("ADMIN"),
  asyncHandler(updateOrderStatus),
);
router.get(
  "/admin/analytics/sales",
  authMiddleware("ADMIN"),
  getSalesAnalytics,
);

export default router;
