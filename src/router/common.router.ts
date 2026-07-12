import express from "express";
const app = express();
import authRouter from "./authRouter.js";
import productRouter from "./productRouter.js";
import cartRouter from "./cartRouter.js";
import paymentRouter from "./paymentwebookRouter.js";
import orderRouter from "./orderRouter.js";

app.use("/api/v1/auth", authRouter);
app.use("/", productRouter);
app.use("/", cartRouter);
app.use("/", paymentRouter);
app.use("/", orderRouter);

export default app;
