import { Algorithm, SignOptions } from "jsonwebtoken";
import { environment } from "./env.js";

const normalizePem = (value: string): string => {
  if (!value) {
    throw new Error("Missing required environment variable");
  }
  return value.replace(/\\n/g, "\n").trim();
};

const privateKeyPem = normalizePem(environment.private_key);
const publicKeyPem = normalizePem(environment.public_key);

export const jwtConfig: {
  privateKey: string;
  publicKey: string;
  accessTokenExpiry: SignOptions["expiresIn"];
  refreshTokenExpiry: SignOptions["expiresIn"];
  algorithm: Algorithm;
} = {
  privateKey: privateKeyPem,
  publicKey: publicKeyPem,
  accessTokenExpiry: "1h",
  refreshTokenExpiry: "7d",
  algorithm: "RS256" as Algorithm,
};
