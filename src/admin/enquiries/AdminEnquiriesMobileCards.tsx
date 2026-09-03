import { Fragment } from 'react';
import type { MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  XCircle,
  ChatCircle as MessageCircle,
  CaretDown as ChevronDown,
  CurrencyInr as IndianRupee,
  Users,
  User,
  Baby,
  ForkKnife as Utensils,
  CalendarDot as CalendarClock,
  Briefcase,
  Buildings as Building2,
  Package,
  CalendarBlank as CalendarDays,
  Bird,
  FileText,
  ShareNetwork as Share2,
  Globe,
  ArrowRight,
  UserMinus,
  ArrowsClockwise as RefreshCw,
  Eye,
  Pencil,
  SignIn as LogIn,
  Trash as Trash2,
  UserCheck,
  UserMinus as UserX,
  X,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import FoodMark from '../../components/ui/FoodMark';
import { TablePagination, ContactQuickLinks } from '../../components/ui/DataTableChrome';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { Enquiry, Kid, KidStatus, UpcomingTrip } from '../../types/types-index';
import { formatDate, formatTime, formatPrice } from '../../utils/utils-index';
import {
  PACKAGE_CONFIG,
  foodBadge, foodPreferenceKey, SOURCE_CONFIG,
  journeyBadge, nextManualAction,
  closedReasonLabel, canSetFollowUp, followUpStatus,
  canSetBookingFollowUp, bookingFollowUpStatus,
  kidStatusBadge, canMarkKidNotInterested, canReopenKid, kidNotInterestedReasonLabel, nextKidManualAction,
  canSetKidFollowUp, canCancelKid, canMarkKidNoShow, KID_NO_SHOW_BADGE,
} from './AdminEnquiryCommon';
import { isGeneralContactMessage, groupColorFor, kidDisplayRows } from './enquiryGrouping';
import { paymentBalance, paymentFilterKey, refundStatus } from './AdminEnquiriesShared';

interface AdminEnquiriesMobileCardsProps {
  // Data for the current page
  paginatedEnquiries: Enquiry[];
  enquiriesSafePage: number;
  enquiriesRangeStart: number;
  enquiriesRangeEnd: number;
  enquiriesTotalPages: number;
  totalFiltered: number;
  setCurrentPage: (page: number) => void;

  // Expand/collapse
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;

  // Selection
  selectedIds: Set<string>;
  toggleSelectOne: (id: string) => void;

  // Grouping / highlight
  activeGroup: { key: string; title: string; trip?: UpcomingTrip } | null;
  highlightId: string | null;
  groupColor: (e: Enquiry) => ReturnType<typeof groupColorFor>;
  groupLabel: (e: Enquiry) => string;
  cardRefs: MutableRefObject<Record<string, HTMLElement | null>>;

  // Row actions
  updating: string | null;
  invoiceBusyId: string | null;
  handleDownloadInvoice: (e: Enquiry) => void;
  handleShareInvoice: (e: Enquiry) => void;
  openPayment: (e: Enquiry) => void;
  openFollowUpModal: (e: Enquiry) => void;
  setBookingFollowUpTarget: (e: Enquiry) => void;
  handleAdvance: (e: Enquiry) => void;
  buildRowActions: (e: Enquiry) => ActionMenuItem[];

  // Kids — see AdminEnquiriesDesktopTable's matching props.
  kidsByEnquiry: Record<string, Kid[]>;
  kidRowLabel: (kid: Kid, fallbackIndex: number) => string;
  onOpenKidPayment: (kid: Kid, tripId: string | undefined) => void;
  // Same one-click "Not Interested" action as the desktop table — see
  // AdminEnquiries' handleMarkKidNotInterested.
  onMarkKidNotInterested: (kid: Kid) => void;
  // Counterpart to the above — see AdminEnquiries' handleReopenKid.
  onReopenKid: (kid: Kid) => void;
  // Powers the kid card's kebab menu — see AdminEnquiriesDesktopTable's
  // matching props / AdminEnquiries' handleUpdateKidStatus/handleDeleteKid.
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
  // Opens the Edit Details modal (name/age/food_preference) for one kid —
  // see AdminKidEditModal.tsx. Mirrors the adult card's own Edit Details
  // kebab entry.
  onEditKid: (kid: Kid) => void;
  // Kid-side Download/Share Invoice and Clear Follow-up — see
  // AdminEnquiriesDesktopTable's matching props for the reasoning. Reuses
  // this component's own `invoiceBusyId` prop above (keyed off kid.id).
  onDownloadKidInvoice: (kid: Kid, enquiry: Enquiry, kidLabel: string) => void;
  onShareKidInvoice: (kid: Kid, enquiry: Enquiry, kidLabel: string) => void;
  onClearKidFollowUp: (kid: Kid) => void;
}

/** Mobile card-list view of the enquiries list (tap a card to expand full
 *  details), plus its own "Showing X–Y of N" + pagination footer —
 *  extracted from AdminEnquiries.tsx's JSX return (see that file's history
 *  for the original single-component version). Purely presentational, same
 *  as AdminEnquiriesDesktopTable: every piece of state and every handler is
 *  owned by AdminEnquiries (via its hooks) and passed in as props. */
export default function AdminEnquiriesMobileCards({
  paginatedEnquiries, enquiriesSafePage, enquiriesRangeStart, enquiriesRangeEnd,
  enquiriesTotalPages, totalFiltered, setCurrentPage,
  expandedId, setExpandedId,
  selectedIds, toggleSelectOne,
  activeGroup, highlightId, groupColor, groupLabel, cardRefs,
  updating, invoiceBusyId, handleDownloadInvoice, handleShareInvoice,
  openPayment, openFollowUpModal, setBookingFollowUpTarget, handleAdvance, buildRowActions,
  kidsByEnquiry, kidRowLabel, onOpenKidPayment, onMarkKidNotInterested, onReopenKid,
  onUpdateKidStatus, onAdvanceKid, onToggleKidNoShow, onDeleteKid, onEditKid,
  onDownloadKidInvoice, onShareKidInvoice, onClearKidFollowUp,
}: AdminEnquiriesMobileCardsProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Mobile: tap a card to expand full details */}
      <div className="sm:hidden space-y-3">
        {paginatedEnquiries.map((e, idx) => {
          const jb = journeyBadge(e);
          const nma = nextManualAction(e);
          const srcCfg = SOURCE_CONFIG[e.source] || SOURCE_CONFIG.other;
          const isOpen = expandedId === e.id;
          const isHighlighted = highlightId === e.id;
          const clr = groupColor(e);
          const realKids = kidsByEnquiry[e.id] || [];
          const kidRows = realKids.length > 0
            ? realKids.map((kid, ki) => ({
                id: kid.id,
                label: kidRowLabel(kid, ki),
                realKid: kid as Kid | null,
              }))
            : kidDisplayRows(e).map(kr => ({
                id: kr.id,
                label: `Kid ${kr.index}`,
                realKid: null as Kid | null,
              }));
          // Kid card kebab — see AdminEnquiriesDesktopTable's matching
          // buildKidActions for the reasoning.
          const buildKidActions = (kid: { realKid: Kid | null; label: string }): ActionMenuItem[] => {
            const rk = kid.realKid;
            // Real kid -> Edit Details opens name/age/food right from the
            // kebab (see AdminKidEditModal.tsx) — mirrors the adult card's
            // own Edit Details entry. No record yet -> nothing of its own
            // to edit, falls back to the enquiry page, same as
            // AdminEnquiriesDesktopTable's matching buildKidActions.
            const items: ActionMenuItem[] = [
              ...(rk ? [{ label: 'Edit Details', icon: Pencil, onClick: () => onEditKid(rk) }] : [{ label: 'View Enquiry', icon: Eye, onClick: () => navigate(`/admin/enquiries/${e.id}`) }]),
              { label: 'Manage Payment', icon: IndianRupee, onClick: () => (kid.realKid ? onOpenKidPayment(kid.realKid, e.trip_id) : openPayment(e)) },
            ];
            // Download/Share Invoice — see AdminEnquiriesDesktopTable's
            // matching buildKidActions for the reasoning/gating.
            if (rk && rk.amount_paid > 0) {
              items.push(
                { label: 'Download Invoice', icon: FileText, onClick: () => onDownloadKidInvoice(rk, e, kid.label), disabled: invoiceBusyId === rk.id },
                { label: 'Share Invoice', icon: Share2, onClick: () => onShareKidInvoice(rk, e, kid.label), disabled: invoiceBusyId === rk.id },
              );
            }
            if (rk) {
              // nma shown as its own visible button on the card footer
              // now (mirrors the adult row's nma button) — not
              // duplicated here.
              if (canMarkKidNotInterested(rk)) items.push({ label: 'Not Interested', icon: UserMinus, onClick: () => onMarkKidNotInterested(rk) });
              if (canReopenKid(rk)) items.push({ label: 'Reopen', icon: RefreshCw, onClick: () => onReopenKid(rk) });
              // Clear Follow-up — see AdminEnquiriesDesktopTable's matching
              // buildKidActions for the reasoning.
              if (canSetKidFollowUp(rk) && rk.follow_up_at) {
                items.push({ label: 'Clear Follow-up', icon: X, onClick: () => onClearKidFollowUp(rk) });
              }
              if (rk.status === 'checked_in') {
                items.push({ label: 'Undo Check In', icon: LogIn, onClick: () => onUpdateKidStatus(rk, 'confirmed') });
              }
              if (rk.status === 'cancelled') {
                items.push({ label: 'Reopen (Undo Cancel)', icon: RefreshCw, onClick: () => onUpdateKidStatus(rk, 'pending') });
              } else if (canCancelKid(rk)) {
                items.push({ label: 'Mark Cancelled', icon: XCircle, danger: true, onClick: () => onUpdateKidStatus(rk, 'cancelled') });
              }
              // Independent attendance flag — same Mark/Undo No Show pair
              // the adult kebab offers (useRowActions.ts).
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
            <motion.div
              ref={(el) => { cardRefs.current[e.id] = el; }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`bg-white rounded-lg shadow-card overflow-hidden transition-shadow duration-1000 ${
                isHighlighted ? 'ring-2 ring-primary/40' : ''
              }`}
            >
              <div className={`w-full flex items-center gap-1.5 px-3 py-2.5 ${clr ? clr.row : ''}`}>
                <label className="shrink-0 flex items-center justify-center w-11 h-11 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(e.id)}
                    onChange={() => toggleSelectOne(e.id)}
                    aria-label={`Select ${e.full_name}`}
                    className="w-5 h-5 rounded border-background-warm accent-primary cursor-pointer"
                  />
                </label>
              <button
                onClick={() => setExpandedId(isOpen ? null : e.id)}
                aria-expanded={isOpen}
                className="flex-1 min-w-0 flex flex-col text-left py-2.5 pr-1"
              >
                <div className="w-full flex items-start justify-between gap-3">
                  <p className="font-medium text-sm text-dark truncate flex items-center gap-1.5 min-w-0">
                    <span className="text-dark-muted text-xs font-normal shrink-0">#{idx + 1}</span>
                    {e.full_name}
                    {e.package_type === 'early_bird' && (
                      <span
                        title="Early Bird"
                        className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 shrink-0"
                      >
                        <Bird size={11}  aria-hidden="true" />
                      </span>
                    )}
                    {e.cancelled_at && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${e.is_no_show ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                        <XCircle size={9}  aria-hidden="true" /> {e.is_no_show ? 'No Show' : 'Cancelled'}
                      </span>
                    )}
                    {!e.trip_id && !activeGroup && (
                      <span
                        title={isGeneralContactMessage(e) ? 'A "Contact Us" message from the website — not linked to any trip' : 'Logged without picking a trip'}
                        className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-dark-muted shrink-0"
                      >
                        <MessageCircle size={9}  aria-hidden="true" /> General
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {followUpStatus(e)?.isDue && (
                      <span title={followUpStatus(e)!.label} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${followUpStatus(e)!.color}`}>
                        <CalendarClock size={12} className="shrink-0" aria-hidden="true" />
                      </span>
                    )}
                    {bookingFollowUpStatus(e)?.isDue && (
                      <span title={bookingFollowUpStatus(e)!.label} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${bookingFollowUpStatus(e)!.color}`}>
                        <CalendarClock size={12} className="shrink-0" aria-hidden="true" />
                      </span>
                    )}
                    <span title={closedReasonLabel(e) ? `Booking Journey: ${jb.label} — ${closedReasonLabel(e)}` : `Booking Journey: ${jb.label}`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                      <jb.icon size={12} className="shrink-0" aria-hidden="true" />
                      {jb.label}
                    </span>
                    <ChevronDown size={16} className={`text-dark-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </div>
                </div>
                <p className="text-dark-muted text-xs truncate mt-0.5">{e.phone}</p>
                <div className="w-full flex items-center flex-nowrap gap-1.5 mt-1.5 overflow-x-auto no-scrollbar">
                  {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                    <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap bg-green-100 text-green-700 shrink-0">
                      Due {formatPrice(paymentBalance(e)!)}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold whitespace-nowrap shrink-0 ${
                    e.food_preference === 'veg' ? 'text-green-700' : e.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark-muted'
                  }`}>
                    <FoodMark type={foodPreferenceKey(e)} size={9} /> {foodBadge(e).label}
                  </span>
                  {e.group_size && e.group_size > 1 ? (
                    <span
                      title={`${groupLabel(e)} — part of a group booking of ${e.group_size}${e.kids_count ? `, plus ${e.kids_count} kid${e.kids_count > 1 ? 's' : ''} (no seat needed)` : ''}`}
                      className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                    >
                      <Users size={9}  aria-hidden="true" /> {groupLabel(e).replace(/^Group /, '')} · {e.group_seq}/{e.group_size}
                      {!!e.kids_count && (
                        <>
                          <span className="opacity-50">+</span>
                          <Baby size={9} aria-hidden="true" /> {e.kids_count} {e.kids_count > 1 ? 'Kids' : 'Kid'}
                        </>
                      )}
                    </span>
                  ) : (
                    <span
                      title={`Booked individually, not part of a group${e.kids_count ? `, plus ${e.kids_count} kid${e.kids_count > 1 ? 's' : ''} (no seat needed)` : ''}`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap bg-slate-100 text-dark-muted"
                    >
                      <User size={9}  aria-hidden="true" /> Solo
                      {!!e.kids_count && (
                        <>
                          <span className="opacity-50">+</span>
                          <Baby size={9} aria-hidden="true" /> {e.kids_count} {e.kids_count > 1 ? 'Kids' : 'Kid'}
                        </>
                      )}
                    </span>
                  )}
                </div>
              </button>
              </div>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-background-warm space-y-3">
                  <div className="grid grid-cols-2 gap-x-3 pt-3 pb-3 border-b border-background-warm">
                    <div>
                      <p className="text-dark-muted text-xs">Phone</p>
                      <p className="text-dark text-sm truncate">{e.phone}</p>
                    </div>
                    <div>
                      <p className="text-dark-muted text-xs">Email</p>
                      <p className="text-dark text-sm truncate">{e.email}</p>
                    </div>
                  </div>

                  <div className="divide-y divide-background-warm">
                    {/* Trip (3.8) — spelled out explicitly, including
                        the no-trip case, instead of only being
                        inferable from which Trip filter group the
                        admin happens to be scoped to. */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          <Briefcase size={15}  aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">Trip</p>
                          <p className="text-dark text-sm truncate">
                            {e.trip_id ? e.trip_title : (
                              <span className="text-dark-muted italic">
                                {isGeneralContactMessage(e) ? 'None — Contact Us message' : 'None — logged without a trip'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          <User size={15}  aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">Age</p>
                          <p className="text-dark text-sm truncate">{e.age ?? '—'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          <Building2 size={15}  aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">City</p>
                          <p className="text-dark text-sm truncate">{e.city || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          <Utensils size={15}  aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">Food Preference</p>
                          <p className={`text-sm truncate flex items-center gap-1 ${
                            e.food_preference === 'veg' ? 'text-green-700 font-medium' : e.food_preference === 'non_veg' ? 'text-red-700 font-medium' : 'text-dark'
                          }`}>
                            {(e.food_preference === 'veg' || e.food_preference === 'non_veg') && <FoodMark type={e.food_preference} size={11} />}
                            {e.food_preference === 'veg' ? 'Veg' : e.food_preference === 'non_veg' ? 'Non-veg' : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          <CalendarDays size={15}  aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">Date &amp; Time</p>
                          <p className="text-dark text-sm truncate">{formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          <p className="text-dark-muted text-xs truncate">{formatTime(e.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          <Globe size={15}  aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">Source</p>
                          <p className="text-dark text-sm truncate">{srcCfg.label}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3 items-center">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          {e.package_type === 'early_bird' ? <Bird size={15}  aria-hidden="true" /> : <Package size={15}  aria-hidden="true" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">Package</p>
                          <p className="text-dark text-sm truncate">{PACKAGE_CONFIG[e.package_type || 'normal'].label}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                          <MessageCircle size={15}  aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-dark-muted text-xs">Quick Contact</p>
                          <ContactQuickLinks phone={e.phone} email={e.email} name={e.full_name} tripTitle={e.trip_title} size="md" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {e.message && (
                    <div>
                      <p className="text-dark-muted text-xs">Notes</p>
                      <p className="text-dark text-sm">{e.message}</p>
                    </div>
                  )}

                  {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                    <div className="bg-amber-50 rounded-md px-3 py-2">
                      <p className="text-amber-700 text-xs font-medium">Balance due: {formatPrice(paymentBalance(e)!)}</p>
                    </div>
                  )}

                  {refundStatus(e) && (
                    <div className={`rounded-md px-3 py-2 ${refundStatus(e)!.color}`}>
                      <p className="text-xs font-medium">{refundStatus(e)!.label}</p>
                    </div>
                  )}

                  {e.booking_id && (
                    <div className="flex items-center justify-between bg-background-warm rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-dark-muted text-[10px]">Booking ID</p>
                        <p className="text-dark text-xs font-mono truncate">{e.booking_id}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => handleDownloadInvoice(e)}
                          disabled={invoiceBusyId === e.id}
                          title="Download invoice"
                          aria-label="Download invoice"
                          className="p-2 -m-1 text-primary hover:text-primary-dark disabled:opacity-50"
                        >
                          <FileText size={16}  aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => handleShareInvoice(e)}
                          disabled={invoiceBusyId === e.id}
                          title="Share invoice"
                          aria-label="Share invoice"
                          className="p-2 -m-1 text-primary hover:text-primary-dark disabled:opacity-50"
                        >
                          <Share2 size={16}  aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action row — Follow-up chip (if applicable) +
                      Journey Advance (the one obvious next step for
                      this row, e.g. "Mark Contacted" on a fresh lead)
                      + the primary "View Full CRM" CTA + kebab. Journey
                      Advance used to only live inside the kebab, which
                      buried the single highest-leverage action for a
                      New Enquiry card behind Record Payment/Edit/View/
                      Not Interested/Delete — now it gets the same
                      visible-chip treatment as Set Follow-up, ahead of
                      View Full CRM (a navigation action, not a
                      forward-moving one). Record Payment, Edit Details,
                      View Details, Not Interested, and Delete remain in
                      the kebab so the row doesn't have to fit every
                      possible action inline. Themed to match the
                      "Payment" (outline) / "Add Invoice" (primary)
                      buttons on the enquiry detail page — same Button
                      component, same size, same variants — so the
                      list and detail views feel consistent. */}
                  {/* flex-wrap so a New Enquiry (Follow-up n/a) still
                      fits Mark Contacted + View Full CRM + kebab on one
                      line, while a Contacted lead with both a Follow-up
                      chip and Log Call Outcome showing at once wraps to
                      a second line instead of squeezing four controls
                      into an unreadable row. Kebab stays shrink-0 so it
                      never grows/shrinks with the wrap. */}
                  <div className="flex items-center gap-2 pt-3 flex-wrap">
                    {(followUpStatus(e) || canSetFollowUp(e) || bookingFollowUpStatus(e) || canSetBookingFollowUp(e)) && (
                      <Button
                        variant={
                          followUpStatus(e)?.isOverdue || bookingFollowUpStatus(e)?.isOverdue ? 'outlineDanger'
                          : followUpStatus(e) || bookingFollowUpStatus(e) ? 'secondary'
                          : 'outline'
                        }
                        size="sm"
                        onClick={() => (followUpStatus(e) || canSetFollowUp(e) ? openFollowUpModal(e) : setBookingFollowUpTarget(e))}
                        disabled={updating === e.id}
                        className="flex-1 min-w-[140px] text-xs !gap-1.5 whitespace-nowrap"
                      >
                        <CalendarClock size={14}  aria-hidden="true" />
                        {followUpStatus(e)?.label || bookingFollowUpStatus(e)?.label || 'Set Follow-up'}
                      </Button>
                    )}
                    {nma && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAdvance(e)}
                        disabled={updating === e.id}
                        className="flex-1 min-w-[140px] text-xs !gap-1.5 whitespace-nowrap"
                      >
                        <nma.icon size={14} aria-hidden="true" />
                        {nma.label}
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                      className="flex-1 min-w-[140px] text-xs !gap-1.5 whitespace-nowrap"
                    >
                      View Full CRM <ArrowRight size={14}  aria-hidden="true" />
                    </Button>
                    <div className="shrink-0">
                      <ActionsMenu
                        disabled={updating === e.id}
                        items={[
                          { label: 'Record Payment', icon: IndianRupee, onClick: () => openPayment(e) },
                          ...buildRowActions(e),
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
            {kidRows.map(kid => {
              const isKidOpen = expandedId === kid.id;
              return (
              <motion.div
                key={kid.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-lg shadow-card overflow-hidden"
              >
                <div className="w-full flex items-center gap-1.5 px-3 py-2.5">
                  <span
                    title="Kids don't have their own record — travelling with this booking, so there's nothing separate to select"
                    className="shrink-0 flex items-center justify-center w-11 h-11 text-dark-muted/30"
                  >
                    <Baby size={18} aria-hidden="true" />
                  </span>
                  <button
                    onClick={() => setExpandedId(isKidOpen ? null : kid.id)}
                    aria-expanded={isKidOpen}
                    className="flex-1 min-w-0 flex flex-col text-left py-2.5 pr-1"
                  >
                    <div className="w-full flex items-start justify-between gap-3">
                      <p className="font-medium text-sm text-dark truncate flex items-center gap-1.5 min-w-0">
                        <span className="text-dark-muted text-xs font-normal shrink-0">{kid.label}</span>
                        <span className="text-dark-muted text-xs font-normal truncate">of {e.full_name}</span>
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {kid.realKid ? (() => {
                          const ksb = kidStatusBadge(kid.realKid!);
                          const reasonLabel = kidNotInterestedReasonLabel(kid.realKid!);
                          return (
                            <>
                              {kid.realKid!.is_no_show && (
                                <span title={`${kid.label} — marked No Show`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-1.5 py-1 rounded-md whitespace-nowrap ${KID_NO_SHOW_BADGE.color}`}>
                                  <KID_NO_SHOW_BADGE.icon size={12} className="shrink-0" aria-hidden="true" />
                                </span>
                              )}
                              <span title={reasonLabel ? `${kid.label}'s own status — independent of ${e.full_name}'s booking — ${reasonLabel}` : `${kid.label}'s own status — independent of ${e.full_name}'s booking`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${ksb.color}`}>
                                <ksb.icon size={12} className="shrink-0" aria-hidden="true" />
                                {ksb.label}
                              </span>
                            </>
                          );
                        })() : (
                          <span title={`Booking Journey: ${jb.label} (same as ${e.full_name})`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                            <jb.icon size={12} className="shrink-0" aria-hidden="true" />
                            {jb.label}
                          </span>
                        )}
                        <ChevronDown size={16} className={`text-dark-muted transition-transform ${isKidOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </div>
                    </div>
                    <p className="text-dark-muted text-xs truncate mt-0.5">{e.phone}</p>
                    <div className="w-full flex items-center flex-nowrap gap-1.5 mt-1.5 overflow-x-auto no-scrollbar">
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold whitespace-nowrap shrink-0 ${
                        e.food_preference === 'veg' ? 'text-green-700' : e.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark-muted'
                      }`}>
                        <FoodMark type={foodPreferenceKey(e)} size={9} /> {foodBadge(e).label}
                      </span>
                      <span
                        title={`${groupLabel(e)} — travelling with ${e.full_name}, no seat needed`}
                        className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                      >
                        {e.group_size && e.group_size > 1 ? (
                          <>
                            <Users size={9} aria-hidden="true" /> {groupLabel(e).replace(/^Group /, '')}
                          </>
                        ) : (
                          <>
                            <User size={9} aria-hidden="true" /> Solo
                          </>
                        )}
                      </span>
                      <span title="Kids never occupy a seat or count towards capacity" className="inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap bg-slate-100 text-dark-muted">
                        <Baby size={9} aria-hidden="true" /> No seat
                      </span>
                    </div>
                  </button>
                </div>

                {isKidOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-background-warm space-y-3">
                    <div className="grid grid-cols-2 gap-x-3 pt-3 pb-3 border-b border-background-warm">
                      <div>
                        <p className="text-dark-muted text-xs">Phone</p>
                        <p className="text-dark text-sm truncate">{e.phone}</p>
                      </div>
                      <div>
                        <p className="text-dark-muted text-xs">Email</p>
                        <p className="text-dark text-sm truncate">{e.email}</p>
                      </div>
                    </div>

                    <div className="divide-y divide-background-warm">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <Briefcase size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Trip</p>
                            <p className="text-dark text-sm truncate">
                              {e.trip_id ? e.trip_title : (
                                <span className="text-dark-muted italic">
                                  {isGeneralContactMessage(e) ? 'None — Contact Us message' : 'None — logged without a trip'}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0" title={kid.realKid ? "Admin-entered — the public booking form doesn't collect a kid's age" : "Kids have no separate age/name record — see Enquiry.kids_count"}>
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <User size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Age</p>
                            {kid.realKid ? (
                              <p className="text-dark text-sm truncate">{kid.realKid.age ?? '—'}</p>
                            ) : (
                              <p className="text-dark text-sm truncate text-dark-muted italic">Not tracked</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <Building2 size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">City</p>
                            <p className="text-dark text-sm truncate">{e.city || '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0" title="Kids share the booking's food preference — not tracked individually">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <Utensils size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Food Preference</p>
                            <p className={`text-sm truncate flex items-center gap-1 ${
                              e.food_preference === 'veg' ? 'text-green-700 font-medium' : e.food_preference === 'non_veg' ? 'text-red-700 font-medium' : 'text-dark'
                            }`}>
                              {(e.food_preference === 'veg' || e.food_preference === 'non_veg') && <FoodMark type={e.food_preference} size={11} />}
                              {e.food_preference === 'veg' ? 'Veg' : e.food_preference === 'non_veg' ? 'Non-veg' : '—'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <CalendarDays size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Date &amp; Time</p>
                            <p className="text-dark text-sm truncate">{formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            <p className="text-dark-muted text-xs truncate">{formatTime(e.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <Globe size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Source</p>
                            <p className="text-dark text-sm truncate">{srcCfg.label}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3 items-center">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            {e.package_type === 'early_bird' ? <Bird size={15} aria-hidden="true" /> : <Package size={15} aria-hidden="true" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Package</p>
                            <p className="text-dark text-sm truncate">{PACKAGE_CONFIG[e.package_type || 'normal'].label}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <MessageCircle size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Quick Contact</p>
                            <ContactQuickLinks phone={e.phone} email={e.email} name={`${e.full_name} (${kid.label})`} tripTitle={e.trip_title} size="md" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => (kid.realKid ? onOpenKidPayment(kid.realKid, e.trip_id) : openPayment(e))}
                      title={kid.realKid ? `Manage ${kid.label}'s own payment — independent of every other kid on this booking` : `Manage ${e.full_name}'s kids fee — opens their full CRM page, same as their own booking`}
                      className="w-full text-left bg-background-warm rounded-md px-3 py-2 flex items-center gap-2.5 hover:opacity-75 transition-opacity"
                    >
                      <IndianRupee size={14} className="text-dark-muted shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-dark-muted text-[10px]">{kid.realKid ? `${kid.label}'s Fee` : 'Kids Fee (whole booking)'}</p>
                        <p className="text-dark text-xs truncate">
                          {kid.realKid
                            ? (kid.realKid.amount ? `${formatPrice(kid.realKid.amount_paid || 0)} / ${formatPrice(kid.realKid.amount)}` : 'Not set')
                            : (e.kids_amount ? `${formatPrice(e.kids_amount_paid || 0)} / ${formatPrice(e.kids_amount)}` : 'Not set')}
                        </p>
                      </div>
                    </button>

                    {/* Footer row — mirrors the adult card's own footer
                        exactly: optional Follow-up chip, Journey
                        Advance (kid's nma — "Mark Confirmed" etc, the
                        one obvious next step), primary CTA, and the
                        kebab, wrapping onto a second line if all four
                        show at once. Not Interested/Reopen/Delete and
                        the rest stay in buildKidActions' kebab menu so
                        the row doesn't try to fit every possible
                        action inline. */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Set Follow-up chip intentionally removed for kid
                          cards — kids share the booking's follow-up flow
                          via the parent enquiry, so keeping a second,
                          per-kid follow-up chip here was redundant and
                          also crowded out Mark Contacted / View Full CRM
                          onto their own row. */}
                      {kid.realKid && nextKidManualAction(kid.realKid) && (() => {
                        const knma = nextKidManualAction(kid.realKid!)!;
                        return (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onAdvanceKid(kid.realKid!, knma.status, kid.label, e)}
                            disabled={updating === kid.realKid!.id}
                            className="flex-1 min-w-[140px] text-xs !gap-1.5 whitespace-nowrap"
                          >
                            <knma.icon size={14} aria-hidden="true" /> {knma.label}
                          </Button>
                        );
                      })()}
                      {/* Kid's own equivalent of the adult card's primary
                          "View Enquiry" CTA — both a real kid record and a
                          bare placeholder (no kid record yet) land on the
                          same parent enquiry page, whose Kids card is where
                          this kid's own status/payment/follow-up live. */}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                        disabled={!!kid.realKid && updating === kid.realKid.id}
                        className="flex-1 min-w-[140px] text-xs !gap-1.5 whitespace-nowrap"
                      >
                        View Enquiry <ArrowRight size={14} aria-hidden="true" />
                      </Button>
                      <div className="shrink-0">
                        <ActionsMenu
                          disabled={!!kid.realKid && updating === kid.realKid.id}
                          items={buildKidActions(kid)}
                          label={`${kid.label} actions`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
              );
            })}
            </Fragment>
          );
        })}
      </div>

      {/* Mobile: same "Showing X–Y of N" + Prev/Next/page-number
          pagination the desktop table gets — previously mobile had
          no way to reach page 2+ at all. Wrapped in its own card so
          it reads as a distinct, easy-to-find control at the end of
          the list rather than bare text. */}
      <div className="sm:hidden bg-white rounded-lg shadow-card overflow-hidden">
        <p className="text-dark-muted text-xs text-center px-4 pt-3">
          {totalFiltered === 0 ? 'No enquiries found' : `Showing ${enquiriesRangeStart}\u2013${enquiriesRangeEnd} of ${totalFiltered} enquiries`}
        </p>
        <TablePagination
          currentPage={enquiriesSafePage}
          totalPages={enquiriesTotalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </>
  );
}
