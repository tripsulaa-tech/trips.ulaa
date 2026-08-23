import { motion, AnimatePresence } from 'framer-motion';
import ItineraryDayPhotos from '../../components/ui/ItineraryDayPhotos';
import { getTripHighlightIcon, getTripHighlightPalette } from '../../constants/tripHighlightIcons';
import type { UpcomingTrip } from '../../types/types-index';
import { getItineraryGridClass } from './tripDetailUtils';

interface TripItinerarySectionProps {
  itinerary: UpcomingTrip['itinerary'];
  expandedItineraryDays: Set<number>;
  toggleItineraryDay: (i: number) => void;
}

export default function TripItinerarySection({
  itinerary,
  expandedItineraryDays,
  toggleItineraryDay,
}: TripItinerarySectionProps) {
  return (
    <section id="itinerary" className="scroll-mt-44 mb-10 sm:mb-[60px]">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-6 sm:mb-10 text-center px-2">
        {itinerary.length} Day{itinerary.length !== 1 ? 's' : ''} of Unforgettable Moments
      </h2>
      <p className="text-center text-dark-muted text-sm -mt-4 mb-6">
        Tap a day's icon to see the details
      </p>
      <div className={`grid gap-x-6 gap-y-9 sm:gap-y-12 pt-6 ${getItineraryGridClass(itinerary.length)}`}>
        {itinerary.map((day, i) => {
          const meta = getTripHighlightIcon(day.icon);
          const palette = getTripHighlightPalette(i);
          const isDayOpen = expandedItineraryDays.has(i);
          const hasDetails = Boolean(day.description) || (day.bullets?.length ?? 0) > 0;
          return (
            <motion.div
              key={day.day}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(i, 8) * 0.07, duration: 0.5 }}
              className="relative"
            >
              {/* Circular badge — half in, half out of the card's top edge */}
              <button
                type="button"
                onClick={() => hasDetails && toggleItineraryDay(i)}
                aria-expanded={isDayOpen}
                aria-label={`${day.title} — tap for details`}
                className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center shadow-md ring-4 ring-white font-button font-bold text-sm text-white focus:outline-none focus-visible:ring-primary/50 ${hasDetails ? 'cursor-pointer' : 'cursor-default'} ${hasDetails && !isDayOpen ? 'itinerary-icon-glow' : ''}`}
                style={{ backgroundColor: palette.fg }}
              >
                {meta ? <meta.Icon size={20} color="#fff" strokeWidth={2.25} /> : day.day}
              </button>
              <div className="w-full bg-white border border-background-warm rounded-lg pt-8 pb-4 px-4 shadow-card hover:shadow-card-hover transition-shadow flex flex-col gap-2 text-center">
                <h3 className="font-display font-bold text-dark text-base">{day.title}</h3>
                <AnimatePresence initial={false}>
                  {isDayOpen && hasDetails && (
                    <motion.div
                      key="day-details"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <p className="text-dark-muted text-sm leading-relaxed">{day.description}</p>
                      {(day.bullets?.length ?? 0) > 0 && (
                        <ul className="text-left space-y-1 mt-2">
                          {day.bullets!.map((bullet, bi) => (
                            <li key={bi} className="flex items-start gap-2 text-dark-muted text-sm leading-relaxed">
                              <span className="mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                {(day.images?.length ?? 0) > 0 && (
                  <ItineraryDayPhotos images={day.images || []} className="h-40 mt-1" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
