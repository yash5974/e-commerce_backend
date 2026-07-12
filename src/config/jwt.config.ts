import { Algorithm, SignOptions } from "jsonwebtoken";
import { privateKey, publicKey } from "./env.js";

export const jwtConfig: {
  privateKey: string;
  publicKey: string;
  accessTokenExpiry: SignOptions["expiresIn"];
  refreshTokenExpiry: SignOptions["expiresIn"];
  algorithm: Algorithm;
} = {
  privateKey: privateKey,
  publicKey: publicKey,
  accessTokenExpiry: "1h",
  refreshTokenExpiry: "7d",
  algorithm: "RS256" as Algorithm,
};
