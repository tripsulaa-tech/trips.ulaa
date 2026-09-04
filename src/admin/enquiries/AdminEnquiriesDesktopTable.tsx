import type { MutableRefObject, RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChatCircle as MessageCircle,
  Users,
  User,
  CalendarDot as CalendarClock,
  ArrowRight,
  Bird,
  Baby,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import FoodMark from '../../components/ui/FoodMark';
import { TableHeaderBar, TablePagination, SortableTh } from '../../components/ui/DataTableChrome';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { useDragScroll } from '../../components/ui/dataTableUtils';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { formatDate, formatTime, formatPrice } from '../../utils/utils-index';
import {
  PACKAGE_CONFIG,
  foodBadge, foodPreferenceKey, SOURCE_CONFIG,
  journeyBadge, nextManualAction,
  closedReasonLabel, canSetFollowUp, followUpStatus,
  canSetBookingFollowUp, bookingFollowUpStatus,
} from './AdminEnquiryCommon';
import { isGeneralContactMessage, groupColorFor } from './enquiryGrouping';
import {
  paymentStatus, paymentBalance, paymentFilterKey, refundStatus, seatStatus,
} from './AdminEnquiriesShared';
import type { EnquirySortKey } from './useEnquiryFilters';

interface AdminEnquiriesDesktopTableProps {
  // Data for the current page
  paginatedEnquiries: Enquiry[];
  enquiriesSafePage: number;
  pageSize: number;
  enquiriesRangeStart: number;
  enquiriesRangeEnd: number;
  enquiriesTotalPages: number;
  totalFiltered: number;
  sortedFiltered: Enquiry[];
  setCurrentPage: (page: number) => void;

  // Header bar
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onExportCsv: (rows: Enquiry[], tripTitle: string | null, groupLabel: (e: Enquiry) => string, trip?: UpcomingTrip) => void;
  activeGroupTitle: string | null;

  // Sorting
  sortKey: EnquirySortKey | null;
  sortDir: 'asc' | 'desc';
  handleSort: (key: EnquirySortKey) => void;

  // Selection
  selectedIds: Set<string>;
  toggleSelectOne: (id: string) => void;
  toggleSelectAllFiltered: (rows: Enquiry[]) => void;

  // Grouping / highlight
  activeGroup: { key: string; title: string; trip?: UpcomingTrip } | null;
  highlightId: string | null;
  groupColor: (e: Enquiry) => ReturnType<typeof groupColorFor>;
  groupLabel: (e: Enquiry) => string;
  cardRefs: MutableRefObject<Record<string, HTMLElement | null>>;

  // Scroll/drag
  tableScrollRef: RefObject<HTMLDivElement | null>;
  dragHandlers: ReturnType<typeof useDragScroll<HTMLDivElement>>['handlers'];
  isDragging: boolean;

  // Row actions
  updating: string | null;
  completingId: string | null;
  setDetailsTarget: (e: Enquiry) => void;
  openPayment: (e: Enquiry) => void;
  openFollowUpModal: (e: Enquiry) => void;
  setBookingFollowUpTarget: (e: Enquiry) => void;
  handleAdvance: (e: Enquiry) => void;
  buildRowActions: (e: Enquiry) => ActionMenuItem[];
}

/** Desktop/tablet table view of the enquiries list — extracted from
 *  AdminEnquiries.tsx's JSX return (see that file's history for the
 *  original single-component version). Purely presentational: every piece
 *  of state and every handler is owned by AdminEnquiries (via its hooks)
 *  and passed in as props, so this component has zero behavior of its own
 *  beyond the small `idx`/`jb`/`nma`/etc. per-row derivations that were
 *  already inline here before the split. */
export default function AdminEnquiriesDesktopTable({
  paginatedEnquiries, enquiriesSafePage, pageSize, enquiriesRangeStart, enquiriesRangeEnd,
  enquiriesTotalPages, totalFiltered, sortedFiltered, setCurrentPage,
  searchQuery, setSearchQuery, onExportCsv, activeGroupTitle,
  sortKey, sortDir, handleSort,
  selectedIds, toggleSelectOne, toggleSelectAllFiltered,
  activeGroup, highlightId, groupColor, groupLabel, cardRefs,
  tableScrollRef, dragHandlers, isDragging,
  updating, completingId, setDetailsTarget, openPayment, openFollowUpModal, setBookingFollowUpTarget,
  handleAdvance, buildRowActions,
}: AdminEnquiriesDesktopTableProps) {
  // Only used for the "Open Full CRM Page" link below — the desktop table
  // otherwise has zero navigation behavior of its own (see the component
  // doc comment). Mirrors AdminEnquiriesMobileCards' "View Full CRM"
  // button, which is the only way to reach /admin/enquiries/:id (the page
  // with the Activity Timeline, Invoices, etc) on mobile — before this, the
  // desktop table had no equivalent at all; clicking a name here only ever
  // opened AdminDetailsModal's lightweight summary.
  const navigate = useNavigate();
  return (
    <div className="hidden sm:block bg-white rounded-lg shadow-card overflow-hidden">
      <TableHeaderBar
        title="Enquiry details"
        rangeStart={enquiriesRangeStart}
        rangeEnd={enquiriesRangeEnd}
        total={totalFiltered}
        itemLabel="enquiries"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search case #, title, owner..."
        onExport={() => onExportCsv(sortedFiltered, activeGroupTitle, groupLabel, activeGroup?.trip)}
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
              <th className="px-3 py-4 text-left w-8">
                <input
                  type="checkbox"
                  checked={paginatedEnquiries.length > 0 && paginatedEnquiries.every(e => selectedIds.has(e.id))}
                  onChange={() => toggleSelectAllFiltered(paginatedEnquiries)}
                  aria-label="Select all"
                  className="w-4 h-4 rounded border-background-warm accent-primary cursor-pointer"
                />
              </th>
              <th className="px-3 py-4 text-left hidden md:table-cell">S.No</th>
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-4 py-4 text-left" />
              <SortableTh label="Group" sortKey="group" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-4 text-left whitespace-nowrap" />
              <SortableTh label="Food" sortKey="food" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-4 text-left whitespace-nowrap" />
              <th className="px-4 py-4 text-left hidden sm:table-cell">Contact</th>
              <SortableTh label="Source" sortKey="source" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-4 py-4 text-left hidden lg:table-cell" />
              <SortableTh label="Date & Time" sortKey="date" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-4 py-4 text-left hidden lg:table-cell" />
              <SortableTh label="Package" sortKey="package" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-4 text-center whitespace-nowrap" />
              <SortableTh label="Payment" sortKey="payment" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-4 text-left whitespace-nowrap" />
              <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-4 text-center whitespace-nowrap" />
              <SortableTh label="Follow-up" sortKey="follow_up" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-4 text-left whitespace-nowrap hidden md:table-cell" />
              <th className="px-2 py-4 text-center whitespace-nowrap">Seat</th>
              <th className="px-2 py-4 text-right whitespace-nowrap">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-warm">
            {paginatedEnquiries.map((e, pageIdx) => {
              const idx = (enquiriesSafePage - 1) * pageSize + pageIdx;
              const jb = journeyBadge(e);
              const nma = nextManualAction(e);
              const seat = seatStatus(e);
              const srcCfg = SOURCE_CONFIG[e.source] || SOURCE_CONFIG.other;
              const isHighlighted = highlightId === e.id;
              const clr = groupColor(e);
              const food = foodBadge(e);
              return (
                <motion.tr
                  key={e.id}
                  ref={(el) => { cardRefs.current[e.id] = el; }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`transition-colors duration-1000 ${
                    isHighlighted ? 'bg-amber-50 ring-2 ring-inset ring-primary/40' : clr ? clr.row : 'hover:bg-background/50'
                  }`}
                >
                  <td className="px-3 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelectOne(e.id)}
                      aria-label={`Select ${e.full_name}`}
                      className="w-4 h-4 rounded border-background-warm accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-4 text-dark-muted hidden md:table-cell whitespace-nowrap">{idx + 1}</td>
                  <td className="px-4 py-4 max-w-[150px] sm:max-w-none">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDetailsTarget(e)}
                        className="text-left min-w-0 flex-1 group"
                        title="Click for a quick summary"
                      >
                        <p className="font-medium text-dark group-hover:text-primary transition-colors flex items-center gap-1.5 min-w-0">
                          <span className="truncate min-w-0">{e.full_name}</span>
                          {e.has_child_addon && (
                            <span
                              title="A Child Fare add-on has been added to this booking"
                              className="inline-flex items-center gap-1 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 shrink-0"
                            >
                              <Baby size={9} className="shrink-0" aria-hidden="true" /> Child
                            </span>
                          )}
                          {!e.trip_id && !activeGroup && (
                            <span
                              title={isGeneralContactMessage(e) ? 'A "Contact Us" message from the website — not linked to any trip' : 'Logged without picking a trip'}
                              className="inline-flex items-center gap-1 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-dark-muted shrink-0"
                            >
                              <MessageCircle size={9} className="shrink-0" aria-hidden="true" /> General
                            </span>
                          )}
                        </p>
                        <p className="text-dark-muted text-xs truncate sm:hidden">{e.email}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                        title="Open Full CRM Page — Activity Timeline, Invoices, and every other detail live here"
                        aria-label={`Open full CRM page for ${e.full_name}`}
                        className="shrink-0 text-dark-muted hover:text-primary p-1 -m-1 rounded transition-colors"
                      >
                        <ArrowSquareOut size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-4 whitespace-nowrap">
                    {e.group_size && e.group_size > 1 ? (
                      <span
                        title={`${groupLabel(e)} — part of a group booking of ${e.group_size}`}
                        className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                      >
                        <Users size={12} className="shrink-0" aria-hidden="true" /> {groupLabel(e)} · {e.group_seq}/{e.group_size}
                      </span>
                    ) : (
                      <span
                        title="Booked individually, not part of a group"
                        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md shrink-0 whitespace-nowrap bg-slate-100 text-dark-muted"
                      >
                        <User size={12} className="shrink-0" aria-hidden="true" /> Solo
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold whitespace-nowrap ${
                      e.food_preference === 'veg' ? 'text-green-700' : e.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark-muted'
                    }`}>
                      <FoodMark type={foodPreferenceKey(e)} size={12} /> {food.label}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-dark-muted hidden sm:table-cell">
                    <p className="text-xs truncate">{e.email}</p>
                    <p className="text-xs mt-0.5">{e.phone}</p>
                  </td>
                  <td className="px-4 py-4 text-dark-muted hidden lg:table-cell truncate">
                    <span className="text-xs">
                      {srcCfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-dark-muted hidden lg:table-cell whitespace-nowrap">
                    <p>{formatDate(e.created_at, { day: 'numeric', month: 'short' })}</p>
                    <p className="text-[11px] text-dark-muted/80">{formatTime(e.created_at)}</p>
                  </td>
                  <td className="px-2 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold whitespace-nowrap ${
                      e.package_type === 'early_bird' ? 'text-purple-700' : 'text-slate-700'
                    }`}>
                      {e.package_type === 'early_bird' && <Bird size={12} className="shrink-0" aria-hidden="true" />}
                      {PACKAGE_CONFIG[e.package_type || 'normal'].label}
                    </span>
                  </td>
                  <td className="px-2 py-4 text-left whitespace-nowrap">
                    <button onClick={() => openPayment(e)} className="text-left hover:opacity-75 transition-opacity">
                      <p className="text-dark text-xs">
                        <span className="font-medium">{formatPrice(e.amount_paid || 0)}{e.total_amount ? ` / ${formatPrice(e.total_amount)}` : ''}</span>
                        <span className="text-dark-muted"> · </span>
                        <span className={`font-semibold ${
                          paymentStatus(e).color.includes('green') ? 'text-green-700'
                            : paymentStatus(e).color.includes('amber') ? 'text-amber-700'
                            : paymentStatus(e).color.includes('red') ? 'text-red-700'
                            : 'text-dark-muted'
                        }`}>
                          {paymentStatus(e).label}
                        </span>
                        {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                          <span className="text-amber-600"> · {formatPrice(paymentBalance(e)!)} Due</span>
                        )}
                      </p>
                    </button>
                    {e.booking_id && (
                      <span title="Booking ID" className="mt-0.5 block text-[10px] font-mono text-dark-muted truncate">{e.booking_id}</span>
                    )}
                    {refundStatus(e) && (
                      <p className={`text-[10px] font-medium mt-1 px-1.5 py-0.5 rounded-md inline-block whitespace-nowrap ${refundStatus(e)!.color}`}>
                        {refundStatus(e)!.label}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-4 text-center">
                    <span title={closedReasonLabel(e) ? `Booking Journey: ${jb.label} — ${closedReasonLabel(e)}` : `Booking Journey: ${jb.label}`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                      <jb.icon size={12} className="shrink-0" aria-hidden="true" />
                      {jb.label}
                    </span>
                  </td>
                  <td className="px-2 py-4 text-left whitespace-nowrap hidden md:table-cell">
                    {(() => {
                      const fu = followUpStatus(e);
                      if (fu) {
                        return (
                          <button
                            onClick={() => openFollowUpModal(e)}
                            disabled={updating === e.id}
                            title="Click to change the follow-up date"
                            className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap hover:opacity-80 transition-opacity disabled:opacity-50 ${fu.color}`}
                          >
                            <fu.icon size={12} className="shrink-0" aria-hidden="true" />
                            {fu.label}
                          </button>
                        );
                      }
                      if (canSetFollowUp(e)) {
                        return (
                          <button
                            onClick={() => openFollowUpModal(e)}
                            disabled={updating === e.id}
                            title="Set a follow-up reminder"
                            className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-md border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            <CalendarClock size={12} className="shrink-0" aria-hidden="true" /> Set
                          </button>
                        );
                      }
                      // Booking Follow-up — the post-booking
                      // counterpart, only reachable once the lead
                      // window above no longer applies (the two
                      // never overlap on the same row).
                      const bfu = bookingFollowUpStatus(e);
                      if (bfu) {
                        return (
                          <button
                            onClick={() => setBookingFollowUpTarget(e)}
                            disabled={updating === e.id}
                            title="Click to change the booking follow-up"
                            className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap hover:opacity-80 transition-opacity disabled:opacity-50 ${bfu.color}`}
                          >
                            <bfu.icon size={12} className="shrink-0" aria-hidden="true" />
                            {bfu.label}
                          </button>
                        );
                      }
                      if (canSetBookingFollowUp(e)) {
                        return (
                          <button
                            onClick={() => setBookingFollowUpTarget(e)}
                            disabled={updating === e.id}
                            title="Set a booking follow-up reminder"
                            className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-md border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            <CalendarClock size={12} className="shrink-0" aria-hidden="true" /> Set
                          </button>
                        );
                      }
                      return <span className="text-dark-muted/50 text-xs">—</span>;
                    })()}
                  </td>
                  <td className="px-2 py-4 text-center">
                    <span
                      title={seat.title}
                      className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${seat.color}`}
                    >
                      <seat.icon size={12} className="shrink-0" aria-hidden="true" />
                      {seat.label}
                    </span>
                  </td>
                  <td className="px-2 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {nma && (
                        <button
                          onClick={() => handleAdvance(e)}
                          disabled={updating === e.id || completingId === e.id}
                          title={nma.label}
                          className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/5 transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          <nma.icon size={12} className="shrink-0" aria-hidden="true" />
                          {nma.label}
                        </button>
                      )}
                      {/* "Not Interested (Close Query)" used to have its
                          own standalone icon button here too — dropped
                          since it's already one click away in the kebab
                          below (see useRowActions.ts), and having it twice
                          on the same row was redundant. This slot now
                          carries the same "View Full CRM" jump the mobile
                          card's footer already has next to its own
                          Mark Contacted/nma chip, which the desktop table
                          had no equivalent of before. */}
                      <button
                        onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                        disabled={updating === e.id || completingId === e.id}
                        title="View Full CRM"
                        className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1.5 rounded border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        View Full CRM <ArrowRight size={12} className="shrink-0" aria-hidden="true" />
                      </button>
                      <ActionsMenu disabled={updating === e.id} items={buildRowActions(e)} />
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        currentPage={enquiriesSafePage}
        totalPages={enquiriesTotalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
