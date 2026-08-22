import { motion } from 'framer-motion';
import type { ComponentType, ReactNode } from 'react';

// Shared backdrop + card + icon/title/message layout for the app's two
// single-dialog providers (AlertDialog, ConfirmDialog). Each provider
// supplies its own icon/variant styling and footer buttons as children;
// this only owns the animation and structural markup that was previously
// duplicated between them.
export default function DialogShell({
  icon: Icon,
  iconClass,
  title,
  message,
  messageId,
  onBackdropClick,
  children,
}: {
  icon: ComponentType<{ size?: number }>;
  iconClass: string;
  title?: string;
  message: ReactNode;
  messageId: string;
  onBackdropClick: () => void;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-dark/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onBackdropClick(); }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-sm bg-white rounded-lg shadow-warm-lg overflow-hidden"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={messageId}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${iconClass}`}>
              <Icon size={22} />
            </div>
            <div className="flex-1 pt-1 min-w-0">
              {title && (
                <h3 className="font-display text-lg font-bold text-dark mb-1">{title}</h3>
              )}
              <p id={messageId} className="text-dark-muted text-sm leading-relaxed">
                {message}
              </p>
            </div>
          </div>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
