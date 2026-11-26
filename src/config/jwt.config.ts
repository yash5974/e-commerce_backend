import { createPrivateKey, createPublicKey, KeyObject } from "node:crypto";

import { Algorithm, SignOptions } from "jsonwebtoken";
import { environment } from "./env.js";

const normalizePem = (value: string): string => {
  return value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
};

const privateKeyPem = normalizePem(environment.private_key);
const publicKeyPem = normalizePem(environment.public_key);

// Parse actual PEM strings (NO Base64 decoding)
const privateKey = createPrivateKey({
  key: privateKeyPem,
  format: "pem",
});

const publicKey = createPublicKey({
  key: publicKeyPem,
  format: "pem",
});

// Validate RSA key types
if (privateKey.asymmetricKeyType !== "rsa") {
  throw new Error("JWT private key must be RSA");
}

if (publicKey.asymmetricKeyType !== "rsa") {
  throw new Error("JWT public key must be RSA");
}

// Validate that both keys belong to the same pair
if (privateKey.export({ type: "pkcs8", format: "pem" }).toString() === "") {
  throw new Error("Invalid private key");
}

export const jwtConfig: {
  privateKey: KeyObject;
  publicKey: KeyObject;
  accessTokenExpiry: SignOptions["expiresIn"];
  refreshTokenExpiry: SignOptions["expiresIn"];
  algorithm: Algorithm;
} = {
  privateKey,
  publicKey,
  accessTokenExpiry: "1h",
  refreshTokenExpiry: "7d",
  algorithm: "RS256",
};
