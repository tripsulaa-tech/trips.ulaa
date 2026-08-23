import type { RefObject } from 'react';
import TripHighlightIconDisplay from '../../components/ui/TripHighlightIconDisplay';
import Button from '../../components/ui/Button';
import PdfDownloadMenu from '../../components/ui/PdfDownloadMenu';
import type { UpcomingTrip, TripConfidenceItem, ButtonLabelsConfig } from '../../types/types-index';
import { formatDateRange, formatDate, formatPrice, formatAgeRange } from '../../utils/utils-index';
import { getGoogleCalendarUrl, downloadTripIcs } from '../../utils/calendar';
import {
  Calendar,
  Clock,
  Users,
  UserCheck,
  ArrowRight,
  CalendarPlus,
  Download,
  ShareNetwork as Share2,
  SealCheck as BadgeCheck,
  ShieldCheck,
} from '@phosphor-icons/react';

interface TripConfidenceBookingSectionProps {
  trip: UpcomingTrip;
  buttonLabels: ButtonLabelsConfig;
  confidenceItems?: TripConfidenceItem[] | null;
  activeConfidenceItems: Set<number>;
  setActiveConfidenceItems: React.Dispatch<React.SetStateAction<Set<number>>>;
  toggleInSet: (setter: React.Dispatch<React.SetStateAction<Set<number>>>, i: number) => void;
  activePrice: number | null | undefined;
  strikeThroughPrice: number | null | undefined;
  isEarlyBird: boolean;
  deadlinePassed: boolean;
  remainingAfterAdvance: number | null;
  isFull: boolean;
  isAlmostFull: boolean;
  remaining: number;
  calendarMenuOpen: boolean;
  setCalendarMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  calendarMenuRef: RefObject<HTMLDivElement | null>;
  onBook: () => void;
}

