import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';

interface AutoScrollCarouselProps {
  items: ReactNode[];
  /** Milliseconds each card stays before sliding to the next. */
  intervalMs?: number;
  /** Accessible name for the carousel region. */
  label?: string;
}

/**
 * Mobile card carousel: one card at a time with the next one peeking in from
 * the right, sliding on its own every few seconds and looping back to the
 * start. Built on native scroll-snap, so swiping feels exactly like any other
 * phone scroller.
 *
 * Autoplay is polite: it pauses while the visitor is touching/hovering the
 * cards (and for a moment after they let go), only runs while the carousel is
 * actually on screen, and is off entirely for people who asked their device
 * for reduced motion (they can still swipe).
 */
export default function AutoScrollCarousel({ items, intervalMs = 4500, label = 'Carousel' }: AutoScrollCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const pausedRef = useRef(false);
  const visibleRef = useRef(true);
  const resumeTimer = useRef<number>(0);
  const reduceMotion = useReducedMotion();
  const count = items.length;

  const scrollToIndex = useCallback((i: number, smooth = true) => {
    const track = trackRef.current;
    const card = track?.children[i] as HTMLElement | undefined;
    if (!track || !card) return;
    const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.scrollTo({ left: card.offsetLeft - padLeft, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Keep `active` in step with whatever card is snapped into place, whether
  // that came from autoplay, a swipe, or a dot tap.
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const x = track.scrollLeft + padLeft;
    let nearest = 0;
    let best = Infinity;
    Array.from(track.children).forEach((child, i) => {
      const d = Math.abs((child as HTMLElement).offsetLeft - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    activeRef.current = nearest;
    setActive(nearest);
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    window.clearTimeout(resumeTimer.current);
  }, []);
  const resumeSoon = useCallback(() => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      pausedRef.current = false;
    }, 2500);
  }, []);

  // Only advance while the carousel is on screen.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const io = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
    }, { threshold: 0.4 });
    io.observe(track);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion || count < 2) return;
    const id = window.setInterval(() => {
      if (pausedRef.current || !visibleRef.current || document.hidden) return;
      scrollToIndex((activeRef.current + 1) % count);
    }, intervalMs);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(resumeTimer.current);
    };
  }, [count, intervalMs, reduceMotion, scrollToIndex]);

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={pause}
        onPointerUp={resumeSoon}
        onPointerCancel={resumeSoon}
        onMouseEnter={pause}
        onMouseLeave={resumeSoon}
        // -mx-4/px-4 lets the cards bleed to the screen edges while the first
        // card still lines up with the page's 16px gutter.
        className="relative -mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollPaddingLeft: '1rem', overscrollBehaviorX: 'contain' }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            className={`snap-start shrink-0 ${count > 1 ? 'w-[88%]' : 'w-full'}`}
          >
            {item}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to card ${i + 1}`}
              aria-current={i === active}
              onClick={() => {
                pause();
                scrollToIndex(i);
                resumeSoon();
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? 'w-6 bg-primary' : 'w-1.5 bg-primary/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
