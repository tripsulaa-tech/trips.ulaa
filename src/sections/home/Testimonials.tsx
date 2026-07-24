import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SectionTitle from '../../components/ui/SectionTitle';
import TestimonialCard from '../../components/ui/TestimonialCard';
import { getTestimonials } from '../../services/api';
import type { Testimonial } from '../../types';

const DEMO_TESTIMONIALS: Testimonial[] = [
  {
    id: '1', name: 'Priya Sharma', rating: 5, destination: 'Spiti Valley',
    review: 'ULAA completely changed how I travel. I went from being someone who never traveled alone to summiting passes at 15,000 feet. The sisterhood is real — these trips gave me lifelong friends and a new version of myself.',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80',
    is_published: true, sort_order: 1, created_at: '',
  },
  {
    id: '2', name: 'Ananya Krishnan', rating: 5, destination: 'Kerala Backwaters',
    review: 'As someone who was skeptical about group travel, ULAA proved me completely wrong. Small groups, thoughtful itineraries, and an organizer who genuinely cares. Already booked my second trip!',
    photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&q=80',
    is_published: true, sort_order: 2, created_at: '',
  },
  {
    id: '3', name: 'Meera Nair', rating: 5, destination: 'Meghalaya',
    review: 'The hidden gems ULAA finds are unreal. Places I didn\'t even know existed. And the safety and comfort they provide makes you forget all your worries. Pure magic, every single time.',
    photo: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200&q=80',
    is_published: true, sort_order: 3, created_at: '',
  },
  {
    id: '4', name: 'Ritu Agarwal', rating: 5, destination: 'Andaman Islands',
    review: 'I travelled solo for the first time ever on a ULAA trip and it was the best decision of my life. The team is professional, the destinations are stunning, and the women you meet become family.',
    photo: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=200&q=80',
    is_published: true, sort_order: 4, created_at: '',
  },
];

export default function Testimonials() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    getTestimonials()
      .then(data => setTestimonials((data.length > 0 ? data : DEMO_TESTIMONIALS).slice(0, 3)))
      .catch(() => setTestimonials(DEMO_TESTIMONIALS.slice(0, 3)));
  }, []);

  const prev = () => {
    setDirection(-1);
    setCurrent(c => Math.max(0, c - 1));
  };
  const next = () => {
    setDirection(1);
    setCurrent(c => Math.min(testimonials.length - 1, c + 1));
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
    <section className="py-14 sm:py-24 px-4 sm:px-6 lg:px-8 bg-dark overflow-hidden">
      <div className="max-w-[1344px] mx-auto">
        <div className="text-center mb-8 sm:mb-16">
          <SectionTitle
            label="Real Stories"
            title="What our travelers say."
            subtitle="Thousands of women have discovered themselves through ULAA. Here are some of their stories."
            align="center"
            light
          />
        </div>

        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <TestimonialCard key={t.id} testimonial={t} index={i} />
          ))}
        </div>

        {/* Mobile carousel — only the active card is rendered, so the
            section height always matches that card, not the tallest one */}
        <div className="md:hidden">
          <div className="overflow-hidden px-2">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={testimonials[current]?.id}
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
                {testimonials[current] && (
                  <TestimonialCard testimonial={testimonials[current]} index={0} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={prev}
              disabled={current === 0}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-primary text-white flex items-center justify-center disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDirection(i > current ? 1 : -1); setCurrent(i); }}
                  className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-secondary w-5' : 'bg-white/30'}`}
                />
              ))}
            </div>
            <button
              onClick={next}
              disabled={current === testimonials.length - 1}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-primary text-white flex items-center justify-center disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
