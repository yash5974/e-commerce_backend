import { NextFunction, Request, Response } from "express";
import { AuthPayload, Role } from "../config/types/auth.interface.js";
import { ForbiddenError, UnauthorizedError } from "../errors/domain.errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const authMiddleware = (...allowedRoles: Role[]) =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError("Authorization header is required");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Invalid authorization header");
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      throw new UnauthorizedError("Access token is required");
    }

    let payload: AuthPayload;

    try {
      payload = verifyAccessToken(token) as AuthPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(payload?.role)) {
      throw new ForbiddenError("You are not allowed to access this resource");
    }

    req.user = payload;

    next();
  });
