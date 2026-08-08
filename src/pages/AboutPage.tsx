import { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { X, ShieldCheck, HelpCircle, Frown, Heart, Users, Sparkles, ArrowRight, ArrowDown, ChevronLeft, ChevronRight, Compass, Ticket, Backpack, Plane, Image as ImageIcon, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import TestimonialCard from '../components/ui/TestimonialCard';
import { getSiteContent, getTestimonials, getCompletedTrips } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../constants/about';
import { getTripHighlightIcon } from '../constants/tripHighlightIcons';
import type {
  AboutContent,
  AboutHaveYouEverItem,
  AboutWelcomeItem,
  AboutWhyDifferentCard,
  AboutJourneyStep,
  Testimonial,
  CompletedTrip,
} from '../types/types-index';

const MeetTheFounder = lazy(() => import('../sections/home/MeetTheFounder'));

// ─── animation helpers ────────────────────────────────────────────────────────

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, delay },
});

// "have_you_ever" items store an icon-library key chosen in the admin
// (AboutHaveYouEverItem.icon, see constants/tripHighlightIcons.ts). This
// fallback set is only used for legacy items saved before the picker
// existed, so they still render something instead of a blank slot.
const HAVE_YOU_EVER_ICONS = [X, ShieldCheck, HelpCircle, Frown];

// "welcome_to_ulaa" items likewise store an icon-library key
// (AboutWelcomeItem.icon). This fallback set covers legacy items saved
// before the picker existed (e.g. rows that still hold a raw emoji string).
const WELCOME_ICONS = [Heart, Users, ShieldCheck, Sparkles];

// "journey" steps likewise store an icon-library key (AboutJourneyStep.icon).
// This fallback set covers legacy steps saved before the picker existed.
const JOURNEY_ICONS = [Compass, Ticket, Backpack, Plane, Heart];

// Have You Ever / Welcome to Ulaa icon circles: every icon on the "Have You
// Ever" side is a muted, premium red, and every icon on the "Welcome to
// Ulaa" side is a muted, premium green — both subtler than a pure/saturated
// red or green so they sit quietly alongside the rest of the palette.
const HAVE_YOU_EVER_FILL = '#B0524F';
const WELCOME_FILL = '#4C8368';

