/**
 * Custom Hook untuk API mutations dengan toast notifications
 * Menggunakan gooey-toast untuk success/error handling
 */

import { useState, useCallback } from 'react';
import toastHandler from '@/lib/toast-handler';

interface UseMutationOptions {
  onSuccess?: (data: any) => void | Promise<void>;
  onError?: (error: any) => void;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
}

export function useApiMutation<TData = any, TError = any>(
  mutationFn: (data: any) => Promise<TData>,
  options: UseMutationOptions = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<TError | null>(null);
  const [data, setData] = useState<TData | null>(null);

  const {
    onSuccess,
    onError,
    showSuccessToast = true,
    showErrorToast = true,
    successMessage = 'Operasi berhasil',
    errorMessage = 'Operasi gagal',
  } = options;

  const mutate = useCallback(
    async (payload: any) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await mutationFn(payload);
        setData(result);

        if (showSuccessToast) {
          toastHandler.showSuccess(successMessage);
        }

        await onSuccess?.(result);
        return result;
      } catch (err) {
        setError(err as TError);

        if (showErrorToast) {
          toastHandler.handleApiError(err, errorMessage);
        }

        onError?.(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [
      mutationFn,
      onSuccess,
      onError,
      showSuccessToast,
      showErrorToast,
      successMessage,
      errorMessage,
    ]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    mutate,
    isLoading,
    error,
    data,
    reset,
  };
}

export default useApiMutation;
