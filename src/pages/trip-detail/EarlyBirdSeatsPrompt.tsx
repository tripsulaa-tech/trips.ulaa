import { Fire } from '@phosphor-icons/react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { getActivePrice, formatPrice } from '../../utils/utils-index';
import { withBasicPricing } from '../../utils/tripOptions';
import type { UpcomingTrip } from '../../types/types-index';

export interface EarlyBirdSeatsOffer {
  /** Seat limit the admin set (e.g. 5 or 10) — "first N travellers". */
  totalSeats: number;
  /** Early-bird seats still free right now. */
  seatsLeft: number;
  /** Early-bird price per person (Basic package when the trip has packages). */
  price: number;
  /** Regular price it replaces, when known and higher. */
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
    regularPrice: t.price != null && t.price > activePrice ? t.price : null,
  };
}

interface EarlyBirdSeatsPromptProps {
  isOpen: boolean;
  offer: EarlyBirdSeatsOffer | null;
  advanceAmount?: number | null;
  /** Visitor accepted the heads-up — carry on to the booking form. */
  onContinue: () => void;
  /** X / backdrop / Escape — closes the banner without opening the form. */
  onClose: () => void;
}

/** Small heads-up shown when someone clicks Book on a trip whose early-bird
 *  price is limited to the first N paid travellers. */
export default function EarlyBirdSeatsPrompt({ isOpen, offer, advanceAmount, onContinue, onClose }: EarlyBirdSeatsPromptProps) {
  if (!offer) return null;
  const { totalSeats, seatsLeft, price, regularPrice } = offer;
  const advanceText = advanceAmount && advanceAmount > 0 ? `your ${formatPrice(advanceAmount)} advance` : 'your advance';
  const seatWord = seatsLeft === 1 ? 'seat' : 'seats';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="p-6 text-center">
        <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Fire size={26} weight="fill" />
        </div>
        <h3 className="font-display text-xl font-bold text-dark">Early bird — first {totalSeats} travellers</h3>
        <p className="mt-2 text-sm text-dark-muted leading-relaxed">
          Only the first {totalSeats} travellers to pay get the early-bird price.{' '}
          <strong className="text-dark">{seatsLeft} {seatWord} left.</strong>
        </p>
        <p className="mt-3 font-display text-2xl font-bold text-primary">
          {formatPrice(price)}
          {regularPrice != null && (
            <span className="ml-2 text-sm font-normal text-dark-muted line-through">{formatPrice(regularPrice)}</span>
          )}
        </p>
        <p className="mt-2 text-xs text-dark-muted leading-snug">
          Pay {advanceText} to lock in your seat — first come, first served.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button fullWidth onClick={onContinue}>Continue to Book</Button>
          <Button fullWidth variant="ghost" onClick={onClose}>Maybe later</Button>
        </div>
      </div>
    </Modal>
  );
}
