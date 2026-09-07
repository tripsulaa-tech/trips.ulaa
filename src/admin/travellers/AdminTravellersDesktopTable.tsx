import {
  Phone, Envelope as Mail, MapPin, Repeat,
  PencilSimple as Edit2, Trash as Trash2,
} from '@phosphor-icons/react';
import { TableHeaderBar, TablePagination } from '../../components/ui/DataTableChrome';
import { formatDate, getWhatsAppLink } from '../../utils/utils-index';
import { journeyBadge } from '../enquiries/AdminEnquiryCommon';
import type { TravellerContact } from './travellerContacts';

// Initials avatar — same helper as AdminTravellerCard's mobile card, kept
// local since it's a one-liner and the two views don't otherwise share
// component code.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

interface AdminTravellersDesktopTableProps {
  pageItems: TravellerContact[];
  rangeStart: number;
  rangeEnd: number;
  total: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  safePage: number;
  totalPages: number;
  setPage: (page: number) => void;
  onEdit: (contact: TravellerContact) => void;
  onDelete: (contact: TravellerContact) => void;
  deletingKey: string | null;
}

/** Desktop/tablet table view of the Contact Book — same data and actions
 *  as AdminTravellerCard's mobile card, laid out as rows instead of
 *  stacked cards (the same split AdminTripLeaders and Admin Enquiries use
 *  between their mobile cards and desktop tables). A contact with more
 *  than one trip shows its most recent one inline plus a "+N more" note
 *  (full list on hover) rather than an expand/collapse toggle — a table
 *  row growing taller on click doesn't fit this layout the way it does in
 *  the mobile card. */
export default function AdminTravellersDesktopTable({
  pageItems, rangeStart, rangeEnd, total, searchQuery, setSearchQuery,
  safePage, totalPages, setPage, onEdit, onDelete, deletingKey,
}: AdminTravellersDesktopTableProps) {
  return (
    <div className="hidden sm:block bg-white rounded-lg shadow-card overflow-hidden">
      <TableHeaderBar
        title="Contact Book"
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        itemLabel="contacts"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search name, phone, email, trip..."
      />
      <div className="overflow-x-auto scrollbar-hide mx-4 sm:mx-5 mb-4 sm:mb-5 rounded-md border border-background-warm">
        <table className="w-full text-sm">
          <thead className="bg-background-warm text-dark font-medium">
            <tr>
              <th className="px-4 py-4 text-left">Contact</th>
              <th className="px-4 py-4 text-left hidden md:table-cell">Reach</th>
              <th className="px-4 py-4 text-left hidden lg:table-cell">City</th>
              <th className="px-4 py-4 text-left">Trip</th>
              <th className="px-4 py-4 text-center">Status</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-warm">
            {pageItems.map(contact => {
              const latestTrip = contact.trips[0];
              const badge = latestTrip ? journeyBadge(latestTrip.representative) : undefined;
              const extraTripTitles = contact.trips.slice(1).map(t => t.tripTitle).join(', ');
              return (
                <tr key={contact.key} className="hover:bg-background/50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-display font-bold text-xs flex-shrink-0">
                        {initials(contact.fullName)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-dark truncate max-w-[160px]">{contact.fullName}</p>
                          {contact.tripCount > 1 && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                              <Repeat size={9} aria-hidden="true" /> {contact.tripCount} trips
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-dark-muted truncate">Registered {formatDate(contact.registeredAt)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <div className="min-w-0">
                      {contact.phone ? (
                        <a
                          href={getWhatsAppLink(contact.phone)}
                          target="_blank"
                          rel="noreferrer"
                          title={`Message ${contact.fullName} on WhatsApp`}
                          className="flex items-center gap-1.5 font-medium text-dark truncate hover:text-primary transition-colors"
                        >
                          <Phone size={12} className="shrink-0" aria-hidden="true" /> {contact.phone}
                        </a>
                      ) : (
                        <p className="font-medium text-dark-muted/60 truncate">No phone on file</p>
                      )}
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          title={`Email ${contact.fullName}`}
                          className="flex items-center gap-1.5 text-xs text-dark-muted truncate max-w-[180px] hover:text-primary transition-colors"
                        >
                          <Mail size={11} className="shrink-0" aria-hidden="true" /> {contact.email}
                        </a>
                      ) : (
                        <p className="text-xs text-dark-muted">—</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-dark-muted hidden lg:table-cell">
                    {contact.city ? (
                      <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {contact.city}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-4 text-dark-muted max-w-[200px]">
                    <p className="truncate">{latestTrip ? latestTrip.tripTitle : 'No trip on file'}</p>
                    {contact.trips.length > 1 && (
                      <p className="text-xs text-dark-muted/70 truncate" title={extraTripTitles}>+{contact.trips.length - 1} more</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {badge && (
                      <span className={`inline-flex text-[10px] font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(contact)}
                        aria-label={`Edit ${contact.fullName}`}
                        className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"
                      >
                        <Edit2 size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(contact)}
                        disabled={deletingKey === contact.key}
                        aria-label={`Delete ${contact.fullName}`}
                        className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
