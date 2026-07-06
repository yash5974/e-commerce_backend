import { redisClient } from "../config/redis";

class RedisService {
  private isConnecting = false;

  public async connect(): Promise<void> {
    if (redisClient.isOpen || this.isConnecting) {
      return;
    }

    try {
      this.isConnecting = true;

      await redisClient.connect();

      console.log("✅ Redis service initialized.");
    } catch (error) {
      console.error(
        "⚠️ Redis unavailable. Application will continue without cache.",
        error,
      );
    } finally {
      this.isConnecting = false;
    }
  }

  public async disconnect(): Promise<void> {
    if (!redisClient.isOpen) {
      return;
    }

    try {
      await redisClient.quit();

      console.log("👋 Redis disconnected.");
    } catch (error) {
      console.error("Error while disconnecting Redis:", error);
    }
  }

  public isConnected(): boolean {
    return redisClient.isOpen;
  }
}

export const redisService = new RedisService();
