import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, animate as animateMotionValue, type PanInfo } from 'framer-motion';
import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
} from '@phosphor-icons/react';

export interface PagedCarouselHandle {
  next: () => void;
  prev: () => void;
}


interface PagedCarouselProps<T> {
  items: T[];
  /** Resolved card count for the current viewport — pass the result of useResponsiveItemsPerView. */
  itemsPerView: number;
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
  /** Extra space (px) reserved above the sliding track for content that
   *  intentionally overflows a card's top edge (e.g. a circular badge that
   *  straddles the border). Without this, the track's `overflow-hidden`
   *  (needed to mask horizontal sliding) clips the top of that content.
   *  A matching negative margin keeps the track's visual position unchanged. */
  topOverflow?: number;
  /** Forces the horizontal drag/swipe gesture to stay enabled even when
   *  there's only a single page (i.e. items.length <= itemsPerView), so
   *  touch swipes are always available rather than only appearing once
   *  prev/next controls show up. */
  alwaysDrag?: boolean;
  /** When set, the carousel advances on its own every this-many milliseconds
   *  and loops back to the first card after the last. It pauses while the
   *  visitor is touching/hovering it (and for a moment afterwards), only runs
   *  while on screen, and stays off for people who prefer reduced motion. */
  autoPlayMs?: number;
  /** Sizes the carousel to the card(s) currently showing instead of the
   *  tallest card in the list, and eases the height whenever the visible
   *  card changes — so a short card isn't followed by a blank gap. */
  autoHeight?: boolean;
}

// How far (as a fraction of one card's width) or how fast (px/s) a swipe
// needs to be before it counts as "advance one page", rather than
// snapping back to where it started. Matching thresholds used elsewhere
// in the app (see Lightbox.tsx) so every swipeable surface feels the same.
const OFFSET_FRACTION_THRESHOLD = 0.2;
const VELOCITY_THRESHOLD = 400;

