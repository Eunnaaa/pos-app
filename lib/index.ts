/**
 * Centralized exports for lib modules
 */

// Toast Handler - Error & Success notifications
export * from './toast-handler';
export { default as toastHandler } from './toast-handler';

// NOTE: The canonical server error handling system is in lib/server/errors.ts
// (AppError, normalizeError, errorResponse) and is re-exported via lib/server/index.ts.
// The legacy lib/server/error-handler.ts (ApiError, handleError, withErrorHandler)
// is deprecated and intentionally NOT re-exported here to prevent accidental use.
