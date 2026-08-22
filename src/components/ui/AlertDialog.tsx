import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  WarningCircle as AlertCircle,
  Info,
  CheckCircle as CheckCircle2,
} from '@phosphor-icons/react';
import Button from './Button';
import DialogShell from './DialogShell';
import { AlertContext, type AlertFn, type AlertOptions } from './useAlert';

const VARIANT_CONFIG = {
  error: { icon: AlertCircle, iconClass: 'bg-red-100 text-red-600' },
  info: { icon: Info, iconClass: 'bg-primary/10 text-primary' },
  success: { icon: CheckCircle2, iconClass: 'bg-green-100 text-green-600' },
} as const;

export function AlertDialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<AlertOptions | null>(null);
  const resolverRef = useRef<(() => void) | undefined>(undefined);

  const showAlert = useCallback<AlertFn>((opts) => {
    setOptions(typeof opts === 'string' ? { message: opts } : opts);
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const dismiss = () => {
    setOptions(null);
    resolverRef.current?.();
    resolverRef.current = undefined;
  };

  const isOpen = !!options;
  const variant = options?.variant ?? 'error';
  const { icon: Icon, iconClass } = VARIANT_CONFIG[variant];

  return (
    <AlertContext.Provider value={showAlert}>
      {children}
      <AnimatePresence>
        {isOpen && options && (
          <DialogShell
            icon={Icon}
            iconClass={iconClass}
            title={options.title}
            message={options.message}
            messageId="alert-dialog-message"
            onBackdropClick={dismiss}
          >
            <div className="flex justify-end mt-6">
              <Button size="sm" onClick={dismiss} autoFocus>
                {options.okLabel ?? 'OK'}
              </Button>
            </div>
          </DialogShell>
        )}
      </AnimatePresence>
    </AlertContext.Provider>
  );
}