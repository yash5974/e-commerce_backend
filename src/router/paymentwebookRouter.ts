import express from "express";
import {
  createPaymentIntent,
  getPayment,
  getPaymentStatus,
  refundPaymentController,
  retryPayment,
} from "../controller/paymentWebhook.controller.js";
import { authMiddleware } from "../middleware/middleware.js";
import { asyncHandler } from "./../utils/asyncHandler.js";
const router = express.Router();

router.post(
  "/intent",
  authMiddleware("USER"),
  asyncHandler(createPaymentIntent),
);
router.get(
  "/:paymentId",
  authMiddleware("USER", "ADMIN"),
  asyncHandler(getPayment),
);
router.get(
  "/:paymentId/status",
  authMiddleware("USER"),
  asyncHandler(getPaymentStatus),
);
router.post(
  "/:paymentId/retry",
  authMiddleware("USER"),
  asyncHandler(retryPayment),
);

router.post(
  "/:paymentId/refund",
  authMiddleware("ADMIN"),
  asyncHandler(refundPaymentController),
);

router.post(
  "/intent",
  authMiddleware("USER"),
  asyncHandler(createPaymentIntent),
);

export default router;
