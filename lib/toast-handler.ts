/**
 * Centralized Toast Notification Handler
 * Menggunakan sonner untuk error dan success handling
 * 
 * Features:
 * - Error handling (validation, API, system errors)
 * - Success notifications
 * - Warning alerts
 * - Info messages
 * - Auto-dismiss dengan timeout
 * - Custom styling & positioning
 */

import { toast } from 'sonner';

// Types
export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface ToastOptions {
  duration?: number;
  position?: ToastPosition;
}

// Default configurations
const DEFAULT_DURATION = 4000; // 4 seconds
const ERROR_DURATION = 6000; // 6 seconds
const SUCCESS_DURATION = 3000; // 3 seconds
const DEFAULT_POSITION: ToastPosition = 'top-right';

// Toast instances map untuk prevent duplicates
const activeToasts = new Map<string, NodeJS.Timeout>();

/**
 * Helper function untuk generate unique toast ID
 */
function generateToastId(message: string, type: ToastType): string {
  return `${type}-${message}`.replace(/\s+/g, '-').toLowerCase();
}

/**
 * Success Toast Notification
 */
export function showSuccess(
  message: string,
  options?: ToastOptions
) {
  const toastId = generateToastId(message, 'success');
  
  // Clear duplicate toast jika ada
  if (activeToasts.has(toastId)) {
    clearTimeout(activeToasts.get(toastId)!);
    activeToasts.delete(toastId);
  }

  const duration = options?.duration ?? SUCCESS_DURATION;

  toast.success(message, { duration });

  // Track timeout untuk cleanup
  const timeoutId = setTimeout(() => {
    activeToasts.delete(toastId);
  }, duration);

  activeToasts.set(toastId, timeoutId);
}

/**
 * Error Toast Notification
 */
export function showError(
  message: string,
  options?: ToastOptions & { error?: Error | string | unknown }
) {
  const toastId = generateToastId(message, 'error');
  
  if (activeToasts.has(toastId)) {
    clearTimeout(activeToasts.get(toastId)!);
    activeToasts.delete(toastId);
  }

  const duration = options?.duration ?? ERROR_DURATION;

  // Log error untuk debugging
  if (options?.error) {
    console.error('Toast Error:', {
      message,
      error: options.error,
      timestamp: new Date().toISOString(),
    });
  }

  toast.error(message, { duration });

  const timeoutId = setTimeout(() => {
    activeToasts.delete(toastId);
  }, duration);

  activeToasts.set(toastId, timeoutId);
}

/**
 * Warning Toast Notification
 */
export function showWarning(
  message: string,
  options?: ToastOptions
) {
  const toastId = generateToastId(message, 'warning');
  
  if (activeToasts.has(toastId)) {
    clearTimeout(activeToasts.get(toastId)!);
    activeToasts.delete(toastId);
  }

  const duration = options?.duration ?? DEFAULT_DURATION;

  toast.warning(message, { duration });

  const timeoutId = setTimeout(() => {
    activeToasts.delete(toastId);
  }, duration);

  activeToasts.set(toastId, timeoutId);
}

/**
 * Info Toast Notification
 */
export function showInfo(
  message: string,
  options?: ToastOptions
) {
  const toastId = generateToastId(message, 'info');
  
  if (activeToasts.has(toastId)) {
    clearTimeout(activeToasts.get(toastId)!);
    activeToasts.delete(toastId);
  }

  const duration = options?.duration ?? DEFAULT_DURATION;

  toast.info(message, { duration });

  const timeoutId = setTimeout(() => {
    activeToasts.delete(toastId);
  }, duration);

  activeToasts.set(toastId, timeoutId);
}

/**
 * API Error Handler
 * Converts API errors ke user-friendly messages
 */
export function handleApiError(
  error: unknown,
  defaultMessage: string = 'Terjadi kesalahan pada server',
  options?: ToastOptions
): string {
  let message = defaultMessage;

  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    const status = (err.response as Record<string, unknown>)?.status;
    
    if (status === 401) {
      message = 'Sesi Anda telah berakhir. Silakan login kembali.';
    } else if (status === 403) {
      message = 'Anda tidak memiliki akses untuk operasi ini.';
    } else if (status === 404) {
      message = 'Data tidak ditemukan.';
    } else if (status === 409) {
      message = 'Data sudah ada atau terjadi konflik.';
    } else if (status === 422) {
      const errorData = (err.response as Record<string, unknown>)?.data as Record<string, unknown>;
      message = (errorData?.error as Record<string, unknown>)?.message as string || 'Data yang dikirim tidak valid.';
    } else if (status === 500) {
      message = 'Kesalahan server. Silakan coba lagi nanti.';
    } else if (status === 503) {
      message = 'Server sedang dalam pemeliharaan. Silakan coba lagi nanti.';
    } else if ((err as Record<string, unknown>).message === 'Network Error') {
      message = 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
    } else {
      const errorData = (err.response as Record<string, unknown>)?.data as Record<string, unknown>;
      message = (errorData?.error as Record<string, unknown>)?.message as string || (err as Record<string, unknown>).message as string || defaultMessage;
    }
  }

  showError(message, { ...options, error });
  return message;
}

/**
 * Validation Error Handler
 * Handle form/data validation errors
 */
export function handleValidationError(
  errors: Record<string, string | string[]>,
  options?: ToastOptions
): void {
  const errorMessages = Object.entries(errors)
    .map(([field, message]) => {
      const msg = Array.isArray(message) ? message[0] : message;
      return `${field}: ${msg}`;
    })
    .join('\n');

  showError(
    errorMessages || 'Data yang dikirim tidak valid',
    { ...options, duration: 5000 }
  );
}

/**
 * Success Handler untuk CRUD operations
 */
export function handleCrudSuccess(
  operation: 'create' | 'update' | 'delete' | 'restore',
  resourceName: string = 'Data',
  options?: ToastOptions
): void {
  const messages = {
    create: `${resourceName} berhasil ditambahkan`,
    update: `${resourceName} berhasil diperbarui`,
    delete: `${resourceName} berhasil dihapus`,
    restore: `${resourceName} berhasil dipulihkan`,
  };

  showSuccess(messages[operation] || 'Operasi berhasil', {
    ...options,
    duration: SUCCESS_DURATION,
  });
}

/**
 * Loading Toast (placeholder untuk operasi panjang)
 */
export function showLoading(
  message: string = 'Memproses...',
  options?: ToastOptions
): string {
  const toastId = generateToastId(message, 'info');
  
  toast.loading(message);

  return toastId;
}

/**
 * Clear all active toasts
 */
export function clearAllToasts(): void {
  activeToasts.forEach((timeoutId) => {
    clearTimeout(timeoutId);
  });
  activeToasts.clear();
}

/**
 * Transaction Handler untuk operasi multi-step
 */
export async function withToastNotification<T>(
  operation: () => Promise<T>,
  {
    loadingMessage = 'Memproses...',
    successMessage = 'Operasi berhasil',
    errorMessage = 'Operasi gagal',
    onError,
  }: {
    loadingMessage?: string;
    successMessage?: string;
    errorMessage?: string;
    onError?: (error: unknown) => void;
  } = {}
): Promise<T | null> {
  try {
    showInfo(loadingMessage);
    const result = await operation();
    showSuccess(successMessage);
    return result;
  } catch (error) {
    handleApiError(error, errorMessage);
    onError?.(error);
    return null;
  }
}

export default {
  showSuccess,
  showError,
  showWarning,
  showInfo,
  handleApiError,
  handleValidationError,
  handleCrudSuccess,
  showLoading,
  clearAllToasts,
  withToastNotification,
};
