import { motion } from 'framer-motion';
import {
  MapPin,
  Calendar,
  Clock,
  ArrowRight,
  CalendarPlus,
  ShareNetwork as Share2,
  Timer,
  Bird,
  CaretRight,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { UpcomingTrip, TripCardFeatureTag } from '../../types/types-index';
import { formatDateRange, formatDate, formatPrice, getActivePrice, getStrikeThroughPrice, publicSeatsLeft, PLACEHOLDER_IMAGE, formatAgeRange, getCoverImageStyle, formatDestinationDotsCompact, daysUntil } from '../../utils/utils-index';
import { addToCalendar } from '../../utils/calendar';
import { getTripHighlightIcon, suggestTripHighlightIcons } from '../../constants/tripHighlightIcons';
import type { TripHighlightIconType } from '../../constants/tripHighlightIcons';
import Button from './Button';

interface TripCardProps {
  trip: UpcomingTrip;
  index?: number;
}

// Plump rounded shield with a solid white checkmark — matches the "Reserve
// your spot" badge reference design more closely than the angular Phosphor
// ShieldCheck glyph. The checkmark is a real white stroke (not a knockout),
// so it stays crisp regardless of the badge's background color.
function ReserveShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M11.484 2.17a.75.75 0 0 1 1.032 0 11.209 11.209 0 0 0 7.877 3.08.75.75 0 0 1 .722.515 12.74 12.74 0 0 1 .635 3.985c0 5.942-4.064 10.933-9.563 12.348a.749.749 0 0 1-.374 0C6.314 20.683 2.25 15.692 2.25 9.75c0-1.39.223-2.73.635-3.985a.75.75 0 0 1 .722-.516l.143.001c2.996 0 5.718-1.17 7.734-3.08Z"
        fill="currentColor"
      />
      <path
        d="M8.75 12.6l2.15 2.15 4.35-4.85"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Common trip-card tag labels (Travelers, Girls-Only, Luxury Stays, etc.)
// get a specific, correct icon here first — the generic keyword search in
// suggestTripHighlightIcons is tuned for free-text highlight-card headings
// and can pick a loosely-related icon (e.g. "heart" for "Girls-Only")
// instead of the more literal one (the venus/female symbol). Falls through
// to the generic suggestion, then to nothing, so a tag never renders a
// broken icon. Returns the "fill" weight (solid) plus a per-icon color —
// the venus symbol renders in rose/pink like the reference design, while
// everything else stays in the brand primary color.
function resolveFeatureTagIcon(label: string, iconKey: string): { Icon: TripHighlightIconType; colorClass: string; weight: 'fill' | 'regular' } | undefined {
  const stored = getTripHighlightIcon(iconKey);
  if (stored) {
    // The venus/female symbol always gets its rose outline treatment,
    // even when it comes from an admin-set icon key rather than the
    // label-based fallback below.
    if (stored.key === 'venus') return { Icon: stored.Icon, colorClass: 'text-rose-400', weight: 'regular' };
    return { Icon: stored.Icon, colorClass: 'text-primary', weight: 'fill' };
  }

  const l = label.toLowerCase();
  if (/girl|women|ladies|female/.test(l)) {
    const venus = getTripHighlightIcon('venus');
    // Kept as an outline (not "fill") — the venus glyph reads as a hollow
    // circle-and-cross in the reference design, not a solid disc.
    if (venus) return { Icon: venus.Icon, colorClass: 'text-rose-400', weight: 'regular' };
  }
  const explicitKey =
    /luxury|premium|5-star|five-star|deluxe/.test(l) ? 'crown' :
    /travel|traveler|traveller|people|group|squad|guest/.test(l) ? 'users' :
    /age/.test(l) ? 'user-check' :
    /duration|day|night/.test(l) ? 'clock' :
    /place|destination|stop/.test(l) ? 'map-pin' :
    null;
  const explicit = explicitKey ? getTripHighlightIcon(explicitKey) : undefined;
  if (explicit) return { Icon: explicit.Icon, colorClass: 'text-primary', weight: 'fill' };

  const suggestion = suggestTripHighlightIcons(label, 1)[0];
  return suggestion ? { Icon: suggestion.Icon, colorClass: 'text-primary', weight: 'fill' } : undefined;
}

export default function TripCard({ trip, index = 0 }: TripCardProps) {
  // Coming Soon trips (Admin → Upcoming Trips → Add/Edit Trip → Publish
  // tab) intentionally show only the cover image + title on the public
  // site — no price, dates, seats, or booking CTA — while the rest of the
  // trip's content is still being filled in. Renders as its own simple
  // teaser instead of reusing the full card below, since almost every
  // field that card shows (price, dates, seats, share/calendar actions)
  // doesn't apply yet.
  if (trip.status === 'coming_soon') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
        className="group bg-white rounded-2xl border border-background-warm shadow-warm hover:shadow-warm-lg transition-all duration-300 h-full flex flex-col overflow-hidden"
      >
        <Link to={`/trips/${trip.slug}`} className="relative h-56 md:h-64 overflow-hidden block">
          <div className="w-full h-full transition-transform duration-700 group-hover:scale-110">
            <img
              src={trip.cover_image || PLACEHOLDER_IMAGE}
              alt={trip.title}
              loading="lazy"
              className="w-full h-full object-cover"
              style={getCoverImageStyle(trip.cover_image_crop)}
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-dark/60 via-transparent to-transparent" />
          <div className="absolute top-4 left-4">
            <span className="bg-amber-500 text-white text-xs font-button font-semibold px-3 py-1 rounded-md">
              Coming Soon
            </span>
          </div>
        </Link>
        <div className="p-5 flex-1 flex flex-col">
          <h3 className="font-display text-xl font-bold text-dark mb-3 line-clamp-2 flex-1">
            {trip.title}
          </h3>
          <Link to={`/trips/${trip.slug}`}>
            <Button variant="outline" size="sm" fullWidth>
              Coming Soon
            </Button>
          </Link>
        </div>
      </motion.div>
    );
  }

  const remaining = publicSeatsLeft(trip.total_seats, trip.seats_booked, trip.waitlist_reserved || 0);
  const isAlmostFull = remaining <= 5 && remaining > 0;
  const isFull = remaining === 0;
  const { activePrice, isEarlyBird } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
  const strikeThroughPrice = getStrikeThroughPrice(activePrice, trip.price, isEarlyBird, trip.strike_through_price);

  // Admin-set marketing tags (Admin → Add/Edit Trip → Overview & Itinerary)
  // take priority; falling back to tags built from real trip data keeps
  // every trip's card useful even before an admin fills in custom copy.
  const destinationCount = trip.destination.split(',').map(s => s.trim()).filter(Boolean).length;
  const fallbackFeatureTags: TripCardFeatureTag[] = [
    { icon: 'users', label: isFull ? 'Full' : isAlmostFull ? `${remaining} left` : `${trip.total_seats}`, sublabel: 'Travelers' },
    { icon: 'user-check', label: formatAgeRange(trip.min_age, trip.max_age), sublabel: 'Age range' },
    { icon: 'clock', label: trip.duration, sublabel: 'Duration' },
    { icon: 'map-pin', label: String(destinationCount), sublabel: destinationCount === 1 ? 'Place' : 'Places' },
  ];
  const featureTags = trip.card_feature_tags && trip.card_feature_tags.length > 0
    ? trip.card_feature_tags.slice(0, 4)
    : fallbackFeatureTags;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="group bg-white rounded-2xl border border-background-warm shadow-warm hover:shadow-warm-lg transition-all duration-300 h-full flex flex-col overflow-hidden"
    >
      {/* Image */}
      <Link to={`/trips/${trip.slug}`} className="relative h-56 md:h-64 overflow-hidden block">
        {/*
          The hover-zoom (group-hover:scale-110) lives on this wrapper div
          rather than the <img> itself, because the saved cover_image_crop
          (see CoverImageCrop in types-index.ts) applies its own zoom via an
          inline transform on the <img> — an inline style would otherwise
          override the Tailwind hover transform outright. Keeping them on
          separate elements lets both scales apply together.
        */}
        <div className="w-full h-full transition-transform duration-700 group-hover:scale-110">
          <img
            src={trip.cover_image || PLACEHOLDER_IMAGE}
            alt={trip.destination}
            loading="lazy"
            className="w-full h-full object-cover"
            style={getCoverImageStyle(trip.cover_image_crop)}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-dark/60 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-4 left-4 flex gap-2">
          {isFull ? (
            <span className="bg-red-500 text-white text-xs font-button font-semibold px-3 py-1 rounded-md">
              Sold Out
            </span>
          ) : isAlmostFull ? (
            <span className="bg-amber-500 text-white text-xs font-button font-semibold px-3 py-1 rounded-md">
              Only {remaining} left!
            </span>
          ) : null}
          {isEarlyBird && (
            <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-secondary to-primary text-white text-xs font-button font-bold uppercase tracking-wide px-3 py-1.5 rounded-md shadow-warm">
              <Bird size={14} weight="fill" />
              Early Bird
            </span>
          )}
        </div>

        {/* Share + Add to calendar */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const url = `${window.location.origin}/trips/${trip.slug}`;
              navigator.share?.({ title: trip.title, url });
            }}
            aria-label="Share this trip"
            title="Share this trip"
            className="h-9 w-9 flex items-center justify-center rounded-full bg-white text-dark shadow-warm hover:bg-primary hover:text-white transition-all"
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToCalendar(trip); }}
            aria-label="Add to calendar"
            title="Add to calendar"
            className="h-9 w-9 flex items-center justify-center rounded-full bg-white text-dark shadow-warm hover:bg-primary hover:text-white transition-all"
          >
            <CalendarPlus size={16} />
          </button>
        </div>

        {/* Destination overlay — kept to a single line; formatDestinationDotsCompact
            folds anything past the fitted destinations into a trailing "+N". */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="inline-flex items-center gap-1.5 bg-white text-dark text-xs font-button font-semibold px-3 py-1.5 rounded-md shadow-warm max-w-full">
            <MapPin size={13} className="text-primary shrink-0" />
            <span className="truncate">{formatDestinationDotsCompact(trip.destination)}</span>
          </div>
        </div>
      </Link>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex-1">
          <h3 className="font-display text-xl font-bold text-dark mb-2 line-clamp-2">
            {trip.title}
          </h3>
          <div className="w-9 h-[3px] bg-primary rounded-full mb-3" />

          <div className="flex items-center gap-3 mb-3 text-xs sm:text-sm text-dark-muted">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Calendar size={13} className="text-primary shrink-0" />
              <span>{formatDateRange(trip.start_date, trip.end_date)}</span>
            </div>
            <span className="text-background-warm">|</span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Clock size={13} className="text-primary shrink-0" />
              <span>{trip.duration}</span>
            </div>
          </div>

          {activePrice != null && (
            <div className="mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-2xl font-bold text-primary">{formatPrice(activePrice)}</span>
                {strikeThroughPrice != null && (
                  <>
                    <span className="text-gray-400 line-through text-sm">{formatPrice(strikeThroughPrice)}</span>
                    <span className="bg-green-50 border border-green-200 text-green-700 text-[11px] font-button font-medium px-2 py-0.5 rounded-md whitespace-nowrap">
                      Save {formatPrice(strikeThroughPrice - activePrice)}
                    </span>
                  </>
                )}
              </div>
              {trip.advance_amount != null && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                  <ReserveShieldIcon className="w-[26px] h-[26px] text-green-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-green-700 text-xs font-button font-semibold leading-tight">
                      Reserve your spot from {formatPrice(trip.advance_amount)}
                    </p>
                    <p className="text-dark text-[10.5px] leading-tight mt-0.5">
                      Secure your trip with a small advance
                    </p>
                  </div>
                  <CaretRight size={16} className="text-green-700 shrink-0" />
                </div>
              )}
            </div>
          )}

          {/* Feature tag row: admin-set marketing tags when configured
              (e.g. "Girls-Only"), else auto-generated from real trip data —
              see featureTags above. When a tag has no valid stored icon key
              (or one no longer in the library), suggestTripHighlightIcons
              infers a sensible icon from the label text itself so the row
              never renders without icons. Divided into evenly-spaced
              columns with vertical separators between tags. */}
          <div className="grid grid-cols-3 divide-x divide-background-warm mb-3">
            {featureTags.slice(0, 3).map((tag, i) => {
              const resolved = resolveFeatureTagIcon(tag.label, tag.icon);
              const TagIcon = resolved?.Icon;
              return (
                <div key={i} className="flex items-center justify-center gap-1.5 min-w-0 px-2 first:pl-0 last:pr-0">
                  {TagIcon && (
                    <TagIcon
                      size={20}
                      weight={resolved.weight}
                      className={`${resolved.colorClass} shrink-0`}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-xs font-semibold text-dark whitespace-nowrap truncate">{tag.label}</span>
                </div>
              );
            })}
          </div>

          {isEarlyBird && trip.early_bird_deadline && (
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-5">
              <Timer size={14} className="text-secondary shrink-0" />
              <p className="text-dark text-[11.5px] leading-tight">
                Early bird ends in{' '}
                <span className="text-secondary font-bold">
                  {daysUntil(trip.early_bird_deadline)} {daysUntil(trip.early_bird_deadline) === 1 ? 'day' : 'days'}
                </span>{' '}
                ({formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })})
              </p>
            </div>
          )}
        </div>

        <Link to={`/trips/${trip.slug}`}>
          <Button
            variant={isFull ? 'outline' : 'primary'}
            size="sm"
            fullWidth
            className="group/btn"
          >
            {isFull ? 'Join Waitlist' : 'Explore Trip'}
            <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}