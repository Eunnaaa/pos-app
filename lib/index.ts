/**
 * Centralized exports for lib modules
 */

// Toast Handler - Error & Success notifications
export * from './toast-handler';
export { default as toastHandler } from './toast-handler';

// Canonical server errors live in lib/server/errors.ts and are re-exported by
// lib/server/index.ts. The retired error-handler module has been removed.
