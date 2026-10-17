import type { MutableRefObject, RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChatCircle as MessageCircle,
  Users,
  CalendarDot as CalendarClock,
  Bird,
  Baby,
  Package,
} from '@phosphor-icons/react';
import FoodMark from '../../components/ui/FoodMark';
import { TableHeaderBar, TablePagination, SortableTh } from '../../components/ui/DataTableChrome';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { useDragScroll } from '../../components/ui/dataTableUtils';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { formatDate, formatTime, formatPrice } from '../../utils/utils-index';
import { isPremiumPackage } from '../../utils/tripOptions';
import {
  PACKAGE_CONFIG,
  foodBadge, foodPreferenceKey, SOURCE_CONFIG,
  listStatusBadge, nextManualAction,
  closedReasonLabel, canSetFollowUp, followUpStatus, isNotInterested,
  canSetBookingFollowUp, bookingFollowUpStatus,
} from './AdminEnquiryCommon';
import { isGeneralContactMessage, groupColorFor } from './enquiryGrouping';
import {
  paymentStatus, paymentBalance, paymentFilterKey, refundStatus, seatStatus,
} from './AdminEnquiriesShared';
import type { EnquirySortKey } from './useEnquiryFilters';
import { realEmail } from '../../utils/placeholderEmail';

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
  openPayment: (e: Enquiry) => void;
  openFollowUpModal: (e: Enquiry) => void;
  setBookingFollowUpTarget: (e: Enquiry) => void;
  handleAdvance: (e: Enquiry) => void;
  buildRowActions: (e: Enquiry) => ActionMenuItem[];
}

/** The "₹paid / ₹total · Status[ · ₹X Due]" line shown in the Payment cell
 *  — identical in both the non-clickable (`new_enquiry`) and clickable
 *  variants of that cell below; only the wrapping element and whether the
 *  booking ID is shown beneath it differ. */
