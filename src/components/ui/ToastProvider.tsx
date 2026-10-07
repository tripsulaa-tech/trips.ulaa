import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { ToastContext, type ToastApi, type ToastOptions, type ToastVariant } from './useToast';

// One look per variant: a solid rounded-square icon tile with a white glyph, and a soft
// shadow tinted in the variant colour so the type reads at a glance. Info uses the brand
// colour; the rest are fixed semantic colours (gold is the theme's own amber).
const VARIANT_CONFIG: Record<ToastVariant, { tile: string; shadow: string; edge: [string, string] }> = {
  success: { tile: 'bg-green-500', shadow: 'shadow-[0_10px_28px_-8px_rgba(34,197,94,0.40),0_2px_8px_rgba(45,33,24,0.06)]', edge: ['#22c55e', '#2dd4bf'] },
  error: { tile: 'bg-red-500', shadow: 'shadow-[0_10px_28px_-8px_rgba(239,68,68,0.38),0_2px_8px_rgba(45,33,24,0.06)]', edge: ['#ef4444', '#fb923c'] },
  info: { tile: 'bg-primary', shadow: 'shadow-[0_10px_28px_-8px_rgba(168,90,42,0.42),0_2px_8px_rgba(45,33,24,0.06)]', edge: ['#A85A2A', '#E8A04A'] },
  warning: { tile: 'bg-gold', shadow: 'shadow-[0_10px_28px_-8px_rgba(200,150,42,0.45),0_2px_8px_rgba(45,33,24,0.06)]', edge: ['#C8962A', '#F0643C'] },
};

// Tail of the border comet: many stacked arcs that all end at the same head. Where they
// overlap the glow builds up, so brightness falls away smoothly from head to tail.
const COMET_LAYERS = 14;
const COMET = Array.from({ length: COMET_LAYERS }, (_, i) => ({
  len: Number((0.5 * Math.pow(1 - i / COMET_LAYERS, 1.7)).toFixed(4)),
  opacity: 0.14,
}));

const DEFAULT_DURATION_MS = 4000;
const WARNING_DURATION_MS = 5000;
const ERROR_DURATION_MS = 6000;
const MAX_DURATION_MS = 12000;
// Roughly the reading time of a long message, so a detailed error isn't gone before it's read.
const MS_PER_CHAR = 55;
const MAX_VISIBLE = 4;
const SWIPE_DISMISS_PX = 48;

// Icon glyphs are drawn as strokes so they can "write themselves" in.
const CIRCLE = 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z';
const GLYPHS: Record<ToastVariant, string[]> = {
  success: ['M2.5 12.5l4 4L15 7.5', 'M11 15.5l1.5 1.5L21.5 7.5'],
  error: [CIRCLE, 'M6 6l12 12'],
  warning: ['M12 4 21 19.5H3Z', 'M12 10.5v3.5', 'M12 17h.01'],
  info: [CIRCLE, 'M12 11v5', 'M12 8h.01'],
};

function StatusIcon({ variant, reduceMotion }: { variant: ToastVariant; reduceMotion: boolean }) {
  const { tile } = VARIANT_CONFIG[variant];
  return (
    <motion.div
      className={`relative shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white ${tile}`}
      initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
      animate={
        reduceMotion
          ? { scale: 1, opacity: 1 }
          : variant === 'error'
            ? { scale: 1, opacity: 1, x: [0, -3, 3, -2, 2, 0] }
            : { scale: 1, opacity: 1 }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : variant === 'error'
            ? { scale: { type: 'spring', stiffness: 420, damping: 18, delay: 0.06 }, opacity: { duration: 0.12, delay: 0.06 }, x: { duration: 0.4, delay: 0.22 } }
            : { type: 'spring', stiffness: 420, damping: 18, delay: 0.06 }
      }
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {GLYPHS[variant].map((d, i) => (
          <motion.path
            key={d}
            d={d}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.38, delay: 0.2 + i * 0.12, ease: 'easeOut' }}
          />
        ))}
      </svg>
    </motion.div>
  );
}

