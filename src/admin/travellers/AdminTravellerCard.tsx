import { Phone, Envelope as Mail, MapPin, Repeat } from '@phosphor-icons/react';
import { formatDate, formatPrice, getWhatsAppLink } from '../../utils/utils-index';
import { journeyBadge } from '../enquiries/AdminEnquiryCommon';
import type { TravellerContact } from './travellerContacts';

export default function AdminTravellerCard({ contact }: { contact: TravellerContact }) {
  return (
    <div className="p-4 sm:p-5 border-b border-background-warm last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-dark truncate">{contact.fullName}</h3>
            {contact.tripCount > 1 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                <Repeat size={10} aria-hidden="true" /> Repeat &middot; {contact.tripCount} trips
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-dark-muted">
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
              <span className="inline-flex items-center gap-1">
                <Mail size={12} aria-hidden="true" /> {contact.email}
              </span>
            )}
            {contact.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden="true" /> {contact.city}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide">Lifetime Paid</p>
          <p className="font-display font-bold text-dark">{formatPrice(contact.totalPaidLifetime)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {contact.trips.map(trip => {
          const badge = journeyBadge(trip.representative);
          return (
            <div
              key={trip.key}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-background-warm/50 rounded-md px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <span className="font-button font-semibold text-sm text-dark truncate">{trip.tripTitle}</span>
                {trip.seatCount > 1 && (
                  <span className="text-[10px] font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-dark-muted">
                    Group of {trip.seatCount}
                  </span>
                )}
                {trip.departureDate && (
                  <span className="text-xs text-dark-muted">{formatDate(trip.departureDate)}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-dark-muted">
                  {formatPrice(trip.totalPaid)}{trip.totalAmount > 0 ? ` / ${formatPrice(trip.totalAmount)}` : ''}
                </span>
                <span className={`text-[10px] font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
