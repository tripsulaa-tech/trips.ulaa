import { Fragment } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChatCircle as MessageCircle,
  Users,
  User,
  Baby,
  CalendarDot as CalendarClock,
  UserMinus,
  ArrowRight,
  ArrowsClockwise as RefreshCw,
  Bird,
  ArrowSquareOut,
  Eye,
  CurrencyInr as IndianRupee,
  SignIn as LogIn,
  XCircle,
  Trash as Trash2,
  UserCheck,
  UserMinus as UserX,
  FileText,
  ShareNetwork as Share2,
  X,
} from '@phosphor-icons/react';
import FoodMark from '../../components/ui/FoodMark';
import { TableHeaderBar, TablePagination, SortableTh } from '../../components/ui/DataTableChrome';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { useDragScroll } from '../../components/ui/dataTableUtils';
import type { Enquiry, Kid, KidStatus, UpcomingTrip } from '../../types/types-index';
import { formatDate, formatTime, formatPrice } from '../../utils/utils-index';
import {
  PACKAGE_CONFIG,
  foodBadge, foodPreferenceKey, SOURCE_CONFIG,
  journeyBadge, nextManualAction,
  closedReasonLabel, canSetFollowUp, followUpStatus,
  canSetBookingFollowUp, bookingFollowUpStatus,
  kidStatusBadge, canMarkKidNotInterested, canReopenKid, kidNotInterestedReasonLabel, nextKidManualAction,
  kidFollowUpStatus, canSetKidFollowUp, canCancelKid, canMarkKidNoShow, KID_NO_SHOW_BADGE,
} from './AdminEnquiryCommon';
import { isGeneralContactMessage, groupColorFor, kidDisplayRows } from './enquiryGrouping';
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

  // Kids — real per-kid rows, bulk-loaded per page (see AdminEnquiries'
  // kidsByEnquiry), falling back to enquiryGrouping's placeholder rows for
  // any enquiry whose kids array hasn't landed yet (or is genuinely empty).
  kidsByEnquiry: Record<string, Kid[]>;
  kidRowLabel: (kid: Kid, fallbackIndex: number) => string;
  onOpenKidPayment: (kid: Kid, tripId: string | undefined) => void;
  // One-click "Not Interested" for a single kid, right from its own row —
  // only ever callable for a real kid record (placeholder rows built from
  // a bare kids_count have no id to update). See AdminEnquiries'
  // handleMarkKidNotInterested.
  onMarkKidNotInterested: (kid: Kid) => void;
  // Counterpart to the above — one-click "Reopen" for a kid already marked
  // not_interested. See AdminEnquiries' handleReopenKid.
  onReopenKid: (kid: Kid) => void;
  // Powers the kid row's kebab menu (mirroring buildRowActions for the
  // adult row) — a direct status jump (Confirmed/Checked In/Pending/
  // Cancelled) and permanent removal, both previously only reachable by
  // opening the full CRM page and finding AdminEnquiryKidsCard's own menu.
  onUpdateKidStatus: (kid: Kid, status: KidStatus) => void;
  // Single "next step" chip dispatcher — routes a kid's first contact
  // (pending -> contacted) through the Log Call Outcome popup instead of
  // flipping status directly; every later step still falls through to
  // onUpdateKidStatus above. See AdminEnquiries' handleAdvanceKid.
  onAdvanceKid: (kid: Kid, status: KidStatus, label: string, enquiry: Enquiry) => void;
  // Toggles a kid's independent is_no_show flag — see canMarkKidNoShow /
  // AdminEnquiries' handleToggleKidNoShow.
  onToggleKidNoShow: (kid: Kid, isNoShow: boolean) => void;
  onDeleteKid: (kid: Kid) => void;
  // Navigates to this kid's own full routed detail page (/admin/kids/:id
  // — see AdminKidDetail.tsx): own name/age/food/status/follow-up, never
  // the parent enquiry's own record. Replaces the row's former "View Full
  // Details" jump to the enquiry's detail page, which showed the adult
  // booking only.
  onViewKidDetails: (kid: Kid) => void;
  // Kid-side counterparts to the adult row's Download/Share Invoice pair
  // (useRowActions.ts) — full parity with the adult kebab menu, sourced
  // from the kid's own payment ledger via kidAsInvoiceEnquiry. Shares the
  // same busy-id tracking as the adult actions (useEnquiryDetailsModal),
  // just keyed off kid.id instead of enquiry.id.
  invoiceBusyId: string | null;
  onDownloadKidInvoice: (kid: Kid, enquiry: Enquiry, kidLabel: string) => void;
  onShareKidInvoice: (kid: Kid, enquiry: Enquiry, kidLabel: string) => void;
  // Kid-side counterpart to the adult row's "Clear Follow-up" kebab entry —
  // setting/editing stays on the row's own "Set Follow-up" chip, same as
  // the adult side.
  onClearKidFollowUp: (kid: Kid) => void;
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
  kidsByEnquiry, kidRowLabel, onOpenKidPayment, onMarkKidNotInterested, onReopenKid,
  onUpdateKidStatus, onAdvanceKid, onToggleKidNoShow, onDeleteKid, onViewKidDetails,
  invoiceBusyId, onDownloadKidInvoice, onShareKidInvoice, onClearKidFollowUp,
}: AdminEnquiriesDesktopTableProps) {
  // Only used for the "Open Full CRM Page" link below — the desktop table
  // otherwise has zero navigation behavior of its own (see the component
  // doc comment). Mirrors AdminEnquiriesMobileCards' "View Full CRM"
  // button, which is the only way to reach /admin/enquiries/:id (the page
  // with the per-kid Kids card, Activity Timeline, etc) on mobile — before
  // this, the desktop table had no equivalent at all; clicking a name here
  // only ever opened AdminDetailsModal's lightweight summary, which never
  // rendered kids as individual rows.
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
              const realKids = kidsByEnquiry[e.id] || [];
              const kidRows = realKids.length > 0
                ? realKids.map((kid, ki) => ({
                    key: kid.id,
                    label: kidRowLabel(kid, ki),
                    onPayment: () => onOpenKidPayment(kid, e.trip_id),
                    paymentText: kid.amount ? `${formatPrice(kid.amount_paid || 0)} / ${formatPrice(kid.amount)}` : 'No fee set yet',
                    // Only real kid rows carry their own status/action —
                    // placeholder rows (below) are just a bare headcount
                    // with no kid record to update yet.
                    realKid: kid as Kid | null,
                  }))
                : kidDisplayRows(e).map(kr => ({
                    key: kr.id,
                    label: `Kid ${kr.index}`,
                    onPayment: () => openPayment(e),
                    paymentText: e.kids_amount ? `${formatPrice(e.kids_amount_paid || 0)} / ${formatPrice(e.kids_amount)}` : 'No kids fee set',
                    realKid: null as Kid | null,
                  }));
              // Kid row kebab — mirrors buildRowActions for the adult row
              // just above, action for action: Edit/View Details, a
              // single contextual "next step" instead of every status
              // jump at once (see nextKidManualAction), the same Not
              // Interested/Reopen pair the adult side offers, a single
              // Cancel action in place of Cancel Booking, then Delete.
              const buildKidActions = (kid: { realKid: Kid | null; onPayment: () => void; label: string }): ActionMenuItem[] => {
                const rk = kid.realKid;
                // Real kid -> its own full page is now reachable via the
                // "Open Full CRM Page" icon-link next to its name (see the
                // name cell below) — mirrors the adult row, which
                // likewise keeps that link out of its own kebab. No
                // record yet -> nothing of its own to show, falls back to
                // the enquiry page.
                const items: ActionMenuItem[] = [
                  ...(rk ? [] : [{ label: 'View Enquiry', icon: Eye, onClick: () => navigate(`/admin/enquiries/${e.id}`) }]),
                  { label: 'Manage Payment', icon: IndianRupee, onClick: kid.onPayment },
                ];
                // Download/Share Invoice — full parity with the adult
                // kebab's own pair (useRowActions.ts), gated on money
                // actually having moved for this kid (there's no
                // booking_id equivalent to gate on the way the adult side
                // does, so amount_paid > 0 is the direct substitute).
                if (rk && rk.amount_paid > 0) {
                  items.push(
                    { label: 'Download Invoice', icon: FileText, onClick: () => onDownloadKidInvoice(rk, e, kid.label), disabled: invoiceBusyId === rk.id },
                    { label: 'Share Invoice', icon: Share2, onClick: () => onShareKidInvoice(rk, e, kid.label), disabled: invoiceBusyId === rk.id },
                  );
                }
                if (rk) {
                  // nma shown as its own visible chip on the row already
                  // (dispatched via onAdvanceKid, which routes a kid's
                  // first "Mark Contacted" through the Log Call Outcome
                  // popup — see AdminEnquiries' handleAdvanceKid) — not
                  // duplicated here, mirroring the mobile kid card's own
                  // buildKidActions and the adult row's kebab (neither
                  // repeats their own nma chip either).
                  if (canMarkKidNotInterested(rk)) items.push({ label: 'Not Interested', icon: UserMinus, onClick: () => onMarkKidNotInterested(rk) });
                  if (canReopenKid(rk)) items.push({ label: 'Reopen', icon: RefreshCw, onClick: () => onReopenKid(rk) });
                  // Clear Follow-up — counterpart to the adult kebab's own
                  // entry; setting/editing stays on the row's "Set
                  // Follow-up" chip, same convention as the adult side.
                  if (canSetKidFollowUp(rk) && rk.follow_up_at) {
                    items.push({ label: 'Clear Follow-up', icon: X, onClick: () => onClearKidFollowUp(rk) });
                  }
                  // Undo Check In — counterpart to the adult kebab's own
                  // entry, and the only way back to Mark Cancelled below
                  // once a kid's checked in (see canCancelKid).
                  if (rk.status === 'checked_in') {
                    items.push({ label: 'Undo Check In', icon: LogIn, onClick: () => onUpdateKidStatus(rk, 'confirmed') });
                  }
                  if (rk.status === 'cancelled') {
                    items.push({ label: 'Reopen (Undo Cancel)', icon: RefreshCw, onClick: () => onUpdateKidStatus(rk, 'pending') });
                  } else if (canCancelKid(rk)) {
                    items.push({ label: 'Mark Cancelled', icon: XCircle, danger: true, onClick: () => onUpdateKidStatus(rk, 'cancelled') });
                  }
                  // Independent attendance flag — same Mark/Undo No Show
                  // pair the adult kebab offers (useRowActions.ts).
                  if (rk.is_no_show) {
                    items.push({ label: 'Undo No Show', icon: UserCheck, onClick: () => onToggleKidNoShow(rk, false) });
                  } else if (canMarkKidNoShow(rk)) {
                    items.push({ label: 'Mark No Show', icon: UserX, onClick: () => onToggleKidNoShow(rk, true) });
                  }
                  items.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => onDeleteKid(rk) });
                }
                return items;
              };
              return (
                <Fragment key={e.id}>
                <motion.tr
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
                        <p className="font-medium text-dark truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                          {e.full_name}
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
                        title="Open Full CRM Page — Kids, Activity Timeline, Invoices, and every other detail live here"
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
                        title={`${groupLabel(e)} — part of a group booking of ${e.group_size}${e.kids_count ? `, plus ${e.kids_count} kid${e.kids_count > 1 ? 's' : ''} (no seat needed)` : ''}`}
                        className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                      >
                        <Users size={12} className="shrink-0" aria-hidden="true" /> {groupLabel(e)} · {e.group_seq}/{e.group_size}
                        {!!e.kids_count && (
                          <>
                            <span className="opacity-50">+</span>
                            <Baby size={12} className="shrink-0" aria-hidden="true" /> {e.kids_count} {e.kids_count > 1 ? 'Kids' : 'Kid'}
                          </>
                        )}
                      </span>
                    ) : (
                      <span
                        title={`Booked individually, not part of a group${e.kids_count ? `, plus ${e.kids_count} kid${e.kids_count > 1 ? 's' : ''} (no seat needed)` : ''}`}
                        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md shrink-0 whitespace-nowrap bg-slate-100 text-dark-muted"
                      >
                        <User size={12} className="shrink-0" aria-hidden="true" /> Solo
                        {!!e.kids_count && (
                          <>
                            <span className="opacity-50">+</span>
                            <Baby size={12} className="shrink-0" aria-hidden="true" /> {e.kids_count} {e.kids_count > 1 ? 'Kids' : 'Kid'}
                          </>
                        )}
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
                {kidRows.map(kid => (
                  <motion.tr
                    key={kid.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`opacity-80 ${clr ? clr.row : 'bg-slate-50/40'}`}
                  >
                    <td className="px-3 py-4" />
                    <td className="px-3 py-4 hidden md:table-cell" />
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 pl-4">
                        <p className="font-medium text-dark-muted flex items-center gap-1.5 min-w-0">
                          <Baby size={13} className="shrink-0" aria-hidden="true" />
                          {kid.label}
                          <span className="text-dark-muted/60 font-normal text-xs">of {e.full_name}</span>
                        </p>
                        {/* Kid's own equivalent of the adult name cell's
                            "Open Full CRM Page" link just above — real kid
                            only, since a placeholder row has no page of
                            its own to open (see buildKidActions' matching
                            "View Enquiry" fallback in the kebab instead). */}
                        {kid.realKid && (
                          <button
                            type="button"
                            onClick={() => onViewKidDetails(kid.realKid!)}
                            title={`Open Full CRM Page for ${kid.label} — own status, payment, follow-up`}
                            aria-label={`Open full CRM page for ${kid.label}`}
                            className="shrink-0 text-dark-muted hover:text-primary p-1 -m-1 rounded transition-colors"
                          >
                            <ArrowSquareOut size={13} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap">
                      <span
                        title={`${groupLabel(e)} — travelling with ${e.full_name}, no seat needed`}
                        className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                      >
                        {e.group_size && e.group_size > 1 ? (
                          <>
                            <Users size={12} className="shrink-0" aria-hidden="true" /> {groupLabel(e)}
                          </>
                        ) : (
                          <>
                            <User size={12} className="shrink-0" aria-hidden="true" /> Solo
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap">
                      <span
                        title="Kids share the booking's food preference — not tracked individually"
                        className={`inline-flex items-center gap-1 text-xs font-button font-semibold whitespace-nowrap ${
                          e.food_preference === 'veg' ? 'text-green-700' : e.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark-muted'
                        }`}
                      >
                        <FoodMark type={foodPreferenceKey(e)} size={12} /> {food.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-dark-muted hidden sm:table-cell" title="Same contact as the booking">
                      <p className="text-xs truncate">{e.email}</p>
                      <p className="text-xs mt-0.5">{e.phone}</p>
                    </td>
                    <td className="px-4 py-4 text-dark-muted hidden lg:table-cell truncate">
                      <span className="text-xs">{srcCfg.label}</span>
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
                      <button
                        onClick={kid.onPayment}
                        title={`Manage ${kid.label}'s own payment — independent of every other kid on this booking`}
                        className="text-left hover:opacity-75 transition-opacity"
                      >
                        <p className="text-dark text-xs">
                          <span className="font-medium">Included</span>
                          <span className="text-dark-muted"> · </span>
                          <span className="text-dark-muted">{kid.paymentText}</span>
                        </p>
                      </button>
                    </td>
                    <td className="px-2 py-4 text-center">
                      {kid.realKid ? (() => {
                        const ksb = kidStatusBadge(kid.realKid!);
                        const reasonLabel = kidNotInterestedReasonLabel(kid.realKid!);
                        return (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <span title={reasonLabel ? `${kid.label}'s own status — independent of ${e.full_name}'s booking — ${reasonLabel}` : `${kid.label}'s own status — independent of ${e.full_name}'s booking`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${ksb.color}`}>
                              <ksb.icon size={12} className="shrink-0" aria-hidden="true" />
                              {ksb.label}
                            </span>
                            {kid.realKid!.is_no_show && (
                              <span title={`${kid.label} — marked No Show`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${KID_NO_SHOW_BADGE.color}`}>
                                <KID_NO_SHOW_BADGE.icon size={12} className="shrink-0" aria-hidden="true" />
                                {KID_NO_SHOW_BADGE.label}
                              </span>
                            )}
                          </div>
                        );
                      })() : (
                        <span title={`Booking Journey: ${jb.label} (same as ${e.full_name})`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap opacity-80 ${jb.color}`}>
                          <jb.icon size={12} className="shrink-0" aria-hidden="true" />
                          {jb.label}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-4 hidden md:table-cell">
                      {kid.realKid ? (() => {
                        const kfu = kidFollowUpStatus(kid.realKid!);
                        if (kfu) {
                          return (
                            <button
                              onClick={() => onViewKidDetails(kid.realKid!)}
                              disabled={updating === kid.realKid!.id}
                              title={`${kid.label}'s own follow-up — click to change`}
                              className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap hover:opacity-80 transition-opacity disabled:opacity-50 ${kfu.color}`}
                            >
                              <kfu.icon size={12} className="shrink-0" aria-hidden="true" />
                              {kfu.label}
                            </button>
                          );
                        }
                        if (canSetKidFollowUp(kid.realKid!)) {
                          return (
                            <button
                              onClick={() => onViewKidDetails(kid.realKid!)}
                              disabled={updating === kid.realKid!.id}
                              title={`Set a follow-up reminder for ${kid.label}`}
                              className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-md border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                            >
                              <CalendarClock size={12} className="shrink-0" aria-hidden="true" /> Set
                            </button>
                          );
                        }
                        return <span className="text-dark-muted/50 text-xs">—</span>;
                      })() : <span className="text-dark-muted/50 text-xs">—</span>}
                    </td>
                    <td className="px-2 py-4 text-center">
                      <span title="Kids never occupy a seat or count towards capacity" className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted">
                        <Baby size={12} className="shrink-0" aria-hidden="true" /> No seat
                      </span>
                    </td>
                    <td className="px-2 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Single contextual "next step" pill — mirrors
                            the adult row's nma button just above. */}
                        {kid.realKid && nextKidManualAction(kid.realKid) && (() => {
                          const knma = nextKidManualAction(kid.realKid!)!;
                          return (
                            <button
                              onClick={() => onAdvanceKid(kid.realKid!, knma.status, kid.label, e)}
                              disabled={updating === kid.realKid!.id}
                              title={knma.label}
                              className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/5 transition-colors whitespace-nowrap disabled:opacity-50"
                            >
                              <knma.icon size={12} className="shrink-0" aria-hidden="true" />
                              {knma.label}
                            </button>
                          );
                        })()}
                        {/* "Not Interested" used to have its own
                            standalone icon button here too — dropped
                            since it's already one click away in the kebab
                            below (see buildKidActions), and having it
                            twice on the same row was redundant. This slot
                            now carries the same View Full CRM / View
                            Enquiry jump the kid card's mobile footer
                            already has next to its own Mark Contacted/nma
                            chip, which the desktop table had no
                            equivalent of before. */}
                        <button
                          onClick={() => (kid.realKid ? onViewKidDetails(kid.realKid) : navigate(`/admin/enquiries/${e.id}`))}
                          disabled={!!kid.realKid && updating === kid.realKid.id}
                          title={kid.realKid ? 'View Full CRM' : 'View Enquiry'}
                          className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1.5 rounded border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          {kid.realKid ? 'View Full CRM' : 'View Enquiry'} <ArrowRight size={12} className="shrink-0" aria-hidden="true" />
                        </button>
                        {/* Counterpart to the Not Interested kebab item —
                            Interested marking, mirroring the adult side's
                            Reopen Enquiry action. */}
                        {kid.realKid && canReopenKid(kid.realKid) && (
                          <button
                            onClick={() => onReopenKid(kid.realKid!)}
                            disabled={updating === kid.realKid.id}
                            aria-label={`Reopen ${kid.label}`}
                            title="Reopen"
                            className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1.5 rounded border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            <RefreshCw size={12} className="shrink-0" aria-hidden="true" />
                          </button>
                        )}
                        {/* The kebab that was missing here — every kid row
                            now gets the same ⋮ menu the adult row has,
                            instead of only the two quick-action buttons
                            above (which vanish once neither applies). */}
                        <ActionsMenu
                          disabled={!!kid.realKid && updating === kid.realKid.id}
                          items={buildKidActions(kid)}
                          label={`${kid.label} actions`}
                        />
                      </div>
                    </td>
                  </motion.tr>
                ))}
                </Fragment>
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
