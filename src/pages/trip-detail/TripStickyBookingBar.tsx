import Button from '../../components/ui/Button';
import type { UpcomingTrip, ButtonLabelsConfig } from '../../types/types-index';
import { formatDate, formatPrice } from '../../utils/utils-index';
import { Clock } from '@phosphor-icons/react';

interface TripStickyBookingBarProps {
  trip: UpcomingTrip;
  buttonLabels: ButtonLabelsConfig;
  activePrice: number | null | undefined;
  strikeThroughPrice: number | null | undefined;
  isEarlyBird: boolean;
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
  isFull,
  isAlmostFull,
  remaining,
  onBook,
}: TripStickyBookingBarProps) {
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
                  <span className="text-dark-muted text-[11px] shrink-0">to reserve</span>
                </div>

                {/* Row 2: total price + strike-through + Save, now secondary */}
                <div className="flex items-center gap-1.5 mt-0.5 overflow-x-auto no-scrollbar">
                  {strikeThroughPrice != null && (
                    <span className="text-dark-muted line-through text-[10px] shrink-0">{formatPrice(strikeThroughPrice)}</span>
                  )}
                  <span className="text-dark text-[10px] font-semibold shrink-0">{formatPrice(activePrice)} total</span>
                  {strikeThroughPrice != null && (
                    <span className="bg-green-50 border border-green-200 text-green-700 text-[9px] font-button font-medium px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      Save {formatPrice(strikeThroughPrice - activePrice)}
                    </span>
                  )}
                </div>

                {/* Row 3: Early Bird + Ends date, kept but compact */}
                {isEarlyBird && (
                  <div className="flex items-center gap-1.5 mt-0.5 overflow-x-auto no-scrollbar">
                    <span className="bg-secondary text-white text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      Early Bird
                    </span>
                    {trip.early_bird_deadline && (
                      <span className="flex items-center gap-0.5 text-orange-600 text-[9px] font-medium shrink-0 whitespace-nowrap">
                        <Clock size={9} className="shrink-0" />
                        Ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* No advance_amount configured for this trip: unchanged original layout */}
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-base font-bold text-dark shrink-0">{formatPrice(activePrice)}</span>
                  {strikeThroughPrice != null && (
                    <>
                      <span className="text-dark-muted line-through text-xs shrink-0">{formatPrice(strikeThroughPrice)}</span>
                      <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-button font-medium px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        Save {formatPrice(strikeThroughPrice - activePrice)}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 overflow-x-auto no-scrollbar">
                  {isEarlyBird && (
                    <span className="bg-secondary text-white text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      Early Bird
                    </span>
                  )}
                  {isEarlyBird && trip.early_bird_deadline && (
                    <span className="flex items-center gap-0.5 text-orange-600 text-[10px] font-medium shrink-0 whitespace-nowrap">
                      <Clock size={10} className="shrink-0" />
                      Offer ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
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
            <span className="text-[9px] font-normal text-white/85 mt-0.5">
              Only {remaining} left!
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
