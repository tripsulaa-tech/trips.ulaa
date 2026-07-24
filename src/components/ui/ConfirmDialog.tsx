import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Button from './Button';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' for destructive actions (delete, reset, etc). Defaults to 'danger'. */
  variant?: 'danger' | 'default';
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

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

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(typeof opts === 'string' ? { message: opts } : opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (result: boolean) => {
    setOptions(null);
    resolverRef.current?.(result);
    resolverRef.current = undefined;
  };

  const isOpen = !!options;
  const variant = options?.variant ?? 'danger';
  const Icon = variant === 'danger' ? AlertTriangle : HelpCircle;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {isOpen && options && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-dark/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) settle(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-warm-lg overflow-hidden"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-message"
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${
                      variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    <Icon size={22} />
                  </div>
                  <div className="flex-1 pt-1 min-w-0">
                    {options.title && (
                      <h3 className="font-display text-lg font-bold text-dark mb-1">{options.title}</h3>
                    )}
                    <p id="confirm-dialog-message" className="text-dark-muted text-sm leading-relaxed">
                      {options.message}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 mt-6 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => settle(false)} autoFocus>
                    {options.cancelLabel ?? 'Cancel'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => settle(true)}
                    className={
                      variant === 'danger'
                        ? '!bg-red-600 !border-red-600 hover:!bg-red-700 active:!bg-red-700 !text-white'
                        : ''
                    }
                  >
                    {options.confirmLabel ?? 'Confirm'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
