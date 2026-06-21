import { NextFunction, Request, Response } from "express";
import { AuthPayload } from "../config/types/auth.interface";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyAccessToken } from "../utils/jwt";

export const authMiddleware = (roles: ("USER" | "ADMIN")[]) => {
  const roleSet = new Set(roles);

  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        throw new Error("Unauthorized");
      }

      const parts = authHeader.split(" ");

      if (parts.length !== 2 || parts[0] !== "Bearer") {
        throw new Error("Unauthorized");
      }

      const token = parts[1];

      if (!token || token.length < 20) {
        throw new Error("Unauthorized");
      }

      let payload: AuthPayload;

      try {
        payload = verifyAccessToken(token);
      } catch {
        throw new Error("Invalid or expired token");
      }

      if (!roleSet.has(payload.role)) {
        throw new Error("Forbidden");
      }

      // ✅ Works because of global augmentation
      req.user = payload;

      next();
    },
  );
};
