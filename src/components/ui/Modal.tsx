import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional actions (e.g. Save/Cancel), rendered as a footer bar that
   *  stays pinned to the bottom of the modal while the body scrolls. */
  footer?: ReactNode;
  /** Optional content (e.g. a search field) rendered in the header row,
   *  between the title and the close button. Only shown when `title` is set. */
  headerContent?: ReactNode;
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({ isOpen, onClose, title, children, size = 'md', footer, headerContent }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  // Tracks whether the mousedown that started this click also happened on
  // the overlay itself. Without this, selecting text inside the modal
  // (mousedown on an input, drag outside, mouseup on the backdrop) fires a
  // click whose target is the overlay — since that's the nearest common
  // ancestor of the mousedown/mouseup targets — which closed the modal
  // even though the user never actually clicked the backdrop.
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/60 backdrop-blur-sm"
          onMouseDown={(e) => { mouseDownOnOverlay.current = e.target === overlayRef.current; }}
          onClick={(e) => {
            if (e.target === overlayRef.current && mouseDownOnOverlay.current) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative w-full ${sizes[size]} bg-white rounded-md shadow-warm-lg max-h-[90vh] overflow-hidden flex flex-col`}
          >
            {!title && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-dark-muted hover:text-dark bg-background rounded-full p-3 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors z-10"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            )}

            {/* Header */}
            {title && (
              <div className="flex items-center gap-4 p-6 border-b border-background-warm flex-shrink-0">
                <h3 className="font-display text-2xl font-bold text-dark flex-shrink-0">{title}</h3>
                <div className="flex-1 min-w-0 flex justify-end">{headerContent}</div>
                <button
                  onClick={onClose}
                  className="text-dark-muted hover:text-dark bg-background rounded-full p-3 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            )}

            {/* Scrollable content. `overflow-y-auto` sits directly on this
                flex item (not a wrapper) — that's what lets the browser
                shrink it to the remaining space in the flex-col modal and
                actually scroll, instead of growing to fit all the content
                and getting clipped by the outer overflow-hidden. */}
            <div className="app-scroll overflow-y-auto flex-1 min-h-0 p-6">
              {children}

              {/* Sticky footer — lives inside the scroll container as its
                  last child, pinned to the bottom via `position: sticky`.
                  This keeps Save/Cancel reachable at all times without
                  relying on fragile height calculations elsewhere. */}
              {footer && (
                <div className="sticky -bottom-6 -mx-6 -mb-6 mt-6 px-6 py-4 border-t border-background-warm bg-white rounded-b-md">
                  {footer}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
