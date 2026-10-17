import { withBasicPricing } from '../../utils/tripOptions';
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

// Give visitors time to see the hero. A dismissal lasts for this tab's
// session, including navigation back to Home and page reloads.
const REVEAL_DELAY_MS = 8000;
const DISMISSED_KEY = 'ulaa:home-offer-dismissed:v1';
let dismissedInMemory = false;

function wasDismissed() {
  try {
    return dismissedInMemory || sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return dismissedInMemory;
  }
}

export default function SpecialOfferPopup() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('[data-home-hero]');
    if (!hero) return;
    // Let visitors finish exploring the landscape before an offer appears.
    const observer = new IntersectionObserver(([entry]) => {
      setPastHero(entry.boundingClientRect.bottom <= 80);
    }, { rootMargin: '-80px 0px 0px 0px' });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  // Derived, not stored: reveals the instant both the fetch and the minimum
  // delay have settled (whichever finishes last), with no extra render lag
  // from bouncing the result through its own effect + state.
  const visible = !!trip && dataReady && delayElapsed && pastHero && !dismissed;

  // Fetch and the reveal delay run side by side, not one after the other —
  // see the REVEAL_DELAY_MS comment above.
  useEffect(() => {
    if (dismissed) return;
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
          // Admin's "hide special-offer promo" quick action opts a trip out
          // of this popup entirely, even while its special_offer_price/date
          // is still live — see add_trip_hide_special_offer_promo.sql.
          if (t.hide_special_offer_promo) return false;
          // Priced as the Basic (first) package when the trip has packages.
          const pt = withBasicPricing(t);
          const { isSpecialOffer } = getActivePrice(
            pt.price, pt.early_bird_price, pt.early_bird_deadline,
            pt.special_offer_price, pt.special_offer_date, pt.special_offer_end_date
          );
          if (!isSpecialOffer) return false;
          const remaining = publicSeatsLeft(t.total_seats, t.seats_booked, t.waitlist_reserved || 0);
          return remaining > 0;
        });

        if (featured) setTrip(withBasicPricing(featured));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDataReady(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dismissed]);

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
    dismissedInMemory = true;
    try { sessionStorage.setItem(DISMISSED_KEY, '1'); } catch { /* Storage may be disabled. */ }
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
