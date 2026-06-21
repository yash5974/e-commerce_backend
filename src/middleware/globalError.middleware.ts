import { Request, Response, NextFunction } from "express";
import { IAppError, BaseAppError } from "../errors/base.error";
import { mapMongoError } from "../errors/mongo.error.mapper";
import { isMongoError } from "./error.utils";

export const globalErrorHandler = (
  err: IAppError | any,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let error: IAppError;

  // ✅ Step 1: Normalize Error
  if (err instanceof BaseAppError) {
    error = err;
  } else if (isMongoError(err)) {
    error = mapMongoError(err);
  } else {
    error = new BaseAppError({
      message: err.message || "Internal Server Error",
      statusCode: 500,
      isOperational: false,
      details: err,
    });
  }

  //   // ✅ Step 2: Logging (Production-ready hook)
  //   logError(error, req);

  // ✅ Step 3: Response (safe)
  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code || "INTERNAL_ERROR",
      ...(process.env.NODE_ENV !== "production" && {
        stack: error.stack,
        details: error.details,
      }),
    },
  });
};
