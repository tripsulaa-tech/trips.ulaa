import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useReducedMotion,
  animate,
  type PanInfo,
} from 'framer-motion';
import {
  X,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  MapPin,
  Heart,
  Info,
  ArrowsOut as Maximize2,
  ArrowsIn as Minimize2,
  Play,
  Pause,
  MagnifyingGlassPlus as ZoomIn,
  ArrowCounterClockwise as RotateCcw,
} from '@phosphor-icons/react';

// =============================================================================
// GalleryViewer — ultra-premium fullscreen photo viewer for the whole app.
// Inspired by Apple Photos, Airbnb, Linear, Arc Browser, and Unsplash.
// Features: shared-element transitions, swipe/keyboard navigation, pinch &
// double-tap zoom, drag-to-pan, swipe-down-to-close, glassmorphism controls,
// auto-hiding UI, thumbnail filmstrip, expandable info panel, adaptive
// blurred background using dominant image colors, progressive loading,
// prefetching, single-slide virtualization, fullscreen mode, favorites,
// slideshow, and full keyboard/screen-reader accessibility.
// =============================================================================

interface GalleryImageItem {
  src: string;
  alt?: string;
  caption?: string;
  location?: string;
  date?: string;
  photographer?: string;
}

type GalleryImageInput = string | GalleryImageItem;

interface GalleryViewerProps {
  images: GalleryImageInput[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  /** framer-motion layoutId of the thumbnail that opened the viewer, used
   *  purely for the shared-element morph on open/close of that one photo. */
  openLayoutId?: string;
  fallbackLocation?: string;
  onToggleLike?: (image: GalleryImageItem, index: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SWIPE_VELOCITY_THRESHOLD = 500;
const SWIPE_DISTANCE_RATIO = 0.18;
const CLOSE_DRAG_THRESHOLD = 120;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;
const CONTROLS_HIDE_DELAY = 3500;
const SLIDESHOW_INTERVAL = 4000;
const FAVORITES_KEY = 'ulaa-gallery-favorites';
const FILMSTRIP_WINDOW = 15;
const SPRING = { type: 'spring', stiffness: 320, damping: 32 } as const;

function normalizeImages(images: GalleryImageInput[]): GalleryImageItem[] {
  return images.map(img => (typeof img === 'string' ? { src: img } : img));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ─── Favorites (persisted per-photo, across the whole app) ───────────────────
function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function writeFavorites(set: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable/full — favorites just won't persist this session */
  }
}

// ─── Dominant color extraction (adaptive blurred background) ────────────────
const dominantColorCache = new Map<string, string>();

function extractDominantColor(src: string): Promise<string> {
  const cached = dominantColorCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 12;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas unavailable');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        const color = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
        dominantColorCache.set(src, color);
        resolve(color);
      } catch {
        resolve('rgb(18, 14, 10)');
      }
    };
    img.onerror = () => resolve('rgb(18, 14, 10)');
    img.src = src;
  });
}

// ─── Prefetching ──────────────────────────────────────────────────────────────
const prefetchedSrcs = new Set<string>();
function prefetchImage(src: string | undefined) {
  if (!src || prefetchedSrcs.has(src)) return;
  prefetchedSrcs.add(src);
  const img = new Image();
  img.src = src;
}

