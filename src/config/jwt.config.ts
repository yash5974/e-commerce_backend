import { Algorithm, SignOptions } from "jsonwebtoken";
import { getPrivateKey, getPublicKey } from "./env";

export const jwtConfig: {
  privateKey: string;
  publicKey: string;
  accessTokenExpiry: SignOptions["expiresIn"];
  refreshTokenExpiry: SignOptions["expiresIn"];
  algorithm: Algorithm;
} = {
  privateKey: getPrivateKey(),
  publicKey: getPublicKey(),
  accessTokenExpiry: "15m",
  refreshTokenExpiry: "7d",
  algorithm: "RS256" as Algorithm,
};
