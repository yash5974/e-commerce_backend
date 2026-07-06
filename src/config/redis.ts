import { createClient } from "redis";
import { environment } from "./env";
import { redisService } from "../services/redis.service";

export const redisClient = createClient({
  url: environment.redisUrl,
});

redisClient.on("connect", () => {
  console.log("🟡 Connecting to Redis...");
});

redisClient.on("ready", () => {
  console.log("🟢 Redis connected.");
});

redisClient.on("reconnecting", () => {
  console.warn("🟠 Reconnecting to Redis...");
});

redisClient.on("end", () => {
  console.warn("🔴 Redis connection closed.");
});

redisClient.on("error", (error: unknown) => {
  console.error("❌ Redis Error:", error);
});
