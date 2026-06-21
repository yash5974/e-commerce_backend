import express from "express";
const router = express.Router();
import authRouter from "./auth/authRouter";

router.get("/api/v1/auth", authRouter);

export default router;