interface ToastItemData {
  id: number;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  action?: ToastOptions['action'];
}

function ToastItem({
  toast,
  depth,
  onDismiss,
  reduceMotion,
}: {
  toast: ToastItemData;
  /** 0 = newest (front); older toasts sit slightly behind it. */
  depth: number;
  onDismiss: (id: number) => void;
  reduceMotion: boolean;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const { shadow, edge } = VARIANT_CONFIG[toast.variant];
  const gradientId = `ulaa-toast-edge-${useId().replace(/:/g, '')}`;

  // Auto-close timer that stops while the pointer or keyboard focus is on the toast and
  // carries on with whatever time was left afterwards. The progress bar below is driven by
  // the same `paused` flag so the two stay in step.
  useEffect(() => {
    if (paused || toast.duration <= 0) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current -= Date.now() - startedAt;
    };
  }, [paused, toast.duration, toast.id, onDismiss]);

  const handleDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > SWIPE_DISMISS_PX || info.velocity.y > 500) onDismiss(toast.id);
  };

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.9, filter: 'blur(8px)' }}
      animate={
        reduceMotion
          ? { opacity: 1 }
          : { opacity: Math.max(0.78, 1 - depth * 0.1), y: 0, scale: 1 - depth * 0.035, filter: 'blur(0px)' }
      }
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94, filter: 'blur(6px)' }}
      transition={
        reduceMotion
          ? { duration: 0.1 }
          : { type: 'spring', stiffness: 380, damping: 26, mass: 0.8, filter: { duration: 0.25 } }
      }
      drag={reduceMotion ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.7 }}
      onDragEnd={handleDragEnd}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{ originY: 1 }}
      className={`pointer-events-auto relative w-full overflow-hidden rounded-xl border border-background-warm bg-white ${shadow} touch-pan-x`}
    >
      {/* A soft comet that glides around the border at a constant speed. It is drawn as a
          stroked rectangle (so the speed is the same on the long and short sides) with a
          tail built from a few fading, shorter-to-longer arcs that share one head. The card
          clips the outer half of the stroke, so 5px of stroke shows as a 2.5px border. It
          runs while a timed toast is up (holding still when paused) and does two laps for one
          that stays until dismissed. Not drawn at all under reduced motion. */}
      {!reduceMotion && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" fill="none">
          {/* Colour runs left to right and back, so the border reads as a gradient all the way round. */}
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={edge[0]} />
              <stop offset="0.5" stopColor={edge[1]} />
              <stop offset="1" stopColor={edge[0]} />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" rx="11" ry="11" style={{ stroke: `url(#${gradientId})`, strokeWidth: 5, opacity: 0.16 }} />
          {COMET.map(({ len, opacity }) => (
            <rect
              key={len}
              width="100%"
              height="100%"
              rx="11"
              ry="11"
              pathLength={1}
              strokeLinecap="round"
              strokeDasharray={`${len} ${1 - len}`}
              style={{
                stroke: `url(#${gradientId})`,
                strokeWidth: 5,
                opacity,
                ['--from' as string]: len,
                ['--to' as string]: len - 1,
                animation: `ulaa-toast-orbit 3.6s linear ${toast.duration > 0 ? 'infinite' : '2'}`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
            />
          ))}
        </svg>
      )}

      <div className="relative flex items-center gap-3 pl-3 pr-2.5 py-3">
        <StatusIcon variant={toast.variant} reduceMotion={reduceMotion} />

        <div className="flex-1 min-w-0" title={toast.message.length > 120 ? toast.message : undefined}>
          {toast.title && <p className="font-display text-sm font-bold text-dark leading-snug">{toast.title}</p>}
          <p className={`text-sm leading-snug break-words line-clamp-4 ${toast.title ? 'text-dark-muted mt-0.5' : 'text-dark font-semibold'}`}>
            {toast.message}
          </p>
        </div>

        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action?.onClick(); onDismiss(toast.id); }}
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-button font-semibold text-white hover:bg-primary-dark active:scale-95 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
          >
            {toast.action.label}
          </button>
        )}

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="group shrink-0 -my-2 -mr-1.5 w-11 h-11 flex items-center justify-center cursor-pointer outline-none"
        >
          <span className="w-7 h-7 rounded-md flex items-center justify-center text-dark-muted/60 group-hover:text-dark group-hover:bg-background-warm group-active:scale-90 group-focus-visible:ring-2 group-focus-visible:ring-primary/40 transition-all">
            <X size={14} aria-hidden="true" />
          </span>
        </button>
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItemData[]>([]);
  const [lift, setLift] = useState(0);
  const nextId = useRef(1);
  const regionRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((input: ToastOptions | string) => {
    const opts: ToastOptions = typeof input === 'string' ? { message: input } : input;
    const variant = opts.variant ?? 'info';
    const item: ToastItemData = {
      id: nextId.current++,
      title: opts.title,
      message: opts.message,
      variant,
      duration: opts.duration ?? Math.min(
        MAX_DURATION_MS,
        Math.max(
          variant === 'error' ? ERROR_DURATION_MS : variant === 'warning' ? WARNING_DURATION_MS : DEFAULT_DURATION_MS,
          (opts.title ? opts.title.length + opts.message.length : opts.message.length) * MS_PER_CHAR,
        ),
      ),
      action: opts.action,
    };
    setToasts(prev => {
      // The same message fired again (e.g. a double-click on Save) replaces
      // the one on screen, restarting its timer, instead of stacking up.
      const rest = prev.filter(t => !(t.message === item.message && t.variant === item.variant && t.title === item.title));
      // The cap applies to self-closing toasts only: one that stays until dismissed (the
      // "new version" notice) must never be pushed off screen by a burst of saves.
      const all = [...rest, item];
      const sticky = all.filter(t => t.duration <= 0);
      const timed = all.filter(t => t.duration > 0).slice(-MAX_VISIBLE);
      return [...sticky, ...timed].sort((a, b) => a.id - b.id);
    });
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (message, options) => show({ ...options, message, variant: 'success' }),
    error: (message, options) => show({ ...options, message, variant: 'error' }),
    info: (message, options) => show({ ...options, message, variant: 'info' }),
    warning: (message, options) => show({ ...options, message, variant: 'warning' }),
    dismissAll: () => setToasts([]),
  }), [show]);

  // Escape closes the newest toast, so keyboard users never have to tab to the X. It steps
  // aside while a dialog is open (Escape belongs to the dialog) unless focus is in the toast.
  const hasAny = toasts.length > 0;
  useEffect(() => {
    if (!hasAny) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const inToast = !!regionRef.current?.contains(document.activeElement);
      if (!inToast && document.querySelector('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')) return;
      setToasts(prev => prev.slice(0, -1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasAny]);

  // Sticky action bars (marked data-toast-avoid, e.g. the Save / Reset footer) are never
  // covered: while a toast is up, it rides above the tallest one currently on screen.
  const hasToasts = toasts.length > 0;
  useEffect(() => {
    if (!hasToasts) return;
    const measure = () => {
      let tallest = 0;
      document.querySelectorAll<HTMLElement>('[data-toast-avoid]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < window.innerHeight && r.bottom > 0) {
          tallest = Math.max(tallest, window.innerHeight - r.top);
        }
      });
      setLift(prev => (Math.abs(prev - tallest) > 1 ? tallest : prev));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [hasToasts]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <style>{`@keyframes ulaa-toast-orbit{from{stroke-dashoffset:var(--from)}to{stroke-dashoffset:var(--to)}}`}</style>
      {/* Bottom-centre, above the phone safe area and any sticky action bar. The wrapper
          ignores pointer events so it never blocks the page; only the toasts are clickable. */}
      <div
        ref={regionRef}
        style={{ bottom: lift }}
        className="pointer-events-none fixed left-1/2 -translate-x-1/2 z-[300] flex w-full max-w-[26rem] flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[bottom] duration-200 ease-out"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast, i) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              depth={toasts.length - 1 - i}
              onDismiss={dismiss}
              reduceMotion={reduceMotion}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
