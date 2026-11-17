import express from "express";
import authRouter from "./authRouter.js";
import cartRouter from "./cartRouter.js";
import orderRouter from "./orderRouter.js";
import paymentRouter from "./paymentwebookRouter.js";
import productRouter from "./productRouter.js";
import webhookRouter from "./webhook.routes.js";
const app = express();

app.use("/auth", authRouter);
app.use("/", productRouter);
app.use("/", cartRouter);
app.use("/payments", paymentRouter);
app.use("/", orderRouter);

export default app;
