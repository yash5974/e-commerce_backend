import crypto from "crypto";

import JWT from "jsonwebtoken";
import { jwtConfig } from "../config/jwt.config.js";
import { AuthPayload, RefreshPayload } from "../config/types/auth.interface.js";
import { UnauthorizedError } from "../errors/domain.errors.js";

export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const signAccessToken = (payload: AuthPayload): string => {
  return JWT.sign(payload, jwtConfig.privateKey, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.accessTokenExpiry,
  });
};

export const verifyAccessToken = (token: string): AuthPayload => {
  try {
    return JWT.verify(token, jwtConfig.publicKey, {
      algorithms: ["RS256"],
    }) as AuthPayload;
  } catch (error) {
    if (error instanceof JWT.TokenExpiredError) {
      throw new UnauthorizedError("Access token expired");
    }

    if (error instanceof JWT.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid access token");
    }

    throw error;
  }
};

export const signRefreshToken = (payload: RefreshPayload): string => {
  return JWT.sign(payload, jwtConfig.privateKey, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.refreshTokenExpiry,
  });
};

export const verifyRefreshToken = (token: string): RefreshPayload => {
  return JWT.verify(token, jwtConfig.publicKey, {
    algorithms: ["RS256"],
  }) as RefreshPayload;
};

// export const PaymentGateway = {
//   async createIntent(amount: number) {
//     return {
//       providerPaymentId: crypto.randomUUID(),
//       clientSecret: crypto.randomUUID(),
//     };
//   },
// };

export const PaymentGateway = {
  async createIntent(
    amount: number,
    options: {
      idempotencyKey: string;
    },
  ) {
    const paymentIntentId = `pi_${crypto.randomBytes(16).toString("hex")}`;
    const secret = crypto.randomBytes(24).toString("hex");
    return {
      providerPaymentId: paymentIntentId,
      clientSecret: `${paymentIntentId}_secret_${secret}`,
      amount,
      idempotencyKey: options.idempotencyKey,
    };
  },
};
