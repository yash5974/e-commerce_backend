import cors from "cors";
import express, { Request, Response, urlencoded } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { connectDB } from "./config/db.js";
import { dropboxConfig } from "./config/dropbox.config.js";
import { environment } from "./config/env.js";
import { dropboxStorage } from "./infrastructure/storage/dropbox/dropbox.storage.js";
import { globalErrorHandler } from "./middleware/globalError.middleware.js";
import commonRouter from "./router/common.router.js";
import webhookRouter from "./router/webhook.routes.js";
import { redisService } from "./services/redis.service.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(morgan("combined"));
app.use(express.json());
app.use(urlencoded({ extended: true }));

app.use("/api/v1", commonRouter);
app.use(
  "/webhook",
  express.raw({
    type: "application/json",
    limit: "256kb",
  }),
  webhookRouter,
);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Server connected.",
    data: null,
  });
});

app.use(globalErrorHandler);

const port = environment.PORT;

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    await redisService.connect();

    await dropboxStorage.ensureFolder(dropboxConfig.rootFolder);

    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

void startServer();

const shutdown = async (): Promise<void> => {
  console.log("Gracefully shutting down...");

  await redisService.disconnect();

  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});