// ─── Slide transition variants ────────────────────────────────────────────────
const slideVariants = {
  enter: (direction: number) => ({ x: direction >= 0 ? '6%' : '-6%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction >= 0 ? '-6%' : '6%', opacity: 0 }),
};

// =============================================================================
// GlassButton — shared floating glassmorphism control
// =============================================================================
interface GlassButtonProps {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}

function GlassButton({ onClick, label, children, className = '', active = false }: GlassButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 hover:bg-black/60 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer ${
        active ? 'ring-1 ring-white/60' : ''
      } ${className}`}
    >
      {children}
    </button>
  );
}

// =============================================================================
// ZoomableImage — pinch/double-tap zoom + drag-to-pan for the active slide
// =============================================================================
interface ZoomableImageProps {
  item: GalleryImageItem;
  reduceMotion: boolean;
  onZoomChange: (zoomed: boolean, zoomValue: number) => void;
  onLoad: () => void;
  loaded: boolean;
  layoutId?: string;
}

const ZoomableImage = memo(function ZoomableImage({ item, onZoomChange, onLoad, loaded, layoutId }: ZoomableImageProps) {
  const zoom = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const [isZoomed, setIsZoomedLocal] = useState(false);
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);

  const setZoomed = useCallback((val: boolean, zoomValue: number) => {
    setIsZoomedLocal(val);
    onZoomChange(val, zoomValue);
  }, [onZoomChange]);

  const resetZoom = useCallback(() => {
    animate(zoom, 1, SPRING);
    animate(panX, 0, SPRING);
    animate(panY, 0, SPRING);
    setZoomed(false, 1);
  }, [zoom, panX, panY, setZoomed]);

  const toggleZoom = useCallback(() => {
    if (zoom.get() > 1.01) {
      resetZoom();
    } else {
      animate(zoom, DOUBLE_TAP_ZOOM, SPRING);
      setZoomed(true, DOUBLE_TAP_ZOOM);
    }
  }, [zoom, resetZoom, setZoomed]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) toggleZoom();
    lastTapRef.current = now;
  }, [toggleZoom]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastTouchDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistRef.current != null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const next = clamp(zoom.get() * (dist / lastTouchDistRef.current), MIN_ZOOM, MAX_ZOOM);
      zoom.set(next);
      lastTouchDistRef.current = dist;
      setZoomed(next > 1.02, next);
    }
  }, [zoom, setZoomed]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) lastTouchDistRef.current = null;
    if (zoom.get() <= MIN_ZOOM + 0.05) resetZoom();
  }, [zoom, resetZoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const next = clamp(zoom.get() - e.deltaY * 0.01, MIN_ZOOM, MAX_ZOOM);
    zoom.set(next);
    setZoomed(next > 1.02, next);
  }, [zoom, setZoomed]);

  return (
    <div
      className="relative w-full h-full flex items-center justify-center"
      style={{ touchAction: isZoomed ? 'none' : 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onClick={handleTap}
      onDoubleClick={toggleZoom}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white/5 rounded-lg">
          <div className="absolute inset-0 -translate-x-full gallery-shimmer bg-linear-to-r from-transparent via-white/10 to-transparent" />
        </div>
      )}
      <motion.img
        layoutId={layoutId}
        src={item.src}
        alt={item.alt || item.caption || 'Photo'}
        drag={isZoomed}
        dragElastic={0.05}
        dragMomentum={false}
        onLoad={onLoad}
        fetchPriority="high"
        style={{ x: panX, y: panY, scale: zoom }}
        className={`max-w-full max-h-full w-auto h-auto object-contain select-none transition-opacity duration-500 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        draggable={false}
      />
    </div>
  );
});

