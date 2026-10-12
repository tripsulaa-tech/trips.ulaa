import { getActivePrice, getStrikeThroughPrice } from '../../utils/utils-index';
import { withBasicPricing } from '../../utils/tripOptions';
import type { UpcomingTrip } from '../../types/types-index';

export interface EarlyBirdSeatsOffer {
  /** Seat limit the admin set (e.g. 5 or 10) — "first N travellers". */
  totalSeats: number;
  /** Early-bird seats still free right now. */
  seatsLeft: number;
  /** Early-bird price per person (Basic package when the trip has packages). */
  price: number;
  /** Crossed-out "was" price: the trip's own strike-through price if the admin
   *  set one, otherwise the regular price. Same rule as the trip card. */
  regularPrice: number | null;
}

/**
 * Generic for any trip: returns the offer only while a SEAT-LIMITED early bird
 * (early_bird_seats + early_bird_price, set by the admin) still has free seats
 * and isn't overridden by a live special offer. Deadline-based early birds and
 * trips with no early bird return null, so no banner is ever shown for them.
 */
export function getEarlyBirdSeatsOffer(trip: UpcomingTrip | null | undefined): EarlyBirdSeatsOffer | null {
  if (!trip || !trip.early_bird_seats) return null;
  const t = withBasicPricing(trip);
  const { activePrice, isEarlyBird, earlyBirdSeatsLeft } = getActivePrice(
    t.price, t.early_bird_price, t.early_bird_deadline,
    t.special_offer_price, t.special_offer_date, t.special_offer_end_date,
    t.early_bird_seats, t.early_bird_seats_taken
  );
  if (!isEarlyBird || earlyBirdSeatsLeft == null || earlyBirdSeatsLeft <= 0 || activePrice == null) return null;
  return {
    totalSeats: t.early_bird_seats as number,
    seatsLeft: earlyBirdSeatsLeft,
    price: activePrice,
    regularPrice: getStrikeThroughPrice(activePrice, t.price, true, trip.strike_through_price, false) ?? null,
  };
}
