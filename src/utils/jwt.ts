import crypto from "crypto";

import JWT from "jsonwebtoken";
import { jwtConfig } from "../config/jwt.config.js";
import { AuthPayload, RefreshPayload } from "../config/types/auth.interface.js";

export const signAccessToken = (payload: AuthPayload): string => {
  return JWT.sign(payload, jwtConfig.privateKey, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.accessTokenExpiry,
  });
};

export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// export const verifyAccessToken = (token: string): AuthPayload => {
//   return JWT.verify(token, jwtConfig.publicKey) as AuthPayload;
// };

export const verifyAccessToken = (token: string): AuthPayload => {
  return JWT.verify(token, jwtConfig.publicKey, {
    algorithms: ["RS256"],
  }) as AuthPayload;
};

export const signRefreshToken = (payload: RefreshPayload): string => {
  return JWT.sign(payload, jwtConfig.privateKey, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.refreshTokenExpiry,
  });
};

export const PaymentGateway = {
  async createIntent(amount: number) {
    return {
      providerPaymentId: crypto.randomUUID(),
      clientSecret: crypto.randomUUID(),
    };
  },
};
