import { FastifyReply } from "fastify";

export interface ErrorResponse {
  status_code: number;
  message: string;
  trace_id: string;
  error?: string;
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string) {
    super(message, 500);
  }
}

export const handleError = (error: any, traceId: string): ErrorResponse => {
  // If it's our custom AppError
  if (error instanceof AppError) {
    return {
      status_code: error.statusCode,
      message: error.message,
      trace_id: traceId,
      error: error.message,
    };
  }

  // Handle Sequelize errors
  if (error.name === "SequelizeValidationError") {
    return {
      status_code: 400,
      message: "Validation Error",
      trace_id: traceId,
      error: error.message,
    };
  }

  if (error.name === "SequelizeUniqueConstraintError") {
    return {
      status_code: 409,
      message: "Duplicate Entry",
      trace_id: traceId,
      error: error.message,
    };
  }

  if (error.name === "SequelizeForeignKeyConstraintError") {
    return {
      status_code: 400,
      message: "Invalid Reference",
      trace_id: traceId,
      error: error.message,
    };
  }

  // Handle JWT errors
  if (error.name === "JsonWebTokenError") {
    return {
      status_code: 401,
      message: "Invalid Token",
      trace_id: traceId,
      error: error.message,
    };
  }

  if (error.name === "TokenExpiredError") {
    return {
      status_code: 401,
      message: "Token Expired",
      trace_id: traceId,
      error: error.message,
    };
  }

  // Handle network/axios errors
  if (error.code === "ECONNREFUSED") {
    return {
      status_code: 503,
      message: "Service Unavailable",
      trace_id: traceId,
      error: "Database connection refused",
    };
  }

  if (error.code === "ENOTFOUND") {
    return {
      status_code: 503,
      message: "Service Unavailable",
      trace_id: traceId,
      error: "Service not found",
    };
  }

  // Default error response
  return {
    status_code: 500,
    message: "Internal Server Error",
    trace_id: traceId,
    error: error.message || "An unexpected error occurred",
  };
};

export const createErrorResponse = (
  statusCode: number,
  message: string,
  traceId: string,
  error?: string
): ErrorResponse => {
  return {
    status_code: statusCode,
    message,
    trace_id: traceId,
    error,
  };
};

export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};
