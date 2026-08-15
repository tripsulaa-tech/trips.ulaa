import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { getSiteContent } from '../../services/api';
import { subscribeToTable } from '../../services/realtime';
import { DEFAULT_HOME_HERO, mergeWithDefaults } from '../../constants/home-hero';
import type { HomeHeroContent } from '../../types/types-index';
import heroImg from '../../assets/hero.webp';

export default function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const textVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.15, duration: 0.7, ease: 'easeOut' as const },
    }),
  };

  // ── Admin-controlled carousel content ──────────────────────────────────
  // Loaded from the 'home_hero' site_content row (see AdminHomeHero.tsx),
  // with live updates pushed the instant an admin saves changes, matching
  // the pattern used by AboutPage.tsx. Falls back to DEFAULT_HOME_HERO
  // (zero slides) until it loads, which in turn falls back to the bundled
  // static hero.webp image below — so the banner is never blank.
  const [hero, setHero] = useState<HomeHeroContent>(DEFAULT_HOME_HERO);

  useEffect(() => {
    getSiteContent<Partial<HomeHeroContent>>('home_hero')
      .then(data => setHero(mergeWithDefaults(data)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToTable(
      'site_content',
      () => {
        getSiteContent<Partial<HomeHeroContent>>('home_hero')
          .then(data => setHero(mergeWithDefaults(data)))
          .catch(() => {});
      },
      'key=eq.home_hero'
    );
    return unsubscribe;
  }, []);

  const activeSlides = hero.slides.filter(s => s.active && s.image);
  // Resolved slide list actually shown — falls back to a single static
  // slide (the original hard-coded hero.webp image) whenever the admin
  // hasn't added any photos yet, so nothing about the visual layout
  // changes for sites that haven't touched the new admin page.
  const slides = activeSlides.length > 0
    ? activeSlides
    : [{ id: '__default', image: heroImg, mobile_image: '', active: true }];
  const isCarousel = slides.length > 1;

  const [rawIndex, setIndex] = useState(0);
  // Clamp in case the admin removes slides while a visitor is mid-session,
  // computed at render time (not via a setState-in-effect) so it never
  // triggers an extra cascading render.
  const index = rawIndex >= slides.length ? 0 : rawIndex;

  // Direction of travel (1 = forward/next, -1 = backward/prev), driving
  // which side the incoming slide enters from — this is what makes it read
  // as a real sliding carousel (Swiper/Embla-style) instead of a fade.
  const [direction, setDirection] = useState(1);

  const goTo = useCallback((next: number, dir: number = 1) => {
    setDirection(dir);
    setIndex(((next % slides.length) + slides.length) % slides.length);
  }, [slides.length]);

  const goNext = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  // Autoplay — pauses while the visitor is actively dragging/hovering so a
  // swipe-in-progress or a deliberate "let me look at this one" hover isn't
  // yanked away mid-interaction, and resets its timer after every manual
  // navigation so the next auto-advance is a full interval away.
  // Faster default cadence for a snappier, more "alive" hero.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!isCarousel || !hero.autoplay || paused) return;
    const ms = Math.max(2, hero.interval_seconds || 4.5) * 1000;
    const id = setInterval(() => goTo(index + 1, 1), ms);
    return () => clearInterval(id);
  }, [isCarousel, hero.autoplay, hero.interval_seconds, paused, index, goTo]);

  // Swipe — left/right drag on the slide itself. Lower thresholds than
  // before so a quick flick registers immediately, matching the feel of
  // native mobile carousels.
  const SWIPE_DISTANCE = 40;
  const SWIPE_VELOCITY = 300;
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) goNext();
    else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) goPrev();
  };

  // Directional slide — the incoming slide enters from the side it's
  // travelling from and the outgoing slide exits the opposite side, the
  // way modern hero carousels (Swiper, Embla, most agency sites) move,
  // rather than a plain crossfade.
  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%' }),
    center: { x: '0%' },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%' }),
  };

  const currentSlide = slides[index] ?? slides[0];

  return (
    <section
      ref={containerRef}
      className="relative min-h-[60vh] sm:min-h-[82vh] lg:min-h-[85vh]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Parallax Background — carousel when the admin has added 2+ active
          photos (AdminHomeHero.tsx), otherwise a single static image. */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div className="absolute inset-0 overflow-hidden" style={{ y }}>
          <AnimatePresence initial={false} custom={direction} mode="sync">
            <motion.div
              key={currentSlide.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
              className="absolute inset-0"
              drag={isCarousel ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              dragMomentum={false}
              style={{ touchAction: 'pan-y' }}
              onDragStart={() => setPaused(true)}
              onDragEnd={(e, info) => { handleDragEnd(e, info); setPaused(false); }}
            >
              <picture>
                {currentSlide.mobile_image && (
                  <source media="(max-width: 639px)" srcSet={currentSlide.mobile_image} />
                )}
                <img
                  src={currentSlide.image}
                  alt="ULAA — Girls-only travel experiences"
                  className="w-full h-full object-cover"
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                  draggable={false}
                />
              </picture>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Gradient overlay — dark fade for text legibility, first slide
            only (other slides have no text on them, just the buttons, so
            they stay as clean, undarkened photos). Same on mobile and
            desktop; pointer-events-none so it never blocks the swipe/drag
            gesture on the image beneath it. */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: index === 0 ? 1 : 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-dark/60 via-dark/40 to-dark/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-dark/40 via-transparent to-transparent" />
        </motion.div>
      </div>

      {/* Content — anchored to the bottom of the hero at every breakpoint,
          so the subheading + buttons land in the lower portion of the image
          (next to the women) with consistent breathing room above the
          section's bottom edge, instead of being pinned near the top. */}
      <motion.div
        style={{ opacity }}
        className="absolute inset-x-0 bottom-0 z-10 px-4 sm:px-6 lg:px-8 pb-8 sm:pb-14 lg:pb-20 text-white pointer-events-none"
      >
        <div className="max-w-[1344px] mx-auto pointer-events-none">
        <div className="max-w-3xl pointer-events-none">
          {/* Headline + subheading — only on the first slide. Other slides
              are photo-only with just the two action buttons below. */}
          <AnimatePresence mode="wait">
            {index === 0 && (
              <motion.div
                key="hero-copy"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <motion.h1
                  custom={1}
                  initial="hidden"
                  animate="visible"
                  variants={textVariants}
                  className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.15] mb-6"
                >
                  Girls-only
                  <br />
                  <span className="text-secondary italic">travel</span> experiences.
                </motion.h1>

                <motion.p
                  custom={2}
                  initial="hidden"
                  animate="visible"
                  variants={textVariants}
                  className="text-base sm:text-lg text-white/85 leading-relaxed mb-3 sm:mb-8 max-w-xl"
                >
                  Discover hidden destinations. Travel safely.
                  Create unforgettable memories with like-minded women.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buttons — shown on every slide. */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={textVariants}
            className="flex flex-row flex-wrap gap-3 sm:gap-4 pointer-events-auto"
          >
            <Link to="/trips">
              <Button
                variant="primary"
                size="sm"
                className="group/btn whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
              >
                Explore Trips
                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1 sm:w-[18px] sm:h-[18px]" />
              </Button>
            </Link>
            <Link to="/completed-trips">
              <Button
                variant="ghost"
                size="sm"
                className="whitespace-nowrap text-white border-white/40 hover:border-white hover:bg-white/10 sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
              >
                <Play size={14} className="fill-white sm:w-4 sm:h-4" />
                View Gallery
              </Button>
            </Link>
          </motion.div>

          {/* Dot indicators — only shown once there's a real carousel. */}
          {isCarousel && (
            <div className="flex items-center gap-2 mt-6 sm:mt-10 pointer-events-auto">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goTo(i, i > index ? 1 : -1)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? 'w-7 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, repeat: Infinity, repeatType: 'reverse', duration: 1 }}
        className="hidden sm:flex absolute bottom-24 left-1/2 -translate-x-1/2 flex-col items-center gap-2 text-white/60"
      >
        <span className="text-xs font-button tracking-widest uppercase">Scroll</span>
        <div className="w-px h-10 bg-gradient-to-b from-white/60 to-transparent" />
      </motion.div>
    </section>
  );
}
