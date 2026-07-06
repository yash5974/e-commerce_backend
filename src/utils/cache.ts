import { redisClient } from "../config/redis";

export class Cache {
  public static async get<T>(key: string): Promise<T | null> {
    try {
      if (!redisClient.isOpen) {
        return null;
      }

      const value = await redisClient.get(key);

      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error("Redis GET Error:", error);
      return null;
    }
  }

  public static async set<T>(
    key: string,
    value: T,
    ttlInSeconds = 300,
  ): Promise<void> {
    try {
      if (!redisClient.isOpen) {
        return;
      }

      await redisClient.set(key, JSON.stringify(value), {
        EX: ttlInSeconds,
      });
    } catch (error) {
      console.error("Redis SET Error:", error);
    }
  }

  public static async del(key: string): Promise<void> {
    try {
      if (!redisClient.isOpen) {
        return;
      }

      await redisClient.del(key);
    } catch (error) {
      console.error("Redis DEL Error:", error);
    }
  }

  public static async exists(key: string): Promise<boolean> {
    try {
      if (!redisClient.isOpen) {
        return false;
      }

      return (await redisClient.exists(key)) === 1;
    } catch (error) {
      console.error("Redis EXISTS Error:", error);
      return false;
    }
  }

  public static async flush(): Promise<void> {
    try {
      if (!redisClient.isOpen) {
        return;
      }

      await redisClient.flushAll();
    } catch (error) {
      console.error("Redis FLUSH Error:", error);
    }
  }
}
