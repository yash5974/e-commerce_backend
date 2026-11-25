import { createHmac, randomInt } from "node:crypto";
import { env } from "node:process";
import { environment } from "../config/env.js";

export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashOtp(otp: string): string {
  return createHmac("sha256", environment.OTP_SECRET).update(otp).digest("hex");
}
