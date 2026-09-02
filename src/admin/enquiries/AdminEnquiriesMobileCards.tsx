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
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import FoodMark from '../../components/ui/FoodMark';
import { TablePagination, ContactQuickLinks } from '../../components/ui/DataTableChrome';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { formatDate, formatTime, formatPrice } from '../../utils/utils-index';
import {
  PACKAGE_CONFIG,
  foodBadge, foodPreferenceKey, SOURCE_CONFIG,
  journeyBadge, nextManualAction,
  closedReasonLabel, canSetFollowUp, followUpStatus,
  canSetBookingFollowUp, bookingFollowUpStatus,
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
          const kidRows = kidDisplayRows(e);
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

                  {/* Simplified action row — a single "Set Follow-up"
                      chip (lead or booking, whichever applies) plus
                      a primary "View Full CRM" CTA. Payment, seat
                      status, Journey Advance, Not Interested, and the
                      rest now live in the kebab so the card footer
                      stays to these two buttons. Themed to match the
                      "Payment" (outline) / "Add Invoice" (primary)
                      buttons on the enquiry detail page — same Button
                      component, same size, same variants — so the
                      list and detail views feel consistent. */}
                  {/* All three controls fit one row: the two buttons
                      share the row via flex-1 (not fullWidth — two
                      buttons each claiming 100% width was pushing the
                      "more" kebab menu off screen) while the kebab
                      stays a fixed, always-visible width. */}
                  <div className="flex items-center gap-2 pt-3">
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
                        className="flex-1 min-w-0 text-xs !gap-1.5 whitespace-nowrap"
                      >
                        <CalendarClock size={14}  aria-hidden="true" />
                        {followUpStatus(e)?.label || bookingFollowUpStatus(e)?.label || 'Set Follow-up'}
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                      className="flex-1 min-w-0 text-xs !gap-1.5 whitespace-nowrap"
                    >
                      View Full CRM <ArrowRight size={14}  aria-hidden="true" />
                    </Button>
                    <div className="shrink-0">
                      <ActionsMenu
                        disabled={updating === e.id}
                        items={[
                          { label: 'Record Payment', icon: IndianRupee, onClick: () => openPayment(e) },
                          ...(nma ? [{ label: nma.label, icon: nma.icon, onClick: () => handleAdvance(e) }] : []),
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
                        <span className="text-dark-muted text-xs font-normal shrink-0">Kid {kid.index}</span>
                        <span className="text-dark-muted text-xs font-normal truncate">of {e.full_name}</span>
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span title={`Booking Journey: ${jb.label} (same as ${e.full_name})`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                          <jb.icon size={12} className="shrink-0" aria-hidden="true" />
                          {jb.label}
                        </span>
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
                        <div className="flex items-center gap-2.5 min-w-0" title="Kids have no separate age/name record — see Enquiry.kids_count">
                          <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                            <User size={15} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-dark-muted text-xs">Age</p>
                            <p className="text-dark text-sm truncate text-dark-muted italic">Not tracked</p>
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
                            <ContactQuickLinks phone={e.phone} email={e.email} name={`${e.full_name} (Kid ${kid.index})`} tripTitle={e.trip_title} size="md" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => openPayment(e)}
                      title={`Manage ${e.full_name}'s kids fee — opens the same Payment modal as their own booking`}
                      className="w-full text-left bg-background-warm rounded-md px-3 py-2 flex items-center gap-2.5 hover:opacity-75 transition-opacity"
                    >
                      <IndianRupee size={14} className="text-dark-muted shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-dark-muted text-[10px]">Kids Fee (whole booking)</p>
                        <p className="text-dark text-xs truncate">
                          {e.kids_amount ? `${formatPrice(e.kids_amount_paid || 0)} / ${formatPrice(e.kids_amount)}` : 'Not set'}
                        </p>
                      </div>
                    </button>

                    {followUpStatus(e) && (() => {
                      const fu = followUpStatus(e)!;
                      return (
                        <div className={`rounded-md px-3 py-2 ${fu.color}`} title={`Follow-up set on ${e.full_name}'s booking`}>
                          <p className="text-xs font-medium flex items-center gap-1">
                            <fu.icon size={12} className="shrink-0" aria-hidden="true" /> {fu.label}
                          </p>
                        </div>
                      );
                    })()}

                    <p className="text-dark-muted/70 text-[11px] text-center pt-1" title="Kids have no separate record — everything above lives on this booking">
                      Part of {e.full_name}'s booking · no separate record to open
                    </p>
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
