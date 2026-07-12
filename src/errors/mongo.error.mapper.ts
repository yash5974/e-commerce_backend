import { BaseAppError } from "./base.error.js";
import { ConflictError, ValidationError } from "./domain.errors.js";

export const mapMongoError = (err: any): BaseAppError => {
  // Duplicate key (unique index violation)
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];

    return new ConflictError(`Duplicate value for field: ${field}`);
  }

  // Mongoose Validation Error
  if (err?.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e: any) => e.message);

    return new ValidationError("Validation failed", errors);
  }

  // Cast Error (Invalid ObjectId)
  if (err?.name === "CastError") {
    return new ValidationError(`Invalid ${err.path}: ${err.value}`);
  }

  return new BaseAppError({
    message: "Database error",
    statusCode: 500,
    isOperational: false,
    details: err,
  });
};
