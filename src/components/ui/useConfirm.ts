import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' for destructive actions (delete, reset, etc). Defaults to 'danger'. */
  variant?: 'danger' | 'default';
  /** For a pure-info notice with nothing to cancel out of — hides the Cancel button, leaving only the confirm/OK action. */
  hideCancel?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Drop-in, app-themed replacement for `window.confirm`.
 *
 * const confirm = useConfirm();
 * const ok = await confirm('Delete this album?');
 * if (!ok) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a <ConfirmDialogProvider>');
  return ctx;
}
