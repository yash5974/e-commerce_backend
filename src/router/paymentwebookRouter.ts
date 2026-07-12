import express from "express";
import {
  createPaymentIntent,
  paymentWebhook,
} from "../controller/paymentWebhook.controller.js";
import { authMiddleware } from "../middleware/middleware.js";
import { asyncHandler } from "./../utils/asyncHandler.js";
const router = express.Router();

router.post(
  "/intent",
  authMiddleware("USER"),
  asyncHandler(createPaymentIntent),
);
router.post("/payment", asyncHandler(paymentWebhook));

export default router;
