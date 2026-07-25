import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AlbumCard from './AlbumCard';
import type { CompletedTrip } from '../../types';

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

  if (items.length === 0) return null;

  const prev = () => setIndex(i => Math.max(0, i - 1));
  const next = () => setIndex(i => Math.min(maxIndex, i + 1));

  const SWIPE_THRESHOLD = 50;
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) next();
    else if (info.offset.x > SWIPE_THRESHOLD) prev();
  };

  const slideWidthPct = 100 / itemsPerView;
  const pageCount = maxIndex + 1;
  const showControls = items.length > itemsPerView;

  return (
    <div>
      <div className="overflow-hidden -mx-3">
        <motion.div
          className="flex"
          drag={showControls ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.08}
          onDragEnd={handleDragEnd}
          animate={{ x: `-${index * slideWidthPct}%` }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
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
