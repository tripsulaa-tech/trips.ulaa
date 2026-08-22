import { motion } from 'framer-motion';
import { MapPin, Calendar, Clock, ArrowRight, CalendarPlus, Share2, Check, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { UpcomingTrip, TripCardFeatureTag } from '../../types/types-index';
import { formatDateRange, formatDate, formatPrice, getActivePrice, getStrikeThroughPrice, publicSeatsLeft, PLACEHOLDER_IMAGE, formatAgeRange, getCoverImageStyle } from '../../utils/utils-index';
import { addToCalendar } from '../../utils/calendar';
import { getTripHighlightIcon } from '../../constants/tripHighlightIcons';
import Button from './Button';

interface TripCardProps {
  trip: UpcomingTrip;
  index?: number;
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
        className="group bg-white rounded-2xl border border-background-warm shadow-warm hover:shadow-warm-lg transition-all duration-300 h-full flex flex-col"
      >
        <Link to={`/trips/${trip.slug}`} className="relative h-56 md:h-64 overflow-hidden rounded-t-2xl block">
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
      className="group bg-white rounded-2xl border border-background-warm shadow-warm hover:shadow-warm-lg transition-all duration-300 h-full flex flex-col"
    >
      {/* Image */}
      <Link to={`/trips/${trip.slug}`} className="relative h-56 md:h-64 overflow-hidden rounded-t-2xl block">
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
            <span className="bg-secondary text-white text-xs font-button font-semibold px-3 py-1 rounded-md">
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
            className="h-9 w-9 flex items-center justify-center rounded-full bg-primary text-white border-2 border-primary shadow-warm hover:bg-primary-dark hover:shadow-warm-lg transition-all"
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToCalendar(trip); }}
            aria-label="Add to calendar"
            title="Add to calendar"
            className="h-9 w-9 flex items-center justify-center rounded-full bg-primary text-white border-2 border-primary shadow-warm hover:bg-primary-dark hover:shadow-warm-lg transition-all"
          >
            <CalendarPlus size={16} />
          </button>
        </div>

        {/* Destination overlay */}
        <div className="absolute bottom-4 left-4">
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-md border border-white/30 text-white text-xs font-button font-semibold px-3 py-1.5 rounded-md">
            <MapPin size={13} />
            <span>{trip.destination}</span>
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
                <span className="font-display text-lg font-bold text-primary">{formatPrice(activePrice)}</span>
                {strikeThroughPrice != null && (
                  <>
                    <span className="text-dark-muted line-through text-sm">{formatPrice(strikeThroughPrice)}</span>
                    <span className="bg-green-50 border border-green-200 text-green-700 text-[11px] font-button font-medium px-2 py-0.5 rounded-md whitespace-nowrap">
                      Save {formatPrice(strikeThroughPrice - activePrice)}
                    </span>
                  </>
                )}
              </div>
              {trip.advance_amount != null && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                  <span className="w-[22px] h-[22px] rounded-full bg-green-600 text-white flex items-center justify-center shrink-0">
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span className="text-green-700 text-xs font-button font-semibold">
                    Reserve your spot for just {formatPrice(trip.advance_amount)}
                  </span>
                </div>
              )}
              {isEarlyBird && trip.early_bird_deadline && (
                <p className="flex items-center gap-1.5 text-dark-muted text-[11.5px] mt-2">
                  <Timer size={13} className="text-secondary shrink-0" />
                  <span>
                    Early bird offer ends{' '}
                    <span className="text-secondary font-semibold">
                      {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Feature tag row: admin-set marketing tags when configured
              (e.g. "Girls-Only" / "Safe & fun"), else auto-generated from
              real trip data — see featureTags above. */}
          <div className="grid grid-cols-4 gap-1 border-t border-background-warm pt-3 mb-5 text-center">
            {featureTags.map((tag, i) => {
              const iconMeta = getTripHighlightIcon(tag.icon);
              const TagIcon = iconMeta?.Icon;
              return (
                <div key={i} className="flex flex-col items-center gap-1 min-w-0">
                  <span className="w-[34px] h-[34px] rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {TagIcon && <TagIcon size={14} className="text-primary" aria-hidden="true" />}
                  </span>
                  <span className="text-[11px] font-semibold text-dark leading-tight truncate w-full">{tag.label}</span>
                  <span className="text-[9px] text-dark-muted leading-tight truncate w-full">{tag.sublabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        <Link to={`/trips/${trip.slug}`}>
          <Button
            variant={isFull ? 'outline' : 'primary'}
            size="sm"
            fullWidth
            className="group/btn"
          >
            {isFull ? 'Join Waitlist' : 'View Details'}
            <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}