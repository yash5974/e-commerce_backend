import { Algorithm, SignOptions } from "jsonwebtoken";
import { privateKey, publicKey } from "./env";

export const jwtConfig: {
  privateKey: string;
  publicKey: string;
  accessTokenExpiry: SignOptions["expiresIn"];
  refreshTokenExpiry: SignOptions["expiresIn"];
  algorithm: Algorithm;
} = {
  privateKey: privateKey,
  publicKey: publicKey,
  accessTokenExpiry: "1m",
  refreshTokenExpiry: "2m",
  algorithm: "RS256" as Algorithm,
};
