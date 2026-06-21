import express from "express";
const app = express();
import authRouter from "./auth/authRouter";

app.use("/api/v1/auth", authRouter);

export default app;
