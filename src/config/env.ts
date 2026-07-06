import { generateKeyPairSync } from "crypto";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const environment = {
  PORT: process.env.PORT as string,
  DB_CONNECTION: process.env.DB_CONNECTION as string,
  redisUrl: process.env.REDIS_URL as string,
};

export const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
