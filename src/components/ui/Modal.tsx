import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
} from '@phosphor-icons/react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Optional actions (e.g. Save/Cancel), rendered as a footer bar that
   *  stays pinned to the bottom of the modal while the body scrolls. */
  footer?: ReactNode;
  /** Optional content (e.g. a search field) rendered in the header row,
   *  between the title and the close button. Only shown when `title` is set. */
  headerContent?: ReactNode;
  /** Ref attached to the actual scrollable body div. Hand this to any
   *  in-modal jump-nav (e.g. Tabs' `scrollContainerRef`) or search feature
   *  so it can scroll this container's own scrollTop directly instead of
   *  calling a target's scrollIntoView() — which walks every scrollable
   *  ancestor up to <body>/<html>, including this panel's own
   *  overflow-hidden wrapper below, which still accepts a programmatic
   *  scrollTop even though the user can't scroll it by hand. Left
   *  unscoped, that silently shifts the page's own hidden scroll position
   *  and can surface a stray native scrollbar behind the modal. */
  bodyRef?: RefObject<HTMLDivElement | null>;
  /** Opt-in: on mobile the panel fills the entire viewport edge-to-edge
   *  (no rounding, no surrounding margin) instead of the usual centered
   *  card — for content-heavy modals (long multi-tab forms) where every
   *  extra pixel of width/height matters on a small screen. Desktop is
   *  unaffected either way. Defaults to false so every existing modal
   *  keeps its current look exactly. */
  mobileFullScreen?: boolean;
  /** Opt-in: tightens header/body/footer padding and text size on mobile,
   *  and lets `headerContent` wrap to its own row under the title instead
   *  of squeezing into the same row as the close button. Defaults to
   *  false, matching every existing modal's current spacing. */
  compactHeader?: boolean;
  /** Opt-in: removes the body padding and the reserved scrollbar gutter so
   *  children can bleed edge-to-edge (e.g. a full-width hero band). Defaults
   *  to false, so every existing modal is unchanged. */
  flush?: boolean;
  /** Accessible name for the dialog when no `title` is shown (e.g. a modal
   *  whose content draws its own heading). Ignored when `title` is set. */
  ariaLabel?: string;
  /** Opt-in: the panel fills the whole viewport at every screen size (used
   *  by the games). Content is responsible for its own background. */
  fullScreen?: boolean;
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
};

export default function Modal({ isOpen, onClose, title, children, size = 'md', footer, headerContent, bodyRef, mobileFullScreen = false, compactHeader = false, flush = false, ariaLabel, fullScreen = false }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
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

  // Lets page-level chrome (e.g. the floating WhatsApp button) hide itself
  // while a full-screen experience such as a game is open.
  useEffect(() => {
    if (!isOpen || !fullScreen) return;
    document.body.classList.add('fullscreen-modal-open');
    return () => { document.body.classList.remove('fullscreen-modal-open'); };
  }, [isOpen, fullScreen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Moves focus into the dialog the moment it opens, so keyboard and
  // screen-reader users land inside it (and hear it announced via
  // role="dialog" below) instead of it appearing behind wherever focus
  // already was on the page.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-dark/60 backdrop-blur-sm ${fullScreen ? 'p-0 bg-footer' : mobileFullScreen ? 'p-0 sm:p-4' : 'p-4'}`}
          onMouseDown={(e) => { mouseDownOnOverlay.current = e.target === overlayRef.current; }}
          onClick={(e) => {
            if (e.target === overlayRef.current && mouseDownOnOverlay.current) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={!title ? ariaLabel : undefined}
            tabIndex={-1}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative w-full ${fullScreen ? 'max-w-none' : sizes[size]} bg-white shadow-warm-lg overflow-hidden flex flex-col outline-none ${
              fullScreen
                ? 'h-full max-h-none rounded-none'
                : mobileFullScreen
                ? 'h-full sm:h-auto max-h-none sm:max-h-[90vh] rounded-none sm:rounded-md'
                : 'max-h-[90vh] rounded-md'
            }`}
          >
            {!title && (
              <button
                onClick={onClose}
                className={`absolute right-4 ${fullScreen ? 'top-[max(1rem,env(safe-area-inset-top))] bg-white/10 text-cream hover:bg-white/20 border border-white/15' : 'top-4 bg-background text-dark-muted hover:text-dark'} rounded-full p-3 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors z-10`}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            )}

            {/* Header */}
            {title && (
              <div className={`flex items-center border-b border-background-warm flex-shrink-0 ${
                compactHeader ? 'flex-wrap gap-2 sm:gap-4 p-4 sm:p-6' : 'gap-4 p-6'
              }`}>
                <h3 id={titleId} className={`font-display font-bold text-dark flex-shrink-0 ${compactHeader ? 'text-lg sm:text-2xl' : 'text-2xl'}`}>{title}</h3>
                <div className={`flex-1 min-w-0 flex justify-end ${compactHeader ? 'order-last basis-full sm:basis-auto sm:order-none' : ''}`}>{headerContent}</div>
                <button
                  onClick={onClose}
                  className={`text-dark-muted hover:text-dark bg-background rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                    compactHeader ? 'p-2.5 min-w-[40px] min-h-[40px] sm:p-3 sm:min-w-[44px] sm:min-h-[44px]' : 'p-3 min-w-[44px] min-h-[44px]'
                  }`}
                  aria-label="Close"
                >
                  <X size={compactHeader ? 18 : 20} />
                </button>
              </div>
            )}

            {/* Scrollable content. `overflow-y-auto` sits directly on this
                flex item (not a wrapper) — that's what lets the browser
                shrink it to the remaining space in the flex-col modal and
                actually scroll, instead of growing to fit all the content
                and getting clipped by the outer overflow-hidden. */}
            <div ref={bodyRef} className={`overflow-y-auto flex-1 min-h-0 ${flush ? '' : `app-scroll ${compactHeader ? 'p-4 sm:p-6' : 'p-6'}`}`}>
              {children}
            </div>

            {/* Footer — a real flex item below the scroll area (not a
                `position: sticky` trick inside it), same pattern as the
                header above. That means it's always pinned exactly here,
                full stop — including mid-scroll, mid smooth-scroll (e.g. a
                tab-bar jump inside the body), on any browser, regardless of
                how tall the scrollable content is. */}
            {footer && (
              <div className={`flex-shrink-0 border-t border-background-warm bg-white ${compactHeader ? 'px-4 py-3 sm:px-6 sm:py-4' : 'px-6 py-4'} ${mobileFullScreen ? 'rounded-b-none sm:rounded-b-md' : 'rounded-b-md'}`}>
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
