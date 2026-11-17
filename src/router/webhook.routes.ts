import { Router } from "express";
import {
  razorpayWebhook,
  stripeWebhook,
} from "../controller/webhook.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/strpie", asyncHandler(stripeWebhook));
router.post("/razorpay", asyncHandler(razorpayWebhook));

export default router;
