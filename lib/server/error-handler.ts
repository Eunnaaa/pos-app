/**
 * Server-side Error Handler untuk API Routes
 * Menangani berbagai jenis error dan return consistent response
 */

import { NextResponse } from 'next/server';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
  };
}

export interface SuccessResponse<T> {
  data: T;
  meta: {
    timestamp: string;
    requestId?: string;
  };
}

// Error codes mapping
export const ERROR_CODES = {
  // Client errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',

  // Multi-tenancy
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  INVALID_BRANCH: 'INVALID_BRANCH',

  // Business logic
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INVALID_OPERATION: 'INVALID_OPERATION',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
} as const;

/**
 * Error class untuk API errors
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Handle success response
 */
export function successResponse<T>(
  data: T,
  requestId?: string
): SuccessResponse<T> {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * Handle error response
 */
export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string
): ErrorResponse {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * Parse error dan return appropriate response
 */
export function handleError(
  error: unknown,
  requestId?: string
): { status: number; body: ErrorResponse } {
  // Handle ApiError
  if (error instanceof ApiError) {
    return {
      status: error.statusCode,
      body: errorResponse(
        error.statusCode,
        error.code,
        error.message,
        error.details,
        requestId
      ),
    };
  }

  // Handle Zod validation errors
  if (typeof error === 'object' && error !== null && (error as Record<string, unknown>).name === 'ZodError') {
    const zodError = error as Record<string, unknown>;
    const fieldErrors = (zodError.errors as Array<Record<string, unknown>>).reduce(
      (acc: Record<string, string>, err: Record<string, unknown>) => {
        const path = (err.path as Array<string>).join('.');
        acc[path] = err.message as string;
        return acc;
      },
      {}
    );

    return {
      status: 422,
      body: errorResponse(
        422,
        ERROR_CODES.VALIDATION_ERROR,
        'Data validation failed',
        fieldErrors,
        requestId
      ),
    };
  }

  // Handle database errors
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (errObj.code === 'P2002') {
      return {
        status: 409,
        body: errorResponse(
          409,
          ERROR_CODES.CONFLICT,
          'Duplicate entry found',
          { field: (errObj.meta as Record<string, unknown>)?.target },
          requestId
        ),
      };
    }

    if (errObj.code === 'P2025') {
      return {
        status: 404,
        body: errorResponse(
          404,
          ERROR_CODES.NOT_FOUND,
          'Record not found',
          undefined,
          requestId
        ),
      };
    }
  }

  // Handle unknown errors
  console.error('Unhandled error:', error);

  return {
    status: 500,
    body: errorResponse(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'Internal server error',
      process.env.NODE_ENV === 'development' ? { raw: typeof error === 'object' && error !== null ? (error as Record<string, unknown>).message : String(error) } : undefined,
      requestId
    ),
  };
}

/**
 * Middleware untuk wrap API routes dengan error handling
 */
export function withErrorHandler(
  handler: (req: Request, context?: unknown) => Promise<Response>
) {
  return async (req: Request, context?: unknown) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const response = await handler(req, context);
      return response;
    } catch (error) {
      const { status, body } = handleError(error, requestId);
      return NextResponse.json(body, { status });
    }
  };
}

/**
 * Helper untuk throw API errors
 */
export function throwBadRequest(
  message: string,
  details?: Record<string, unknown>
): never {
  throw new ApiError(400, ERROR_CODES.BAD_REQUEST, message, details);
}

export function throwUnauthorized(message: string = 'Unauthorized'): never {
  throw new ApiError(401, ERROR_CODES.UNAUTHORIZED, message);
}

export function throwForbidden(message: string = 'Forbidden'): never {
  throw new ApiError(403, ERROR_CODES.FORBIDDEN, message);
}

export function throwNotFound(message: string = 'Not found'): never {
  throw new ApiError(404, ERROR_CODES.NOT_FOUND, message);
}

export function throwConflict(message: string, details?: Record<string, unknown>): never {
  throw new ApiError(409, ERROR_CODES.CONFLICT, message, details);
}

export function throwValidationError(
  message: string,
  details?: Record<string, unknown>
): never {
  throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, message, details);
}

export function throwInternalError(
  message: string = 'Internal server error',
  details?: Record<string, unknown>
): never {
  throw new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message, details);
}

const errorHandler = {
  ApiError,
  ERROR_CODES,
  successResponse,
  errorResponse,
  handleError,
  withErrorHandler,
  throwBadRequest,
  throwUnauthorized,
  throwForbidden,
  throwNotFound,
  throwConflict,
  throwValidationError,
  throwInternalError,
};

export default errorHandler;
