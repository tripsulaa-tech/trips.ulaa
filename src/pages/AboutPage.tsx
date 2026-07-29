import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import TestimonialCard from '../components/ui/TestimonialCard';
import { getSiteContent, getTestimonials } from '../services/api';
import { DEFAULT_ABOUT } from '../constants/about';
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

// ─────────────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [liveRating, setLiveRating] = useState<number | null>(null);

  useEffect(() => {
    // Fetch about content
    getSiteContent<AboutContent>('about')
      .then(data => { if (data) setContent(data); })
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
    have_you_ever,
    welcome_to_ulaa,
    why_different,
    community,
    stats,
    testimonials_heading,
    journey,
    founder,
  } = content;

  // Use live avg rating from DB if available, fall back to admin-set value
  const displayRating = liveRating ?? stats.avg_trip_rating;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Layout>

      {/* ══════════════════════════════════════════════════════════════
          1. HERO BANNER
      ══════════════════════════════════════════════════════════════ */}
      <div className="relative h-[70vh] min-h-[480px] overflow-hidden">
        {hero.image ? (
          <img
            src={hero.image}
            alt={hero.heading}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/80 to-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-dark/40 via-dark/50 to-dark/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-20">
          <motion.div {...fadeUp()}>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6">
              {hero.heading}
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
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
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background">
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
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark leading-tight">
              {our_story.heading}
            </h2>
            <p className="text-dark-muted text-lg leading-relaxed">
              {our_story.description}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          3. HAVE YOU EVER...
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-dark">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h2
            {...fadeUp()}
            className="font-display text-4xl md:text-5xl font-bold text-white mb-12"
          >
            {have_you_ever.heading}
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {have_you_ever.items.map((item: AboutHaveYouEverItem, i: number) => (
              <motion.div
                key={i}
                {...fadeUp(i * 0.08)}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-6 py-4 text-white text-left"
              >
                <span className="text-secondary text-xl flex-shrink-0">✓</span>
                <span className="font-display text-lg font-semibold">{item.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          4. WELCOME TO ULAA
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-[1344px] mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4">
              {welcome_to_ulaa.heading}
            </h2>
            {welcome_to_ulaa.subheading && (
              <p className="text-dark-muted text-lg max-w-2xl mx-auto">
                {welcome_to_ulaa.subheading}
              </p>
            )}
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {welcome_to_ulaa.items.map((item: AboutWelcomeItem, i: number) => (
              <motion.div
                key={i}
                {...fadeUp(i * 0.1)}
                className="bg-white rounded-2xl shadow-card p-7 text-center hover:shadow-card-hover transition-shadow duration-300"
              >
                {item.icon && (
                  <div className="text-4xl mb-4">{item.icon}</div>
                )}
                <h3 className="font-display text-xl font-bold text-dark mb-3">{item.title}</h3>
                <p className="text-dark-muted text-sm leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          5. WHY ULAA IS DIFFERENT
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background-warm">
        <div className="max-w-[1344px] mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4">
              {why_different.heading}
            </h2>
            {why_different.subheading && (
              <p className="text-dark-muted text-lg max-w-2xl mx-auto">
                {why_different.subheading}
              </p>
            )}
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {why_different.cards.map((card: AboutWhyDifferentCard, i: number) => (
              <motion.div
                key={i}
                {...fadeUp(i * 0.08)}
                className="bg-white rounded-2xl shadow-card p-7 hover:shadow-card-hover transition-shadow duration-300 group"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <span className="text-primary font-bold text-lg">{i + 1}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-dark mb-3">{card.heading}</h3>
                <p className="text-dark-muted text-sm leading-relaxed">{card.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          6. OUR COMMUNITY
      ══════════════════════════════════════════════════════════════ */}
      {(community.photos.length > 0 || community.heading) && (
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background">
          <div className="max-w-[1344px] mx-auto">
            <motion.div {...fadeUp()} className="text-center mb-12">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4">
                {community.heading}
              </h2>
              {community.subheading && (
                <p className="text-dark-muted text-lg max-w-2xl mx-auto">
                  {community.subheading}
                </p>
              )}
            </motion.div>
            {community.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {community.photos.map((photo, i) => (
                  <motion.div
                    key={i}
                    {...fadeUp(i * 0.04)}
                    className="aspect-square overflow-hidden rounded-xl"
                  >
                    <img
                      src={photo}
                      alt={`Community photo ${i + 1}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center text-dark-muted py-10">
                Community photos will appear here once uploaded.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════
          7. STATISTICS
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary">
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
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background-warm">
          <div className="max-w-[1344px] mx-auto">
            <motion.div {...fadeUp()} className="text-center mb-12">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-dark">
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
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-16">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-dark mb-4">
              {journey.heading}
            </h2>
            {journey.subheading && (
              <p className="text-dark-muted text-lg">{journey.subheading}</p>
            )}
          </motion.div>
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-primary/20 hidden sm:block" />
            <div className="space-y-8">
              {journey.steps.map((step: AboutJourneyStep, i: number) => (
                <motion.div
                  key={i}
                  {...fadeUp(i * 0.1)}
                  className="flex items-start gap-6 relative"
                >
                  {/* Step number bubble */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-display font-bold text-lg z-10 shadow-md">
                    {i + 1}
                  </div>
                  <div className="bg-white rounded-2xl shadow-card p-6 flex-1 hover:shadow-card-hover transition-shadow duration-300">
                    <h3 className="font-display text-xl font-bold text-dark mb-2">{step.heading}</h3>
                    <p className="text-dark-muted text-sm leading-relaxed">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          10. MEET THE FOUNDER
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-dark">
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
              <p className="text-white/70 text-lg leading-relaxed">{founder.description}</p>
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

