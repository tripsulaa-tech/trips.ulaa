import { createContext, useContext } from 'react';

export interface AlertOptions {
  title?: string;
  message: string;
  okLabel?: string;
  /** Defaults to 'error', since that's almost every call site (validation
   *  messages, failed saves). Pass 'info' or 'success' for anything else. */
  variant?: 'error' | 'info' | 'success';
}

export type AlertFn = (options: AlertOptions | string) => Promise<void>;

export const AlertContext = createContext<AlertFn | null>(null);

/**
 * Drop-in, app-themed replacement for `window.alert`.
 *
 * const alert = useAlert();
 * await alert("Amount paid can't be more than the total amount.");
 */
export function useAlert(): AlertFn {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within an <AlertDialogProvider>');
  return ctx;
}
