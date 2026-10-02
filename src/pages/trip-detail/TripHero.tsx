import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../../components/ui/Button';
import PdfDownloadMenu from '../../components/ui/PdfDownloadMenu';
import type { UpcomingTrip, ButtonLabelsConfig } from '../../types/types-index';
import { PLACEHOLDER_IMAGE, formatDateRange, formatAgeRange, getCoverImageStyle } from '../../utils/utils-index';
import { ArrowLeft, ArrowRight, CaretDown, MapPin, Calendar, Clock, Users, UserCheck, Sparkle } from '@phosphor-icons/react';

interface TripHeroProps {
  trip: UpcomingTrip;
  buttonLabels: ButtonLabelsConfig;
  isFull: boolean;
  isAlmostFull: boolean;
  isEarlyBird: boolean;
  isSpecialOffer: boolean;
  // Seats still open — used for the "Only N seats left" badge.
  seatsLeft: number;
  descriptionExpanded: boolean;
  setDescriptionExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onBook: () => void;
}

// Keeps a hyphenated word like "Girls-Only" together instead of letting the
// title wrap in the middle of it.
function keepHyphenatedWordsTogether(text: string) {
  return text.split(' ').map((word, i, all) => (
    <span key={i}>
      {word.includes('-') ? <span className="whitespace-nowrap">{word}</span> : word}
      {i < all.length - 1 ? ' ' : ''}
    </span>
  ));
}

// The trip title split over two lines. A "-" only marks the line break when
// it stands apart from its words ("Sri Lanka - Island Escape"); a hyphen
// inside a word ("Girls-Only") is just part of that word. With no manual
// break, the last word drops onto its own line so it isn't stranded.
function TitleLines({ title }: { title: string }) {
  const hyphenIdx = title.search(/\s-|-\s/);
  const hyphenPos = hyphenIdx === -1 ? -1 : title.indexOf('-', hyphenIdx);
  let firstLine: string;
  let secondLine: string;

  if (hyphenPos !== -1) {
    firstLine = title.slice(0, hyphenPos + 1);
    secondLine = title.slice(hyphenPos + 1).trim();
  } else {
    const words = title.trim().split(/\s+/);
    if (words.length > 1) {
      secondLine = words[words.length - 1];
      firstLine = words.slice(0, -1).join(' ');
    } else {
      firstLine = title;
      secondLine = '';
    }
  }

  if (!secondLine) return <>{keepHyphenatedWordsTogether(firstLine)}</>;
  return (
    <>
      {keepHyphenatedWordsTogether(firstLine)}
      <br />
      {keepHyphenatedWordsTogether(secondLine)}
    </>
  );
}

/** Trip Detail hero.
 *
 *  Desktop/tablet (sm+): the banner is shown at full brightness — no side
 *  overlay — so artwork with text baked into it (titles, taglines) is never
 *  dimmed or covered; only its bottom edge fades into the panel below, as on
 *  mobile. All the trip's words sit under it on solid warm brown (the
 *  theme's dark colour), so they stay clearly readable whatever the photo
 *  looks like.
 *
 *  Mobile (<sm): keeps the tall 9:16 banner with the content over its
 *  bottom, as before.
 *
 *  When the banner artwork already contains the title (banner_has_text),
 *  the title isn't drawn again — it stays in the page as screen-reader/SEO
 *  text only. */
