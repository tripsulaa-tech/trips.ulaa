import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import {
  Trash as Trash2,
  Envelope as Mail,
  Phone,
  ChatDots as MessageSquare,
  Users,
  UserPlus,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import FoodMark from '../../components/ui/FoodMark';
import { TableHeaderBar, TablePagination, SortableTh, ContactQuickLinks } from '../../components/ui/DataTableChrome';
import type { WaitlistEntry } from '../../types/types-index';
import { formatDate } from '../../utils/utils-index';
import type { WaitlistSortKey } from './useWaitlistFilters';
import { foodBadge, foodBreakdown, messageWithoutFoodBreakdown, hasSeatOpen, canConvert } from './waitlistShared';
import {
  QueueRankBadge, ConvertedProgressBadge, SeatAvailabilityBadges,
  ConvertedStatusBadges, ConvertedBookingLinks, WaitlistStatusControl,
} from './WaitlistRowBits';

interface AdminWaitlistDesktopTableProps {
  paginatedEntries: WaitlistEntry[];
  waitlistSafePage: number;
  waitlistTotalPages: number;
  waitlistRangeStart: number;
  waitlistRangeEnd: number;
  totalFiltered: number;
  sortKey: WaitlistSortKey | null;
  sortDir: 'asc' | 'desc';
  onSort: (key: WaitlistSortKey) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onExport: () => void;
  onPageChange: (page: number) => void;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  dragHandlers: Record<string, (e: React.MouseEvent) => void>;
  seatsAvailable: Record<string, number>;
  cancelledEnquiryIds: Set<string>;
  groupLabel: (e: WaitlistEntry) => string;
  queueRank: Map<string, { rank: number; total: number }>;
  updating: string | null;
  onStatusChange: (id: string, status: WaitlistEntry['status']) => void;
  onDelete: (entry: WaitlistEntry) => void;
  onConvert: (entry: WaitlistEntry) => void;
}

/** The desktop/tablet waitlist table — sm and up. Purely presentational;
 *  all state, filtering/sorting, and row actions live in the page's hooks.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export default function AdminWaitlistDesktopTable({
  paginatedEntries, waitlistSafePage, waitlistTotalPages, waitlistRangeStart, waitlistRangeEnd,
  totalFiltered, sortKey, sortDir, onSort, searchQuery, setSearchQuery, onExport, onPageChange,
  tableScrollRef, isDragging, dragHandlers, seatsAvailable, cancelledEnquiryIds, groupLabel,
  queueRank, updating, onStatusChange, onDelete, onConvert,
}: AdminWaitlistDesktopTableProps) {
  const navigate = useNavigate();

  return (
    <div className="hidden sm:block bg-white rounded-lg shadow-card overflow-hidden">
      <TableHeaderBar
        title="Waitlist details"
        rangeStart={waitlistRangeStart}
        rangeEnd={waitlistRangeEnd}
        total={totalFiltered}
        itemLabel="signups"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search name, trip, contact..."
        onExport={onExport}
        exportLabel="Export CSV"
      />
      <div
        ref={tableScrollRef}
        {...dragHandlers}
        className={`overflow-x-auto overflow-y-auto scrollbar-hide mx-4 sm:mx-5 mb-4 sm:mb-5 max-h-[620px] rounded-md border border-background-warm ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background-warm text-dark font-medium">
            <tr>
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={onSort} className="px-4 py-4 text-left" />
              <SortableTh label="Group" sortKey="group" activeKey={sortKey} direction={sortDir} onSort={onSort} className="px-2 py-4 text-left whitespace-nowrap" />
              <SortableTh label="Food" sortKey="food" activeKey={sortKey} direction={sortDir} onSort={onSort} className="px-2 py-4 text-left whitespace-nowrap" />
              <SortableTh label="Trip" sortKey="trip" activeKey={sortKey} direction={sortDir} onSort={onSort} className="px-4 py-4 text-left hidden lg:table-cell" />
              <th className="px-4 py-4 text-left hidden md:table-cell">Contact</th>
              <SortableTh label="Joined" sortKey="joined" activeKey={sortKey} direction={sortDir} onSort={onSort} className="px-4 py-4 text-left hidden lg:table-cell" />
              <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={onSort} className="px-2 py-4 text-right whitespace-nowrap" />
              <th className="px-2 py-4 text-right whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-warm">
            {paginatedEntries.map(e => (
              <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                <td className="px-4 py-4 max-w-[160px] sm:max-w-none">
                  <p className="font-medium text-dark truncate flex items-center gap-1.5">
                    {e.full_name}
                    <QueueRankBadge entry={e} queueRank={queueRank} />
                    <ConvertedProgressBadge entry={e} />
                  </p>
                  <p className="text-dark-muted text-xs truncate md:hidden">{e.email}</p>
                  {e.age && (
                    <p className="text-dark-muted text-xs mt-0.5">{e.age} yrs</p>
                  )}
                  {messageWithoutFoodBreakdown(e) && (
                    <p className="text-dark-muted text-xs mt-1 flex items-start gap-1 max-w-xs">
                      <MessageSquare size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="line-clamp-2">{messageWithoutFoodBreakdown(e)}</span>
                    </p>
                  )}
                </td>
                <td className="px-2 py-4 whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    {e.group_size && e.group_size > 1 ? (
                      <span
                        title={`${groupLabel(e)} — waiting for ${e.group_size} seats together`}
                        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md bg-background-warm text-dark-muted whitespace-nowrap"
                      >
                        <Users size={12} className="shrink-0" aria-hidden="true" /> {groupLabel(e)} · {e.group_size}
                      </span>
                    ) : (
                      <span
                        title="Booked individually, not part of a group"
                        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md bg-slate-100 text-dark-muted whitespace-nowrap"
                      >
                        <UserPlus size={12} className="shrink-0" aria-hidden="true" /> Solo
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-4 whitespace-nowrap">
                  {foodBreakdown(e) ? (
                    <span className="inline-flex items-center gap-2 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-background-warm">
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <FoodMark type="veg" size={12} /> {foodBreakdown(e)![1]} veg
                      </span>
                      <span className="text-dark-muted/40">/</span>
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <FoodMark type="non_veg" size={12} /> {foodBreakdown(e)![2]} non-veg
                      </span>
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${foodBadge(e).color}`}>
                      <FoodMark type={foodBadge(e).key} size={12} /> {foodBadge(e).label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-dark-muted hidden lg:table-cell max-w-[180px]">
                  <p className="truncate">{e.trip_title || '—'}</p>
                  <SeatAvailabilityBadges entry={e} seatsAvailable={seatsAvailable} />
                </td>
                <td className="px-4 py-4 text-dark-muted hidden md:table-cell">
                  <p className="flex items-center gap-1 text-xs"><Mail size={11} className="shrink-0" aria-hidden="true" /> {e.email}</p>
                  <p className="flex items-center gap-1 text-xs mt-0.5"><Phone size={11} className="shrink-0" aria-hidden="true" /> {e.phone}</p>
                  {e.city && <p className="text-xs mt-0.5">{e.city}</p>}
                  {e.emergency_contact && <p className="text-xs mt-0.5">Emergency: {e.emergency_contact}</p>}
                  <div className="mt-1.5">
                    <ContactQuickLinks phone={e.phone} email={e.email} name={e.full_name} tripTitle={e.trip_title} />
                  </div>
                </td>
                <td className="px-4 py-4 text-dark-muted hidden lg:table-cell whitespace-nowrap">
                  {formatDate(e.created_at, { day: 'numeric', month: 'short' })}
                </td>
                <td className="px-2 py-4 text-right">
                  {e.status === 'converted' ? (
                    <div className="flex flex-col items-end gap-1">
                      <ConvertedStatusBadges entry={e} cancelledEnquiryIds={cancelledEnquiryIds} />
                      <div className="flex flex-col items-end gap-0.5">
                        <ConvertedBookingLinks entry={e} onNavigate={id => navigate(`/admin/enquiries?enquiry=${id}`)} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <WaitlistStatusControl entry={e} idPrefix="waitlist-status-" updating={updating} onStatusChange={onStatusChange} />
                    </div>
                  )}
                </td>
                <td className="px-2 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canConvert(e) && (
                      <button
                        onClick={() => onConvert(e)}
                        title="Convert to enquiry"
                        className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 h-7 rounded border transition-colors whitespace-nowrap ${
                          hasSeatOpen(e, seatsAvailable)
                            ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                            : 'border-primary/40 text-primary hover:bg-primary/10'
                        }`}
                      >
                        <UserPlus size={12} className="shrink-0" aria-hidden="true" />
                        Convert
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(e)}
                      disabled={updating === e.id}
                      title={`Remove ${e.full_name} from waitlist`}
                      aria-label={`Remove ${e.full_name} from waitlist`}
                      className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        currentPage={waitlistSafePage}
        totalPages={waitlistTotalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
