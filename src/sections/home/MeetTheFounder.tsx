import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { getSiteContent } from '../../services/api';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../../constants/about';
import type { AboutContent, AboutFounderSocialLink } from '../../types/types-index';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, delay },
});

// Same "Meet the Founder" block as the About page (section 10 there),
// reused as-is on the Home page — same content source (site_content ->
// 'about' -> founder), same markup/styling — just placed above Instagram
// Moments here instead of at the end of the About page. Kept as its own
// component (rather than importing a shared one from AboutPage.tsx) so
// this section can be lazy-loaded independently of the rest of the About
// page's code, matching the pattern of the other Home sections.
export default function MeetTheFounder() {
  const [content, setContent] = useState<AboutContent>(DEFAULT_ABOUT);

  useEffect(() => {
    getSiteContent<Partial<AboutContent>>('about')
      .then(data => setContent(mergeWithDefaults(data)))
      .catch(() => {});
  }, []);

  const { founder } = content;

  return (
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
  );
}
