import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, ExternalLink, X, ShieldCheck, HelpCircle, Frown, Heart, Users, Sparkles, ArrowRight, ArrowDown, Compass, Ticket, Backpack, Plane, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import TestimonialCard from '../components/ui/TestimonialCard';
import { getSiteContent, getTestimonials } from '../services/api';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../constants/about';
import { getTripHighlightIcon } from '../constants/tripHighlightIcons';
import type {
  AboutContent,
  AboutHaveYouEverItem,
  AboutWelcomeItem,
  AboutWhyDifferentCard,
  AboutJourneyStep,
  AboutFounderSocialLink,
  Testimonial,
} from '../types/types-index';

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

// Have You Ever / Welcome to Ulaa icon circles: every icon shares one base
// pastel color (rather than rotating through the trip-card palette), and
// tapping the connector arrow fills the whole "Have You Ever" side red and
// the whole "Welcome to Ulaa" side green.
const JOURNEY_BASE_BG = '#FBEAD9';
const JOURNEY_BASE_FG = '#C4703A';
const HAVE_YOU_EVER_FILL = '#DC2626';
const WELCOME_FILL = '#16A34A';

export default function AboutPage() {
  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [liveRating, setLiveRating] = useState<number | null>(null);
  // Tapping the glowing connector arrow fills every "Have You Ever" icon red
  // and every "Welcome to Ulaa" icon green, all at once (tap again to
  // revert). Mirrors the heart-tap-to-reveal pattern on the trip details page.
  const [journeyActivated, setJourneyActivated] = useState(false);

  useEffect(() => {
    // Fetch about content
    getSiteContent<Partial<AboutContent>>('about')
      .then(data => setContent(mergeWithDefaults(data)))
      .catch(() => {});

    // Fetch testimonials from existing module
    getTestimonials()
      .then(data => {
        setTestimonials(data);
        // Calculate avg rating dynamically from the testimonials table
        if (data.length > 0) {
          const avg = data.reduce((sum, t) => sum + t.rating, 0) / data.length;
          setLiveRating(Math.round(avg * 10) / 10);
        }
      })
      .catch(() => {});
  }, []);

  const {
    hero,
    our_story,
    journey_intro,
    why_different,
    community,
    stats,
    testimonials_heading,
    journey,
    founder,
  } = content;
  const { have_you_ever, welcome_to_ulaa } = journey_intro;

  // Use live avg rating from DB if available, fall back to admin-set value
  const displayRating = liveRating ?? stats.avg_trip_rating;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Layout>

      {/* ══════════════════════════════════════════════════════════════
          1. HERO BANNER
      ══════════════════════════════════════════════════════════════ */}
      <div className="relative h-[70vh] min-h-[480px] overflow-hidden">
        {(hero.image || hero.mobile_image) ? (
          <>
            {/* Mobile banner (falls back to desktop image if no mobile-specific one was uploaded) */}
            <img
              src={hero.mobile_image || hero.image}
              alt={hero.heading}
              className="w-full h-full object-cover md:hidden"
            />
            {/* Desktop/tablet banner (falls back to mobile image if no desktop-specific one was uploaded) */}
            <img
              src={hero.image || hero.mobile_image}
              alt={hero.heading}
              className="w-full h-full object-cover hidden md:block"
            />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/80 to-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-dark/40 via-dark/50 to-dark/80" />
        <div className="absolute inset-0 flex flex-col items-start justify-center text-left text-white px-6 sm:px-10 lg:px-20 pt-20">
          <motion.div {...fadeUp()} className="max-w-3xl">
            <h1 className="font-display text-4xl sm:text-5xl md:text-7xl font-bold leading-tight mb-6 whitespace-pre-line">
              {hero.heading}
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mb-8 leading-relaxed whitespace-pre-line">
              {hero.subheading}
            </p>
            {hero.cta_label && hero.cta_url && (
              <Link
                to={hero.cta_url}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-button font-semibold px-8 py-3 rounded-full transition-colors duration-200"
              >
                {hero.cta_label}
              </Link>
            )}
          </motion.div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          2. OUR STORY
      ══════════════════════════════════════════════════════════════ */}
      <section className="pt-6 pb-0 sm:pt-24 sm:pb-12 px-4 sm:px-6 lg:px-8 bg-background">
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
      <section className="pt-12 pb-12 sm:pb-24 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-[1344px] mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-6 sm:mb-14">
            {journey_intro.sub_heading && (
              <p className="font-script text-3xl md:text-4xl text-primary mb-2 whitespace-pre-line">
                {journey_intro.sub_heading}
              </p>
            )}
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark leading-tight mb-4 whitespace-pre-line">
              {journey_intro.heading}
            </h2>
            {journey_intro.description && (
              <p className="text-dark-muted text-lg whitespace-pre-line">
                {journey_intro.description}
              </p>
            )}
          </motion.div>
          <div className="relative rounded-3xl bg-gradient-to-br from-background-warm to-primary/10 px-6 py-12 sm:p-12">
            {/* Center connector arrow — glows continuously to invite a tap; tapping fills every icon on both sides */}
            <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => setJourneyActivated(v => !v)}
                aria-pressed={journeyActivated}
                aria-label={journeyActivated ? 'Tap to reset icon colors' : 'Tap to reveal icon colors'}
                className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-warm-lg itinerary-icon-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <ArrowRight size={22} className="text-white" />
              </button>
              {!journeyActivated && (
                <span className="text-xs font-semibold text-primary whitespace-nowrap bg-white/80 px-2 py-0.5 rounded-full shadow-sm">
                  Tap me!
                </span>
              )}
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
                    <button
                      type="button"
                      onClick={() => setJourneyActivated(v => !v)}
                      aria-pressed={journeyActivated}
                      aria-label={journeyActivated ? 'Tap to reset icon colors' : 'Tap to reveal icon colors'}
                      className="relative z-10 w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-warm-lg itinerary-icon-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <ArrowDown size={18} className="text-white" />
                    </button>
                  </div>
                  {!journeyActivated && (
                    <span className="text-xs font-semibold text-primary whitespace-nowrap bg-white px-2 py-0.5 rounded-full shadow-sm">
                      Tap me!
                    </span>
                  )}
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
                        <div className="relative w-16 h-16 rounded-full flex-shrink-0">
                          {/* base state — same pastel bg/color for every icon */}
                          <span
                            className="absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-300"
                            style={{ backgroundColor: JOURNEY_BASE_BG, opacity: journeyActivated ? 0 : 1 }}
                          >
                            <Icon size={28} color={JOURNEY_BASE_FG} strokeWidth={1.75} />
                          </span>
                          {/* green fill state, triggered by the connector arrow */}
                          <span
                            className="absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-300"
                            style={{ backgroundColor: WELCOME_FILL, opacity: journeyActivated ? 1 : 0 }}
                          >
                            <Icon size={28} color="#fff" strokeWidth={1.75} />
                          </span>
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
          <motion.div {...fadeUp()} className="text-center mb-6 sm:mb-14">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4 whitespace-pre-line">
              {why_different.heading}
            </h2>
            {why_different.subheading && (
              <p className="text-dark-muted text-lg max-w-2xl mx-auto whitespace-pre-line">
                {why_different.subheading}
              </p>
            )}
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {why_different.cards.map((card: AboutWhyDifferentCard, i: number) => (
              <motion.div
                key={i}
                {...fadeUp(i * 0.08)}
                className="relative rounded-2xl shadow-card overflow-hidden hover:shadow-card-hover transition-shadow duration-300 group aspect-[4/3]"
              >
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.heading}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="absolute inset-0 w-full h-full bg-background-warm" />
                )}
                {/* Dark bottom gradient for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-7">
                  <h3 className="font-display text-xl font-bold text-white mb-3 whitespace-pre-line">{card.heading}</h3>
                  <p className="text-white/85 text-sm leading-relaxed whitespace-pre-line">{card.description}</p>
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
        <section className="pt-12 sm:pt-24 pb-12 sm:pb-24 px-4 sm:px-6 lg:px-8 bg-background">
          <div className="max-w-[1344px] mx-auto">
            {community.photos.length > 0 ? (
              <div className="flex flex-col lg:flex-row gap-4 lg:h-[560px]">
                {/* Left column: heading card + hero photo */}
                <div className="lg:w-[30%] flex flex-col gap-4 lg:h-full">
                  <motion.div
                    {...fadeUp()}
                    className="flex-shrink-0 bg-gradient-to-br from-background-warm to-primary/10 rounded-2xl p-6"
                  >
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
            {[
              { value: `${stats.girls_travelled}+`, label: 'Girls Travelled' },
              { value: `${stats.destinations}+`, label: 'Destinations' },
              { value: `${stats.friendships_made}+`, label: 'Friendships Made' },
              {
                value: (
                  <span className="flex items-center justify-center gap-1">
                    <Star size={28} className="fill-white text-white" />
                    {displayRating}
                  </span>
                ),
                label: 'Average Trip Rating',
              },
            ].map((stat, i) => (
              <motion.div key={i} {...fadeUp(i * 0.1)}>
                <div className="font-display text-5xl md:text-6xl font-bold mb-2">
                  {stat.value}
                </div>
                <div className="text-white/80 text-sm font-button font-semibold uppercase tracking-widest">
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
        <section className="py-12 sm:py-24 px-4 sm:px-6 lg:px-8 bg-background-warm">
          <div className="max-w-[1344px] mx-auto">
            <motion.div {...fadeUp()} className="text-center mb-12">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-dark whitespace-pre-line">
                {testimonials_heading}
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((testimonial, i) => (
                <TestimonialCard key={testimonial.id} testimonial={testimonial} index={i} />
              ))}
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
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4 whitespace-pre-line">
              {journey.heading}
            </h2>
            {journey.subheading && (
              <p className="text-dark-muted text-lg whitespace-pre-line">{journey.subheading}</p>
            )}
          </motion.div>
          <div className="relative">
            {/* Horizontal connector line (desktop) */}
            <div className="hidden md:block absolute top-8 left-8 right-8 h-0.5 bg-primary/30" />
            <div className="flex flex-col md:flex-row md:justify-between gap-10 md:gap-4">
              {journey.steps.map((step: AboutJourneyStep, i: number) => {
                const meta = getTripHighlightIcon(step.icon);
                const Icon = meta ? meta.Icon : JOURNEY_ICONS[i % JOURNEY_ICONS.length];
                return (
                  <motion.div
                    key={i}
                    {...fadeUp(i * 0.1)}
                    className="relative z-10 flex flex-col items-center text-center md:flex-1 md:px-2"
                  >
                    {/* Step icon bubble */}
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
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          10. MEET THE FOUNDER
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-12 sm:py-24 px-4 sm:px-6 lg:px-8 bg-dark">
        <div className="max-w-[1344px] mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-12">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-4">
              Meet the Founder
            </h2>
          </motion.div>
          <div className="flex flex-col md:flex-row gap-12 items-center max-w-4xl mx-auto">
            <motion.div {...fadeUp(0.1)} className="flex-shrink-0">
              {founder.photo ? (
                <img
                  src={founder.photo}
                  alt={founder.name}
                  className="w-56 h-56 md:w-72 md:h-72 rounded-full object-cover shadow-warm-lg border-4 border-primary/30"
                />
              ) : (
                <div className="w-56 h-56 md:w-72 md:h-72 rounded-full bg-white/10 border-4 border-primary/30 flex items-center justify-center">
                  <span className="text-white/40 text-5xl font-display font-bold">
                    {founder.name.charAt(0) || '?'}
                  </span>
                </div>
              )}
            </motion.div>
            <motion.div {...fadeUp(0.2)} className="space-y-5 text-center md:text-left">
              <div>
                <h3 className="font-display text-3xl font-bold text-white">{founder.name}</h3>
                {founder.designation && (
                  <p className="text-primary text-base font-semibold mt-1">{founder.designation}</p>
                )}
              </div>
              <p className="text-white/70 text-lg leading-relaxed whitespace-pre-line">{founder.description}</p>
              {founder.social_links.length > 0 && (
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  {founder.social_links.map((link: AboutFounderSocialLink, i: number) =>
                    link.url ? (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-button font-semibold px-4 py-2 rounded-full transition-colors duration-200"
                      >
                        {link.platform}
                        <ExternalLink size={13} />
                      </a>
                    ) : null,
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

    </Layout>
  );
}

