import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, ArrowRight, Clock, X, MapPin, Users } from '@phosphor-icons/react';
import { getUpcomingTrips } from '../../services/api';
import {
  getActivePrice,
  getStrikeThroughPrice,
  formatPrice,
  formatDate,
  formatDestinationDotsCompact,
  specialOfferDaysLeft,
  publicSeatsLeft,
  PLACEHOLDER_IMAGE,
  getCoverImageStyle,
} from '../../utils/utils-index';
import type { UpcomingTrip } from '../../types/types-index';

// How long the homepage sits quietly before the offer surfaces. Long enough
// that it never feels like it's blocking the very first paint (people get a
// beat to actually see the page they landed on first), short enough that
// almost nobody has scrolled past the hero before it appears.
//
// This runs in *parallel* with the trips fetch (see the effect below), not
// stacked after it — so the real worst-case wait is max(fetchTime,
// REVEAL_DELAY_MS), not fetchTime + REVEAL_DELAY_MS. On a slow connection
// the homepage's ~15 parallel Supabase calls can themselves take several
// seconds; stacking a fixed delay on top of that would mean the popup can
// interrupt someone who's already scrolled deep into the page, which feels
// random rather than intentional.
const REVEAL_DELAY_MS = 1800;

/**
 * A single, tastefully-timed popup that surfaces the best currently-live
 * special offer every time someone lands on the homepage, and gets them
 * straight to booking it. Dismissing it (X, "Maybe later", or the backdrop)
 * only closes *this* visit — since HomePage remounts fresh on every
 * navigation to "/", leaving this page and coming back always shows it
 * again for as long as a real, currently-active offer exists on a trip
 * that isn't already sold out. It never pitches something the visitor
 * can't actually book.
 */
export default function SpecialOfferPopup() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Derived, not stored: reveals the instant both the fetch and the minimum
  // delay have settled (whichever finishes last), with no extra render lag
  // from bouncing the result through its own effect + state.
  const visible = !!trip && dataReady && delayElapsed && !dismissed;

  // Fetch and the reveal delay run side by side, not one after the other —
  // see the REVEAL_DELAY_MS comment above.
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      if (!cancelled) setDelayElapsed(true);
    }, REVEAL_DELAY_MS);

    getUpcomingTrips()
      .then(trips => {
        if (cancelled) return;

        // Trips already come back in the admin's curated sort order, so the
        // first live, bookable special offer in that order is the one the
        // admin would want featured first — same trip that'd show first in
        // the "Upcoming adventures" preview below.
        const featured = trips.find(t => {
          const { isSpecialOffer } = getActivePrice(
            t.price, t.early_bird_price, t.early_bird_deadline,
            t.special_offer_price, t.special_offer_date, t.special_offer_end_date
          );
          if (!isSpecialOffer) return false;
          const remaining = publicSeatsLeft(t.total_seats, t.seats_booked, t.waitlist_reserved || 0);
          return remaining > 0;
        });

        if (featured) setTrip(featured);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDataReady(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!trip) return null;

  const { activePrice, isSpecialOffer } = getActivePrice(
    trip.price, trip.early_bird_price, trip.early_bird_deadline,
    trip.special_offer_price, trip.special_offer_date, trip.special_offer_end_date
  );
  const strikeThroughPrice = getStrikeThroughPrice(activePrice, trip.price, false, trip.strike_through_price, isSpecialOffer);
  const daysLeft = trip.special_offer_date
    ? specialOfferDaysLeft(trip.special_offer_date, trip.special_offer_end_date)
    : 0;
  // Only shown when it's true and genuinely scarce — real numbers, not a
  // manufactured "hurry" line. Mirrors the "Almost full" threshold used
  // elsewhere on the site (TripCard/TripHero) so the two never disagree.
  const remaining = publicSeatsLeft(trip.total_seats, trip.seats_booked, trip.waitlist_reserved || 0);
  const isAlmostFull = remaining > 0 && remaining <= 5;

  const dismiss = () => {
    setDismissed(true);
  };

  const handleView = () => {
    dismiss();
    navigate(`/trips/${trip.slug}`);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Special offer: ${trip.special_offer_name || trip.title}`}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm sm:max-w-md bg-white rounded-lg shadow-warm-lg overflow-hidden"
          >
            {/* 44x44 tap target (WCAG/Apple minimum), even though the
                visible circle stays visually compact. */}
            <button
              onClick={dismiss}
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
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-primary-dark text-white text-2xs font-button font-bold uppercase tracking-wide px-3 py-1.5 rounded-md shadow-warm max-w-[calc(100%-3.5rem)]">
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
                onClick={handleView}
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.035, 1] }}
                transition={{ duration: 0.7, delay: 0.4, times: [0, 0.5, 1], repeat: 1, repeatDelay: 0.5 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`group/btn w-full inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark shadow-warm hover:shadow-warm-lg border-2 border-primary rounded-md px-6 py-3 text-sm sm:text-base font-button font-semibold transition-colors min-h-[48px] ${isAlmostFull ? '' : 'mt-1'}`}
              >
                View This Offer
                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
              </motion.button>

              {/* Padded to a real 44px tap target even though it reads as a
                  plain text link. */}
              <button
                type="button"
                onClick={dismiss}
                className="mt-1 px-4 py-2.5 min-h-[44px] inline-flex items-center justify-center text-dark-muted text-xs hover:text-dark transition-colors mx-auto block"
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
