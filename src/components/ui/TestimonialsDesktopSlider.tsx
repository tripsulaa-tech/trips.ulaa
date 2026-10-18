import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '@phosphor-icons/react';
import TestimonialCard from './TestimonialCard';
import type { Testimonial } from '../../types/types-index';

/** Cards that fit across: 3 on large screens, 2 on tablets. */
function useVisibleCount(): number {
  const read = () => (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches ? 3 : 2);
  const [n, setN] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setN(mq.matches ? 3 : 2);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return n;
}

/**
 * Desktop / tablet testimonials. Up to 3 (2 on tablets) show as a plain grid. With more, the
 * same cards become a carousel that slides one card at a time, like the phone view.
 * `theme="dark"` is for the dark home section, `theme="light"` for the About page.
 */
export default function TestimonialsDesktopSlider({ items, theme }: { items: Testimonial[]; theme: 'dark' | 'light' }) {
  const visible = useVisibleCount();
  const [pos, setPos] = useState(0);          // which card is first in view (may step just outside 0..n-1 mid-slide)
  const [snap, setSnap] = useState(false);     // true while jumping back to the real copy with no animation
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const n = items.length;
  const GAP = 24;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, visible]);

  const btn = theme === 'dark'
    ? 'bg-white/10 hover:bg-primary text-white'
    : 'bg-dark/10 hover:bg-primary hover:text-white text-dark';
  const dotOn = theme === 'dark' ? 'bg-secondary' : 'bg-primary';
  const dotOff = theme === 'dark' ? 'bg-white/30' : 'bg-dark/20';

  const cardW = width > 0 ? (width - GAP * (visible - 1)) / visible : 0;
  const step = cardW + GAP;
  // Three copies in a row: sliding past either end lands on a copy of the same cards, then
  // quietly jumps back to the middle copy, so the carousel never runs out.
  const track = [...items, ...items, ...items];
  const slideTo = (target: number) => { if (busy || target === pos) return; setBusy(true); setPos(target); };
  const settle = () => {
    setBusy(false);
    if (pos < 0 || pos >= n) {
      setSnap(true);
      setPos(p => ((p % n) + n) % n);
      requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)));
    }
  };
  const current = ((pos % n) + n) % n;

  if (n <= visible) {
    return (
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((t, i) => <TestimonialCard key={t.id} testimonial={t} index={i} />)}
      </div>
    );
  }

  return (
    <div className="hidden md:block">
      <div ref={wrapRef} className="overflow-hidden -my-3 py-3">
        <motion.div
          className="flex"
          style={{ gap: GAP }}
          animate={{ x: -(n + pos) * step }}
          transition={snap ? { duration: 0 } : { type: 'spring', damping: 32, stiffness: 220 }}
          onAnimationComplete={settle}
        >
          {track.map((t, i) => (
            <div key={`${t.id}-${i}`} className="shrink-0 [&>*]:h-full" style={{ width: cardW || undefined }}>
              <TestimonialCard testimonial={t} animateEntrance={false} />
            </div>
          ))}
        </motion.div>
      </div>
      <div className="flex items-center justify-center gap-4 mt-8">
        <button type="button" onClick={() => slideTo(pos - 1)} aria-label="Previous testimonial"
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${btn}`}>
          <ChevronLeft size={20} />
        </button>
        <div className="flex gap-2">
          {items.map((t, i) => (
            <button key={t.id} type="button" aria-label={`Show testimonial ${i + 1}`}
              onClick={() => slideTo(i)}
              className={`h-2 rounded-full transition-all ${i === current ? `${dotOn} w-5` : `${dotOff} w-2`}`} />
          ))}
        </div>
        <button type="button" onClick={() => slideTo(pos + 1)} aria-label="Next testimonial"
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${btn}`}>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