export default function AboutPage() {
  // Remember and restore scroll position when leaving/returning via the
  // bottom nav. Content starts from DEFAULT_ABOUT and is replaced in place
  // once it loads, so the page has its real height immediately — no async
  // "ready" gate needed.
  useScrollRestoration('/about', true);

  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  // Completed trips, fetched live so the stats strip below (Girls Travelled,
  // Trips Completed, Destinations) reflects real data instead of a
  // hardcoded admin number — same live-data approach, and now the exact
  // same three stats, as the Completed Trips page.
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);

  // Mobile "What Our Girls Say" carousel — mirrors the swipeable single-card
  // carousel used on the home page's Testimonials section.
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const [testimonialDirection, setTestimonialDirection] = useState(0);
  const prevTestimonial = () => {
    setTestimonialDirection(-1);
    setTestimonialIndex(c => Math.max(0, c - 1));
  };
  const nextTestimonial = () => {
    setTestimonialDirection(1);
    setTestimonialIndex(c => Math.min(testimonials.length - 1, c + 1));
  };
  const TESTIMONIAL_SWIPE_DISTANCE = 50;
  const TESTIMONIAL_SWIPE_VELOCITY = 400;
  const handleTestimonialDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -TESTIMONIAL_SWIPE_DISTANCE || info.velocity.x < -TESTIMONIAL_SWIPE_VELOCITY) nextTestimonial();
    else if (info.offset.x > TESTIMONIAL_SWIPE_DISTANCE || info.velocity.x > TESTIMONIAL_SWIPE_VELOCITY) prevTestimonial();
  };
  const testimonialSlideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };
  // Parallax hero — mirrors HeroSection.tsx exactly
  const heroContainerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScrollY } = useScroll({
    target: heroContainerRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(heroScrollY, [0, 1], ['0%', '30%']);
  const heroOpacity = useTransform(heroScrollY, [0, 0.8], [1, 0]);
  const heroTextVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.15, duration: 0.7, ease: 'easeOut' as const },
    }),
  };

  useEffect(() => {
    // Fetch about content
    getSiteContent<Partial<AboutContent>>('about')
      .then(data => setContent(mergeWithDefaults(data)))
      .catch(() => {});

    // Fetch testimonials from existing module
    getTestimonials()
      .then(data => setTestimonials(data))
      .catch(() => {});

    // Fetch completed trips to derive live stats (girls travelled, trips
    // completed, destinations) instead of using static numbers
    getCompletedTrips()
      .then(data => setCompletedTrips(data))
      .catch(() => {});
  }, []);

  // Live content — the instant an admin saves changes in AdminAbout (copy,
  // images, the Statistics labels, etc.), re-pull this page's content so
  // anyone already here sees the update without refreshing.
  useEffect(() => {
    const unsubscribe = subscribeToTable(
      'site_content',
      () => {
        getSiteContent<Partial<AboutContent>>('about')
          .then(data => setContent(mergeWithDefaults(data)))
          .catch(() => {});
      },
      'key=eq.about'
    );
    return unsubscribe;
  }, []);

  const {
    hero,
    our_story,
    journey_intro,
    why_different,
    community,
    stats,
    testimonials: testimonialsContent,
    journey,
  } = content;
  const { have_you_ever, welcome_to_ulaa } = journey_intro;

  // Live stats derived from real completed trips — same three numbers,
  // same order, as the Completed Trips page (Girls Travelled, Trips
  // Completed, Destinations). Falls back to the admin-configured numbers
  // until trips have loaded.
  const liveStats = useMemo(() => {
    if (completedTrips.length === 0) return null;
    const girlsTravelled = completedTrips.reduce((sum, t) => sum + (t.participants || 0), 0);
    const tripsCompleted = completedTrips.length;
    const destinations = new Set(
      completedTrips.flatMap(t => t.destination.split(',').map(d => d.trim().toLowerCase()))
    ).size;
    return { girlsTravelled, tripsCompleted, destinations };
  }, [completedTrips]);

  const statsDisplay = {
    girls_travelled: liveStats?.girlsTravelled ?? stats.girls_travelled,
    trips_completed: liveStats?.tripsCompleted ?? 0,
    destinations: liveStats?.destinations ?? stats.destinations,
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Layout>

      {/* ══════════════════════════════════════════════════════════════
          1. HERO BANNER — identical layout to home HeroSection
      ══════════════════════════════════════════════════════════════ */}
      <section
        ref={heroContainerRef}
        className="relative min-h-[60vh] sm:min-h-[82vh] lg:min-h-[85vh]"
      >
        {/* Parallax Background */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div className="absolute inset-0" style={{ y: heroY }}>
            {(hero.image || hero.mobile_image) ? (
              <>
                <img
                  src={hero.mobile_image || hero.image}
                  alt={hero.heading}
                  className="w-full h-full object-cover md:hidden"
                />
                <img
                  src={hero.image || hero.mobile_image}
                  alt={hero.heading}
                  className="w-full h-full object-cover hidden md:block"
                />
              </>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/80 to-dark" />
            )}
          </motion.div>
          {/* Gradient Overlays — identical to home hero */}
          <div className="absolute inset-0 bg-gradient-to-b from-dark/60 via-dark/40 to-dark/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-dark/40 via-transparent to-transparent" />
        </div>

        {/* Content — bottom-anchored, matching home hero exactly */}
        <motion.div
          style={{ opacity: heroOpacity }}
          className="absolute inset-x-0 bottom-0 z-10 px-4 sm:px-6 lg:px-8 pb-8 sm:pb-14 lg:pb-20 text-white"
        >
          <div className="max-w-[1344px] mx-auto">
            <div className="max-w-3xl">
              <motion.h1
                custom={1}
                initial="hidden"
                animate="visible"
                variants={heroTextVariants}
                className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.15] mb-6 whitespace-pre-line"
              >
                {hero.heading}
              </motion.h1>
              <motion.p
                custom={2}
                initial="hidden"
                animate="visible"
                variants={heroTextVariants}
                className="text-base sm:text-lg text-white/85 leading-relaxed mb-3 sm:mb-8 max-w-xl whitespace-pre-line"
              >
                {hero.subheading}
              </motion.p>
              <motion.div
                custom={3}
                initial="hidden"
                animate="visible"
                variants={heroTextVariants}
                className="flex flex-row flex-wrap gap-3 sm:gap-4"
              >
                <Link to={hero.cta_url || '/trips'}>
                  <Button
                    variant="primary"
                    size="sm"
                    className="group/btn whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
                  >
                    {hero.cta_label || 'Explore Trips'}
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

      {/* ══════════════════════════════════════════════════════════════
          2. OUR STORY
      ══════════════════════════════════════════════════════════════ */}
      <section className="pt-6 pb-0 sm:pt-12 sm:pb-12 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-[1344px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp()}>
            {our_story.image ? (
              <img
                src={our_story.image}
                alt={our_story.heading}
                className="rounded-2xl shadow-warm-lg w-full h-80 md:h-[440px] object-cover"
              />
            ) : (
              <div className="rounded-2xl shadow-warm-lg w-full h-80 md:h-[440px] bg-background-warm flex items-center justify-center">
                <span className="text-dark-muted text-sm">No image uploaded yet</span>
              </div>
            )}
          </motion.div>
          <motion.div {...fadeUp(0.15)} className="space-y-6">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark leading-tight whitespace-pre-line">
              {our_story.heading}
            </h2>
            <p className="text-dark-muted text-lg leading-relaxed whitespace-pre-line">
              {our_story.description}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          3 & 4. HAVE YOU EVER... / WELCOME TO ULAA (merged split card)
      ══════════════════════════════════════════════════════════════ */}
      <section className="pt-12 pb-12 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-[1344px] mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-6 sm:mb-12">
            {journey_intro.sub_heading && (
              <p className="font-script font-normal text-3xl md:text-4xl text-primary mb-2 whitespace-pre-line">
                {journey_intro.sub_heading}
              </p>
            )}
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark leading-tight mb-4 whitespace-pre-line">
              {journey_intro.heading}
            </h2>
            {journey_intro.description && (
              <p className="text-dark-muted text-lg whitespace-pre-line">
                {(() => {
                  // Highlight "beautiful experiences" in the same color as
                  // the "From Worries" script heading above it, matching
                  // everything else exactly as admin-configured.
                  const phrase = 'beautiful experiences';
                  const idx = journey_intro.description.toLowerCase().indexOf(phrase);
                  if (idx === -1) return journey_intro.description;
                  const before = journey_intro.description.slice(0, idx);
                  const match = journey_intro.description.slice(idx, idx + phrase.length);
                  const after = journey_intro.description.slice(idx + phrase.length);
                  return (
                    <>
                      {before}
                      <span className="text-primary">{match}</span>
                      {after}
                    </>
                  );
                })()}
              </p>
            )}
          </motion.div>
          <div className="relative rounded-3xl bg-gradient-to-br from-background-warm to-primary/10 px-6 py-12">
            {/* Center connector arrow — purely decorative */}
            <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex-col items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-warm-lg"
              >
                <ArrowRight size={22} className="text-white" />
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-0 md:divide-x md:divide-dashed md:divide-dark/20">
              {/* Have You Ever... */}
              <div className="md:pr-20 text-center">
                <motion.h2
                  {...fadeUp()}
                  className="font-display text-2xl md:text-3xl font-bold text-dark mb-2 whitespace-pre-line"
                >
                  {have_you_ever.heading}
                </motion.h2>
                <span className="inline-block h-1 w-16 bg-primary rounded-full mb-8" />
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-6">
                  {have_you_ever.items.map((item: AboutHaveYouEverItem, i: number) => {
                    const meta = getTripHighlightIcon(item.icon);
                    const Icon = meta ? meta.Icon : HAVE_YOU_EVER_ICONS[i % HAVE_YOU_EVER_ICONS.length];
                    return (
                      <motion.div
                        key={i}
                        {...fadeUp(i * 0.08)}
                        className="flex flex-col items-center text-center gap-3"
                      >
                        <div className="relative w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: HAVE_YOU_EVER_FILL }}>
                          <Icon size={28} color="#fff" strokeWidth={1.75} />
                        </div>
                        <span className="text-dark-muted text-sm leading-snug">{item.text}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Welcome to Ulaa */}
              <div className="md:pl-20 text-center">
                <div className="md:hidden flex flex-col items-center gap-1.5 -mt-2 mb-6">
                  <div className="relative w-full flex items-center justify-center">
                    <span className="absolute left-0 right-0 border-t border-dashed border-dark/20" />
                    <span
                      aria-hidden="true"
                      className="relative z-10 w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-warm-lg"
                    >
                      <ArrowDown size={18} className="text-white" />
                    </span>
                  </div>
                </div>
                <motion.h2
                  {...fadeUp()}
                  className="font-display text-2xl md:text-3xl font-bold text-dark mb-2 whitespace-pre-line"
                >
                  {welcome_to_ulaa.heading}
                </motion.h2>
                <span className="inline-block h-1 w-16 bg-primary rounded-full mb-8" />
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-6">
                  {welcome_to_ulaa.items.map((item: AboutWelcomeItem, i: number) => {
                    const meta = getTripHighlightIcon(item.icon);
                    const Icon = meta ? meta.Icon : WELCOME_ICONS[i % WELCOME_ICONS.length];
                    return (
                      <motion.div
                        key={i}
                        {...fadeUp(i * 0.1)}
                        className="flex flex-col items-center text-center gap-3"
                      >
                        <div className="relative w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: WELCOME_FILL }}>
                          <Icon size={28} color="#fff" strokeWidth={1.75} />
                        </div>
                        <span className="text-dark-muted text-sm leading-snug">{item.title}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          5. WHY ULAA IS DIFFERENT
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-background-warm">
        <div className="max-w-[1344px] mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-6 sm:mb-12">
            {why_different.sub_heading && (
              <p className="font-script font-normal text-3xl md:text-4xl text-primary mb-2 whitespace-pre-line">
                {why_different.sub_heading}
              </p>
            )}
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4 whitespace-pre-line">
              {why_different.heading}
            </h2>
            {why_different.subheading && (
              <p className="text-dark-muted text-lg max-w-2xl mx-auto whitespace-pre-line">
                {why_different.subheading}
              </p>
            )}
          </motion.div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 md:gap-8">
            {why_different.cards.map((card: AboutWhyDifferentCard, i: number) => (
              <motion.div
                key={i}
                {...fadeUp(i * 0.08)}
                className="relative aspect-[4/3] rounded-lg sm:rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 group"
              >
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.heading}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="absolute inset-0 w-full h-full bg-background-warm" />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                  }}
                />
                <div className="relative h-full flex flex-col justify-end p-3 sm:p-4">
                  <h3 className="font-display text-sm sm:text-base font-bold text-white mb-1 whitespace-pre-line">
                    {card.heading}
                  </h3>
                  <p className="text-white/90 text-xs leading-snug whitespace-pre-line">
                    {card.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          6. OUR COMMUNITY
      ══════════════════════════════════════════════════════════════ */}
      {(community.photos.length > 0 || community.heading) && (
        <section className="pt-12 pb-12 px-4 sm:px-6 lg:px-8 bg-background">
          <div className="max-w-[1344px] mx-auto">
            {community.photos.length > 0 ? (
              <div className="flex flex-col lg:flex-row gap-4 lg:h-[560px]">
                {/* Left column: heading card + hero photo */}
                <div className="lg:w-[30%] flex flex-col gap-4 lg:h-full">
                  <motion.div
                    {...fadeUp()}
                    className="flex-shrink-0 bg-gradient-to-br from-background-warm to-primary/10 rounded-2xl p-6"
                  >
                    {community.sub_heading && (
                      <p className="font-script font-normal text-xl text-primary mb-1 whitespace-pre-line">
                        {community.sub_heading}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="font-display text-4xl font-bold text-dark whitespace-nowrap">
                        {community.heading}
                      </h2>
                      <Heart size={26} className="text-primary flex-shrink-0" fill="currentColor" strokeWidth={0} />
                    </div>
                    {community.subheading && (
                      <p className="text-dark-muted text-base leading-relaxed whitespace-pre-line">
                        {community.subheading}
                      </p>
                    )}
                  </motion.div>
                  {community.photos[0] && (
                    <motion.div
                      {...fadeUp(0.1)}
                      className="flex-1 aspect-[4/3] lg:aspect-auto rounded-2xl overflow-hidden group"
                    >
                      <img
                        src={community.photos[0]}
                        alt="Our community"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </motion.div>
                  )}
                </div>

                {/* Right: photo grid */}
                {community.photos.length > 1 && (
                  <div className="lg:w-[70%] grid grid-cols-2 sm:grid-cols-3 lg:grid-rows-2 gap-4 lg:h-full">
                    {community.photos.slice(1, 7).map((photo, i) => {
                      const isLast = i === 5 && community.photos.length > 7;
                      return (
                        <motion.div
                          key={i}
                          {...fadeUp(i * 0.06)}
                          className="relative aspect-square lg:aspect-auto rounded-2xl overflow-hidden group"
                        >
                          <img
                            src={photo}
                            alt={`Community photo ${i + 2}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          {isLast && (
                            <Link
                              to="/completed-trips"
                              className="absolute inset-0 bg-gradient-to-t from-dark/50 via-transparent to-transparent hover:from-dark/60 transition-colors flex items-end justify-end p-4"
                            >
                              <span className="inline-flex items-center gap-2 bg-primary text-white font-button font-semibold text-sm px-4 py-2.5 rounded-full shadow-warm whitespace-nowrap">
                                See More Memories
                                <ImageIcon size={16} />
                              </span>
                            </Link>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                <motion.div {...fadeUp()} className="text-center mb-12">
                  {community.sub_heading && (
                    <p className="font-script font-normal text-3xl md:text-4xl text-primary mb-2 whitespace-pre-line">
                      {community.sub_heading}
                    </p>
                  )}
                  <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4 whitespace-pre-line">
                    {community.heading}
                  </h2>
                  {community.subheading && (
                    <p className="text-dark-muted text-lg max-w-2xl mx-auto whitespace-pre-line">
                      {community.subheading}
                    </p>
                  )}
                </motion.div>
                <div className="text-center text-dark-muted py-10">
                  Community photos will appear here once uploaded.
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════
          7. STATISTICS
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-6 sm:py-12 px-4 sm:px-6 lg:px-8 bg-primary">
        <div className="max-w-[1344px] mx-auto">
          <div className="grid grid-cols-3 gap-6 text-center text-white">
            {[
              { value: `${statsDisplay.girls_travelled}+`, label: stats.girls_travelled_label },
              { value: `${statsDisplay.trips_completed}+`, label: stats.trips_completed_label },
              { value: `${statsDisplay.destinations}+`, label: stats.destinations_label },
            ].map((stat, i) => (
              <motion.div key={i} {...fadeUp(i * 0.1)}>
                <div className="font-display text-3xl md:text-4xl font-bold mb-2">
                  {stat.value}
                </div>
                <div className="text-white/80 text-sm md:text-base mt-1">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          8. WHAT OUR GIRLS SAY (dynamic testimonials)
      ══════════════════════════════════════════════════════════════ */}
      {testimonials.length > 0 && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-background-warm">
          <div className="max-w-[1344px] mx-auto">
            <motion.div {...fadeUp()} className="text-center mb-6">
              {testimonialsContent.sub_heading && (
                <p className="font-script font-normal text-3xl md:text-4xl text-primary mb-2 whitespace-pre-line">
                  {testimonialsContent.sub_heading}
                </p>
              )}
              <h2 className="font-display text-4xl md:text-5xl font-bold text-dark whitespace-pre-line">
                {testimonialsContent.heading}
              </h2>
              {testimonialsContent.subheading && (
                <p className="text-dark-muted text-lg mt-4 whitespace-pre-line">
                  {testimonialsContent.subheading}
                </p>
              )}
            </motion.div>
            {/* Desktop / tablet grid */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((testimonial, i) => (
                <TestimonialCard key={testimonial.id} testimonial={testimonial} index={i} />
              ))}
            </div>

            {/* Mobile carousel — only the active card is rendered, swipeable,
                same behaviour as the home page's testimonials carousel */}
            <div className="md:hidden">
              <div className="overflow-hidden px-2">
                <AnimatePresence mode="wait" custom={testimonialDirection} initial={false}>
                  <motion.div
                    key={testimonials[testimonialIndex]?.id}
                    custom={testimonialDirection}
                    variants={testimonialSlideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.6}
                    onDragEnd={handleTestimonialDragEnd}
                  >
                    {testimonials[testimonialIndex] && (
                      <TestimonialCard testimonial={testimonials[testimonialIndex]} index={0} animateEntrance={false} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
              {/* Controls */}
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={prevTestimonial}
                  disabled={testimonialIndex === 0}
                  className="w-10 h-10 rounded-full bg-dark/10 hover:bg-primary hover:text-white text-dark flex items-center justify-center disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex gap-2">
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setTestimonialDirection(i > testimonialIndex ? 1 : -1); setTestimonialIndex(i); }}
                      className={`w-2 h-2 rounded-full transition-all ${i === testimonialIndex ? 'bg-primary w-5' : 'bg-dark/20'}`}
                    />
                  ))}
                </div>
                <button
                  onClick={nextTestimonial}
                  disabled={testimonialIndex === testimonials.length - 1}
                  className="w-10 h-10 rounded-full bg-dark/10 hover:bg-primary hover:text-white text-dark flex items-center justify-center disabled:opacity-40 transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════
          9. YOUR ULAA JOURNEY
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-16">
            {journey.sub_heading && (
              <p className="font-script font-normal text-3xl md:text-4xl text-primary mb-2 whitespace-pre-line">
                {journey.sub_heading}
              </p>
            )}
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4 whitespace-pre-line">
              {journey.heading}
            </h2>
            {journey.subheading && (
              <p className="text-dark-muted text-lg whitespace-pre-line">{journey.subheading}</p>
            )}
          </motion.div>
          {/* Desktop / tablet — horizontal row with a straight connector line */}
          <div className="hidden md:block relative">
            <div className="absolute top-8 left-8 right-8 h-0.5 bg-primary/30" />
            <div className="flex md:flex-row md:justify-between gap-4">
              {journey.steps.map((step: AboutJourneyStep, i: number) => {
                const meta = getTripHighlightIcon(step.icon);
                const Icon = meta ? meta.Icon : JOURNEY_ICONS[i % JOURNEY_ICONS.length];
                return (
                  <motion.div
                    key={i}
                    {...fadeUp(i * 0.1)}
                    className="relative z-10 flex flex-col items-center text-center flex-1 px-2"
                  >
                    <div className="flex-shrink-0 w-16 h-16 rounded-full bg-white border-2 border-primary flex items-center justify-center shadow-md mb-4">
                      <Icon size={26} className="text-primary" strokeWidth={1.75} />
                    </div>
                    <h3 className="font-display text-base font-bold text-primary mb-1.5 whitespace-pre-line">
                      {step.heading}
                    </h3>
                    <p className="text-dark-muted text-sm leading-snug whitespace-pre-line max-w-[200px]">
                      {step.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Mobile — zigzag layout: step 1 on the left, step 2 on the
              right, step 3 back on the left, and so on, connected by a
              single straight vertical line running down the center through
              every icon. */}
          <div className="md:hidden relative">
            <div className="flex flex-col">
              {journey.steps.map((step: AboutJourneyStep, i: number) => {
                const meta = getTripHighlightIcon(step.icon);
                const Icon = meta ? meta.Icon : JOURNEY_ICONS[i % JOURNEY_ICONS.length];
                const isLeft = i % 2 === 0;
                const isLast = i === journey.steps.length - 1;
                return (
                  <motion.div key={i} {...fadeUp(i * 0.1)} className="relative">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                      {/* Left column: content when isLeft, otherwise empty */}
                      <div className={isLeft ? 'text-right' : ''}>
                        {isLeft && (
                          <>
                            <h3 className="font-display text-base font-bold text-primary mb-1.5 whitespace-pre-line">
                              {step.heading}
                            </h3>
                            <p className="text-dark-muted text-sm leading-snug whitespace-pre-line">
                              {step.description}
                            </p>
                          </>
                        )}
                      </div>

                      {/* Center column: icon bubble + connecting line segment down to the next step */}
                      <div className="relative flex flex-col items-center">
                        <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white border-2 border-primary flex items-center justify-center shadow-md z-10">
                          <Icon size={22} className="text-primary" strokeWidth={1.75} />
                        </div>
                        {!isLast && (
                          <div className="w-0.5 bg-primary/30 flex-1 min-h-[64px]" />
                        )}
                      </div>

                      {/* Right column: content when !isLeft, otherwise empty */}
                      <div className={!isLeft ? 'text-left' : ''}>
                        {!isLeft && (
                          <>
                            <h3 className="font-display text-base font-bold text-primary mb-1.5 whitespace-pre-line">
                              {step.heading}
                            </h3>
                            <p className="text-dark-muted text-sm leading-snug whitespace-pre-line">
                              {step.description}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          10. MEET THE FOUNDER
          Shared component/data source with the Home and Upcoming Trips
          pages — see src/sections/home/MeetTheFounder.tsx and
          src/admin/AdminFounder.tsx. The "About" CTA is hidden since
          we're already on the About page.
      ══════════════════════════════════════════════════════════════ */}
      <Suspense fallback={<div className="h-96 bg-dark animate-pulse" />}>
        <MeetTheFounder showAboutLink={false} />
      </Suspense>

    </Layout>
  );
}

