import { cleanTripOptions } from '../../utils/tripOptions';
import type { TripOptionsConfig, TripPricingSnapshot } from '../../types/types-index';

// Draft shape + converters for TripPricingEditor (Pricing & Availability of a
// finished trip, edited from the Trip Finance tab).

type Num = number | '';

export interface PricingDraft {
  total_seats: Num;
  seats_booked: Num;
  price: Num;
  early_bird_price: Num;
  early_bird_deadline: string;
  strike_through_price: Num;
  advance_amount: Num;
  special_offer_name: string;
  special_offer_price: Num;
  special_offer_date: string;
  special_offer_end_date: string;
  trip_options: TripOptionsConfig;
}

const numOrBlank = (n?: number | null): Num => (n == null ? '' : n);
const numOrNull = (n: Num): number | null => (n === '' ? null : n);
export const parseNum = (v: string): Num => (v === '' ? '' : +v);

export function pricingDraftFrom(
  pricing: TripPricingSnapshot | null,
  totalSeats: number | null,
  seatsBooked: number | null,
): PricingDraft {
  return {
    total_seats: numOrBlank(totalSeats),
    seats_booked: numOrBlank(seatsBooked),
    price: numOrBlank(pricing?.price),
    early_bird_price: numOrBlank(pricing?.early_bird_price),
    early_bird_deadline: pricing?.early_bird_deadline ?? '',
    strike_through_price: numOrBlank(pricing?.strike_through_price),
    advance_amount: numOrBlank(pricing?.advance_amount),
    special_offer_name: pricing?.special_offer_name ?? '',
    special_offer_price: numOrBlank(pricing?.special_offer_price),
    special_offer_date: pricing?.special_offer_date ?? '',
    special_offer_end_date: pricing?.special_offer_end_date ?? '',
    trip_options: pricing?.trip_options ?? { options: [], packages: [] },
  };
}

export function pricingFromDraft(d: PricingDraft): {
  total_seats: number | null;
  seats_booked: number | null;
  trip_pricing: TripPricingSnapshot;
} {
  return {
    total_seats: numOrNull(d.total_seats),
    seats_booked: numOrNull(d.seats_booked),
    trip_pricing: {
      price: numOrNull(d.price),
      early_bird_price: numOrNull(d.early_bird_price),
      early_bird_deadline: d.early_bird_deadline || null,
      strike_through_price: numOrNull(d.strike_through_price),
      advance_amount: numOrNull(d.advance_amount),
      special_offer_name: d.special_offer_name.trim() || null,
      special_offer_price: numOrNull(d.special_offer_price),
      special_offer_date: d.special_offer_date || null,
      special_offer_end_date: d.special_offer_end_date || null,
      trip_options: cleanTripOptions(d.trip_options),
    },
  };
}
