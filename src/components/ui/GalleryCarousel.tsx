import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PLACEHOLDER_IMAGE } from '../../utils/utils-index';

export interface GalleryCarouselItem {
  photo: string;
  description?: string;
}

interface GalleryCarouselProps {
  items: GalleryCarouselItem[];
}

// A single continuous horizontal strip of rectangular, short-height image
// cards. Enough cards are sized to show at a glance on desktop (6+), and the
// rest are reached by scrolling the strip — either by dragging/swiping it
// directly, or via the edge arrow buttons, which only appear when there's
// actually more to scroll toward.
export default function GalleryCarousel({ items }: GalleryCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [items.length]);

  const scrollByAmount = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar -mx-1 px-1"
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="group shrink-0 snap-start w-[150px] sm:w-[180px] overflow-hidden rounded-xl shadow-card border border-background-warm bg-white"
          >
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={item.photo || PLACEHOLDER_IMAGE}
                alt={item.description || `Gallery image ${i + 1}`}
                draggable={false}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            {item.description && (
              <div className="px-2.5 py-2">
                <p className="text-dark text-xs font-medium truncate">{item.description}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-1)}
          aria-label="Scroll left"
          className="hidden sm:flex absolute -left-4 top-[calc(50%-1rem)] -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-warm-lg border border-background-warm items-center justify-center text-dark hover:bg-primary hover:text-white transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(1)}
          aria-label="Scroll right"
          className="hidden sm:flex absolute -right-4 top-[calc(50%-1rem)] -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-warm-lg border border-background-warm items-center justify-center text-dark hover:bg-primary hover:text-white transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
