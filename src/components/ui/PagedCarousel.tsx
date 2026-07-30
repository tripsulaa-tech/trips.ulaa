import { forwardRef, useEffect, useImperativeHandle, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PagedCarouselHandle {
  next: () => void;
  prev: () => void;
}

interface ResponsiveCounts {
  base: number;
  sm?: number;
  md?: number;
  lg?: number;
}

/** Resolves how many cards should show at once for the current viewport
 *  width, matching Tailwind's sm(640)/md(768)/lg(1024) breakpoints. */
export function useResponsiveItemsPerView({ base, sm, md, lg }: ResponsiveCounts): number {
  const getValue = () => {
    if (typeof window === 'undefined') return base;
    const w = window.innerWidth;
    if (lg !== undefined && w >= 1024) return lg;
    if (md !== undefined && w >= 768) return md;
    if (sm !== undefined && w >= 640) return sm;
    return base;
  };

  const [value, setValue] = useState(getValue);

  useEffect(() => {
    const onResize = () => setValue(getValue());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, sm, md, lg]);

  return value;
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
}

function PagedCarouselInner<T>(
  { items, itemsPerView, renderItem, keyExtractor, topOverflow = 0, alwaysDrag = false }: PagedCarouselProps<T>,
  ref: React.Ref<PagedCarouselHandle>
) {
  const maxIndex = Math.max(0, items.length - itemsPerView);
  const [rawIndex, setIndex] = useState(0);

  // Derive (rather than sync-via-effect) so the index stays valid if the
  // viewport — and therefore itemsPerView — changes, e.g. on resize.
  const index = Math.min(rawIndex, maxIndex);

  const prev = () => setIndex(i => Math.max(0, i - 1));
  const next = () => setIndex(i => Math.min(maxIndex, i + 1));

  useImperativeHandle(ref, () => ({ next, prev }));

  if (items.length === 0) return null;

  const SWIPE_THRESHOLD = 50;
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) next();
    else if (info.offset.x > SWIPE_THRESHOLD) prev();
  };

  const slideWidthPct = 100 / itemsPerView;
  const pageCount = maxIndex + 1;
  const showControls = items.length > itemsPerView;
  const enableDrag = showControls || alwaysDrag;

  return (
    <div>
      <div
        className="overflow-hidden -mx-3"
        style={topOverflow ? { paddingTop: topOverflow, marginTop: -topOverflow } : undefined}
      >
        <motion.div
          className="flex"
          drag={enableDrag ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.08}
          onDragEnd={handleDragEnd}
          animate={{ x: `-${index * slideWidthPct}%` }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {items.map((item, i) => (
            <div
              key={keyExtractor ? keyExtractor(item, i) : i}
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
