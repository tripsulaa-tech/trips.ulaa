import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { getSiteContent } from '../../services/api';
import { DEFAULT_FOUNDER, mergeFounderWithDefaults } from '../../constants/founder';
import Button from '../../components/ui/Button';
import type { FounderContent } from '../../types/types-index';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, delay },
});

interface MeetTheFounderProps {
  // Hides the "About" CTA (which links to the About page) when this
  // section is rendered on the About page itself, since linking there
  // from there would be a no-op. Defaults to true for the Home and
  // Upcoming Trips placements.
  showAboutLink?: boolean;
}

// The single shared "Meet the Founder" section — reused as-is (same
// component, same data, same design) across the Home page, About page, and
// Upcoming Trips page, all reading the same source: the 'founder'
// site_content row (see src/admin/AdminFounder.tsx). Design: a large
// tilted, rounded photo frame beside a header/bio (centered on mobile,
// left-aligned from md up), plus two CTAs (Contact Us -> the founder's
// Instagram link, About -> the About page) instead of a row of social
// icons. The header/eyebrow is hand-rolled here (rather than the shared
// SectionTitle component) because SectionTitle's `align` prop isn't
// responsive, and this section needs centered-on-mobile/left-on-desktop,
// unlike SectionTitle's other callers. Kept as its own component so it can
// be lazy-loaded independently of the rest of each page's code, matching
// the pattern of the other Home sections.
export default function MeetTheFounder({ showAboutLink = true }: MeetTheFounderProps) {
  const [founder, setFounder] = useState<FounderContent>(DEFAULT_FOUNDER);

  useEffect(() => {
    getSiteContent<Partial<FounderContent>>('founder')
      .then(data => setFounder(mergeFounderWithDefaults(data)))
      .catch(() => {});
  }, []);

  // "Contact Us" points at the founder's Instagram (falling back to
  // whichever social link is set, if Instagram itself isn't) rather than
  // a site contact form.
  const contactUrl =
    founder.social_links.find(l => /insta/i.test(l.platform) && l.url)?.url ||
    founder.social_links.find(l => l.url)?.url;

  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-dark relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 md:gap-16 items-center">
        <motion.div {...fadeUp()} className="flex justify-center md:justify-start">
          <div className="w-64 h-72 sm:w-80 sm:h-96 md:w-[22rem] md:h-[26rem] rounded-[2.5rem] border-4 border-primary overflow-hidden -rotate-6 shadow-warm-lg">
            {founder.photo ? (
              <img
                src={founder.photo}
                alt={founder.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-dark-muted flex items-center justify-center">
                <span className="text-white/35 text-6xl font-button font-bold rotate-6">
                  {founder.name.charAt(0) || '?'}
                </span>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.1)} className="flex flex-col items-center md:items-start text-center md:text-left">
          <span className="font-script font-medium text-3xl md:text-4xl text-secondary">
            Meet the Founder
          </span>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white mt-3">
            {founder.name}
          </h2>
          {founder.designation && (
            <p className="text-base sm:text-lg md:text-xl leading-relaxed text-white/80 mt-3">
              {founder.designation}
            </p>
          )}

          <p className="text-white/65 text-sm sm:text-base leading-relaxed whitespace-pre-line mt-5">
            {founder.description}
          </p>

          <div className="flex flex-row flex-wrap gap-3 sm:gap-4 justify-center md:justify-start mt-7">
            {contactUrl && (
              <a href={contactUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="primary" size="sm" className="sm:px-8 sm:py-4 sm:text-base">
                  Contact Us
                </Button>
              </a>
            )}
            {showAboutLink && (
              <Link to="/about">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white border-white/40 hover:border-white hover:bg-white/10 sm:px-8 sm:py-4 sm:text-base"
                >
                  <Play size={14} className="fill-white sm:w-4 sm:h-4" />
                  About
                </Button>
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
