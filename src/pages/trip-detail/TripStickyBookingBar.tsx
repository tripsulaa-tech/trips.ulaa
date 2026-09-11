import Button from '../../components/ui/Button';
import type { UpcomingTrip, ButtonLabelsConfig } from '../../types/types-index';
import { formatDate, formatPrice, specialOfferDaysLeft } from '../../utils/utils-index';
import { Clock, Sparkle, Gift } from '@phosphor-icons/react';

interface TripStickyBookingBarProps {
  trip: UpcomingTrip;
  buttonLabels: ButtonLabelsConfig;
  activePrice: number | null | undefined;
  strikeThroughPrice: number | null | undefined;
  isEarlyBird: boolean;
  isSpecialOffer: boolean;
  isFull: boolean;
  isAlmostFull: boolean;
  remaining: number;
  onBook: () => void;
}

export default function TripStickyBookingBar({
  trip,
  buttonLabels,
  activePrice,
  strikeThroughPrice,
  isEarlyBird,
  isSpecialOffer,
  isFull,
  isAlmostFull,
  remaining,
  onBook,
}: TripStickyBookingBarProps) {
  // Save = strikeThroughPrice - activePrice (marketing "was ₹X" price vs
  // what they pay). PLUS OFFER = trip.price - activePrice (actual regular
  // price vs what they pay) — same formula and gating as TripCard/
  // SpecialOfferPopupCard: only shown for a live, non-hidden special
  // offer, and only when it says something the green badge doesn't.
  const showSpecialOfferPromo = isSpecialOffer && !trip.hide_special_offer_promo;
  const saveAmount = strikeThroughPrice != null && activePrice != null
    ? strikeThroughPrice - activePrice
    : null;
  const plusOfferAmount = trip.price != null && activePrice != null
    ? trip.price - activePrice
    : null;
  const showPlusOffer = showSpecialOfferPromo && plusOfferAmount != null && plusOfferAmount > 0 && plusOfferAmount !== saveAmount;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-background-warm shadow-warm-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* Left: price + meta */}
        <div className="min-w-0 flex-1">
          {activePrice != null ? (
            trip.advance_amount != null ? (
              <>
                {/* Row 1: advance amount is now the hero figure */}
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-lg font-bold text-primary shrink-0">{formatPrice(trip.advance_amount)}</span>
                  <span className="text-dark-muted text-2xs shrink-0">to reserve</span>
                </div>

                {/* Row 2: total price + strike-through, its own line so it
                    never competes for space with the badges below. */}
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  {strikeThroughPrice != null && (
                    <span className="text-dark-muted line-through text-2xs shrink-0">{formatPrice(strikeThroughPrice)}</span>
                  )}
                  <span className="text-dark text-2xs font-semibold shrink-0">{formatPrice(activePrice)} total</span>
                </div>

                {/* Row 3: Save + PLUS OFFER, grouped together on their own
                    line rather than left to wrap wherever they happen to
                    run out of room — keeps the two badges aligned as a
                    pair instead of splitting across separate lines. */}
                {(saveAmount != null || showPlusOffer) && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {saveAmount != null && (
                      <span className="bg-green-50 border border-green-200 text-green-700 text-2xs font-button font-medium px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        Save {formatPrice(saveAmount)}
                      </span>
                    )}
                    {showPlusOffer && (
                      <span className="inline-flex items-center gap-1 bg-pink-50 border border-pink-200 text-pink-600 text-2xs font-button font-bold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        <Gift size={10} weight="fill" className="shrink-0" />
                        PLUS {formatPrice(plusOfferAmount as number)} OFFER
                      </span>
                    )}
                  </div>
                )}

                {/* Row 4: Special Offer / Early Bird + Ends date, its own
                    line for the same reason — a predictable line break
                    instead of an unpredictable wrap point. */}
                {isSpecialOffer ? (
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="offer-badge-gradient-shift inline-flex items-center gap-1 text-white text-2xs font-button font-bold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      <Sparkle size={9} weight="fill" />
                      {trip.special_offer_name || 'Special Offer'}
                    </span>
                    {trip.special_offer_date && (
                      <span className="flex items-center gap-0.5 text-orange-600 text-2xs font-medium shrink-0 whitespace-nowrap">
                        <Clock size={9} className="shrink-0" />
                        Ends {formatDate(trip.special_offer_end_date || trip.special_offer_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                ) : isEarlyBird && (
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="bg-secondary text-dark text-2xs font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      Early Bird
                    </span>
                    {trip.early_bird_deadline && (
                      <span className="flex items-center gap-0.5 text-orange-600 text-2xs font-medium shrink-0 whitespace-nowrap">
                        <Clock size={9} className="shrink-0" />
                        Ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* No advance_amount configured for this trip. Price on its
                    own line, badges grouped on the next — same
                    predictable-row approach as the advance_amount branch
                    above, instead of one big auto-wrapping row. */}
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-display text-base font-bold text-dark shrink-0">{formatPrice(activePrice)}</span>
                  {strikeThroughPrice != null && (
                    <span className="text-dark-muted line-through text-xs shrink-0">{formatPrice(strikeThroughPrice)}</span>
                  )}
                </div>
                {(saveAmount != null || showPlusOffer) && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {saveAmount != null && (
                      <span className="bg-green-50 border border-green-200 text-green-700 text-2xs font-button font-medium px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        Save {formatPrice(saveAmount)}
                      </span>
                    )}
                    {showPlusOffer && (
                      <span className="inline-flex items-center gap-1 bg-pink-50 border border-pink-200 text-pink-600 text-2xs font-button font-bold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        <Gift size={10} weight="fill" className="shrink-0" />
                        PLUS {formatPrice(plusOfferAmount as number)} OFFER
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {isSpecialOffer ? (
                    <>
                      <span className="offer-badge-gradient-shift inline-flex items-center gap-1 text-white text-2xs font-button font-bold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        <Sparkle size={10} weight="fill" />
                        {trip.special_offer_name || 'Special Offer'}
                      </span>
                      {trip.special_offer_date && (
                        <span className="flex items-center gap-0.5 text-orange-600 text-2xs font-medium shrink-0 whitespace-nowrap">
                          <Clock size={10} className="shrink-0" />
                          {specialOfferDaysLeft(trip.special_offer_date, trip.special_offer_end_date) <= 1
                            ? 'Offer ends today'
                            : `Offer ends ${formatDate(trip.special_offer_end_date || trip.special_offer_date, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {isEarlyBird && (
                        <span className="bg-secondary text-dark text-2xs font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                          Early Bird
                        </span>
                      )}
                      {isEarlyBird && trip.early_bird_deadline && (
                        <span className="flex items-center gap-0.5 text-orange-600 text-2xs font-medium shrink-0 whitespace-nowrap">
                          <Clock size={10} className="shrink-0" />
                          Offer ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </>
            )
          ) : (
            <span className="text-sm text-dark-muted">Enquire for pricing</span>
          )}
        </div>

        {/* Right: CTA with seats-left inside */}
        <Button
          variant="primary"
          size="sm"
          onClick={onBook}
          className="!rounded-lg !px-4 !py-2 shrink-0 flex flex-col items-center !gap-0 leading-tight"
        >
          <span className="text-sm font-bold whitespace-nowrap">
            {isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta}
          </span>
          {isAlmostFull && (
            <span className="text-2xs font-normal text-white/85 mt-0.5">
              Only {remaining} left!
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
