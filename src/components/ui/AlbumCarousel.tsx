import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AlbumCard from './AlbumCard';
import type { CompletedTrip } from '../../types';

interface AlbumCarouselProps {
  items: CompletedTrip[];
}

// Swipeable, single-card-at-a-time carousel. Used to show "overflow"
// albums beyond the static featured set (2 on mobile, 3 on desktop).
// Renders as a carousel even when there's only one item in `items` —
// nav arrows/dots simply don't appear until there's more than one.
export default function AlbumCarousel({ items }: AlbumCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  if (items.length === 0) return null;

  const prev = () => {
    setDirection(-1);
    setCurrent(c => Math.max(0, c - 1));
  };
  const next = () => {
    setDirection(1);
    setCurrent(c => Math.min(items.length - 1, c + 1));
  };

  const SWIPE_THRESHOLD = 50;
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) next();
    else if (info.offset.x > SWIPE_THRESHOLD) prev();
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <div>
      <div className="overflow-hidden px-2">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={items[current]?.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
          >
            {items[current] && <AlbumCard trip={items[current]} index={0} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={prev}
            disabled={current === 0}
            className="w-10 h-10 rounded-full bg-white hover:bg-primary hover:text-white text-dark-muted border border-background-warm flex items-center justify-center disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-2">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => { setDirection(i > current ? 1 : -1); setCurrent(i); }}
                className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-primary w-5' : 'bg-background-warm'}`}
              />
            ))}
          </div>
          <button
            onClick={next}
            disabled={current === items.length - 1}
            className="w-10 h-10 rounded-full bg-white hover:bg-primary hover:text-white text-dark-muted border border-background-warm flex items-center justify-center disabled:opacity-40 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
