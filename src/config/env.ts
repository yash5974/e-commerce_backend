import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const environment = {
  PORT: process.env.PORT as string,
  DB_CONNECTION: process.env.DB_CONNECTION as string,
  redisUrl: process.env.REDIS_URL as string,
  private_key: process.env.JWT_PRIVATE_KEY as string,
  public_key: process.env.JWT_PUBLIC_KEY as string,
  stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET as string,
  stripe_secret_key: process.env.STRIPE_SECRET_KEY as string,
  razorpay_webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET as string,
  razorpay_key_id: process.env.RAZORPAY_KEY_ID as string,
  razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET as string,
};
