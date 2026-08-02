import { ZodError } from "zod";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const statusByCode: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  IDEMPOTENCY_CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: { details?: unknown; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = statusByCode[code];
    this.details = options.details;
  }
}

export type ErrorResponse = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};

const UNIQUE_VIOLATION = "23505";

/** Postgres unique violations arrive wrapped by the driver, so walk the cause chain. */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError("VALIDATION_ERROR", "Request validation failed", {
      details: error.flatten(),
    });
  }
  // A duplicate key means the resource already exists; retries must see 409, not a retryable 500.
  if (isUniqueViolation(error)) {
    return new AppError("CONFLICT", "Resource already exists", { cause: error });
  }
  return new AppError("INTERNAL_ERROR", "An unexpected error occurred", { cause: error });
}

export function errorResponse(error: unknown, requestId = crypto.randomUUID()): Response {
  const normalized = normalizeError(error);
  const body: ErrorResponse = {
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
    },
    requestId,
  };
  return Response.json(body, {
    status: normalized.status,
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}
