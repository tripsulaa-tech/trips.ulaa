import { useState } from 'react';
import {
  Phone, Envelope as Mail, MapPin, Repeat,
  PencilSimple as Edit2, Trash as Trash2,
  CaretUp as ChevronUp, CaretDown as ChevronDown,
} from '@phosphor-icons/react';
import { formatDate, getWhatsAppLink } from '../../utils/utils-index';
import { journeyBadge } from '../enquiries/AdminEnquiryCommon';
import type { TravellerContact } from './travellerContacts';

// Initials avatar — travellers don't have a photo the way Trip Leaders do,
// so this fills the same visual slot the Trip Leader card gives its
// circular photo.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

// Same card shell/layout as the Trip Leaders directory (see
// AdminTripLeaders.tsx's mobile card and the reference screenshot): avatar
// + name/subtitle on the left, a status pill top-right, a description
// line, then a divider with a left-side toggle and right-side action
// icons. Trip Leaders' up/down pair reorders a fixed list; travellers
// aren't reorderable, so that slot becomes a single expand/collapse
// chevron for this contact's trip history instead. There's no
// publish/unpublish concept for a traveller, so only Edit and Delete
// appear on the right.
//
// This is a contact book, not a payments ledger — no lifetime-paid or
// per-trip amount figures are shown here; that lives on the trip/
// Enquiries side. Position in the list (sorted by registration date, see
// buildTravellerContacts' final sort) is conveyed via pagination alone —
// no per-row serial number.
export default function AdminTravellerCard({
  contact,
  onEdit,
  onDelete,
  deleting,
}: {
  contact: TravellerContact;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const latestTrip = contact.trips[0];
  const badge = latestTrip ? journeyBadge(latestTrip.representative) : undefined;

  return (
    <div className="bg-white rounded-lg shadow-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-display font-bold text-sm flex-shrink-0">
            {initials(contact.fullName)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-medium text-dark truncate">{contact.fullName}</p>
              {contact.tripCount > 1 && (
                <span className="inline-flex items-center gap-1 text-2xs font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                  <Repeat size={9} aria-hidden="true" /> {contact.tripCount} trips
                </span>
              )}
            </div>
            <p className="text-xs text-dark-muted truncate">
              Registered {formatDate(contact.registeredAt)}
            </p>
          </div>
        </div>
        {badge && (
          <span className={`shrink-0 text-2xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${badge.color}`}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm text-dark-muted leading-relaxed">
        {contact.phone ? (
          <a
            href={getWhatsAppLink(contact.phone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
          >
            <Phone size={12} aria-hidden="true" /> {contact.phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-dark-muted/60">
            <Phone size={12} aria-hidden="true" /> No phone on file
          </span>
        )}
        {contact.email && (
          <span className="inline-flex items-center gap-1 truncate">
            <Mail size={12} aria-hidden="true" /> {contact.email}
          </span>
        )}
        {contact.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} aria-hidden="true" /> {contact.city}
          </span>
        )}
      </div>

      {expanded && (
        <div className="space-y-1.5 pt-1">
          {contact.trips.map(trip => {
            const tripBadge = journeyBadge(trip.representative);
            return (
              <div
                key={trip.key}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-background-warm/50 rounded-md px-2.5 py-1.5"
              >
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="font-button font-semibold text-xs text-dark truncate">{trip.tripTitle}</span>
                  {trip.seatCount > 1 && (
                    <span className="text-2xs font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-dark-muted">
                      Group of {trip.seatCount}
                    </span>
                  )}
                  {trip.departureDate && (
                    <span className="text-2xs text-dark-muted">{formatDate(trip.departureDate)}</span>
                  )}
                </div>
                <span className={`text-2xs font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${tripBadge.color}`}>
                  {tripBadge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-background-warm">
        {contact.trips.length > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? `Hide ${contact.fullName}'s trips` : `Show all of ${contact.fullName}'s trips`}
            className="inline-flex items-center gap-1 p-2 rounded text-dark-muted hover:bg-background transition-colors"
          >
            {expanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${contact.fullName}`}
            className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"
          >
            <Edit2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`Delete ${contact.fullName}`}
            className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors disabled:opacity-50"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
