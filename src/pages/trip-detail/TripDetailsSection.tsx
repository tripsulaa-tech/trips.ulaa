import type { UpcomingTrip, TripInclusionItem } from '../../types/types-index';
import { formatAgeRange } from '../../utils/utils-index';
import { getTripHighlightIcon } from '../../constants/tripHighlightIcons';
import { getThingsToCarryIcon } from './tripDetailUtils';
import { MapPin, NavigationArrow as Navigation, UserCheck } from '@phosphor-icons/react';

interface TripDetailsSectionProps {
  trip: UpcomingTrip;
}

// Things to Carry, Meeting Point, Trip Leader — grouped under one quick-jump
// anchor since none is substantial enough to warrant its own nav tab.
export default function TripDetailsSection({ trip }: TripDetailsSectionProps) {
  const hasThingsToCarry = (trip.things_to_carry_items?.length ?? 0) > 0;
  const hasFounder = Boolean(trip.trip_founder && (trip.trip_founder.name || trip.trip_founder.photo));

  if (!hasThingsToCarry && !trip.meeting_point && !hasFounder) return null;

  return (
    <div id="details" className="scroll-mt-44 space-y-9 sm:space-y-12">
      {/* Things to Carry — kept directly above Meeting Point */}
      {hasThingsToCarry && (
        <section className="scroll-mt-44">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-dark mb-2">Things to Carry</h2>
          <p className="text-dark-muted text-sm mb-3 sm:mb-4">Pack smart. Travel light. Stay ready.</p>
          <div className="flex flex-wrap gap-2">
            {trip.things_to_carry_items!.map((item: TripInclusionItem, i: number) => {
              const Icon = (item.icon && getTripHighlightIcon(item.icon)?.Icon) || getThingsToCarryIcon(item.description);
              return (
                <span key={i} className="inline-flex items-center gap-1.5 bg-background-warm/60 rounded-lg px-3 py-2.5">
                  <Icon size={18} className="text-primary shrink-0" />
                  <span className="text-sm text-dark font-medium leading-snug whitespace-nowrap">{item.description}</span>
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Meeting Point */}
      {trip.meeting_point && (
        <section className="bg-background-warm rounded-lg p-5 sm:p-6">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-dark mb-3 flex items-center gap-2">
            <Navigation size={22} className="text-primary" /> Meeting Point
          </h2>
          <p className="text-dark font-semibold mb-1">{trip.meeting_point}</p>
          {trip.meeting_address && (
            <p className="text-dark-muted text-sm mb-3">{trip.meeting_address}</p>
          )}
          {(trip.meeting_time || trip.meeting_terminal || trip.meeting_details) && (
            <dl className="mb-3 space-y-1 text-sm">
              {trip.meeting_time && (
                <div className="flex gap-1.5">
                  <dt className="font-semibold text-dark">Time:</dt>
                  <dd className="text-dark-muted">{trip.meeting_time}</dd>
                </div>
              )}
              {trip.meeting_terminal && (
                <div className="flex gap-1.5">
                  <dt className="font-semibold text-dark">Terminal:</dt>
                  <dd className="text-dark-muted">{trip.meeting_terminal}</dd>
                </div>
              )}
              {trip.meeting_details && (
                <div className="flex gap-1.5">
                  <dt className="font-semibold text-dark">Details:</dt>
                  <dd className="text-dark-muted">{trip.meeting_details}</dd>
                </div>
              )}
            </dl>
          )}
          <a
            href={trip.meeting_point_map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.meeting_point)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-button font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <MapPin size={15} /> View on map
          </a>
        </section>
      )}

      {/* Eligibility — only shown when the admin has set an age
          restriction on this trip (Admin → Trips → Basic Info). */}
      {(trip.min_age != null || trip.max_age != null) && (
        <section className="bg-background-warm rounded-lg p-5 sm:p-6">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-dark mb-2 flex items-center gap-2">
            <UserCheck size={22} className="text-primary" /> Eligibility
          </h2>
          <p className="text-dark-muted">
            This trip is open to travelers aged {formatAgeRange(trip.min_age, trip.max_age)}.
          </p>
        </section>
      )}

      {/* Founder */}
      {hasFounder && (
        <section className="scroll-mt-44 bg-dark rounded-lg p-5 sm:p-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6 text-center">Meet Your Trip Leader</h2>
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
            {trip.trip_founder!.photo ? (
              <img
                src={trip.trip_founder!.photo}
                alt={trip.trip_founder!.name}
                className="w-40 h-40 sm:w-44 sm:h-44 rounded-full object-cover border-4 border-primary/30 flex-shrink-0"
              />
            ) : (
              <div className="w-40 h-40 sm:w-44 sm:h-44 rounded-full bg-white/10 border-4 border-primary/30 flex items-center justify-center flex-shrink-0">
                <span className="text-white/40 text-6xl font-display font-bold">{trip.trip_founder!.name.charAt(0)}</span>
              </div>
            )}
            <div className="text-center sm:text-left flex-1">
              {trip.trip_founder!.name && (
                <h3 className="font-display text-xl font-bold text-white mb-0.5">{trip.trip_founder!.name}</h3>
              )}
              {trip.trip_founder!.designation && (
                <p className="text-primary text-sm font-semibold mb-2">{trip.trip_founder!.designation}</p>
              )}
              {trip.trip_founder!.description && (
                <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line">{trip.trip_founder!.description}</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
