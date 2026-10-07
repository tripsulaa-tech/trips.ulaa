import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  /** Optional bold first line. */
  title?: string;
  message: string;
  /** Defaults to 'info'. */
  variant?: ToastVariant;
  /** Milliseconds before it closes itself. 0 keeps it until dismissed.
   *  Defaults to 4000 (longer for warnings and errors, and for long messages). */
  duration?: number;
  /** Optional button inside the toast (e.g. "Refresh now"). Clicking it runs
   *  onClick and closes the toast. */
  action?: { label: string; onClick: () => void };
}

type ToastInput = Omit<ToastOptions, 'variant' | 'message'>;

export interface ToastApi {
  show: (options: ToastOptions | string) => void;
  success: (message: string, options?: ToastInput) => void;
  error: (message: string, options?: ToastInput) => void;
  info: (message: string, options?: ToastInput) => void;
  warning: (message: string, options?: ToastInput) => void;
  dismissAll: () => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * App-themed, non-blocking notification — for confirmations that don't need
 * a click ("Saved", "Copied"). Use `useAlert` when the person must read and
 * acknowledge something before carrying on.
 *
 *   const toast = useToast();
 *   toast.success('Invoice saved.');
 *   toast.error("Couldn't save. Please try again.");
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}
