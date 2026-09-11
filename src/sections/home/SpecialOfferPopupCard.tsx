import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, ArrowRight, Clock, X, MapPin, Users } from '@phosphor-icons/react';
import {
  formatPrice,
  formatDate,
  formatDestinationDotsCompact,
  PLACEHOLDER_IMAGE,
  getCoverImageStyle,
} from '../../utils/utils-index';
import type { UpcomingTrip } from '../../types/types-index';

// Escapes the characters that have special meaning inside an .ics
// TEXT value (RFC 5545 §3.3.11) — commas, semicolons, backslashes, and
// newlines all need a leading backslash or they'd corrupt the file.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

function toIcsDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

// Builds a single-file .ics calendar containing one all-day reminder event
// on the offer's last day, and hands the browser a Blob URL for it. Tapping
// the resulting link is what actually surfaces the phone's native "Add to
// Calendar" flow — this function only prepares the file.
function buildOfferCalendarUrl(trip: UpcomingTrip, activePrice: number | null | undefined): string | null {
  const endDateStr = trip.special_offer_end_date || trip.special_offer_date;
  if (!endDateStr) return null;

  const endDate = new Date(endDateStr);
  if (Number.isNaN(endDate.getTime())) return null;

  // DTEND for an all-day VEVENT is exclusive, so it needs to land on the
  // day *after* the offer actually ends.
  const dtEndExclusive = new Date(endDate);
  dtEndExclusive.setDate(dtEndExclusive.getDate() + 1);

  const summary = `${trip.special_offer_name || 'Special offer'} ends — ${trip.title}`;
  const priceLine = activePrice != null ? `Book at ${formatPrice(activePrice)} per person before it's gone.` : `Last day to book this offer.`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ULAA//Special Offer Reminder//EN',
    'BEGIN:VEVENT',
    `UID:offer-${trip.id}-${toIcsDate(endDate)}@ulaa`,
    `DTSTAMP:${toIcsDate(new Date())}T000000Z`,
    `DTSTART;VALUE=DATE:${toIcsDate(endDate)}`,
    `DTEND;VALUE=DATE:${toIcsDate(dtEndExclusive)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(priceLine)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
}

export interface SpecialOfferPopupCardProps {
  visible: boolean;
  trip: UpcomingTrip;
  activePrice: number | null | undefined;
  strikeThroughPrice: number | null | undefined;
  /** Days left on the offer — only consulted when `trip.special_offer_date` is set. */
  daysLeft: number;
  isAlmostFull: boolean;
  remaining: number;
  /** Defaults to "View This Offer". */
  ctaLabel?: string;
  onCtaClick: () => void;
  onDismiss: () => void;
}

/**
 * Purely presentational special-offer popup — same card used on the
 * homepage (fetches its own featured trip, CTA navigates to the trip page)
 * and on a trip's own detail page (uses the trip already loaded there, CTA
 * opens booking directly). Callers own data-loading, reveal timing, and
 * dismissal state; this component just renders the visuals for a given
 * trip + pricing snapshot.
 */
export default function SpecialOfferPopupCard({
  visible,
  trip,
  activePrice,
  strikeThroughPrice,
  daysLeft,
  isAlmostFull,
  remaining,
  ctaLabel = 'View This Offer',
  onCtaClick,
  onDismiss,
}: SpecialOfferPopupCardProps) {
  // "Maybe later" both dismisses the popup for this visit and, when the
  // offer has a known end date, hands the phone a one-event .ics file so
  // its native "Add to Calendar" prompt comes up as a reminder before the
  // offer runs out.
  const handleMaybeLater = () => {
    const calendarUrl = buildOfferCalendarUrl(trip, activePrice);
    if (calendarUrl) {
      const link = document.createElement('a');
      link.href = calendarUrl;
      link.download = 'special-offer-reminder.ics';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Blob URLs aren't auto-revoked; release it once the browser has had
      // a moment to actually read the file for the calendar prompt/download.
      setTimeout(() => URL.revokeObjectURL(calendarUrl), 1000);
    }
    onDismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Special offer: ${trip.special_offer_name || trip.title}`}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="offer-border-gradient-shift relative w-full max-w-sm sm:max-w-md rounded-xl shadow-warm-lg p-[3px]"
          >
            {/* Everything actually lives inside this inset white panel — the
                outer motion.div is just a 3px strip of the animated
                orange-to-brown gradient showing through as a border/stroke
                around the card, rather than filling it. */}
            <div className="relative bg-white rounded-lg overflow-hidden">
              {/* 44x44 tap target (WCAG/Apple minimum), even though the
                  visible circle stays visually compact. */}
              <button
                onClick={onDismiss}
                aria-label="Close"
                className="absolute top-2 right-2 z-10 text-white bg-dark/40 hover:bg-dark/60 rounded-full p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
              >
                <X size={18} weight="bold" />
              </button>

              {/* Cover image is pure backdrop here — no competing headline text
                  on top of it, since trip cover photos often already carry
                  their own baked-in text/graphics. The only overlay is the
                  offer-name badge, which doubles as the "why this popup"
                  eyebrow — the trip name itself gets top billing below, on
                  white, where it's actually legible regardless of what's in
                  the photo. */}
              <div className="relative h-36 sm:h-44 w-full">
                <img
                  src={trip.cover_image || PLACEHOLDER_IMAGE}
                  alt=""
                  className="w-full h-full object-cover"
                  style={getCoverImageStyle(trip.cover_image_crop)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-dark/50 via-dark/5 to-transparent" />
                <span className="offer-badge-gradient-shift absolute top-3 left-3 inline-flex items-center gap-1.5 text-white text-2xs font-button font-bold uppercase tracking-wide px-3 py-1.5 rounded-md shadow-warm-lg ring-1 ring-inset ring-white/15 max-w-[calc(100%-3.5rem)]">
                  <Sparkle size={13} weight="fill" className="shrink-0" />
                  <span className="truncate">{trip.special_offer_name || 'Limited Time Offer'}</span>
                </span>
              </div>

              <div className="p-5 sm:p-6">
                <div className="text-center mb-4">
                  <p className="font-display text-xl sm:text-2xl font-bold text-dark leading-snug">{trip.title}</p>
                  <p className="flex items-center justify-center gap-1 text-dark-muted text-xs mt-1.5">
                    <MapPin size={12} className="shrink-0" />
                    {formatDestinationDotsCompact(trip.destination)}
                  </p>
                </div>

                {/* One cohesive "deal card" for price + savings + countdown,
                    instead of three loose centered lines — groups everything
                    someone needs to decide into a single scannable chunk, with
                    a hairline divider separating "what it costs" from "why
                    now" rather than relying on margin alone. */}
                {activePrice != null && (
                  <div className="bg-background-warm/60 border border-background-warm rounded-lg px-4 pt-4 pb-3.5 mb-3">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-display text-2xl sm:text-3xl font-bold text-primary">{formatPrice(activePrice)}</span>
                      {strikeThroughPrice != null && (
                        <span className="text-dark-muted line-through text-base">{formatPrice(strikeThroughPrice)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <span className="text-dark-muted text-2xs">per person</span>
                      {strikeThroughPrice != null && (
                        <span className="bg-green-50 border border-green-200 text-green-700 text-2xs font-button font-semibold px-2 py-0.5 rounded-md">
                          Save {formatPrice(strikeThroughPrice - activePrice)}
                        </span>
                      )}
                    </div>

                    {trip.special_offer_date && (
                      <p className="flex items-center justify-center gap-1 text-primary-dark text-xs font-medium mt-3 pt-3 border-t border-dashed border-primary/25">
                        <Clock size={13} className="shrink-0" />
                        {daysLeft <= 1 ? (
                          <>Ends today — <span className="font-bold">grab it before it's gone!</span></>
                        ) : (
                          <>
                            Ends {formatDate(trip.special_offer_end_date || trip.special_offer_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' — '}
                            <span className="font-bold">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                )}

                {isAlmostFull && (
                  <p className="flex items-center justify-center gap-1.5 text-2xs text-primary-dark font-medium mb-4">
                    <Users size={12} className="shrink-0" />
                    Only {remaining} {remaining === 1 ? 'seat' : 'seats'} left at this price
                  </p>
                )}

                {/* A brief double-pulse draws the eye to the CTA the moment
                    the popup lands, then settles — a nudge, not a nag. */}
                <motion.button
                  type="button"
                  onClick={onCtaClick}
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.035, 1] }}
                  transition={{ duration: 0.7, delay: 0.4, times: [0, 0.5, 1], repeat: 1, repeatDelay: 0.5 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`group/btn w-full inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark shadow-warm hover:shadow-warm-lg border-2 border-primary rounded-md px-6 py-3 text-sm sm:text-base font-button font-semibold transition-colors min-h-[48px] ${isAlmostFull ? '' : 'mt-1'}`}
                >
                  {ctaLabel}
                  <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                </motion.button>

                {/* Padded to a real 44px tap target even though it reads as a
                    plain text link. Full-width + flex-centered (not
                    mx-auto/block, which fought the button's own flex
                    centering and left the label hugging the left edge). */}
                <button
                  type="button"
                  onClick={handleMaybeLater}
                  className="mt-1 px-4 py-2.5 min-h-[44px] w-full inline-flex items-center justify-center text-dark-muted text-xs hover:text-dark transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