function PagedCarouselInner<T>(
  { items, itemsPerView, renderItem, keyExtractor, topOverflow = 0, alwaysDrag = false, autoPlayMs, autoHeight = false }: PagedCarouselProps<T>,
  ref: React.Ref<PagedCarouselHandle>
) {
  const maxIndex = Math.max(0, items.length - itemsPerView);
  const [rawIndex, setIndex] = useState(0);

  // Derive (rather than sync-via-effect) so the index stays valid if the
  // viewport — and therefore itemsPerView — changes, e.g. on resize.
  const index = Math.min(rawIndex, maxIndex);

  // Pixel width of the viewport (the overflow-hidden wrapper), measured via
  // ResizeObserver rather than a one-off read so it stays correct across
  // resizes, orientation changes, and sidebar/zoom changes — not just the
  // initial `window.innerWidth` at mount. Everything below (drag bounds,
  // snap targets, imperative next/prev) is computed in real pixels from
  // this, rather than the old percentage-based `animate` prop, so the
  // track visually tracks the finger 1:1 while dragging instead of barely
  // moving until release.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const itemWidth = itemsPerView > 0 ? viewportWidth / itemsPerView : 0;
  const maxOffset = maxIndex * itemWidth;

  const x = useMotionValue(0);
  // Keeps the very first paint (and any programmatic index change, e.g.
  // the "View Accommodation Details" button calling next()) snapped
  // exactly on target; drag gestures update `x` directly via framer
  // motion's own drag handling and are reconciled separately in
  // handleDragEnd below.
  const isFirstRender = useRef(true);
  useEffect(() => {
    const target = -(index * itemWidth);
    if (isFirstRender.current) {
      x.set(target);
      isFirstRender.current = false;
    } else {
      animateMotionValue(x, target, { type: 'spring', damping: 30, stiffness: 300 });
    }
  }, [index, itemWidth, x]);

  // Auto height (opt-in via autoHeight): follow the tallest card currently in
  // view, re-measured whenever it resizes (images loading, text wrapping).
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [slideHeight, setSlideHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!autoHeight) return;
    const visible = slideRefs.current.slice(index, index + itemsPerView).filter((el): el is HTMLDivElement => !!el);
    if (visible.length === 0) return;
    const update = () => setSlideHeight(Math.max(...visible.map(el => el.offsetHeight)));
    update();
    const ro = new ResizeObserver(update);
    visible.forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, [autoHeight, index, itemsPerView, items.length]);

  // Autoplay (opt-in via autoPlayMs).
  const reduceMotion = useReducedMotion();
  const pausedRef = useRef(false);
  const visibleRef = useRef(true);
  const resumeTimer = useRef<number>(0);
  const pauseAutoPlay = () => {
    pausedRef.current = true;
    window.clearTimeout(resumeTimer.current);
  };
  const resumeAutoPlaySoon = () => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      pausedRef.current = false;
    }, 2500);
  };
  useEffect(() => {
    const el = viewportRef.current;
    if (!autoPlayMs || !el) return;
    const io = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [autoPlayMs]);
  useEffect(() => {
    if (!autoPlayMs || reduceMotion || maxIndex < 1) return;
    const id = window.setInterval(() => {
      if (pausedRef.current || !visibleRef.current || document.hidden) return;
      setIndex(i => (Math.min(i, maxIndex) >= maxIndex ? 0 : Math.min(i, maxIndex) + 1));
    }, autoPlayMs);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(resumeTimer.current);
    };
  }, [autoPlayMs, reduceMotion, maxIndex]);

  const prev = () => setIndex(i => Math.max(0, i - 1));
  const next = () => setIndex(i => Math.min(maxIndex, i + 1));

  useImperativeHandle(ref, () => ({ next, prev }));

  if (items.length === 0) return null;

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const offsetThreshold = itemWidth * OFFSET_FRACTION_THRESHOLD;
    let target = index;
    if (info.offset.x < -offsetThreshold || info.velocity.x < -VELOCITY_THRESHOLD) target = index + 1;
    else if (info.offset.x > offsetThreshold || info.velocity.x > VELOCITY_THRESHOLD) target = index - 1;
    setIndex(Math.min(maxIndex, Math.max(0, target)));
  };

  const slideWidthPct = 100 / itemsPerView;
  const pageCount = maxIndex + 1;
  const showControls = items.length > itemsPerView;
  const enableDrag = showControls || alwaysDrag;

  return (
    <div
      onPointerDown={autoPlayMs ? pauseAutoPlay : undefined}
      onPointerUp={autoPlayMs ? resumeAutoPlaySoon : undefined}
      onPointerCancel={autoPlayMs ? resumeAutoPlaySoon : undefined}
      onMouseEnter={autoPlayMs ? pauseAutoPlay : undefined}
      onMouseLeave={autoPlayMs ? resumeAutoPlaySoon : undefined}
    >
      <div
        ref={viewportRef}
        className="overflow-hidden -mx-3"
        style={{
          ...(topOverflow ? { paddingTop: topOverflow, marginTop: -topOverflow } : null),
          // +12px of room so a card's drop shadow isn't clipped by overflow-hidden.
          ...(autoHeight && slideHeight !== null
            ? {
                height: slideHeight + topOverflow + 12,
                transition: reduceMotion ? 'none' : 'height 450ms cubic-bezier(0.22, 1, 0.36, 1)',
              }
            : null),
        }}
      >
        <motion.div
          className={`flex ${autoHeight ? 'items-start' : ''}`}
          drag={enableDrag ? 'x' : false}
          dragConstraints={{ left: -maxOffset, right: 0 }}
          dragElastic={0.08}
          onDragEnd={handleDragEnd}
          style={{ x, touchAction: 'pan-y' }}
        >
          {items.map((item, i) => (
            <div
              key={keyExtractor ? keyExtractor(item, i) : i}
              ref={el => {
                slideRefs.current[i] = el;
              }}
              className="shrink-0 px-3"
              style={{ width: `${slideWidthPct}%` }}
            >
              {renderItem(item, i)}
            </div>
          ))}
        </motion.div>
      </div>

      {showControls && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            aria-label="Previous"
            className="w-10 h-10 rounded-full bg-white hover:bg-primary hover:text-white text-dark-muted border border-background-warm flex items-center justify-center disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-2">
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to page ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === index ? 'bg-primary w-5' : 'bg-background-warm w-2'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            disabled={index === maxIndex}
            aria-label="Next"
            className="w-10 h-10 rounded-full bg-white hover:bg-primary hover:text-white text-dark-muted border border-background-warm flex items-center justify-center disabled:opacity-40 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// forwardRef + generics don't mix directly, so cast through a typed wrapper.
const PagedCarousel = forwardRef(PagedCarouselInner) as <T>(
  props: PagedCarouselProps<T> & { ref?: React.Ref<PagedCarouselHandle> }
) => ReturnType<typeof PagedCarouselInner>;

export default PagedCarousel;