function PaymentSummaryLine({ e }: { e: Enquiry }) {
  // Two short lines: amount paid of total on top, then ONE coloured status
  // line. For a partial payment that line is just the balance ("₹26,999
  // due") — "Partial" and the due amount used to say the same thing twice.
  const status = paymentStatus(e);
  const balance = paymentBalance(e);
  const isPartial = paymentFilterKey(e) === 'partial' && balance != null;
  const colorClass = status.color.includes('green') ? 'text-success-fg'
    : status.color.includes('amber') ? 'text-warning-fg'
    : status.color.includes('red') ? 'text-danger-fg'
    : status.color.includes('orange') ? 'text-orange-700'
    : 'text-dark-muted';
  return (
    <span className="block text-xs text-dark">
      <span className="block font-medium">
        {formatPrice(e.amount_paid || 0)}{e.total_amount ? ` of ${formatPrice(e.total_amount)}` : ''}
      </span>
      <span className={`block mt-0.5 font-semibold ${colorClass}`}>
        {isPartial ? `${formatPrice(balance!)} due` : status.label}
      </span>
    </span>
  );
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
  updating, completingId, openPayment, openFollowUpModal, setBookingFollowUpTarget,
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
        pageSizeKey="enquiries"
        rangeStart={enquiriesRangeStart}
        rangeEnd={enquiriesRangeEnd}
        total={totalFiltered}
        itemLabel="enquiries"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search name, phone, email, trip..."
        onExport={() => onExportCsv(sortedFiltered, activeGroupTitle, groupLabel, activeGroup?.trip)}
        exportLabel="Export CSV"
        exportVariant="primary"
      />
      <div
        ref={tableScrollRef}
        {...dragHandlers}
        // No cursor-grab/cursor-grabbing hand icon here — native
        // overflow-x-auto/overflow-y-auto already gives the browser's own
        // scrollbar + wheel/trackpad scrolling in both directions, and the
        // click-and-drag handlers below (dragHandlers) still work under
        // the ordinary cursor, so the drag-to-scroll gesture isn't lost,
        // just no longer signposted with a hand. select-none stays while
        // actually dragging, so a drag-scroll doesn't also select cell text.
        className={`overflow-x-auto overflow-y-auto scrollbar-hide mx-4 sm:mx-5 mb-4 sm:mb-5 max-h-[620px] rounded-md border border-background-warm ${isDragging ? 'select-none' : ''}`}
      >
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 z-10 bg-background-warm text-dark font-medium">
            <tr>
              <th className="px-3 py-3 text-left w-[3%]">
                <input
                  type="checkbox"
                  checked={paginatedEnquiries.length > 0 && paginatedEnquiries.every(e => selectedIds.has(e.id))}
                  onChange={() => toggleSelectAllFiltered(paginatedEnquiries)}
                  aria-label="Select all"
                  className="w-4 h-4 rounded border-background-warm accent-primary cursor-pointer"
                />
              </th>
              <th className="px-3 py-3 text-left hidden md:table-cell w-[4%]">S.No</th>
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-3 py-3 text-left w-[25%]" />
              <th className="px-3 py-3 text-left hidden sm:table-cell whitespace-nowrap w-[19%]">Contact</th>
              <SortableTh label="Package" sortKey="package" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-3 py-3 text-left whitespace-nowrap hidden md:table-cell w-[10%]" />
              <SortableTh label="Payment" sortKey="payment" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-3 py-3 text-left whitespace-nowrap w-[12%]" />
              <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-3 py-3 text-left whitespace-nowrap w-[12%]" />
              <SortableTh label="Follow-up" sortKey="follow_up" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-3 py-3 text-left whitespace-nowrap hidden md:table-cell w-[8%]" />
              <th className="px-3 py-3 text-right whitespace-nowrap w-[7%]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-warm">
            {paginatedEnquiries.map((e, pageIdx) => {
              const idx = (enquiriesSafePage - 1) * pageSize + pageIdx;
              const jb = listStatusBadge(e);
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
                    isHighlighted ? 'bg-warning-bg ring-2 ring-inset ring-primary/40' : clr ? clr.row : 'hover:bg-background/50'
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelectOne(e.id)}
                      aria-label={`Select ${e.full_name}`}
                      className="w-4 h-4 rounded border-background-warm accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3 text-dark-muted hidden md:table-cell whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                      className="text-left min-w-0 w-full group"
                      title="Open Full CRM Page"
                    >
                      <p className="font-medium text-dark group-hover:text-primary transition-colors flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="truncate min-w-0 max-w-full">{e.full_name}</span>
                        {e.has_child_addon && (
                          <span
                            title="A Child Fare add-on has been added to this booking"
                            className="inline-flex items-center gap-1 text-xs font-button font-semibold px-1.5 py-0.5 rounded-md bg-warning-bg text-warning-fg shrink-0"
                          >
                            <Baby size={9} className="shrink-0" aria-hidden="true" /> Child
                          </span>
                        )}
                        {!e.trip_id && !activeGroup && (
                          <span
                            title={isGeneralContactMessage(e) ? 'A "Contact Us" message from the website — not linked to any trip' : 'Logged without picking a trip'}
                            className="inline-flex items-center gap-1 text-xs font-button font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-dark-muted shrink-0"
                          >
                            <MessageCircle size={9} className="shrink-0" aria-hidden="true" /> General
                          </span>
                        )}
                        {/* Only what differs from the norm gets a chip: Solo and
                            Normal price are the defaults, so they're not drawn.
                            Food stays a tiny icon-only chip. Package has its own column. */}
                        {e.group_size && e.group_size > 1 && (
                          <span
                            title={`${groupLabel(e)} — part of a group booking of ${e.group_size}`}
                            className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                          >
                            <Users size={12} className="shrink-0" aria-hidden="true" /> {groupLabel(e)} · {e.group_seq}/{e.group_size}
                          </span>
                        )}
                        <span
                          title={`Food preference: ${food.label}`}
                          aria-label={`Food preference: ${food.label}`}
                          role="img"
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${food.color}`}
                        >
                          <FoodMark type={foodPreferenceKey(e)} size={12} />
                        </span>
                      </p>
                      <p className="text-dark-muted text-xs truncate sm:hidden">{realEmail(e.email) || 'No email'}</p>
                    </button>
                    {/* Source · Date sits on its own muted line so it always
                        starts at the same x position (it used to trail the
                        chips and jump around from row to row). */}
                    <p className="mt-0.5 text-xs text-dark-muted whitespace-nowrap truncate">
                      {srcCfg.label} · {formatDate(e.created_at, { day: 'numeric', month: 'short' })}, {formatTime(e.created_at)}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-dark-muted hidden sm:table-cell max-w-0">
                    <p className="text-xs truncate" title={realEmail(e.email) || undefined}>{realEmail(e.email) || 'No email'}</p>
                    <p className="text-xs mt-0.5 text-dark">{e.phone}</p>
                  </td>
                  <td className="px-3 py-3 text-left whitespace-nowrap hidden md:table-cell">
                    {/* Line 1: the trip package the traveller picked.
                        Line 2: which price they got (Early Bird / Normal). */}
                    {e.package_name && (
                      <p
                        title={`Trip package: ${e.package_name}`}
                        className={`mb-0.5 inline-flex items-center gap-1 text-xs font-button font-semibold ${isPremiumPackage(e.package_name) ? 'premium-gold-text' : 'text-primary'}`}
                      >
                        <Package size={12} className="shrink-0" aria-hidden="true" />
                        {e.package_name}
                      </p>
                    )}
                    <p
                      title={e.package_type === 'early_bird' ? 'Early Bird pricing applied' : 'Regular (normal) pricing applied'}
                      className={`flex items-center gap-1 text-xs font-semibold ${e.package_type === 'early_bird' ? 'text-purple-700' : 'text-dark-muted'}`}
                    >
                      {e.package_type === 'early_bird' && <Bird size={12} className="shrink-0" aria-hidden="true" />}
                      {PACKAGE_CONFIG[e.package_type || 'normal'].label}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-left whitespace-nowrap">
                    {/* Same gate as the kebab's Add Payment / the detail
                        page's inline Track Payment form — a New Enquiry
                        hasn't been through Contact Outcome yet, so this
                        cell shouldn't be a side-door into the payment
                        modal. Rendered plain (no button, no hover, no
                        click) with a title nudging toward Mark Contacted
                        instead of just silently doing nothing on click. */}
                    {e.journey_stage === 'new_enquiry' ? (
                      <div title="Mark this enquiry Contacted first to record a payment">
                        <PaymentSummaryLine e={e} />
                      </div>
                    ) : (
                      <button
                        onClick={() => openPayment(e)}
                        title={e.booking_id ? `Booking ID: ${e.booking_id} — click to open payments` : 'Open payments'}
                        className="text-left hover:opacity-75 transition-opacity"
                      >
                        <PaymentSummaryLine e={e} />
                      </button>
                    )}
                    {refundStatus(e, true) && (
                      <p className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-md inline-block whitespace-nowrap ${refundStatus(e, true)!.color}`}>
                        {refundStatus(e, true)!.label}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-left">
                    <div className="flex flex-col items-start gap-1">
                    <span title={closedReasonLabel(e) ? `Booking Journey: ${jb.label} — ${closedReasonLabel(e)}` : `Booking Journey: ${jb.label}`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                      <jb.icon size={12} className="shrink-0" aria-hidden="true" />
                      {jb.label}
                    </span>
                    {/* A closed "Not Interested" enquiry is obviously not
                        booked — drop the second badge there. */}
                    {!(isNotInterested(e) && seat.label === 'Not booked') && (
                      <span
                        title={seat.title}
                        className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${seat.color}`}
                      >
                        <seat.icon size={12} className="shrink-0" aria-hidden="true" />
                        {seat.label}
                      </span>
                    )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-left whitespace-nowrap hidden md:table-cell">
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
                            className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
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
                            className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            <CalendarClock size={12} className="shrink-0" aria-hidden="true" /> Set
                          </button>
                        );
                      }
                      return <span className="text-dark-muted/50 text-xs">—</span>;
                    })()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {nma && (
                        <button
                          onClick={() => handleAdvance(e)}
                          disabled={updating === e.id || completingId === e.id}
                          title={nma.label}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-primary bg-primary text-white shadow-warm hover:bg-primary-dark hover:border-primary-dark transition-colors disabled:opacity-50"
                        >
                          <nma.icon size={14} className="shrink-0" aria-hidden="true" />
                          <span className="sr-only">{nma.label}</span>
                        </button>
                      )}
                      {/* No separate "View Full CRM" arrow on desktop — the
                          name in the first column already opens the CRM page.
                          "Not Interested" lives in the kebab (useRowActions.ts). */}
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
