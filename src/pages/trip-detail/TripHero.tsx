import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../../components/ui/Button';
import PdfDownloadMenu from '../../components/ui/PdfDownloadMenu';
import type { UpcomingTrip, ButtonLabelsConfig } from '../../types/types-index';
import { PLACEHOLDER_IMAGE, formatDateRange, formatAgeRange, getCoverImageStyle } from '../../utils/utils-index';
import { ArrowLeft, ArrowRight, MapPin, Calendar, Clock, Users, UserCheck } from '@phosphor-icons/react';

interface TripHeroProps {
  trip: UpcomingTrip;
  buttonLabels: ButtonLabelsConfig;
  isFull: boolean;
  isAlmostFull: boolean;
  isEarlyBird: boolean;
  descriptionExpanded: boolean;
  setDescriptionExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onBook: () => void;
}

export default function TripHero({
  trip,
  buttonLabels,
  isFull,
  isAlmostFull,
  isEarlyBird,
  descriptionExpanded,
  setDescriptionExpanded,
  onBook,
}: TripHeroProps) {
  return (
    /*
      Mobile (<sm) banner box stays a fixed aspect-[9/16] to match the
      Hero Banner Image (Mobile) upload's recommended 9:16 portrait shape
      (Admin → Add/Edit Trip → Media) — the image fills the box edge to
      edge via object-cover, same as the desktop hero does at sm+.

      When no hero_mobile_image is uploaded, the mobile element falls back
      to the landscape cover_image instead. Stretching a landscape photo
      across a tall 9:16 box with plain object-cover would over-crop it,
      so that fallback case keeps the old behaviour: sized to aspect-[9/8]
      (the ratio the Cover Image Editor's crop is actually framed at) and
      anchored to the top, with bg-dark filling the remainder below,
      blending into the existing gradient overlay.
    */
    <div className="relative mt-[81px] aspect-[9/16] sm:aspect-[21/9] overflow-hidden bg-dark">
      {/*
        Two <img> elements, one shown at a time via sm:hidden / hidden sm:block,
        rather than a single element swapping `src` — the mobile hero uses an
        optional, separately-uploaded hero_mobile_image (Admin → Add/Edit
        Trip → Media) with no crop applied, while the sm+ hero always uses
        cover_image with the saved cover_image_crop (position + zoom, set
        in the same place).
      */}
      <img
        src={trip.hero_mobile_image || trip.cover_image || PLACEHOLDER_IMAGE}
        alt={trip.title}
        className={
          trip.hero_mobile_image
            ? 'absolute inset-0 w-full h-full object-cover sm:hidden'
            : 'absolute inset-x-0 top-0 w-full aspect-[9/8] object-cover sm:hidden'
        }
        style={trip.hero_mobile_image ? undefined : getCoverImageStyle(trip.cover_image_crop)}
      />
      <img
        src={trip.cover_image || PLACEHOLDER_IMAGE}
        alt={trip.title}
        className="hidden sm:block absolute inset-0 w-full h-full object-cover"
        style={getCoverImageStyle(trip.cover_image_crop)}
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_55%,var(--color-dark)_78%)] sm:bg-[linear-gradient(to_right,var(--color-dark)_0%,var(--color-dark)_32%,transparent_55%)] sm:opacity-90" />
      <div className="relative sm:absolute sm:inset-0 w-full h-full">
        <div className="relative w-full h-full flex flex-col justify-end pl-4 sm:pl-6 lg:pl-8 pr-4 sm:pr-6 lg:pr-8 pt-32 sm:pt-28 pb-8 sm:pb-12 max-w-[1344px] mx-auto">
        <motion.div className="flex flex-col" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <Link
            to="/trips"
            onClick={() => sessionStorage.setItem('ulaa:restoreScroll:/trips', '1')}
            className="order-1 inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-3 sm:mb-4 transition-colors"
          >
            <ArrowLeft size={16} /> All Trips
          </Link>
          <h1 className="order-3 sm:order-2 font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-3 sm:mb-4 leading-tight">
            {(() => {
              const hyphenIdx = trip.title.indexOf('-');
              let firstLine: string;
              let secondLine: string;

              if (hyphenIdx !== -1) {
                // Existing convention: a "-" in the title marks where the
                // second line should start (e.g. "Sri Lanka - Island Escape").
                firstLine = trip.title.slice(0, hyphenIdx + 1);
                secondLine = trip.title.slice(hyphenIdx + 1).trim();
              } else {
                // No manual "-" in the title: automatically drop the last
                // word onto its own line so it doesn't get stranded at the
                // end of a wrapped line (e.g. "Manali Mountain Escape").
                const words = trip.title.trim().split(/\s+/);
                if (words.length > 1) {
                  secondLine = words[words.length - 1];
                  firstLine = words.slice(0, -1).join(' ');
                } else {
                  firstLine = trip.title;
                  secondLine = '';
                }
              }

              if (!secondLine) return firstLine;

              return (
                <>
                  {firstLine}
                  <br />
                  {secondLine}
                </>
              );
            })()}
          </h1>
          <div className="order-4 sm:order-3 flex w-fit items-center gap-2 text-secondary text-sm font-button font-semibold mb-3">
            <MapPin size={14} /> {trip.destination}
          </div>
          {trip.description && (
            <div className="hidden sm:block order-5 sm:order-4 max-w-xl mb-4 sm:mb-6">
              <p className={`text-white/80 text-sm sm:text-base md:text-lg leading-relaxed ${descriptionExpanded ? '' : 'line-clamp-2 sm:line-clamp-4'}`}>
                {trip.description}
              </p>
              {trip.description.length > 100 && (
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded(v => !v)}
                  className="mt-1 text-primary text-sm font-button font-semibold underline underline-offset-2 hover:text-primary-dark transition-colors"
                >
                  {descriptionExpanded ? 'Read less' : 'Read more'}
                </button>
              )}
            </div>
          )}
          <div className="order-6 sm:order-5 relative flex flex-row flex-wrap items-center gap-2.5 sm:gap-3 mb-5">
            <Button
              variant="primary"
              size="sm"
              onClick={onBook}
              className="group/btn flex-1 sm:flex-none whitespace-nowrap sm:w-auto !px-3 !py-2 !text-sm !min-h-[44px] sm:!px-8 sm:!py-4 sm:!text-lg sm:!min-h-[56px] sm:rounded-lg"
            >
              {isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta}
              {!isFull && <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1 sm:w-[18px] sm:h-[18px]" />}
            </Button>
            {!trip.hide_pdf_download && (
              <PdfDownloadMenu trip={trip} variant="hero" />
            )}
          </div>
          <div className="order-7 sm:order-6 mt-1 sm:mt-0 flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-4 text-white/70 text-xs sm:text-sm mb-4 sm:mb-0">
            <span className="flex items-center gap-2"><Calendar size={14} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
            <span className="flex items-center gap-2"><Clock size={14} /> {trip.duration}</span>
            <span className="flex items-center gap-2"><Users size={14} />
              {isFull ? 'Sold out' : isAlmostFull ? 'Almost full — hurry!' : `${trip.total_seats} Travellers`}
            </span>
            {(trip.min_age != null || trip.max_age != null) && (
              <span className="flex items-center gap-2"><UserCheck size={14} /> {formatAgeRange(trip.min_age, trip.max_age)}</span>
            )}
            {isEarlyBird && (
              <span className="hidden sm:flex items-center gap-1.5 bg-secondary text-white text-xs font-button font-semibold px-3 py-1.5 rounded-md">
                Early Bird
              </span>
            )}
          </div>
        </motion.div>
        </div>
      </div>
    </div>
  );
}
