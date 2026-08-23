import { motion } from 'framer-motion';
import TripHighlightIconDisplay from '../../components/ui/TripHighlightIconDisplay';
import type { TripHighlightCard } from '../../types/types-index';
import { Heart } from '@phosphor-icons/react';

interface TripHighlightsSectionProps {
  highlightCards: TripHighlightCard[];
  isDesktop: boolean;
  expandedHighlights: Set<number>;
  toggleHighlight: (i: number) => void;
  heartLoved: boolean;
  onHeartLove: (count: number) => void;
}

export default function TripHighlightsSection({
  highlightCards,
  isDesktop,
  expandedHighlights,
  toggleHighlight,
  heartLoved,
  onHeartLove,
}: TripHighlightsSectionProps) {
  return (
    <section id="highlights" className="scroll-mt-44">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-5 sm:mb-8 flex items-center justify-center gap-2 text-center">
        Why You'll Love This Trip
        <button
          type="button"
          onClick={() => onHeartLove(highlightCards.length)}
          aria-pressed={heartLoved}
          aria-label={heartLoved ? "Tap to collapse all reasons" : "Tap to fall in love with this trip"}
          className="relative inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {/* Minimal cue that the heart is tappable, before it's been loved */}
          {!heartLoved && (
            <span className="absolute inset-0 -m-1 rounded-full border border-primary/30 animate-ping" />
          )}
          <motion.span
            className="inline-flex"
            animate={heartLoved ? { scale: [1, 1.2, 1] } : {}}
            transition={heartLoved ? { duration: 0.4, ease: 'easeOut' } : {}}
          >
            <Heart
              size={20}
              className={`-rotate-6 transition-colors duration-300 ${heartLoved ? 'text-pink-500 heart-glow' : 'text-primary/70'}`}
              fill={heartLoved ? '#ec4899' : 'currentColor'}
              fillOpacity={heartLoved ? 1 : 0.15}
            />
          </motion.span>
        </button>
      </h2>
      <p className="sm:hidden text-center text-dark-muted text-sm -mt-3 mb-4">
        Tap the heart to reveal all reasons
      </p>
      <div className="flex flex-wrap justify-center divide-y divide-x-0 sm:divide-y-0 sm:divide-x divide-background-warm">
        {highlightCards.map((card, i) => {
          const isOpen = expandedHighlights.has(i);
          return (
            <motion.div
              key={i}
              initial={isDesktop ? { opacity: 0, y: 20 } : false}
              whileInView={isDesktop ? { opacity: 1, y: 0 } : undefined}
              viewport={{ once: true }}
              transition={isDesktop ? { delay: i * 0.07, duration: 0.5 } : undefined}
              className="group flex flex-col items-center text-center gap-2 sm:gap-3 px-3 sm:px-4 py-4 sm:py-5 w-1/2 sm:w-1/3 lg:w-1/6"
            >
              <button
                type="button"
                onClick={() => toggleHighlight(i)}
                aria-expanded={isOpen}
                aria-label={`${card.heading} — tap for details`}
                className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
              >
                <TripHighlightIconDisplay icon={card.icon} index={i} filled={isOpen} hoverFill />
              </button>
              <div className="w-full">
                <h3 className="font-display font-bold text-dark text-base mb-1">{card.heading}</h3>
                {isOpen && (
                  <p className="sm:hidden overflow-hidden text-dark-muted text-sm leading-relaxed">
                    {card.description}
                  </p>
                )}
                <p className="hidden sm:block text-dark-muted text-sm leading-relaxed">{card.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
