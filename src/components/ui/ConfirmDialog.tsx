import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Warning as AlertTriangle,
  Question as HelpCircle,
} from '@phosphor-icons/react';
import Button from './Button';
import DialogShell from './DialogShell';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './useConfirm';

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
          <DialogShell
            icon={Icon}
            iconClass={variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'}
            title={options.title}
            message={options.message}
            messageId="confirm-dialog-message"
            onBackdropClick={() => settle(!!options?.hideCancel)}
          >
            <div className="flex gap-3 mt-6 justify-end">
              {!options.hideCancel && (
                <Button variant="ghost" size="sm" onClick={() => settle(false)} autoFocus>
                  {options.cancelLabel ?? 'Cancel'}
                </Button>
              )}
              <Button
                size="sm"
                autoFocus={options.hideCancel}
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
          </DialogShell>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
