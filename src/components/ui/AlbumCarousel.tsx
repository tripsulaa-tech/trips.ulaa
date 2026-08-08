import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, animate as animateMotionValue, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AlbumCard from './AlbumCard';
import type { CompletedTrip } from '../../types/types-index';

interface AlbumCarouselProps {
  items: CompletedTrip[];
}

// Responsive "cards per view": 1 on mobile, 3 on desktop (md and up).
function useItemsPerView() {
  const getValue = () =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 3 : 1;

  const [itemsPerView, setItemsPerView] = useState(getValue);

  useEffect(() => {
    const onResize = () => setItemsPerView(getValue());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return itemsPerView;
}

// How far (as a fraction of one card's width) or how fast (px/s) a swipe
// needs to be before it counts as "advance one page" — same thresholds as
// PagedCarousel.tsx / Lightbox.tsx so every swipeable surface in the app
// feels consistent.
const OFFSET_FRACTION_THRESHOLD = 0.2;
const VELOCITY_THRESHOLD = 400;

// A normal, always-live carousel: shows `itemsPerView` cards at a time
// (1 on mobile, 3 on desktop) and slides through the rest — nothing is
// rendered as a separate static grid.
export default function AlbumCarousel({ items }: AlbumCarouselProps) {
  const itemsPerView = useItemsPerView();
  const maxIndex = Math.max(0, items.length - itemsPerView);
  const [rawIndex, setIndex] = useState(0);

  // Derive (rather than sync-via-effect) so the index stays valid if the
  // viewport — and therefore itemsPerView — changes, e.g. on resize.
  const index = Math.min(rawIndex, maxIndex);

  // Pixel width of the viewport, measured via ResizeObserver so drag
  // bounds/snap targets stay correct across resizes and orientation
  // changes. Everything below is computed in real pixels so the track
  // visually tracks the finger 1:1 while dragging, rather than the old
  // percentage-based `animate` prop that barely moved until release.
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

  if (items.length === 0) return null;

  const prev = () => setIndex(i => Math.max(0, i - 1));
  const next = () => setIndex(i => Math.min(maxIndex, i + 1));

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

  return (
    <div>
      <div ref={viewportRef} className="overflow-hidden -mx-3">
        <motion.div
          className="flex"
          drag={showControls ? 'x' : false}
          dragConstraints={{ left: -maxOffset, right: 0 }}
          dragElastic={0.08}
          onDragEnd={handleDragEnd}
          style={{ x, touchAction: 'pan-y' }}
        >
          {items.map((trip, i) => (
            <div
              key={trip.id}
              className="shrink-0 px-3"
              style={{ width: `${slideWidthPct}%` }}
            >
              <AlbumCard trip={trip} index={i} />
            </div>
          ))}
        </motion.div>
      </div>

      {showControls && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={prev}
            disabled={index === 0}
            className="w-10 h-10 rounded-full bg-white hover:bg-primary hover:text-white text-dark-muted border border-background-warm flex items-center justify-center disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-2">
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === index ? 'bg-primary w-5' : 'bg-background-warm'}`}
              />
            ))}
          </div>
          <button
            onClick={next}
            disabled={index === maxIndex}
            className="w-10 h-10 rounded-full bg-white hover:bg-primary hover:text-white text-dark-muted border border-background-warm flex items-center justify-center disabled:opacity-40 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
