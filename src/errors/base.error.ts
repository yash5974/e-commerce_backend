export interface IAppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: unknown;
}

export class BaseAppError extends Error implements IAppError {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public details?: unknown;

  constructor({
    message,
    statusCode = 500,
    isOperational = true,
    code,
    details,
  }: {
    message: string;
    statusCode?: number;
    isOperational?: boolean;
    code?: string;
    details?: unknown;
  }) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}
