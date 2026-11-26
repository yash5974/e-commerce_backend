import { Algorithm, SignOptions } from "jsonwebtoken";
import { environment } from "./env.js";
import { createPrivateKey, createPublicKey, KeyObject } from "node:crypto";

// const normalizePem = (value: string): string => {
//   return value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
// };

// const privateKeyPem = normalizePem(environment.private_key);
// const publicKeyPem = normalizePem(environment.public_key);

const privateKey = createPrivateKey({
  key: Buffer.from(environment.private_key, "base64"),
  format: "pem",
});

const publicKey = createPublicKey({
  key: Buffer.from(environment.public_key, "base64"),
  format: "pem",
});

export const jwtConfig: {
  privateKey: KeyObject;
  publicKey: KeyObject;
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
