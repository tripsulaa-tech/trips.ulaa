import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUpcomingTrips } from '../../services/api';
import {
  getActivePrice,
  getStrikeThroughPrice,
  specialOfferDaysLeft,
  publicSeatsLeft,
} from '../../utils/utils-index';
import type { UpcomingTrip } from '../../types/types-index';
import SpecialOfferPopupCard from './SpecialOfferPopupCard';

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
    <SpecialOfferPopupCard
      visible={visible}
      trip={trip}
      activePrice={activePrice}
      strikeThroughPrice={strikeThroughPrice}
      daysLeft={daysLeft}
      isAlmostFull={isAlmostFull}
      remaining={remaining}
      ctaLabel="View This Offer"
      onCtaClick={handleView}
      onDismiss={dismiss}
    />
  );
}
