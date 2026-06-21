import { BaseAppError } from "./base.error";

export class NotFoundError extends BaseAppError {
  constructor(resource: string) {
    super({
      message: `${resource} not found`,
      statusCode: 404,
      code: "NOT_FOUND",
    });
  }
}

export class ValidationError extends BaseAppError {
  constructor(message: string, details?: unknown) {
    super({
      message,
      statusCode: 400,
      code: "VALIDATION_ERROR",
      details,
    });
  }
}

export class UnauthorizedError extends BaseAppError {
  constructor(message = "Unauthorized") {
    super({
      message,
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
  }
}

export class ForbiddenError extends BaseAppError {
  constructor(message = "Forbidden") {
    super({
      message,
      statusCode: 403,
      code: "FORBIDDEN",
    });
  }
}

export class ConflictError extends BaseAppError {
  constructor(message: string) {
    super({
      message,
      statusCode: 409,
      code: "CONFLICT",
    });
  }
}
