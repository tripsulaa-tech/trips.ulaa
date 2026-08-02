import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getSiteContent } from '../../services/api';
import { DEFAULT_ABOUT, mergeWithDefaults } from '../../constants/about';
import { getSocialIcon } from '../../utils/socialIcons';
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
    <section className="py-10 sm:py-14 px-4 sm:px-6 lg:px-8 bg-dark relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center gap-7">
          <motion.div {...fadeUp()} className="flex-shrink-0 relative">
            {founder.photo ? (
              <img
                src={founder.photo}
                alt={founder.name}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-[3px] border-primary shadow-warm"
              />
            ) : (
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-dark-muted border-[3px] border-primary flex items-center justify-center">
                <span className="text-white/35 text-3xl font-button font-bold">
                  {founder.name.charAt(0) || '?'}
                </span>
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-dark text-base font-serif font-bold leading-none">
              &rdquo;
            </div>
          </motion.div>
          <motion.div {...fadeUp(0.1)} className="text-center sm:text-left min-w-0">
            <span className="inline-block text-[10px] font-button font-semibold tracking-wider text-secondary bg-secondary/10 px-2.5 py-1 rounded-full mb-2">
              MEET THE FOUNDER
            </span>
            <h3 className="font-display text-xl sm:text-2xl font-bold text-white">{founder.name}</h3>
            {founder.designation && (
              <p className="text-secondary text-xs font-button font-semibold mt-0.5 mb-2.5">{founder.designation}</p>
            )}
            <p className="text-white/65 text-sm leading-relaxed whitespace-pre-line line-clamp-4 sm:line-clamp-3">
              {founder.description}
            </p>
            {founder.social_links.length > 0 && (
              <div className="flex gap-2 justify-center sm:justify-start mt-3">
                {founder.social_links.map((link: AboutFounderSocialLink, i: number) =>
                  link.url ? (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.platform || 'Social link'}
                      aria-label={link.platform || 'Social link'}
                      className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-colors duration-200"
                    >
                      {getSocialIcon(link.platform, 15)}
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
