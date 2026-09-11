import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, ArrowRight, Clock, X } from '@phosphor-icons/react';
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
const REVEAL_DELAY_MS = 1800;

// sessionStorage key prefix. Keyed by trip id *and* the offer's end date, so
// a dismissed popup naturally reappears the next time the admin sets up a
// fresh offer (different end date = different key = not "seen" yet) without
// needing any cleanup logic — but won't nag again this session for the
// same offer once someone's closed it.
const DISMISS_KEY_PREFIX = 'ulaa_special_offer_dismissed_';

/**
 * A single, tastefully-timed popup that surfaces the best currently-live
 * special offer to homepage visitors and gets them straight to booking it.
 * Shows at most once per browser session per offer (see DISMISS_KEY_PREFIX)
 * and only when a real, currently-active offer exists on a trip that isn't
 * already sold out — so it never nags, and never pitches something the
 * visitor can't actually book.
 */
export default function SpecialOfferPopup() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
        if (!featured) return;

        const dismissKey = `${DISMISS_KEY_PREFIX}${featured.id}_${featured.special_offer_end_date || featured.special_offer_date}`;
        if (sessionStorage.getItem(dismissKey)) return;

        setTrip(featured);
        timer = setTimeout(() => setVisible(true), REVEAL_DELAY_MS);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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

  const dismiss = () => {
    setVisible(false);
    const dismissKey = `${DISMISS_KEY_PREFIX}${trip.id}_${trip.special_offer_end_date || trip.special_offer_date}`;
    sessionStorage.setItem(dismissKey, '1');
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
            <button
              onClick={dismiss}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 text-white bg-dark/40 hover:bg-dark/60 rounded-full p-2 min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors"
            >
              <X size={16} weight="bold" />
            </button>

            {/* Cover image with the offer name overlaid, same visual language
                as the badge on TripCard/TripHero so this reads as "the same
                offer" the moment someone lands on the trip page. */}
            <div className="relative h-40 sm:h-48 w-full">
              <img
                src={trip.cover_image || PLACEHOLDER_IMAGE}
                alt={trip.title}
                className="w-full h-full object-cover"
                style={getCoverImageStyle(trip.cover_image_crop)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-dark/80 via-dark/10 to-transparent" />
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-primary-dark text-white text-2xs font-button font-bold uppercase tracking-wide px-3 py-1.5 rounded-md shadow-warm">
                <Sparkle size={13} weight="fill" />
                Limited Time
              </span>
              <div className="absolute bottom-3 left-4 right-4">
                <p className="font-display text-lg sm:text-xl font-bold text-white leading-tight">
                  {trip.special_offer_name || 'Special Offer'}
                </p>
                <p className="text-white/85 text-xs mt-0.5">{trip.title}</p>
              </div>
            </div>

            <div className="p-5 sm:p-6 text-center">
              <p className="text-dark-muted text-xs mb-3">{formatDestinationDotsCompact(trip.destination)}</p>

              {activePrice != null && (
                <div className="mb-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-display text-2xl sm:text-3xl font-bold text-primary">{formatPrice(activePrice)}</span>
                    {strikeThroughPrice != null && (
                      <span className="text-dark-muted line-through text-base">{formatPrice(strikeThroughPrice)}</span>
                    )}
                  </div>
                  <p className="text-dark-muted text-xs mt-0.5">per person</p>
                  {strikeThroughPrice != null && (
                    <span className="inline-block mt-2 bg-green-50 border border-green-200 text-green-700 text-xs font-button font-medium px-2.5 py-1 rounded-md">
                      Save {formatPrice(strikeThroughPrice - activePrice)}
                    </span>
                  )}
                </div>
              )}

              {trip.special_offer_date && (
                <p className="flex items-center justify-center gap-1 text-orange-600 text-xs font-medium mb-5">
                  <Clock size={13} className="shrink-0" />
                  {daysLeft <= 1
                    ? 'Offer ends today — grab it before it\'s gone!'
                    : <>Ends {formatDate(trip.special_offer_end_date || trip.special_offer_date, { day: 'numeric', month: 'short', year: 'numeric' })} — {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</>}
                </p>
              )}

              <button
                type="button"
                onClick={handleView}
                className="group/btn w-full inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark shadow-warm hover:shadow-warm-lg border-2 border-primary rounded-md px-6 py-3 text-sm sm:text-base font-button font-semibold transition-colors min-h-[48px]"
              >
                View This Offer
                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 text-dark-muted text-xs hover:text-dark transition-colors"
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
