import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const environment = {
  PORT: process.env.PORT as string,
  DB_CONNECTION: process.env.DB_CONNECTION as string,
};

export const getPrivateKey = (): string => {
  const key = process.env.JWT_PRIVATE_KEY;
  if (!key) throw new Error("Missing JWT_PRIVATE_KEY");

  return key.replace(/\\n/g, "\n");
};

export const getPublicKey = (): string => {
  const key = process.env.JWT_PUBLIC_KEY;
  if (!key) throw new Error("Missing JWT_PUBLIC_KEY");

  return key.replace(/\\n/g, "\n");
};
