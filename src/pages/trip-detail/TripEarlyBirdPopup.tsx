import { useEffect, useState } from 'react';
import EarlyBirdSeatsPrompt, { getEarlyBirdSeatsOffer } from '../../components/ui/EarlyBirdSeatsPrompt';
import type { UpcomingTrip } from '../../types/types-index';

// Same beat as the special-offer popup — long enough that it doesn't fight
// with the first paint of the trip page.
const REVEAL_DELAY_MS = 1800;

interface TripEarlyBirdPopupProps {
  trip: UpcomingTrip;
  /** Seats still open to the public; a sold-out trip never pitches. */
  remaining: number;
  /** False in the admin preview, and while the booking form is already open. */
  enabled: boolean;
  /** Opens the booking modal on this page. */
  onBook: () => void;
}

/**
 * Heads-up banner shown on the trip details page for trips with a seat-limited
 * early bird ("first N travellers to pay"). It appears once, a moment after
 * the page opens — never from clicking a button, so the Pack Your Bags / Book
 * buttons open the booking form directly. Dismissing it only closes it for
 * this trip during this visit; "Grab my early-bird seat" opens the booking form.
 */
export default function TripEarlyBirdPopup({ trip, remaining, enabled, onBook }: TripEarlyBirdPopupProps) {
  const [popupTripId, setPopupTripId] = useState(trip.id);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset when the visitor lands on a different trip (the page doesn't
  // remount on a slug change alone). Adjusted during render, keyed on id.
  if (trip.id !== popupTripId) {
    setPopupTripId(trip.id);
    setDelayElapsed(false);
    setDismissed(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => setDelayElapsed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [popupTripId]);

  const offer = getEarlyBirdSeatsOffer(trip);
  const visible = !!offer && remaining > 0 && enabled && delayElapsed && !dismissed;

  return (
    <EarlyBirdSeatsPrompt
      isOpen={visible}
      offer={offer}
      tripTitle={trip.title}
      advanceAmount={trip.advance_amount}
      onContinue={() => { setDismissed(true); onBook(); }}
      onClose={() => setDismissed(true)}
    />
  );
}
