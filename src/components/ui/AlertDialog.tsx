import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import Button from './Button';
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-dark/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-sm bg-white rounded-lg shadow-warm-lg overflow-hidden"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="alert-dialog-message"
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${iconClass}`}>
                    <Icon size={22} />
                  </div>
                  <div className="flex-1 pt-1 min-w-0">
                    {options.title && (
                      <h3 className="font-display text-lg font-bold text-dark mb-1">{options.title}</h3>
                    )}
                    <p id="alert-dialog-message" className="text-dark-muted text-sm leading-relaxed">
                      {options.message}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <Button size="sm" onClick={dismiss} autoFocus>
                    {options.okLabel ?? 'OK'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AlertContext.Provider>
  );
}