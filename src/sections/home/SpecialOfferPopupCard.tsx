import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, ArrowRight, Clock, X, MapPin, Users, Heart, CalendarBlank } from '@phosphor-icons/react';
import {
  formatPrice,
  formatDate,
  formatDestinationDotsCompact,
  PLACEHOLDER_IMAGE,
  getCoverImageStyle,
} from '../../utils/utils-index';
import { addOfferReminderToCalendar } from '../../utils/calendar';
import type { UpcomingTrip } from '../../types/types-index';

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
  // offer has a known end date, adds a reminder for the offer's last day —
  // same device-aware handoff as the "Add to calendar" icon on TripCard:
  // an .ics download straight into Apple Calendar on iOS/iPadOS/macOS, or
  // a Google Calendar prefill tab everywhere else, instead of always
  // forcing an .ics download regardless of platform.
  const handleMaybeLater = () => {
    addOfferReminderToCalendar(trip, activePrice);
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
                green-yellow gradient showing through as a border/stroke
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
                  the photo.

                  rounded-t-lg + overflow-hidden are applied directly on this
                  wrapper (not just inherited from the white panel around it)
                  because getCoverImageStyle() can put a CSS `transform:
                  scale()` on the <img> for zoomed crops — and a transformed
                  child breaks an ancestor's rounded-corner clipping in some
                  browsers, leaving the top corners looking square while the
                  untransformed bottom of the card clips correctly. Giving
                  the image its own clip boundary at the same radius as the
                  panel keeps all four corners visually consistent. */}
              <div className="relative h-24 sm:h-32 w-full rounded-t-lg overflow-hidden">
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

              <div className="p-4 sm:p-5">
                <div className="text-left mb-2.5">
                  {/* Font-size scales with viewport (clamp) rather than
                      jumping between two fixed sizes, and whitespace-nowrap
                      keeps it on one line the way it's meant to be read.
                      overflow-hidden + text-ellipsis is just a safety net
                      for an unusually long title, so it never breaks the
                      card layout. */}
                  <p
                    className="font-display font-bold text-dark leading-snug whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ fontSize: 'clamp(0.8rem, 3.6vw, 1.1rem)' }}
                  >
                    {trip.title}
                  </p>
                  <p className="flex items-center justify-start gap-1 text-dark-muted text-xs mt-1">
                    <MapPin size={12} className="shrink-0" />
                    {formatDestinationDotsCompact(trip.destination)}
                  </p>
                  {/* Festive occasion line — echoes whatever offer name the
                      admin entered (e.g. "Vinayagar Chaturthi") so the popup
                      reads as a warm, on-brand celebration invite rather than
                      a generic markdown. Kept short on purpose (vs. the
                      earlier "This X, treat yourself to a getaway to
                      remember!") so it reliably fits one line instead of
                      wrapping; whitespace-nowrap + ellipsis is a safety net
                      for an unusually long offer name. Heart sits after the
                      copy, not before it. */}
                  <p className="flex items-center justify-start gap-1.5 text-primary-dark text-2xs font-semibold mt-1.5">
                    <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                      {trip.special_offer_name
                        ? `Celebrate ${trip.special_offer_name} with a getaway!`
                        : 'A getaway worth celebrating!'}
                    </span>
                    <Heart size={11} weight="fill" className="shrink-0" />
                  </p>
                </div>

                {/* Redesigned so the "X days left" urgency line is a bold,
                    full-width hero banner at the top of the deal card
                    (not a thin dashed-border footnote) and the price
                    itself is bumped up a size — these are the two things
                    that actually move someone to tap, so they get top
                    billing instead of competing for attention equally
                    with "per person"/Save. */}
                {activePrice != null && (
                  <div className="bg-background-warm/60 border border-background-warm rounded-lg overflow-hidden mb-2">
                    {trip.special_offer_date && (
                      // rounded-t-lg + overflow-hidden applied directly here
                      // (matching the parent's own rounded-lg), for the same
                      // reason as the cover image above: this bar has a
                      // continuously-running background-position animation
                      // (offer-gradient-shift), and an infinitely-animating
                      // child can get promoted to its own compositing layer
                      // in some browsers — which then ignores the parent's
                      // rounded overflow-hidden clip and renders square top
                      // corners instead. Giving it an explicit clip at the
                      // same radius keeps it visually consistent regardless.
                      <div className="offer-gradient-shift rounded-t-lg overflow-hidden flex items-center justify-center flex-wrap gap-x-1.5 gap-y-0.5 text-white py-1.5 px-3">
                        <Clock size={14} weight="bold" className="shrink-0" />
                        <span className="font-display text-xs sm:text-sm font-extrabold uppercase tracking-wide text-center">
                          {daysLeft <= 1
                            ? "Ends today — grab it before it's gone!"
                            : `Only ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left!`}
                        </span>
                        {/* Small, lighter-weight nudge riding alongside the
                            bold headline — only added for the "N days left"
                            case, since the "ends today" copy above already
                            says "grab it before it's gone" itself. */}
                        {daysLeft > 1 && (
                          <span className="text-2xs font-medium normal-case tracking-normal text-white/85">
                            Grab before it's gone!
                          </span>
                        )}
                      </div>
                    )}
                    <div className="px-4 pt-3 pb-2.5">
                      {/* Price, "per person", strike-through, and the Save
                          badge all sit on one row now instead of stacking
                          across two lines. flex-wrap is just a safety net
                          for very narrow screens or long formatted prices —
                          it fits on one line at normal widths. */}
                      <div className="flex items-center justify-center flex-wrap gap-x-2 gap-y-0.5">
                        <span className="font-display text-2xl sm:text-3xl font-bold text-primary">{formatPrice(activePrice)}</span>
                        <span className="text-dark-muted text-2xs">per person</span>
                        {strikeThroughPrice != null && (
                          <span className="text-dark-muted line-through text-sm sm:text-base">{formatPrice(strikeThroughPrice)}</span>
                        )}
                        {strikeThroughPrice != null && (
                          <span className="bg-green-50 border border-green-200 text-green-700 text-2xs font-button font-semibold px-2 py-0.5 rounded-md">
                            Save {formatPrice(strikeThroughPrice - activePrice)}
                          </span>
                        )}
                      </div>

                      {/* "Ends <date>" and "Only N seats left" combined onto
                          one line, now inside the price box itself with a
                          divider separating it from the price row above,
                          instead of living as a separate block underneath
                          the box. Either half can be absent (no end date, or
                          plenty of seats left) without leaving a stray
                          divider behind. */}
                      {((trip.special_offer_date && daysLeft > 1) || isAlmostFull) && (
                        <div className="flex items-center justify-center flex-wrap gap-x-2 gap-y-1 text-2xs mt-2 pt-2 border-t border-dark/10">
                          {trip.special_offer_date && daysLeft > 1 && (
                            <span className="flex items-center gap-1 text-primary-dark font-medium">
                              <CalendarBlank size={12} className="shrink-0" />
                              Ends {formatDate(trip.special_offer_end_date || trip.special_offer_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {trip.special_offer_date && daysLeft > 1 && isAlmostFull && (
                            <span className="text-primary-dark/40">|</span>
                          )}
                          {isAlmostFull && (
                            <span className="flex items-center gap-1 text-primary-dark font-medium">
                              <Users size={12} className="shrink-0" />
                              Only {remaining} {remaining === 1 ? 'seat' : 'seats'} left at this price
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Short, upbeat reassurance line to close the gap between
                    "interested" and "tapping the CTA" — sits right above the
                    button where it's most likely to be read. */}
                <p className="text-center text-dark-muted text-2xs mb-2">
                  Handpicked experiences, trusted by fellow travellers
                </p>

                {/* A brief double-pulse draws the eye to the CTA the moment
                    the popup lands, then settles — a nudge, not a nag.
                    cta-shine-sweep adds a looping light-glide across the
                    button afterwards so it keeps drawing the eye even once
                    the initial pulse has finished. Covers both the
                    homepage popup and the trip-detail-page one, since both
                    render this same button. */}
                <motion.button
                  type="button"
                  onClick={onCtaClick}
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.035, 1] }}
                  transition={{ duration: 0.7, delay: 0.4, times: [0, 0.5, 1], repeat: 1, repeatDelay: 0.5 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`cta-shine-sweep group/btn w-full inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark shadow-warm hover:shadow-warm-lg border-2 border-primary rounded-md px-6 py-2.5 text-sm sm:text-base font-button font-semibold transition-colors min-h-[44px]`}
                >
                  <span className="relative z-10">{ctaLabel}</span>
                  <ArrowRight size={16} className="relative z-10 transition-transform group-hover/btn:translate-x-1" />
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
