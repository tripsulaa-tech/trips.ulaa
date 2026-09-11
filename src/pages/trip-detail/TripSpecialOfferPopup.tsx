import { useEffect, useState } from 'react';
import { specialOfferDaysLeft } from '../../utils/utils-index';
import type { UpcomingTrip } from '../../types/types-index';
import SpecialOfferPopupCard from '../../sections/home/SpecialOfferPopupCard';

// Same beat as the homepage popup (see SpecialOfferPopup.tsx) — long enough
// that it doesn't fight with the very first paint of the trip page, short
// enough that almost nobody has scrolled past the hero before it appears.
// Nothing to race here (the trip is already loaded by the time this
// component is even rendered — see the `!trip` guard in TripDetailPage), so
// this is just a flat delay rather than a parallel fetch+timer.
const REVEAL_DELAY_MS = 1800;

interface TripSpecialOfferPopupProps {
  trip: UpcomingTrip;
  isSpecialOffer: boolean;
  activePrice: number | null | undefined;
  strikeThroughPrice: number | null | undefined;
  isAlmostFull: boolean;
  remaining: number;
  /** Opens the booking modal already on this page — never navigates. */
  onBook: () => void;
}

/**
 * The same special-offer popup shown on the homepage, but for a visitor who
 * has landed directly on a trip's own detail page (e.g. via a shared link)
 * rather than browsing from "/". Since they're already looking at the trip
 * the offer is for, the CTA jumps straight to booking instead of
 * re-navigating to the page they're already on.
 *
 * Dismissing it (X, "Maybe later", or the backdrop) only closes it for this
 * trip during this visit — the reveal/dismissal state resets if the
 * visitor navigates to a *different* trip's detail page, since TripDetailPage
 * doesn't remount on a slug change alone.
 */
export default function TripSpecialOfferPopup({
  trip,
  isSpecialOffer,
  activePrice,
  strikeThroughPrice,
  isAlmostFull,
  remaining,
  onBook,
}: TripSpecialOfferPopupProps) {
  const [popupTripId, setPopupTripId] = useState(trip.id);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset the reveal/dismissal state when the visitor lands on a different
  // trip's detail page — TripDetailPage doesn't remount on a slug change
  // alone. Adjusted during render (React's recommended way to reset state
  // in response to a prop change) rather than in an effect, and keyed on
  // id rather than slug so a slug edit on the same trip doesn't spuriously
  // re-trigger the popup for someone already on the page.
  if (trip.id !== popupTripId) {
    setPopupTripId(trip.id);
    setDelayElapsed(false);
    setDismissed(false);
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setDelayElapsed(true);
    }, REVEAL_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [popupTripId]);

  // Mirrors the homepage popup's rules: only for a genuinely live offer on
  // a trip that isn't already sold out.
  const visible = isSpecialOffer && remaining > 0 && delayElapsed && !dismissed;

  const daysLeft = trip.special_offer_date
    ? specialOfferDaysLeft(trip.special_offer_date, trip.special_offer_end_date)
    : 0;

  const dismiss = () => {
    setDismissed(true);
  };

  const handleBook = () => {
    dismiss();
    onBook();
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
      ctaLabel="Book This Offer"
      onCtaClick={handleBook}
      onDismiss={dismiss}
    />
  );
}
