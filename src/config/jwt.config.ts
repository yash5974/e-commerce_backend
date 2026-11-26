import { Algorithm, SignOptions } from "jsonwebtoken";
import { environment } from "./env.js";

const normalizePem = (value: string, keyName: string): string => {
  if (!value) {
    throw new Error(`Missing environment variable: ${keyName}`);
  }

  return value.replace(/\\n/g, "\n").trim();
};

export const jwtConfig = {
  privateKey: normalizePem(environment.private_key, "JWT_PRIVATE_KEY"),
  publicKey: normalizePem(environment.public_key, "JWT_PUBLIC_KEY"),
  accessTokenExpiry: "1h",
  refreshTokenExpiry: "7d",
  algorithm: "RS256" as Algorithm,
} satisfies {
  privateKey: string;
  publicKey: string;
  accessTokenExpiry: SignOptions["expiresIn"];
  refreshTokenExpiry: SignOptions["expiresIn"];
  algorithm: Algorithm;
};
