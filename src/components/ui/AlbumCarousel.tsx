import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, Images } from 'lucide-react';
import AlbumCard from './AlbumCard';
import type { CompletedTrip } from '../../types';

interface AlbumCarouselProps {
  items: CompletedTrip[];
}

// Swipeable carousel for "overflow" albums beyond the static featured set
// (2 on mobile, 3 on desktop). Starts CLOSED — showing only a "+N more
// albums" placeholder, no photo — so nothing beyond the static count is
// actually visible until the person pages through it with the arrows or
// dots. current === -1 means "closed/placeholder".
export default function AlbumCarousel({ items }: AlbumCarouselProps) {
  const [current, setCurrent] = useState(-1);
  const [direction, setDirection] = useState(0);

  if (items.length === 0) return null;

  const prev = () => {
    setDirection(-1);
    setCurrent(c => Math.max(-1, c - 1));
  };
  const next = () => {
    setDirection(1);
    setCurrent(c => Math.min(items.length - 1, c + 1));
  };

  const SWIPE_THRESHOLD = 50;
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (current === -1) return;
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
            key={current === -1 ? 'placeholder' : items[current]?.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag={current === -1 ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
          >
            {current === -1 ? (
              <button
                onClick={next}
                className="w-full min-h-[280px] flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-background-warm bg-white/60 hover:border-primary hover:bg-white transition-colors text-dark-muted hover:text-primary"
              >
                <Images size={32} />
                <span className="font-button font-semibold text-sm">
                  +{items.length} more album{items.length > 1 ? 's' : ''}
                </span>
              </button>
            ) : (
              items[current] && <AlbumCard trip={items[current]} index={0} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          onClick={prev}
          disabled={current === -1}
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
    </div>
  );
}