export default function TripConfidenceBookingSection({
  trip,
  buttonLabels,
  confidenceItems,
  activeConfidenceItems,
  setActiveConfidenceItems,
  toggleInSet,
  activePrice,
  strikeThroughPrice,
  isEarlyBird,
  deadlinePassed,
  remainingAfterAdvance,
  isFull,
  isAlmostFull,
  remaining,
  calendarMenuOpen,
  setCalendarMenuOpen,
  calendarMenuRef,
  onBook,
}: TripConfidenceBookingSectionProps) {
  const hasConfidenceItems = (confidenceItems?.length ?? 0) > 0;

  return (
    /* Pack Your Bags — sits directly below Fashion Aesthetics / Gallery, matching the quick-jump nav order.
        Travel with Confidence sits to its left as its own separate card. */
    <div className={`grid grid-cols-1 gap-5 sm:gap-6 ${hasConfidenceItems ? 'lg:grid-cols-[1fr_640px] lg:divide-x lg:divide-background-warm' : ''}`}>
      {hasConfidenceItems && (
        <section id="confidence" className="scroll-mt-44 flex flex-col justify-center lg:pr-10">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-3">Travel with Confidence</h2>
          {trip.confidence_description && (
            <p className="text-dark-muted text-base leading-relaxed mb-4 sm:mb-6">{trip.confidence_description}</p>
          )}
          <div className="grid grid-cols-1 gap-0.5 w-fit">
            {confidenceItems!.map((item, i) => (
              <div key={i} className="group relative flex items-center justify-start gap-3 p-1">
                <button
                  type="button"
                  onClick={() => toggleInSet(setActiveConfidenceItems, i)}
                  aria-expanded={activeConfidenceItems.has(i)}
                  aria-label={`${item.description} — tap for details`}
                  className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
                />
                {item.icon && (
                  <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" filled={activeConfidenceItems.has(i)} hoverFill />
                )}
                <p className="text-dark text-base leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`bg-white rounded-lg shadow-warm-lg border border-background-warm p-5 py-6 sm:p-8 sm:py-10 sm:pl-10 sm:pr-14 ${hasConfidenceItems ? 'lg:ml-10' : 'max-w-2xl mx-auto w-full'}`}>
        <div className="max-w-xl mx-auto text-center">
          {activePrice != null && (
            <div className="mb-5 pb-5 border-b border-background-warm">
              {strikeThroughPrice != null ? (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-display text-3xl font-bold text-primary">{formatPrice(activePrice)}</span>
                    <span className="text-dark-muted line-through text-lg">{formatPrice(strikeThroughPrice)}</span>
                  </div>
                  <p className="text-dark-muted text-xs mt-1">per person</p>

                  <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                    <span className="bg-green-50 border border-green-200 text-green-700 text-xs font-button font-medium px-2.5 py-1 rounded-md">
                      Save {formatPrice(strikeThroughPrice - activePrice)}
                    </span>
                    {isEarlyBird && (
                      <span className="bg-secondary text-white text-xs font-button font-semibold px-2.5 py-1 rounded-md">
                        Early Bird
                      </span>
                    )}
                  </div>

                  {isEarlyBird && trip.early_bird_deadline && (
                    <p className="flex items-center justify-center gap-1 text-orange-600 text-xs font-medium mt-2">
                      <Clock size={12} className="shrink-0" />
                      Offer ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <span className="font-display text-3xl font-bold text-dark">{formatPrice(activePrice)}</span>
                  <p className="text-dark-muted text-xs mt-1">per person</p>
                  {deadlinePassed && (
                    <p className="text-dark-muted text-xs mt-1">Early-bird offer has ended</p>
                  )}
                </>
              )}
            </div>
          )}
          <div className="mb-6">
            {isFull ? (
              <span className="inline-block bg-red-50 text-red-600 text-sm font-button font-semibold px-4 py-2 rounded-md">
                Sold Out
              </span>
            ) : isAlmostFull ? (
              <span className="inline-block bg-amber-50 text-amber-700 text-sm font-button font-semibold px-4 py-2 rounded-md">
                Only {remaining} seats left — almost full!
              </span>
            ) : trip.advance_amount != null ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 justify-center">
                <span className="shrink-0 w-9 h-9 rounded-full bg-green-600 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-white" strokeWidth={2.5} />
                </span>
                <div className="text-left">
                  <p className="text-dark font-semibold text-sm sm:text-base">
                    Reserve today with only <span className="text-green-600 font-bold">{formatPrice(trip.advance_amount)}</span>
                  </p>
                  {remainingAfterAdvance != null && (
                    <p className="text-dark-muted text-xs sm:text-sm mt-0.5">
                      Remaining <span className="font-bold">{formatPrice(remainingAfterAdvance)}</span> payable before the trip.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <span className="inline-block bg-green-50 text-green-700 text-sm font-button font-semibold px-4 py-2 rounded-md">
                Seats available
              </span>
            )}
          </div>

          <div className="space-y-3 mb-6 max-w-xs mx-auto">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2 text-dark-muted"><Calendar size={14} className="text-primary shrink-0" /> Dates</span>
              <span className="text-dark font-medium">{formatDateRange(trip.start_date, trip.end_date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2 text-dark-muted"><Clock size={14} className="text-primary shrink-0" /> Duration</span>
              <span className="text-dark font-medium">{trip.duration}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2 text-dark-muted"><Users size={14} className="text-primary shrink-0" /> Group Size</span>
              <span className="text-dark font-medium">Max {trip.total_seats}</span>
            </div>
            {(trip.min_age != null || trip.max_age != null) && (
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2 text-dark-muted"><UserCheck size={14} className="text-primary shrink-0" /> Age Range</span>
                <span className="text-dark font-medium">{formatAgeRange(trip.min_age, trip.max_age)}</span>
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onBook}
            className="group/btn"
          >
            {isFull ? (
              buttonLabels.waitlistCta
            ) : trip.advance_amount != null ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="flex items-center gap-1.5">
                  {buttonLabels.primaryCta}
                  <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                </span>
                <span className="text-xs font-medium opacity-90 mt-0.5">
                  At only {formatPrice(trip.advance_amount)} today
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {buttonLabels.primaryCta}
                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
              </span>
            )}
          </Button>

          <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-2 mt-3">
            <div ref={calendarMenuRef} className="relative">
              <button
                onClick={() => setCalendarMenuOpen(o => !o)}
                className="flex items-center gap-1.5 whitespace-nowrap text-sm text-dark-muted hover:text-primary transition-colors"
              >
                <CalendarPlus size={14} /> Add to calendar
              </button>

              {calendarMenuOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 w-56 rounded-lg border-2 border-background-warm bg-white shadow-warm-lg py-1 overflow-hidden">
                  <a
                    href={getGoogleCalendarUrl(trip)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setCalendarMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-dark text-left hover:bg-background-warm transition-colors"
                  >
                    <Calendar size={14} className="shrink-0" /> Google Calendar
                  </a>
                  <button
                    type="button"
                    onClick={() => { downloadTripIcs(trip); setCalendarMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark text-left hover:bg-background-warm transition-colors"
                  >
                    <Download size={14} className="shrink-0" /> Apple / Outlook (.ics)
                  </button>
                </div>
              )}
            </div>

            <span className="text-background-warm">|</span>

            <button
              onClick={() => navigator.share?.({ title: trip.title, url: window.location.href })}
              className="flex items-center gap-1.5 whitespace-nowrap text-sm text-dark-muted hover:text-primary transition-colors"
            >
              <Share2 size={14} /> Share this trip
            </button>

            {!trip.hide_pdf_download && (
              <>
                <span className="text-background-warm">|</span>

                <PdfDownloadMenu trip={trip} variant="text" />
              </>
            )}
          </div>

          <div className="flex items-start justify-center gap-1.5 text-xs text-dark-muted mt-4">
            <BadgeCheck size={14} className="text-green-600 shrink-0 mt-0.5" />
            <span className="text-left max-w-[15.5rem]">
              No payment required to enquire. We'll contact you within 24 hours.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
