import crypto from "node:crypto";

export const OTP_EXPIRY_MS = 2 * 60 * 1000;

export const generateOtp = (): string => {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
};

export const hashOtp = (otp: string): string => {
  return crypto.createHash("sha256").update(otp, "utf8").digest("hex");
};
