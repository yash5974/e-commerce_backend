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
  SMTP_HOST: process.env.SMTP_HOST as string,
  SMTP_PORT: process.env.SMTP_PORT as string,
  SMTP_SECURE: Boolean(process.env.SMTP_SECURE),
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS as string,
  SMTP_USER: process.env.SMTP_USER as string,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD as string,
  EMAIL_ENABLED: process.env.EMAIL_ENABLED as string,
  OTP_SECRET: process.env.OTP_SECRET as string,
};
