import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useReducedMotion,
  animate,
  type PanInfo,
} from 'framer-motion';
import { X, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';

// =============================================================================
// GalleryViewer — the single, centralized fullscreen photo viewer for the
// whole app. Every place that lets a visitor click/tap a photo to see it
// bigger (homepage Instagram Moments, album pages, trip Fashion Aesthetics,
// etc.) renders THIS component rather than its own bespoke modal, so the
// interaction — swipe, zoom, keyboard nav, filmstrip — is identical
// everywhere and only needs to be built/maintained once.
//
// Mobile is gesture-first (swipe/pinch/double-tap), desktop adds a
// thumbnail filmstrip + keyboard + mouse drag, on top of the same core.
// See GalleryThumb/GalleryGrid below for a ready-made "clickable grid that
// opens this viewer" helper, used where a page doesn't already have its own
// custom grid markup to preserve.
// =============================================================================

export interface GalleryImageItem {
  src: string;
  alt?: string;
  caption?: string;
  /** Per-photo location label (e.g. "Munnar View Point"). Takes priority
   *  over `fallbackLocation` on GalleryViewer when both are present. */
  location?: string;
}

export type GalleryImageInput = string | GalleryImageItem;

export interface GalleryViewerProps {
  images: GalleryImageInput[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  /** Optional layoutId for the very first image shown, matched against a
   *  `layoutId` on the thumbnail that triggered the open — makes the photo
   *  visually expand from where it was clicked instead of popping in.
   *  Omit for a matched scale/fade entrance instead (used where the
   *  calling page has its own custom grid we don't want to touch). */
  openLayoutId?: string;
  /** Generic location label used when a photo has no `location` of its own
   *  — e.g. a trip name or album destination. Shown alongside the photo
   *  counter in the bottom overlay. Omit entirely on pages with no
   *  meaningful single location (e.g. a mixed homepage feed). */
  fallbackLocation?: string;
}

const SWIPE_VELOCITY_THRESHOLD = 500;
const SWIPE_DISTANCE_RATIO = 0.18; // fraction of viewport width to commit a swipe
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const CONTROLS_HIDE_DELAY = 3000;
const HINT_STORAGE_KEY = 'ulaa-gallery-swipe-hint-seen';

function normalizeImages(images: GalleryImageInput[]): GalleryImageItem[] {
  return images.map(img => (typeof img === 'string' ? { src: img } : img));
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export default function GalleryViewer({ images, initialIndex = 0, isOpen, onClose, openLayoutId, fallbackLocation }: GalleryViewerProps) {
  const items = useMemo(() => normalizeImages(images), [images]);
  const total = items.length;

  const [index, setIndex] = useState(initialIndex);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  if (initialIndex !== prevInitialIndex) {
    setPrevInitialIndex(initialIndex);
    setIndex(initialIndex);
  }

  const [zoom, setZoom] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  const x = useMotionValue(0);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const pinchState = useRef<{ startDist: number; startZoom: number } | null>(null);
  const lastTapRef = useRef(0);

  const reduceMotion = useReducedMotion();
  const springConfig = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 340, damping: 34 };

  const canDragTrack = zoom <= 1.02 && total > 1;

  // ─── measure container width so drag thresholds/track math use real px ──
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const el = containerRef.current;
    const update = () => setTrackWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  // Keep the track centered on the current slide whenever it's not mid-drag.
  useEffect(() => {
    x.set(-trackWidth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackWidth, index]);

  // ─── body scroll lock ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [isOpen]);

  // ─── reset transient state whenever the viewer opens ─────────────────
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: resets transient viewer state (zoom/controls/hint) each time the viewer opens, driven by the isOpen prop transition, not by anything computable during render.
    setZoom(1);
    panX.set(0);
    panY.set(0);
    setControlsVisible(true);
    setHasNavigated(false);

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 50);

    const seenHint = typeof window !== 'undefined' && localStorage.getItem(HINT_STORAGE_KEY);
    if (!seenHint && total > 1) {
      setShowHint(true);
      const hintTimer = setTimeout(() => {
        setShowHint(false);
        try { localStorage.setItem(HINT_STORAGE_KEY, '1'); } catch { /* ignore */ }
      }, 2000);
      return () => { clearTimeout(hintTimer); clearTimeout(focusTimer); };
    }
    return () => clearTimeout(focusTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ─── restore focus to trigger element on close ───────────────────────
  useEffect(() => {
    if (isOpen) return;
    restoreFocusRef.current?.focus?.();
  }, [isOpen]);

  // ─── zoom resets on navigation ────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: zoom must reset whenever the displayed photo (index) changes.
    setZoom(1);
    panX.set(0);
    panY.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ─── auto-hide controls after inactivity ─────────────────────────────
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: (re)starts the auto-hide timer whenever the viewer opens.
    bumpControls();
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); };
  }, [isOpen, bumpControls]);

  // ─── navigation ────────────────────────────────────────────────────────
  const goTo = useCallback((newIndex: number) => {
    setHasNavigated(true);
    setIndex(mod(newIndex, total));
    bumpControls();
  }, [total, bumpControls]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // ─── preload current + adjacent, lazy for the rest ────────────────────
  useEffect(() => {
    if (!isOpen || total === 0) return;
    [index, mod(index + 1, total), mod(index - 1, total)].forEach(i => {
      const img = new Image();
      img.src = items[i]?.src;
    });
  }, [isOpen, index, total, items]);

  // ─── keyboard controls ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      bumpControls();
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && zoom <= 1.02) prev();
      else if (e.key === 'ArrowRight' && zoom <= 1.02) next();
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(MAX_ZOOM, z + 0.5));
      else if (e.key === '-') setZoom(z => Math.max(MIN_ZOOM, z - 0.5));
      else if (e.key === 'Tab') {
        // simple focus trap within the dialog
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, next, prev, zoom, bumpControls]);

  // ─── track drag (swipe) ─────────────────────────────────────────────────
  const handleTrackDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const offset = x.get() - -trackWidth;
    const threshold = trackWidth * SWIPE_DISTANCE_RATIO;
    if (offset < -threshold || info.velocity.x < -SWIPE_VELOCITY_THRESHOLD) {
      animate(x, -trackWidth * 2, springConfig).then(() => { goTo(index + 1); });
    } else if (offset > threshold || info.velocity.x > SWIPE_VELOCITY_THRESHOLD) {
      animate(x, 0, springConfig).then(() => { goTo(index - 1); });
    } else {
      animate(x, -trackWidth, springConfig);
    }
  };

  // ─── swipe-down-to-close on the current slide (only when not zoomed) ──
  const handleSlideDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (zoom > 1.02) return;
    if (info.offset.y > 120 && Math.abs(info.offset.y) > Math.abs(info.offset.x) && info.velocity.y > 200) {
      onClose();
    }
  };

  // ─── zoom: double-tap / double-click ────────────────────────────────────
  const toggleZoom = useCallback(() => {
    setZoom(z => (z > 1.02 ? 1 : DOUBLE_TAP_ZOOM));
    panX.set(0);
    panY.set(0);
  }, [panX, panY]);

  const handleImageTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) toggleZoom();
    lastTapRef.current = now;
    bumpControls();
  };

  // ─── zoom: pinch (touch) ────────────────────────────────────────────────
  const touchDistance = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchState.current = { startDist: touchDistance(e.touches), startZoom: zoom };
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchState.current) {
      const dist = touchDistance(e.touches);
      const scale = pinchState.current.startZoom * (dist / pinchState.current.startDist);
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale)));
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchState.current = null;
  };

  // ─── zoom: mouse wheel (desktop) ────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.0015)));
    bumpControls();
  };

  if (total === 0) return null;

  const prevIdx = mod(index - 1, total);
  const nextIdx = mod(index + 1, total);
  const current = items[index];
  const panRange = trackWidth * 0.5 * Math.max(0, zoom - 1);

  const renderSlide = (
    item: GalleryImageItem,
    i: number,
    isCurrent: boolean,
    slot: 'prev' | 'current' | 'next'
  ) => (
    <div
      key={slot}
      style={{ width: trackWidth || '100%' }}
      className="h-full flex items-center justify-center shrink-0 select-none"
    >
      <motion.img
        src={item.src}
        alt={item.alt || `Photo ${i + 1} of ${total}`}
        draggable={false}
        layoutId={isCurrent && !hasNavigated && openLayoutId ? openLayoutId : undefined}
        initial={isCurrent && !openLayoutId ? { opacity: 0, scale: 0.94 } : { opacity: isCurrent ? 1 : 0.5 }}
        animate={{ opacity: isCurrent ? 1 : 0.5, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: 'easeOut' }}
        onClick={isCurrent ? handleImageTap : undefined}
        onDoubleClick={isCurrent ? toggleZoom : undefined}
        onDragEnd={isCurrent ? handleSlideDragEnd : undefined}
        drag={isCurrent && zoom <= 1.02}
        dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
        dragElastic={0.5}
        style={
          isCurrent
            ? {
                x: zoom > 1.02 ? panX : undefined,
                y: zoom > 1.02 ? panY : undefined,
                scale: zoom,
                touchAction: zoom > 1.02 ? 'none' : 'pan-y',
              }
            : undefined
        }
        className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg pointer-events-auto cursor-zoom-in"
        {...(isCurrent && zoom > 1.02
          ? {
              drag: true,
              dragConstraints: { left: -panRange, right: panRange, top: -panRange, bottom: panRange },
              dragElastic: 0.1,
            }
          : {})}
      />
    </div>
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${index + 1} of ${total}${current.caption ? `: ${current.caption}` : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
          className="fixed inset-0 z-[100] overflow-hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          onMouseMove={bumpControls}
        >
          {/* Solid backdrop — standard app dark tone, no blurred-photo effect */}
          <div aria-hidden className="absolute inset-0 bg-dark" />

          {/* Top controls */}
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                className="absolute top-0 inset-x-0 z-20 px-4 pt-3 sm:pt-4"
              >
                <div className="flex items-center justify-between">
                  {total > 1 ? (
                    <span className="text-cream text-xs sm:text-sm font-button tracking-wide bg-dark-muted px-3 py-1.5 rounded-full">
                      {index + 1} / {total}
                    </span>
                  ) : <span />}
                  <button
                    ref={closeBtnRef}
                    onClick={onClose}
                    aria-label="Close gallery"
                    className="text-dark bg-cream hover:bg-white rounded-full p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                {total > 1 && (
                  <div className="mt-2 flex gap-1">
                    {items.map((_, i) => (
                      <div key={i} className="h-[2px] flex-1 rounded-full bg-white/20 overflow-hidden">
                        <motion.div
                          className="h-full bg-secondary rounded-full"
                          initial={false}
                          animate={{ width: i <= index ? '100%' : '0%' }}
                          transition={{ duration: reduceMotion ? 0 : 0.2 }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* First-time swipe hint */}
          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-20 flex justify-center pointer-events-none"
              >
                <span className="text-cream text-sm font-button tracking-wide bg-dark-muted px-4 py-2 rounded-full">
                  ← Swipe to explore photos →
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop-only arrow buttons — mobile relies purely on gestures */}
          {total > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prev(); }}
                aria-label="Previous photo"
                className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 text-dark bg-cream hover:bg-white rounded-full p-3 items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next(); }}
                aria-label="Next photo"
                className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 text-dark bg-cream hover:bg-white rounded-full p-3 items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {/* Swipeable track: prev / current / next windows */}
          <div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {trackWidth > 0 && (
              <motion.div
                className="flex h-full sm:h-[80vh]"
                style={{ x, width: trackWidth * 3 }}
                drag={canDragTrack ? 'x' : false}
                dragElastic={0.15}
                dragMomentum={false}
                onDragEnd={handleTrackDragEnd}
              >
                {renderSlide(items[prevIdx], prevIdx, false, 'prev')}
                {renderSlide(items[index], index, true, 'current')}
                {renderSlide(items[nextIdx], nextIdx, false, 'next')}
              </motion.div>
            )}
          </div>

          {/* Bottom info: location (or caption) + photo count, plus a
              windowed swipe-indicator dot row. Uses a same-tone gradient
              scrim (not a contrasting solid block) so the screen's overall
              brightness stays consistent whether controls are shown or not. */}
          {(() => {
            const locationLabel = current.location || fallbackLocation;
            if (!locationLabel && !current.caption) return null;
            return (
              <AnimatePresence>
                {controlsVisible && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-0 inset-x-0 z-20 pointer-events-none"
                  >
                    <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-dark to-transparent" />
                    <div className="relative px-4 sm:px-6 pb-3 sm:pb-4 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        {locationLabel ? (
                          <>
                            <span className="flex items-center gap-1.5 text-cream text-sm sm:text-base font-display font-semibold truncate">
                              <MapPin size={15} className="shrink-0" />
                              <span className="truncate">{locationLabel}</span>
                            </span>
                            {total > 1 && (
                              <span className="block text-cream/70 text-xs sm:text-sm mt-0.5">
                                Photo {index + 1} of {total}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-cream text-xs sm:text-sm truncate">{current.caption}</span>
                        )}
                      </div>
                      {total > 1 && total <= 12 && (
                        <div className="flex items-center gap-1 shrink-0 pb-0.5">
                          {items.map((_, i) => (
                            <span
                              key={i}
                              className={`rounded-full transition-all duration-200 ${
                                i === index ? 'w-1.5 h-1.5 bg-secondary' : 'w-1 h-1 bg-cream/40'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })()}

          {/* Desktop filmstrip — hidden on small mobile screens */}
          {total > 1 && (
            <AnimatePresence>
              {controlsVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className="hidden sm:block absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4"
                >
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-dark-muted to-transparent z-10 rounded-l-lg" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-dark-muted to-transparent z-10 rounded-r-lg" />
                    <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth bg-dark-muted rounded-lg px-3 py-2.5">
                      {items.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => goTo(i)}
                          aria-label={`Go to photo ${i + 1}`}
                          aria-current={i === index}
                          className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 cursor-pointer transition-all duration-200 ${
                            i === index ? 'ring-2 ring-secondary ring-offset-2 ring-offset-dark scale-105' : 'opacity-50 hover:opacity-90'
                          }`}
                        >
                          <img src={img.src} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// =============================================================================
// GalleryThumb — a clickable grid tile wired to open GalleryViewer with a
// matching layoutId, so the photo visually expands from this exact tile
// instead of the viewer just popping in. Purely optional sugar; any onClick
// handler that opens GalleryViewer works fine without it.
// =============================================================================
interface GalleryThumbProps {
  src: string;
  alt?: string;
  layoutId: string;
  onClick: () => void;
  className?: string;
  imgClassName?: string;
}

export function GalleryThumb({ src, alt, layoutId, onClick, className, imgClassName }: GalleryThumbProps) {
  return (
    <button type="button" onClick={onClick} className={className} aria-label={alt || 'View photo'}>
      <motion.img layoutId={layoutId} src={src} alt={alt || ''} loading="lazy" className={imgClassName} />
    </button>
  );
}

// =============================================================================
// GalleryGrid — a ready-made masonry grid + viewer, for pages that don't
// already have their own custom grid markup to preserve (e.g. album pages).
// =============================================================================
interface GalleryGridProps {
  images: GalleryImageInput[];
  /** Generic location label shown in the viewer's bottom overlay when a
   *  photo has no `location` of its own — e.g. the album's destination. */
  fallbackLocation?: string;
}

export function GalleryGrid({ images, fallbackLocation }: GalleryGridProps) {
  const items = useMemo(() => normalizeImages(images), [images]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);

  const openAt = (i: number) => {
    setSelected(i);
    setOpen(true);
  };

  return (
    <>
      <div className="masonry-grid">
        {items.map((img, i) => (
          <GalleryThumb
            key={i}
            src={img.src}
            alt={img.alt || `Gallery photo ${i + 1}`}
            layoutId={`gallery-grid-${i}`}
            onClick={() => openAt(i)}
            className="masonry-item block w-full cursor-pointer rounded-lg overflow-hidden group"
            imgClassName="w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ))}
      </div>
      <GalleryViewer
        images={items}
        initialIndex={selected}
        isOpen={open}
        onClose={() => setOpen(false)}
        openLayoutId={`gallery-grid-${selected}`}
        fallbackLocation={fallbackLocation}
      />
    </>
  );
}
