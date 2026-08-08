import express from "express";
import {
  addToCart,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from "../controller/cartController.js";
import { authMiddleware } from "../middleware/middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const router = express.Router();

router.post("/cart", authMiddleware("USER"), asyncHandler(addToCart));
router.get("/cart", authMiddleware("USER"), asyncHandler(getCart));
router.patch(
  "/cart/:productId",
  authMiddleware("USER"),
  asyncHandler(updateCartItem),
);
router.delete(
  "/cart/:productId",
  authMiddleware("USER"),
  asyncHandler(removeCartItem),
);
router.delete("/cart", authMiddleware("USER"), asyncHandler(clearCart));

export default router;