export default function TripHero({
  trip,
  buttonLabels,
  isFull,
  isAlmostFull,
  isEarlyBird,
  isSpecialOffer,
  seatsLeft,
  descriptionExpanded,
  setDescriptionExpanded,
  onBook,
}: TripHeroProps) {
  const backLink = (
    <Link
      to="/trips"
      onClick={() => sessionStorage.setItem('ulaa:restoreScroll:/trips', '1')}
      className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-3 sm:mb-4 transition-colors"
    >
      <ArrowLeft size={16} /> All Trips
    </Link>
  );

  const heading = (
    <h1 className={trip.banner_has_text ? 'sr-only' : 'font-display text-3xl sm:text-4xl lg:text-6xl font-bold text-white mb-3 sm:mb-4 leading-tight'}>
      <TitleLines title={trip.title} />
    </h1>
  );

  const destination = (
    <div className="flex w-fit items-center gap-2 text-secondary text-sm font-button font-semibold mb-3">
      <MapPin size={14} /> {trip.destination}
    </div>
  );

  const ctas = (
    <div className="flex flex-row flex-wrap items-center gap-2.5 sm:gap-3">
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
  );

  // Date · duration · seats · age (· offer badge on sm+).
  const facts = (desktop: boolean) => {
    const icon = desktop ? 'text-secondary' : '';
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6 text-white/90 text-xs sm:text-sm">
        <span className="flex items-center gap-2"><Calendar size={16} className={icon} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
        <span className="flex items-center gap-2"><Clock size={16} className={icon} /> {trip.duration}</span>
        {isAlmostFull && !isFull ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary text-dark font-button font-semibold text-xs px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-dark animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            {seatsLeft === 1 ? 'Only 1 seat left' : `Only ${seatsLeft} seats left`} — hurry!
          </span>
        ) : (
          <span className="flex items-center gap-2"><Users size={16} className={icon} />
            {isFull ? 'Sold out' : `${trip.total_seats} Travellers`}
          </span>
        )}
        {(trip.min_age != null || trip.max_age != null) && (
          <span className="flex items-center gap-2"><UserCheck size={16} className={icon} /> {formatAgeRange(trip.min_age, trip.max_age)}</span>
        )}
        {desktop && (isSpecialOffer && trip.special_offer_name ? (
          <span className="offer-badge-gradient-shift flex items-center gap-1.5 text-white text-xs font-button font-bold uppercase tracking-wide px-3 py-1.5 rounded-md shadow-warm">
            <Sparkle size={14} weight="fill" />
            {trip.special_offer_name}
          </span>
        ) : isEarlyBird && (
          <span className="flex items-center gap-1.5 bg-secondary text-dark text-xs font-button font-semibold px-3 py-1.5 rounded-md">
            Early Bird
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* ---------------- Mobile (<sm) ----------------
          Banner box stays a fixed aspect-[9/16] to match the Hero Banner
          Image (Mobile) upload's recommended portrait shape (Admin →
          Add/Edit Trip → Media). With no hero_mobile_image, the landscape
          cover_image is used instead, sized to aspect-[9/8] (the ratio the
          Cover Image Editor's crop is framed at) and anchored to the top,
          with bg-dark filling the rest. */}
      <div className="sm:hidden relative mt-[81px] aspect-[9/16] overflow-hidden bg-dark">
        <img
          src={trip.hero_mobile_image || trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.title}
          className={
            trip.hero_mobile_image
              ? 'absolute inset-0 w-full h-full object-cover'
              : 'absolute inset-x-0 top-0 w-full aspect-[9/8] object-cover'
          }
          style={trip.hero_mobile_image ? undefined : getCoverImageStyle(trip.cover_image_crop)}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_55%,var(--color-dark)_78%)]" />
        <div className="relative w-full h-full flex flex-col justify-end px-4 pt-32 pb-8">
          <motion.div className="flex flex-col" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            {backLink}
            {heading}
            {destination}
            <div className="mb-5">{ctas}</div>
            <div className="mb-4">{facts(false)}</div>
          </motion.div>
        </div>
      </div>

      {/* ---------------- Tablet / desktop (sm+) ---------------- */}
      <div className="hidden sm:block mt-[81px]">
        {/* The banner at full brightness; only its bottom edge melts into
            the brown panel below (same idea as the mobile hero's bottom
            fade), so there is no hard line. Shorter than before: capped at
            640px tall. The sm+ hero always uses cover_image with its saved
            crop (Admin → Edit Trip → Media moves what stays in frame). */}
        <div className="relative aspect-[21/8] max-h-[640px] overflow-hidden bg-dark">
          <img
            src={trip.cover_image || PLACEHOLDER_IMAGE}
            alt={trip.title}
            className="absolute inset-0 w-full h-full object-cover"
            style={getCoverImageStyle(trip.cover_image_crop)}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_68%,var(--color-dark)_100%)]" aria-hidden="true" />
        </div>

        {/* Everything readable lives here, on solid theme brown. */}
        <div className="bg-dark -mt-px">
          <motion.div
            className="max-w-[1344px] mx-auto px-6 lg:px-8 pt-7 pb-6 lg:pt-9"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-x-12 gap-y-6 lg:items-end">
              <div className="min-w-0">
                {backLink}
                {heading}
                {destination}
                {trip.description && (
                  <div className="max-w-2xl">
                    <p className={`text-white/85 text-base lg:text-lg leading-relaxed ${descriptionExpanded ? '' : 'line-clamp-3'}`}>
                      {trip.description}
                    </p>
                    {trip.description.length > 100 && (
                      <button
                        type="button"
                        onClick={() => setDescriptionExpanded(v => !v)}
                        aria-expanded={descriptionExpanded}
                        className="group/more mt-1.5 inline-flex items-center gap-1 text-secondary hover:text-white text-sm font-button font-semibold transition-colors"
                      >
                        {descriptionExpanded ? 'Read less' : 'Read more'}
                        <CaretDown size={14} weight="bold" aria-hidden="true" className={`transition-transform duration-200 ${descriptionExpanded ? 'rotate-180' : 'group-hover/more:translate-y-0.5'}`} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="lg:pb-1">{ctas}</div>
            </div>
            <div className="mt-6 pt-5 border-t border-white/10">{facts(true)}</div>
          </motion.div>
        </div>
      </div>
    </>
  );
}
