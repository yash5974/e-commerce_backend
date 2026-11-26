import dotenv from "dotenv";
dotenv.config({ quiet: true });

const getEnv = (key: string, required = true): string => {
  const value = process.env[key];

  if (required && (!value || !value.trim())) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value?.trim() ?? "";
};

export const environment = {
  PORT: getEnv("PORT"),
  DB_CONNECTION: getEnv("DB_CONNECTION"),
  redisUrl: getEnv("REDIS_URL"),

  // JWT
  private_key: getEnv("JWT_PRIVATE_KEY"),
  public_key: getEnv("JWT_PUBLIC_KEY"),

  // Stripe
  stripe_webhook_secret: getEnv("STRIPE_WEBHOOK_SECRET"),
  stripe_secret_key: getEnv("STRIPE_SECRET_KEY"),

  // Razorpay
  razorpay_webhook_secret: getEnv("RAZORPAY_WEBHOOK_SECRET"),
  razorpay_key_id: getEnv("RAZORPAY_KEY_ID"),
  razorpay_key_secret: getEnv("RAZORPAY_KEY_SECRET"),

  // SMTP
  SMTP_HOST: getEnv("SMTP_HOST"),
  SMTP_PORT: getEnv("SMTP_PORT"),
  SMTP_SECURE: getEnv("SMTP_SECURE", false).toLowerCase() === "true",
  EMAIL_FROM_ADDRESS: getEnv("EMAIL_FROM_ADDRESS"),
  SMTP_USER: getEnv("SMTP_USER"),
  SMTP_PASSWORD: getEnv("SMTP_PASSWORD"),
  EMAIL_ENABLED: getEnv("EMAIL_ENABLED", false),

  // OTP
  OTP_SECRET: getEnv("OTP_SECRET"),
};
