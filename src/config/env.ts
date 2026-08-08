import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const environment = {
  PORT: process.env.PORT as string,
  DB_CONNECTION: process.env.DB_CONNECTION as string,
  redisUrl: process.env.REDIS_URL as string,
  private_key: process.env.JWT_PRIVATE_KEY as string,
  public_key: process.env.JWT_PUBLIC_KEY as string,
};
