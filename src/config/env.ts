import dotenv from "dotenv";

dotenv.config({ quiet: true });

const getEnv = (key: string, required = false, defaultValue = ""): string => {
  const value = process.env[key]?.trim();

  if (required && !value) {
    console.error(`Missing required environment variable: ${key}`);
    // throw new Error(`Missing required environment variable: ${key}`);
  }

  return value || defaultValue;
};

const getBooleanEnv = (key: string, defaultValue = false): boolean => {
  const value = process.env[key]?.trim().toLowerCase();

  if (!value) return defaultValue;

  return value === "true";
};

export const environment = {
  // Server
  PORT: getEnv("PORT", false, "3000"),
  ALLOWED_NETWORK: getEnv("ALLOWED_NETWORK", true),

  // Database
  DB_CONNECTION: getEnv("DB_CONNECTION", true),

  // Redis
  redisUrl: getEnv("REDIS_URL"),

  // JWT
  private_key: getEnv("JWT_PRIVATE_KEY", true),
  public_key: getEnv("JWT_PUBLIC_KEY", true),

  // Stripe
  stripe_webhook_secret: getEnv("STRIPE_WEBHOOK_SECRET"),
  stripe_secret_key: getEnv("STRIPE_SECRET_KEY"),

  // Razorpay
  razorpay_webhook_secret: getEnv("RAZORPAY_WEBHOOK_SECRET"),
  razorpay_key_id: getEnv("RAZORPAY_KEY_ID"),
  razorpay_key_secret: getEnv("RAZORPAY_KEY_SECRET"),

  // SMTP
  SMTP_HOST: getEnv("SMTP_HOST"),
  SMTP_PORT: getEnv("SMTP_PORT", false, "587"),
  SMTP_SECURE: getBooleanEnv("SMTP_SECURE"),
  EMAIL_FROM_ADDRESS: getEnv("EMAIL_FROM_ADDRESS"),
  SMTP_USER: getEnv("SMTP_USER"),
  SMTP_PASSWORD: getEnv("SMTP_PASSWORD"),

  // Email
  EMAIL_ENABLED: getBooleanEnv("EMAIL_ENABLED"),

  // OTP
  OTP_SECRET: getEnv("OTP_SECRET", true),
};