// =============================================================================
// Main GalleryViewer
// =============================================================================
export default function GalleryViewer({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  openLayoutId,
  fallbackLocation,
  onToggleLike,
}: GalleryViewerProps) {
  const items = useMemo(() => normalizeImages(images), [images]);
  const reduceMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [index, setIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isSlideshow, setIsSlideshow] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [loadedMap, setLoadedMap] = useState<Record<number, boolean>>({});
  const [bgColor, setBgColor] = useState('rgb(12, 10, 8)');
  const [heartBurstKey, setHeartBurstKey] = useState(0);

  const current = items[index];

  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) globalThis.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = globalThis.setTimeout(() => {
      setControlsVisible(prev => (isZoomed ? prev : false));
    }, CONTROLS_HIDE_DELAY);
  }, [isZoomed]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setIndex(i => (i - 1 + items.length) % items.length);
  }, [items.length]);

  const goNext = useCallback(() => {
    setDirection(1);
    setIndex(i => (i + 1) % items.length);
  }, [items.length]);

  const goTo = useCallback((next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  }, [index]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setIsSlideshow(false);
    onClose();
  }, [onClose]);

  const toggleFavorite = useCallback(() => {
    if (!current) return;
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(current.src)) next.delete(current.src);
      else next.add(current.src);
      writeFavorites(next);
      return next;
    });
    setHeartBurstKey(k => k + 1);
    onToggleLike?.(current, index);
  }, [current, index, onToggleLike]);

  const handleZoomChange = useCallback((zoomed: boolean, zoomValue: number) => {
    setIsZoomed(zoomed);
    setZoomPct(Math.round(zoomValue * 100));
  }, []);

  const handleStageDragEnd = useCallback((_event: unknown, info: PanInfo) => {
    if (isZoomed) return;
    const { offset, velocity } = info;
    if (Math.abs(offset.y) > Math.abs(offset.x) && (offset.y > CLOSE_DRAG_THRESHOLD || velocity.y > SWIPE_VELOCITY_THRESHOLD)) {
      handleClose();
      return;
    }
    const width = containerRef.current?.offsetWidth || globalThis.innerWidth || 1;
    if (offset.x < -width * SWIPE_DISTANCE_RATIO || velocity.x < -SWIPE_VELOCITY_THRESHOLD) {
      goNext();
    } else if (offset.x > width * SWIPE_DISTANCE_RATIO || velocity.x > SWIPE_VELOCITY_THRESHOLD) {
      goPrev();
    }
  }, [isZoomed, goNext, goPrev, handleClose]);

  // Reset per-open state
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting viewer state to match a newly-opened gallery, not syncing an external system
      setIndex(initialIndex);
      setDirection(0);
      setInfoOpen(false);
      setIsSlideshow(false);
      setIsZoomed(false);
      triggerRef.current = document.activeElement as HTMLElement;
      const raf = requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    triggerRef.current?.focus?.();
  }, [isOpen, initialIndex]);

  // Reset zoom flag whenever the visible photo changes (filmstrip/keys can
  // navigate away while zoomed, since zoom only blocks the swipe gesture).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting a derived UI flag when the active photo changes, not syncing an external system
    setIsZoomed(false);
  }, [index]);

  // Lock page scroll while the viewer is open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // Keyboard navigation + shortcuts
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'Escape': handleClose(); break;
        case 'ArrowLeft': goPrev(); break;
        case 'ArrowRight': goNext(); break;
        case ' ': e.preventDefault(); setIsSlideshow(s => !s); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'i': case 'I': setInfoOpen(o => !o); break;
        default: break;
      }
      resetHideTimer();
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [isOpen, goPrev, goNext, toggleFullscreen, resetHideTimer, handleClose]);

  // Basic focus trap while open
  useEffect(() => {
    if (!isOpen) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !containerRef.current) return;
      const focusables = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
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
    globalThis.addEventListener('keydown', trap);
    return () => globalThis.removeEventListener('keydown', trap);
  }, [isOpen]);

  // Fullscreen state sync
  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Auto-hide controls on open + whenever they're shown
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicking off the auto-hide timer for newly-shown controls, not syncing an external system
    if (isOpen) resetHideTimer();
    return () => { if (hideTimerRef.current) globalThis.clearTimeout(hideTimerRef.current); };
  }, [isOpen, resetHideTimer]);

  // Slideshow auto-advance
  useEffect(() => {
    if (!isSlideshow || items.length < 2) return;
    const id = globalThis.setInterval(() => {
      setDirection(1);
      setIndex(i => (i + 1) % items.length);
    }, SLIDESHOW_INTERVAL);
    return () => globalThis.clearInterval(id);
  }, [isSlideshow, items.length]);

  // Adaptive blurred background — dominant color of the active photo
  useEffect(() => {
    if (!isOpen || !current) return;
    let cancelled = false;
    extractDominantColor(current.src).then(color => { if (!cancelled) setBgColor(color); });
    return () => { cancelled = true; };
  }, [isOpen, current]);

  // Prefetch neighboring photos
  useEffect(() => {
    if (!isOpen || items.length < 2) return;
    prefetchImage(items[(index + 1) % items.length]?.src);
    prefetchImage(items[(index - 1 + items.length) % items.length]?.src);
  }, [isOpen, index, items]);

  // Reset progressive-load tracking when the gallery itself changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting per-photo load tracking when the gallery's item set changes, not syncing an external system
    setLoadedMap({});
  }, [items]);

  // Keep the active filmstrip thumbnail in view
  useEffect(() => {
    thumbRefs.current[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  const handleImageLoad = useCallback((i: number) => {
    setLoadedMap(m => ({ ...m, [i]: true }));
  }, []);

  const isFavorite = current ? favorites.has(current.src) : false;

  if (typeof document === 'undefined') return null;

  const filmstripStart = Math.max(0, index - FILMSTRIP_WINDOW);
  const filmstripEnd = Math.min(items.length - 1, index + FILMSTRIP_WINDOW);

  return createPortal(
    <AnimatePresence>
      {isOpen && items.length > 0 && current && (
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Photo viewer, image ${index + 1} of ${items.length}`}
          className="fixed inset-0 z-999 flex flex-col select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
          onPointerMove={resetHideTimer}
          onClick={resetHideTimer}
        >
          {/* Screen-reader live announcement */}
          <div aria-live="polite" className="sr-only">
            {`Image ${index + 1} of ${items.length}${current.caption ? `: ${current.caption}` : ''}`}
          </div>

          {/* Adaptive blurred background using the photo's dominant color */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 transition-colors duration-700"
            style={{ background: `radial-gradient(120% 120% at 50% 20%, ${bgColor}66, #050505 75%)` }}
          />
          <div aria-hidden className="absolute inset-0 -z-10 bg-black/70 backdrop-blur-3xl" />

          {/* Slideshow progress bar */}
          {isSlideshow && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10 z-30">
              <div
                key={`${index}-progress`}
                className="h-full bg-primary"
                style={{ animation: `slideshow-progress ${SLIDESHOW_INTERVAL}ms linear` }}
              />
            </div>
          )}

          {/* Top glass control bar */}
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                key="top-bar"
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.2 }}
                className="relative z-20 flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4"
              >
                <div className="flex items-center gap-2 text-white/90 text-xs sm:text-sm font-medium bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-3 sm:px-4 py-2 shrink-0">
                  {index + 1} / {items.length}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <GlassButton onClick={toggleFavorite} label={isFavorite ? 'Remove from favorites' : 'Add to favorites'} active={isFavorite}>
                    <Heart
                      key={heartBurstKey}
                      size={17}
                      className={isFavorite ? 'fill-red-500 text-red-500 heart-burst' : 'text-white'}
                    />
                  </GlassButton>
                  {items.length > 1 && (
                    <GlassButton onClick={() => setIsSlideshow(s => !s)} label={isSlideshow ? 'Pause slideshow' : 'Start slideshow'} active={isSlideshow}>
                      {isSlideshow ? <Pause size={17} className="text-white" /> : <Play size={17} className="text-white" />}
                    </GlassButton>
                  )}
                  <GlassButton onClick={() => setInfoOpen(o => !o)} label="Toggle photo info" active={infoOpen}>
                    <Info size={17} className="text-white" />
                  </GlassButton>
                  <GlassButton onClick={toggleFullscreen} label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} className="hidden sm:flex">
                    {isFullscreen ? <Minimize2 size={17} className="text-white" /> : <Maximize2 size={17} className="text-white" />}
                  </GlassButton>
                  <GlassButton onClick={handleClose} label="Close viewer">
                    <X size={19} className="text-white" />
                  </GlassButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main stage */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden px-2 sm:px-8">
            {items.length > 1 && controlsVisible && (
              <>
                <GlassButton onClick={goPrev} label="Previous photo" className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-20">
                  <ChevronLeft size={22} className="text-white" />
                </GlassButton>
                <GlassButton onClick={goNext} label="Next photo" className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-20">
                  <ChevronRight size={22} className="text-white" />
                </GlassButton>
              </>
            )}

            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={index}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                drag={!isZoomed && items.length > 1}
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={0.6}
                onDragEnd={handleStageDragEnd}
                className="absolute inset-0 flex items-center justify-center"
              >
                <ZoomableImage
                  item={current}
                  reduceMotion={!!reduceMotion}
                  onZoomChange={handleZoomChange}
                  onLoad={() => handleImageLoad(index)}
                  loaded={!!loadedMap[index]}
                  layoutId={index === initialIndex ? openLayoutId : undefined}
                />
              </motion.div>
            </AnimatePresence>

            {isZoomed && (
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 text-white text-xs font-medium bg-black/45 backdrop-blur-xl border border-white/15 px-4 py-2 rounded-full cursor-pointer hover:bg-black/60 transition-colors shadow-xl"
              >
                <RotateCcw size={13} />
                Reset zoom ({zoomPct}%)
              </button>
            )}
          </div>

          {/* Expandable info panel */}
          <AnimatePresence>
            {infoOpen && (
              <motion.div
                key="info-panel"
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-0 right-0 bottom-0 z-30 w-full sm:w-96 bg-black/60 backdrop-blur-2xl border-l border-white/10 p-6 overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-white font-display text-lg font-semibold">Photo details</h3>
                  <GlassButton onClick={() => setInfoOpen(false)} label="Close info panel">
                    <X size={16} className="text-white" />
                  </GlassButton>
                </div>
                <div className="space-y-4 text-white/80 text-sm">
                  {current.caption && <p className="text-white text-base leading-relaxed">{current.caption}</p>}
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className="text-primary shrink-0" />
                    <span>{current.location || fallbackLocation || 'Unknown location'}</span>
                  </div>
                  {current.date && <div>{current.date}</div>}
                  {current.photographer && <div>Captured by {current.photographer}</div>}
                  <div className="pt-2 text-white/40 text-xs">Image {index + 1} of {items.length}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Thumbnail filmstrip (windowed for large galleries) */}
          <AnimatePresence>
            {controlsVisible && items.length > 1 && (
              <motion.div
                key="filmstrip"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.2 }}
                className="relative z-20 px-3 sm:px-6 pb-3 sm:pb-5 pt-1"
              >
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-1 py-1">
                  {filmstripStart > 0 && <div style={{ minWidth: filmstripStart * 56 }} />}
                  {items.slice(filmstripStart, filmstripEnd + 1).map((img, offset) => {
                    const i = filmstripStart + offset;
                    return (
                      <button
                        key={`${i}-${img.src}`}
                        ref={el => { thumbRefs.current[i] = el; }}
                        type="button"
                        onClick={() => goTo(i)}
                        aria-label={`Go to photo ${i + 1}`}
                        aria-current={i === index}
                        className={`relative shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border-2 transition-all duration-200 cursor-pointer ${
                          i === index ? 'border-white scale-108 shadow-lg' : 'border-white/20 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={img.src} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                  {filmstripEnd < items.length - 1 && <div style={{ minWidth: (items.length - 1 - filmstripEnd) * 56 }} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Off-screen close button for reliable initial focus target */}
          <button ref={closeButtonRef} type="button" onClick={handleClose} className="sr-only">
            Close photo viewer
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// =============================================================================
// GalleryThumb — small reusable clickable thumbnail with shared-element id
// =============================================================================
interface GalleryThumbProps {
  src: string;
  alt?: string;
  layoutId: string;
  onClick: () => void;
  className?: string;
  imgClassName?: string;
}

function GalleryThumb({ src, alt, layoutId, onClick, className, imgClassName }: GalleryThumbProps) {
  return (
    <button type="button" onClick={onClick} className={className} aria-label={alt || 'View photo'}>
      <motion.img layoutId={layoutId} src={src} alt={alt || ''} loading="lazy" className={imgClassName} />
    </button>
  );
}

// =============================================================================
// GalleryGrid — premium masonry grid that opens photos in the GalleryViewer
// =============================================================================
interface GalleryGridProps {
  images: GalleryImageInput[];
  fallbackLocation?: string;
}

export function GalleryGrid({ images, fallbackLocation }: GalleryGridProps) {
  const items = useMemo(() => normalizeImages(images), [images]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);

  // Long albums can have dozens of photos — loading them all up front is
  // heavy on mobile data and makes the page feel endless. Show a first
  // batch and let the visitor pull in more on demand.
  const INITIAL_COUNT = 6;
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  const openAt = (i: number) => { setSelected(i); setOpen(true); };

  return (
    <>
      <div className="masonry-grid">
        {visibleItems.map((img, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: Math.min(i, 12) * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="masonry-item relative"
          >
            <GalleryThumb
              src={img.src}
              alt={img.alt || `Gallery photo ${i + 1}`}
              layoutId={`gallery-grid-${i}`}
              onClick={() => openAt(i)}
              className="block w-full cursor-pointer rounded-lg overflow-hidden group relative"
              imgClassName="w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            />
            <div
              onClick={() => openAt(i)}
              className="absolute inset-0 bg-dark/0 group-hover:bg-dark/20 rounded-lg transition-all duration-400 flex items-center justify-center cursor-pointer"
              aria-hidden
            >
              <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg" />
            </div>
          </motion.div>
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + INITIAL_COUNT)}
            className="px-6 py-2.5 rounded-md border-2 border-primary text-primary text-sm font-button font-semibold hover:bg-primary hover:text-white transition-colors"
          >
            Load More
          </button>
        </div>
      )}
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
