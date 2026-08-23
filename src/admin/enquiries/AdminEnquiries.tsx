import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowsClockwise as RefreshCw,
  Plus,
  CheckCircle as CheckCircle2,
  ChatCircle as MessageCircle,
  CaretDown as ChevronDown,
  SlidersHorizontal,
  Trash as Trash2,
  Users,
  Pencil,
  X,
  CalendarDot as CalendarClock,
  MagnifyingGlass as Search,
  CalendarBlank as CalendarDays,
} from '@phosphor-icons/react';
import AdminLayout from '../AdminLayout';
import Button from '../../components/ui/Button';
import FoodMark from '../../components/ui/FoodMark';
import { paginate, useDragScroll } from '../../components/ui/dataTableUtils';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { useAlert } from '../../components/ui/useAlert';
import { getPaymentsForEnquiry } from '../../services/api';
import type { Enquiry, UpcomingTrip, WaitlistEntry } from '../../types/types-index';
import { formatDateRange, formatPrice, seatsLeft, buildGroupLetterMap } from '../../utils/utils-index';
import type { GroupUnit } from '../../utils/utils-index';
import {
  foodPreferenceKey, SOURCE_CONFIG, JOURNEY_STAGE_CONFIG,
  closedReasonBreakdown, followUpStatus,
} from './AdminEnquiryCommon';
import { JourneyLifecycleLegend } from './AdminEnquiryLifecycle';
import { useGenerateInvoice } from './useGenerateInvoice';
import { useMarkInvoicePaid } from './useMarkInvoicePaid';
import { useEnquiryData } from './useEnquiryData';
import { useEnquiryFilters, ENQUIRIES_PAGE_SIZE } from './useEnquiryFilters';
import { useEnquirySelection } from './useEnquirySelection';
import { useEnquiryLifecycle } from './useEnquiryLifecycle';
import { useAddEnquiry } from './useAddEnquiry';
import { useEnquiryPayment } from './useEnquiryPayment';
import { useEnquiryDetailsModal } from './useEnquiryDetailsModal';
import { useEditEnquiry } from './useEditEnquiry';
import { useEnquiryStatusActions } from './useEnquiryStatusActions';
import { useBulkEdit } from './useBulkEdit';
import { useRowActions } from './useRowActions';
import {
  isGeneralContactMessage, groupLabelFor, groupColorFor, buildGroupColorMap,
  paymentTotals, foodTotals, buildKpiCards, describeWaiting, fetchWaitlistCounts,
} from './enquiryGrouping';

import {
  paymentFilterKey, isBooked, isCancelled,
  isGroupEntry, STATUS_CONFIG, PAY_FILTER_LABELS, FOOD_FILTER_LABELS,
  BOOKING_FILTER_LABELS, GROUP_FILTER_LABELS, PACKAGE_FILTER_LABELS, packageFilterKey,
} from './AdminEnquiriesShared';
import FilterDropdown from './AdminFilterDropdown';
import { KpiCards, KpiCarousel } from '../../components/ui/KpiCards';
import AddEnquiryModal from './AdminAddEnquiryModal';
import PaymentModal from './AdminPaymentModal';
import DetailsModal from './AdminDetailsModal';
import GenerateInvoiceModal from './AdminGenerateInvoiceModal';
import MarkPaidModal from './AdminMarkPaidModal';
import NotInterestedModal from './AdminNotInterestedModal';
import FollowUpModal from './AdminFollowUpModal';
import BookingFollowUpModal from './AdminBookingFollowUpModal';
import ContactOutcomeModal from './AdminContactOutcomeModal';
import CancelModal from './AdminCancelModal';
import BulkEditModal from './AdminBulkEditModal';
import EditDetailsModal from './AdminEditDetailsModal';
import AdminEnquiriesDesktopTable from './AdminEnquiriesDesktopTable';
import AdminEnquiriesMobileCards from './AdminEnquiriesMobileCards';

export default function AdminEnquiries() {
  const alert = useAlert();
  const [searchParams, setSearchParams] = useSearchParams();
  const { enquiries, trips, completedTrips, loading, load, setTrips } = useEnquiryData();
  // Restores scroll position when the admin comes back to this list — e.g.
  // expand a card, tap "View Full CRM", then go back — instead of always
  // landing back at the top. Waits for `!loading` so it restores against
  // the page's real height, not the loading skeleton's.
  useScrollRestoration('/admin/enquiries', !loading);
  const {
    filter, setFilter,
    journeyFilter, setJourneyFilter,
    payFilter, setPayFilter,
    bookedFilter, setBookedFilter,
    groupFilter, setGroupFilter,
    foodFilter, setFoodFilter,
    packageFilter, setPackageFilter,
    sourceFilter, setSourceFilter,
    followUpDueOnly, setFollowUpDueOnly,
    searchQuery, setSearchQuery, trimmedSearch,
    selectedTripKey, setSelectedTripKey,
    openFilterPanel, setOpenFilterPanel,
    currentPage, setCurrentPage,
    sortKey, sortDir, handleSort,
    activeFilterCount,
    clearAllFilters,
    handleExportCsv,
  } = useEnquiryFilters();
  const { ref: tableScrollRef, isDragging, handlers: dragHandlers } = useDragScroll<HTMLDivElement>();
  const [updating, setUpdating] = useState<string | null>(null);
  // Owns the desktop "View Details" popup — target/invoices state plus the
  // download/share invoice actions.
  const {
    detailsTarget, setDetailsTarget,
    detailsInvoices, setDetailsInvoices,
    detailsInvoicesLoading,
    invoiceBusyId,
    handleDownloadInvoice,
    handleShareInvoice,
  } = useEnquiryDetailsModal();
  // Which mobile card is expanded — restored from sessionStorage on mount so
  // that expanding a card, tapping "View Full CRM" to drill into the detail
  // page, then coming back (browser back / in-app back) lands the admin
  // exactly where they left off: same card still expanded, same scroll
  // position (see useScrollRestoration below). Previously this was plain
  // local state, so navigating away and back always collapsed everything
  // and reset the scroll to the top.
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('ulaa:admin-enquiries:expandedId');
    } catch {
      return null;
    }
  });
  // Tracks whether the expandedId above came from a restore (vs. a fresh
  // tap) so the scroll-into-view effect further down can skip its
  // scroll/animate step just once — useScrollRestoration already puts the
  // page at the exact saved scrollY, and re-running scrollIntoView on top
  // of that would fight it and produce a visible jump.
  const restoredExpandedIdRef = useRef(expandedId !== null);
  // Separate from expandedId: expandedId also drives the mobile
  // expand/collapse toggle and should stay set. highlightId is purely a
  // "you arrived here via a link" visual cue for the desktop table (which
  // has no expand/collapse concept) and fades out on its own.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  // Looks up what a trip actually charges for a given package (early-bird or
  // normal). Returns undefined if the trip or that price isn't set.
  const getTripPrice = (tripId: string | undefined, packageType: Enquiry['package_type']): number | undefined => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return undefined;
    const price = packageType === 'early_bird' ? trip.early_bird_price : trip.price;
    return price ?? undefined;
  };
  // Owns the Track Payment modal — target/form state, inline history,
  // opening with a suggested amount, and saving.
  const {
    paymentTarget, setPaymentTarget,
    paymentForm, setPaymentForm,
    savingPayment,
    paymentHistory, paymentHistoryLoading,
    openPayment,
    handleSavePayment,
  } = useEnquiryPayment({ setTrips, load, getTripPrice });
  const {
    cancelTarget, setCancelTarget,
    cancelCharges, setCancelCharges,
    cancelIsNoShow, setCancelIsNoShow,
    cancelReason, setCancelReason,
    cancelNotes, setCancelNotes,
    togglingNoShow, cancelling, completingId,
    handleCancelToggle, handleConfirmCancel,
    handleToggleNoShow, handleDelete, handleMarkCompleted,
    handleCheckIn, handleUndoCheckIn,
  } = useEnquiryLifecycle({ load, setTrips, setUpdating, setPaymentTarget, setPaymentForm, setDetailsTarget });
  // Owns the Edit Details modal — target/form/touched state, opening with
  // the enquiry's current values prefilled, and saving.
  const {
    editTarget, setEditTarget,
    editForm, setEditForm,
    editTouched, setEditTouched,
    savingEdit,
    openEdit,
    handleSaveEdit,
  } = useEditEnquiry({ trips, load });
  // How many waitlist signups — and how many actual people, since a group
  // signup (group_size > 1) is one signup but several people — are
  // waiting (status 'waiting') for each trip. Used to warn admins before
  // they free up a seat that someone's already in line for — see the
  // Cancel modal and the per-trip banner below.
  const [waitlistWaitingCounts, setWaitlistWaitingCounts] = useState<Record<string, { entries: number; people: number }>>({});
  // Raw waitlist entries — kept only so group waitlist signups (group_size
  // > 1) can be folded into the same trip-scoped Group A/B/C sequence as
  // group bookings in the table below (see groupLetterMap).
  const [waitlistEntriesForGroups, setWaitlistEntriesForGroups] = useState<WaitlistEntry[]>([]);

  // Bulk operations: select, edit, save, delete across multiple enquiries
  // at once.
  const {
    selectedIds, setSelectedIds,
    bulkEditAllowed, selectedTripName,
    toggleSelectOne, toggleSelectAllFiltered,
  } = useEnquirySelection(enquiries, selectedTripKey);
  // Mobile only: filter panel is collapsed by default (it's 7 stacked
  // fields — always showing it pushes the actual list off-screen on a
  // phone) and is opened via the toggle in the Filters header. Desktop
  // ignores this entirely and always shows the panel expanded.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Lightweight, self-dismissing confirmation for things that succeeded but
  // don't need to block the admin with an "OK" click — unlike the shared
  // AlertDialog (via `alert` below), which is reserved for errors/validation
  // that the admin actually needs to acknowledge.
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (message: string) => setToast(message);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const generateInvoice = useGenerateInvoice(async (updatedEnquiry, target) => {
    const freshInvoices = await getPaymentsForEnquiry(target.id);
    setDetailsInvoices(freshInvoices);
    setDetailsTarget(updatedEnquiry);
    load();
  });

  const markPaid = useMarkInvoicePaid(updatedPayment => {
    setDetailsInvoices(prev => prev.map(p => (p.id === updatedPayment.id ? updatedPayment : p)));
    setDetailsTarget(prev => {
      if (!prev) return prev;
      const isRefund = updatedPayment.payment_type === 'refund';
      return { ...prev, amount_paid: (prev.amount_paid || 0) + (isRefund ? 0 : updatedPayment.amount) };
    });
    load();
  });

  const loadWaitlistCounts = () => fetchWaitlistCounts(setWaitlistEntriesForGroups, setWaitlistWaitingCounts);

  useEffect(() => {
    loadWaitlistCounts();
  }, []);

  // Syncs local state FROM the URL's ?trip=/?enquiry= params (external
  // system) rather than deriving state from a prop, so this genuinely
  // belongs in an effect rather than the render-time-adjustment pattern
  // used above — it also needs to call setSearchParams to clear the params
  // once consumed, which can only happen after commit.
  useEffect(() => {
    if (enquiries.length === 0) return;
    const tripParam = searchParams.get('trip');
    const enquiryParam = searchParams.get('enquiry');
    if (tripParam) setSelectedTripKey(tripParam);
    if (enquiryParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state from the ?enquiry= URL param (external system), same rationale as setSelectedTripKey above
      setExpandedId(enquiryParam);
      setHighlightId(enquiryParam);
      // "View booking" links (e.g. from the Waitlist page) only pass
      // ?enquiry=, not ?trip= — without also selecting that enquiry's trip
      // group here, activeGroup stays null, the trip-scoped table never
      // renders, and there's nothing on screen for expandedId to expand.
      if (!tripParam) {
        const target = enquiries.find(e => e.id === enquiryParam);
        if (target) setSelectedTripKey(target.trip_id || 'unlinked');
      }
    }
    if (tripParam || enquiryParam) setSearchParams({}, { replace: true });
  }, [enquiries, searchParams, setSearchParams, setSelectedTripKey]);

  // Owns the "Log an Enquiry" modal: form state, the waitlist-conversion
  // handoff (solo and multi-seat "group" flows), possible-duplicate
  // detection, and the suggested-amount prefill.
  const {
    modalOpen,
    form, setForm,
    saving,
    convertingWaitlist,
    waitlistPeople,
    possibleDuplicates,
    openAdd, closeAddModal, updateWaitlistPerson,
    applySuggestedAmount,
    handleSave,
  } = useAddEnquiry({ trips, enquiries, setTrips, load, loadWaitlistCounts, showToast, getTripPrice });

  // Keep sessionStorage in sync so a later mount (e.g. coming back from the
  // full CRM detail page) can restore this exact card as expanded.
  useEffect(() => {
    try {
      if (expandedId) sessionStorage.setItem('ulaa:admin-enquiries:expandedId', expandedId);
      else sessionStorage.removeItem('ulaa:admin-enquiries:expandedId');
    } catch {
      // sessionStorage unavailable (private browsing, etc.) — expand state
      // just won't survive a navigation; not worth failing anything over.
    }
  }, [expandedId]);

  useEffect(() => {
    if (!expandedId) return;
    if (restoredExpandedIdRef.current) {
      // This run is the restored card, not a fresh tap — skip the
      // scroll-into-view animation once so it doesn't fight the scrollY
      // restoration below, then behave normally for every expand after.
      restoredExpandedIdRef.current = false;
      return;
    }
    const el = cardRefs.current[expandedId];
    if (!el) return;
    // Wait a beat for the expand animation/layout to settle, then decide
    // whether the page needs to move at all.
    const t = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const fitsAlready = rect.top >= 0 && rect.bottom <= viewportHeight;

      // Plenty of room below (or above) already — expanding in place is all
      // that's needed, so don't move the page and cause an unnecessary jump.
      if (fitsAlready) return;

      // Not enough room below: bring the card fully into view. If the whole
      // expanded card is taller than the viewport itself, prioritize showing
      // its header/top details ('start'); otherwise align its bottom edge to
      // the viewport bottom ('end'), which is what makes the card appear to
      // slide up just enough to reveal the newly expanded content.
      const cardTallerThanViewport = rect.height > viewportHeight;
      el.scrollIntoView({ behavior: 'smooth', block: cardTallerThanViewport ? 'start' : 'end' });
    }, 80);
    return () => clearTimeout(t);
  }, [expandedId]);

  // Fades the "you arrived here" highlight after a couple seconds so it
  // reads as a pointer, not a permanent state.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightId]);

  // Owns the small "row status transition" handlers: recording a contact
  // outcome, the single-button "Advance" dispatcher, Not Interested +
  // Reopen, the lead follow-up reminder, and the post-booking follow-up
  // reminder.
  const {
    contactOutcomeTarget, setContactOutcomeTarget,
    savingContactOutcome,
    handleSaveContactOutcome,
    handleAdvance,
    notInterestedTarget, setNotInterestedTarget,
    closedReason, setClosedReason,
    handleMarkNotInterested,
    handleConfirmNotInterested,
    followUpTarget, setFollowUpTarget,
    followUpDate, setFollowUpDate,
    openFollowUpModal,
    handleSaveFollowUp,
    handleClearFollowUp,
    bookingFollowUpTarget, setBookingFollowUpTarget,
    handleSaveBookingFollowUp,
    handleClearBookingFollowUp,
    handleReopenEnquiry,
  } = useEnquiryStatusActions({ load, setUpdating, openPayment, handleCheckIn, handleMarkCompleted });

  // Builds the per-row kebab menu (Edit Details, Mark/Undo No Show, invoice
  // download/share, View Details, Cancel/Reactivate, Delete, etc.) by
  // wiring together handlers owned by the hooks above — see
  // useRowActions.ts for what's included/excluded and why.
  const { buildRowActions } = useRowActions({
    openEdit, setDetailsTarget, invoiceBusyId, handleDownloadInvoice, handleShareInvoice,
    handleToggleNoShow, handleUndoCheckIn, handleClearFollowUp, handleClearBookingFollowUp,
    handleReopenEnquiry, handleMarkNotInterested, handleCancelToggle, handleDelete,
  });

  // Owns bulk operations across the current selection: the Bulk Edit
  // modal's target/form state, saving, and deleting every selected
  // enquiry.
  const {
    bulkEditOpen, setBulkEditOpen,
    bulkForm, setBulkForm,
    bulkSaving,
    bulkDeleting,
    openBulkEdit,
    handleBulkSave,
    handleBulkDelete,
  } = useBulkEdit({ enquiries, selectedIds, setSelectedIds, setTrips, load, showToast });

  // Group enquiries by trip so the admin can see, per trip, how many people
  // enquired/contacted/closed and how much has been collected vs is pending —
  // instead of one long undifferentiated list.
  type TripGroup = {
    key: string;
    title: string;
    trip?: UpcomingTrip;
    enquiries: Enquiry[];
    // True when this group's enquiries reference a trip_id that no longer
    // exists in the current `trips` list — i.e. the trip was deleted after
    // people enquired for it. The group still has to show up (deleting a
    // trip doesn't delete its enquiries/payment history), but it's flagged
    // so the admin isn't confused about why a "gone" trip still appears.
    isDeletedTrip: boolean;
    // True when the trip finished and graduated into a completed album
    // (sync_started_trip_albums, same id). Distinct from isDeletedTrip —
    // this is the normal, expected lifecycle for every trip, not a loss of
    // data — but it's still flagged and labeled so an admin scanning the
    // Trip filter can tell "this already happened" apart from "this is
    // still bookable" at a glance, the same way a CRM tags a closed deal
    // or a support desk tags a resolved ticket instead of leaving it
    // looking identical to an open one in the same list.
    isCompletedTrip: boolean;
  };

  // 'unlinked' bucket = every enquiry with trip_id null — both genuine
  // "Contact Us" messages (submitContactEnquiry, always source: 'website')
  // and any manual admin entry logged without picking a trip. Labeled and
  // sorted distinctly (3.8) so it doesn't just blend into the trip list:
  // pinned to the front regardless of count, since a handful of "just say
  // hi" messages could otherwise sink to the bottom of a long, busy-season
  // trip list and never get noticed.
  const UNLINKED_GROUP_KEY = 'unlinked';
  const tripGroups: TripGroup[] = (() => {
    const map = new Map<string, TripGroup>();
    enquiries.forEach(e => {
      const key = e.trip_id || UNLINKED_GROUP_KEY;
      if (!map.has(key)) {
        const linkedTrip = e.trip_id ? trips.find(t => t.id === e.trip_id) : undefined;
        // A trip_id can stop matching `trips` (upcoming) either because it
        // was genuinely deleted, or because the trip finished and
        // sync_started_trip_albums() turned it into a completed album with
        // the same id — that's a normal lifecycle move, not a deletion, so
        // it must not be flagged the same way.
        const linkedCompletedTrip = e.trip_id ? completedTrips.find(t => t.id === e.trip_id) : undefined;
        const isDeletedTrip = !!e.trip_id && !linkedTrip && !linkedCompletedTrip;
        const isCompletedTrip = !!linkedCompletedTrip;
        const title = linkedTrip?.title || linkedCompletedTrip?.title || e.trip_title || 'General Enquiries (No Trip)';
        map.set(key, {
          key,
          title,
          trip: linkedTrip,
          enquiries: [],
          isDeletedTrip,
          isCompletedTrip,
        });
      }
      map.get(key)!.enquiries.push(e);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === UNLINKED_GROUP_KEY) return -1;
      if (b.key === UNLINKED_GROUP_KEY) return 1;
      // Active trips first, then completed, then deleted — so the Trip
      // filter reads top-to-bottom as "what's live" → "what's finished" →
      // "what's gone" instead of interleaving all three by raw enquiry
      // count. Same idea as an inbox listing unread before archived.
      const tier = (g: TripGroup) => (g.isDeletedTrip ? 2 : g.isCompletedTrip ? 1 : 0);
      const tierDiff = tier(a) - tier(b);
      if (tierDiff !== 0) return tierDiff;
      return b.enquiries.length - a.enquiries.length;
    });
  })();


  const activeGroup = tripGroups.find(g => g.key === selectedTripKey) || null;
  const scopedEnquiries = activeGroup ? activeGroup.enquiries : enquiries;

  // Names every group booking "Group A", "Group B", "Group C"... scoped to
  // the trip it belongs to — the first group ever created for a given trip
  // is always Group A, regardless of which trip is currently being viewed,
  // what filters/sort/search are active, or how the list is paginated.
  // Group waitlist signups (someone joining the waitlist because their
  // group of N didn't fit) are folded into the very same per-trip sequence
  // — via the buildGroupLetterMap helper shared with the Waitlist page —
  // so a new group waitlist entry picks up the next letter after whatever
  // group bookings already exist for that trip, instead of starting over.
  // Built from the full, unscoped `enquiries`/waitlist lists (not
  // scopedEnquiries or any filtered/sorted derivative) so a group's letter
  // is stable and never reshuffles as the admin navigates around.
  const groupUnits: GroupUnit[] = [];
  {
    const seenGroupIds = new Set<string>();
    enquiries.forEach(e => {
      if (!e.group_id || seenGroupIds.has(e.group_id)) return;
      seenGroupIds.add(e.group_id);
      groupUnits.push({ key: e.group_id, tripId: e.trip_id || 'unlinked', createdAt: e.created_at });
    });
    waitlistEntriesForGroups.forEach(w => {
      if (!w.group_size || w.group_size <= 1) return;
      groupUnits.push({ key: `wl:${w.id}`, tripId: w.trip_id || 'unlinked', createdAt: w.created_at });
    });
  }
  const groupLetterMap = buildGroupLetterMap(groupUnits);
  const groupLabel = (e: Enquiry) => groupLabelFor(e, groupLetterMap);

  // Group-booking rows are inserted together in one batch, so their
  // created_at timestamps are effectively identical — ordering purely by
  // created_at (as the initial fetch does) then leaves them in whatever
  // arbitrary order the database happened to return, e.g. "Group 2/5, 1/5,
  // 3/5...". This re-sorts so every group's members sit together,
  // internally ordered 1/N, 2/N, 3/N..., while the groups (and any solo
  // bookings) themselves stay in the same overall newest-first order as
  // before — keyed off the *earliest* created_at seen in each group, since
  // that's the one moment a batch actually happened.
  const groupEarliestCreatedAt = new Map<string, string>();
  scopedEnquiries.forEach(e => {
    if (!e.group_id) return;
    const existing = groupEarliestCreatedAt.get(e.group_id);
    if (!existing || e.created_at < existing) groupEarliestCreatedAt.set(e.group_id, e.created_at);
  });
  const sortedScoped = [...scopedEnquiries].sort((a, b) => {
    const aKey = a.group_id ? groupEarliestCreatedAt.get(a.group_id)! : a.created_at;
    const bKey = b.group_id ? groupEarliestCreatedAt.get(b.group_id)! : b.created_at;
    if (aKey !== bKey) return aKey < bKey ? 1 : -1; // newest batch/entry first
    if (a.group_id && a.group_id === b.group_id) return (a.group_seq || 1) - (b.group_seq || 1);
    return 0;
  });

  // Assigns each group_id a color from the palette below, in the order
  // groups first appear top-to-bottom in the (now-clustered) list — see
  // buildGroupColorMap in enquiryGrouping.ts.
  const groupColorMap = buildGroupColorMap(sortedScoped);
  const groupColor = (e: Enquiry) => groupColorFor(e, groupColorMap);

  const filtered = sortedScoped
    .filter(e => filter === 'all' || e.status === filter)
    .filter(e => journeyFilter === 'all' || e.journey_stage === journeyFilter)
    .filter(e => payFilter === 'all' || paymentFilterKey(e) === payFilter)
    .filter(e => bookedFilter === 'all' || (
      bookedFilter === 'cancelled' ? isCancelled(e)
      : bookedFilter === 'booked' ? isBooked(e)
      : !isBooked(e) && !isCancelled(e)
    ))
    .filter(e => groupFilter === 'all' || (groupFilter === 'group' ? isGroupEntry(e) : !isGroupEntry(e)))
    .filter(e => foodFilter === 'all' || foodPreferenceKey(e) === foodFilter)
    .filter(e => packageFilter === 'all' || packageFilterKey(e) === packageFilter)
    .filter(e => sourceFilter === 'all' || e.source === sourceFilter)
    .filter(e => !followUpDueOnly || !!followUpStatus(e)?.isDue)
    .filter(e => !trimmedSearch
      || e.full_name?.toLowerCase().includes(trimmedSearch)
      || e.phone?.toLowerCase().includes(trimmedSearch)
      || e.email?.toLowerCase().includes(trimmedSearch)
      || e.trip_title?.toLowerCase().includes(trimmedSearch));

  const sortedFiltered = sortKey ? [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name': return dir * (a.full_name || '').localeCompare(b.full_name || '');
      case 'group': return dir * ((a.group_size || 1) - (b.group_size || 1));
      case 'food': return dir * foodPreferenceKey(a).localeCompare(foodPreferenceKey(b));
      case 'source': return dir * (a.source || '').localeCompare(b.source || '');
      case 'date': return dir * (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
      case 'package': return dir * (a.package_type || 'normal').localeCompare(b.package_type || 'normal');
      case 'payment': return dir * ((a.amount_paid || 0) - (b.amount_paid || 0));
      case 'status': return dir * (a.status || '').localeCompare(b.status || '');
      // Nulls (no reminder set) always sort to the end regardless of
      // direction — an admin sorting this column wants due/upcoming dates
      // grouped together, not chasing them past a block of blanks.
      case 'follow_up': {
        if (!a.follow_up_at && !b.follow_up_at) return 0;
        if (!a.follow_up_at) return 1;
        if (!b.follow_up_at) return -1;
        return dir * (a.follow_up_at < b.follow_up_at ? -1 : a.follow_up_at > b.follow_up_at ? 1 : 0);
      }
      default: return 0;
    }
  }) : filtered;

  const {
    pageItems: paginatedEnquiries,
    totalPages: enquiriesTotalPages,
    safePage: enquiriesSafePage,
    rangeStart: enquiriesRangeStart,
    rangeEnd: enquiriesRangeEnd,
  } = paginate(sortedFiltered, currentPage, ENQUIRIES_PAGE_SIZE);

  const counts = {
    all: scopedEnquiries.length,
    new: scopedEnquiries.filter(e => e.status === 'new').length,
    contacted: scopedEnquiries.filter(e => e.status === 'contacted').length,
    closed: scopedEnquiries.filter(e => e.status === 'closed').length,
  };
  const journeyCounts = {
    all: scopedEnquiries.length,
    new_enquiry: scopedEnquiries.filter(e => e.journey_stage === 'new_enquiry').length,
    contacted: scopedEnquiries.filter(e => e.journey_stage === 'contacted').length,
    advance_pending: scopedEnquiries.filter(e => e.journey_stage === 'advance_pending').length,
    advance_paid: scopedEnquiries.filter(e => e.journey_stage === 'advance_paid').length,
    confirmed: scopedEnquiries.filter(e => e.journey_stage === 'confirmed').length,
    balance_pending: scopedEnquiries.filter(e => e.journey_stage === 'balance_pending').length,
    fully_paid: scopedEnquiries.filter(e => e.journey_stage === 'fully_paid').length,
    checked_in: scopedEnquiries.filter(e => e.journey_stage === 'checked_in').length,
    completed: scopedEnquiries.filter(e => e.journey_stage === 'completed').length,
    not_interested: scopedEnquiries.filter(e => e.journey_stage === 'not_interested').length,
  };
  const payCounts = {
    all: scopedEnquiries.length,
    paid: scopedEnquiries.filter(e => paymentFilterKey(e) === 'paid').length,
    partial: scopedEnquiries.filter(e => paymentFilterKey(e) === 'partial').length,
    unpaid: scopedEnquiries.filter(e => paymentFilterKey(e) === 'unpaid').length,
    not_set: scopedEnquiries.filter(e => paymentFilterKey(e) === 'not_set').length,
  };
  const bookedCounts = {
    all: scopedEnquiries.length,
    booked: scopedEnquiries.filter(isBooked).length,
    not_booked: scopedEnquiries.filter(e => !isBooked(e) && !isCancelled(e)).length,
    cancelled: scopedEnquiries.filter(isCancelled).length,
  };
  const groupCounts = {
    all: scopedEnquiries.length,
    group: scopedEnquiries.filter(isGroupEntry).length,
    solo: scopedEnquiries.filter(e => !isGroupEntry(e)).length,
  };
  const foodCounts = {
    all: scopedEnquiries.length,
    veg: scopedEnquiries.filter(e => foodPreferenceKey(e) === 'veg').length,
    non_veg: scopedEnquiries.filter(e => foodPreferenceKey(e) === 'non_veg').length,
    not_set: scopedEnquiries.filter(e => foodPreferenceKey(e) === 'not_set').length,
  };
  const packageCounts = {
    all: scopedEnquiries.length,
    early_bird: scopedEnquiries.filter(e => packageFilterKey(e) === 'early_bird').length,
    normal: scopedEnquiries.filter(e => packageFilterKey(e) === 'normal').length,
  };
  const sourceCounts = Object.keys(SOURCE_CONFIG).reduce((acc, key) => {
    acc[key] = scopedEnquiries.filter(e => e.source === key).length;
    return acc;
  }, { all: scopedEnquiries.length } as Record<string, number>);
  const followUpDueCount = scopedEnquiries.filter(e => !!followUpStatus(e)?.isDue).length;

  return (
    <AdminLayout title="Enquiries">
      <div className="space-y-4 sm:space-y-6">
        <JourneyLifecycleLegend />

        {/* Reporting breakdown — only meaningful once the admin is actually
            looking at closed leads; scoped to whatever trip/search filters
            are already active so it matches what's in the table below. */}
        {filter === 'closed' && closedReasonBreakdown(scopedEnquiries).length > 0 && (
          <div className="bg-white border border-background-warm rounded-lg px-4 py-3">
            <p className="text-[11px] font-button font-bold text-dark-muted uppercase tracking-wide mb-2">
              Why these didn't convert
            </p>
            <div className="flex flex-wrap gap-2">
              {closedReasonBreakdown(scopedEnquiries).map(r => (
                <span key={r.label} className="inline-flex items-center gap-1.5 text-xs font-button font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-dark-muted">
                  {r.label} <span className="text-dark">{r.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-3">
          <p className="text-dark-muted text-sm hidden sm:block">Log a WhatsApp, phone, or walk-in enquiry that didn't come through the website.</p>
          <Button variant="primary" size="sm" onClick={openAdd} className="ml-auto">
            <Plus size={16} aria-hidden="true" /> Add Enquiry
          </Button>
        </div>

        {/* KPI summary — desktop grid + mobile carousel, both scoped to
            whichever trip is selected in the Trip filter below (or
            business-wide when "All trips" is selected). */}
        <KpiCards cards={buildKpiCards(scopedEnquiries)} />
        <KpiCarousel cards={buildKpiCards(scopedEnquiries)} />

        {/* Mobile-only search bar — sits right under the KPI carousel so
            it's reachable with a thumb without hunting through the
            (collapsed-by-default) filter panel below. Bound to the same
            searchQuery state the desktop TableHeaderBar search uses. */}
        <div className="relative sm:hidden">
          <label htmlFor="enq-mobile-search" className="sr-only">Search name, phone, email, or trip</label>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
          <input
            id="enq-mobile-search"
            type="text"
            value={searchQuery}
            onChange={ev => setSearchQuery(ev.target.value)}
            placeholder="Search name, phone, email, trip..."
            className="w-full pl-10 pr-10 py-3 rounded-lg border-2 border-background-warm bg-white font-body text-dark text-sm focus:border-primary outline-none transition-colors shadow-card"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark p-1"
              aria-label="Clear search"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Trip summary card — shows "All Trips" totals when no Trip filter
            is selected below, or that trip's own name/seats/food/money
            once one is picked from the Trip filter. */}
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Section 1 — trip photo + name / date / seats booked · food split */}
            <div className="flex items-center gap-3 p-4 flex-1 min-w-0 md:basis-1/3 border-b md:border-b-0 border-background-warm mx-4 md:mx-0 md:my-4 md:border-r">
              <div className="w-14 h-14 rounded-md overflow-hidden bg-background-warm shrink-0">
                {activeGroup?.trip?.cover_image && (
                  <img src={activeGroup.trip.cover_image} alt={activeGroup.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-1 py-0.5">
                <p className="font-display font-bold text-dark truncate flex items-center gap-2">
                  <span className="truncate">{activeGroup ? (activeGroup.title || activeGroup.trip?.title || 'Untitled Trip') : 'All Trips'}</span>
                  {activeGroup?.isCompletedTrip && (
                    <span className="shrink-0 text-[10px] font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-background-warm text-dark-muted">Completed</span>
                  )}
                  {activeGroup?.isDeletedTrip && (
                    <span className="shrink-0 text-[10px] font-button font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-50 text-red-600">Deleted</span>
                  )}
                </p>
                {activeGroup?.trip?.start_date && activeGroup.trip.end_date && (
                  <p className="text-dark-muted text-xs flex items-center gap-1">
                    <CalendarDays size={11} className="shrink-0" aria-hidden="true" /> {formatDateRange(activeGroup.trip.start_date, activeGroup.trip.end_date)}
                  </p>
                )}
                {(() => {
                  const food = foodTotals(scopedEnquiries);
                  return (
                    <p className="text-dark-muted text-xs flex items-center flex-wrap gap-1.5">
                      {activeGroup?.trip && <span>{activeGroup.trip.seats_booked}/{activeGroup.trip.total_seats} seats booked</span>}
                      {(food.veg > 0 || food.nonVeg > 0) && (
                        <>
                          {activeGroup?.trip && <span className="text-dark-muted/40" aria-hidden="true">|</span>}
                          <span className="inline-flex items-center gap-1 text-green-700"><FoodMark type="veg" size={9} /> {food.veg} Veg</span>
                          <span className="inline-flex items-center gap-1 text-red-700"><FoodMark type="non_veg" size={9} /> {food.nonVeg} Non-veg</span>
                        </>
                      )}
                    </p>
                  );
                })()}
              </div>
            </div>

            {/* Section 2 — seat utilization bar (only meaningful once a specific trip is picked) */}
            {activeGroup?.trip && (
              <div className="flex flex-col justify-center gap-1.5 p-4 flex-1 min-w-0 md:basis-1/3 border-b md:border-b-0 border-background-warm mx-4 md:mx-0 md:my-4 md:border-r">
                <p className="text-dark-muted text-xs font-medium">Seat Utilization</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-background-warm overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${activeGroup.trip.total_seats ? Math.min(100, Math.round((activeGroup.trip.seats_booked / activeGroup.trip.total_seats) * 100)) : 0}%` }}
                    />
                  </div>
                  <span className="text-dark text-xs font-semibold shrink-0">
                    {activeGroup.trip.total_seats ? Math.min(100, Math.round((activeGroup.trip.seats_booked / activeGroup.trip.total_seats) * 100)) : 0}%
                  </span>
                </div>
                <p className="text-dark-muted text-xs">{activeGroup.trip.seats_booked} of {activeGroup.trip.total_seats} seats</p>
              </div>
            )}

            {/* Section 3 — payments collected/pending + link to the trip, button vertically centered against the full card height */}
            <div className="flex items-center gap-4 p-4 flex-1 min-w-0 md:basis-1/3">
              <div className="min-w-0 flex-1">
                <p className="text-dark-muted text-xs font-medium mb-1.5">Payments</p>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-dark-muted text-xs">Collected</p>
                    <p className="text-green-700 font-semibold text-sm">{formatPrice(paymentTotals(scopedEnquiries).collected)}</p>
                  </div>
                  <div>
                    <p className="text-dark-muted text-xs">Pending</p>
                    <p className="text-amber-600 font-semibold text-sm">{formatPrice(paymentTotals(scopedEnquiries).pending)}</p>
                  </div>
                </div>
              </div>
              {activeGroup?.trip && (
                <Link
                  to="/admin/trips"
                  className="shrink-0 self-center text-xs font-button font-semibold px-4 py-2.5 rounded border border-primary/30 text-primary hover:bg-primary/5 transition-colors whitespace-nowrap"
                >
                  View Trip Details
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Someone's waiting for a seat on this trip and one's actually
            open right now — surface it here too, not just on the
            Waitlist page, since this is where an admin notices a seat
            freed up (e.g. right after cancelling someone) and might
            otherwise let it get booked by a new website visitor instead
            of the person who's been waiting longer. Only relevant once a
            specific trip is picked from the Trip filter. */}
        {activeGroup?.trip && waitlistWaitingCounts[activeGroup.key]?.entries > 0 && seatsLeft(activeGroup.trip.total_seats, activeGroup.trip.seats_booked) > 0 && (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
            <Users size={18} className="text-orange-600 shrink-0" />
            <p className="text-sm text-orange-800 flex-1">
              <span className="font-semibold">
                {describeWaiting(waitlistWaitingCounts[activeGroup.key])} {waitlistWaitingCounts[activeGroup.key].entries === 1 ? 'is' : 'are'} waiting
              </span>{' '}
              for a seat on this trip, and one's open right now.
            </p>
            <Link
              to={`/admin/waitlist?trip=${activeGroup.key}`}
              className="shrink-0 text-xs font-button font-semibold px-3 py-1.5 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors whitespace-nowrap"
            >
              Go to Waitlist
            </Link>
          </div>
        )}

            {/* Filters — one single row: Search | Filters | Clear All.
                Each filter box pops open a dropdown of options below it,
                plus a "More Filters" overflow box for anything used less
                often (currently Source). Only one dropdown is open at a
                time; a transparent full-screen layer closes whichever is
                open when you click elsewhere. */}
            {openFilterPanel && (
              <div className="fixed inset-0 z-20" onClick={() => setOpenFilterPanel(null)} />
            )}
            <div className="bg-white rounded-lg shadow-card p-4">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(o => !o)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="enq-mobile-filters-panel"
                className="w-full flex items-center gap-2 sm:pointer-events-none sm:cursor-default"
              >
                <SlidersHorizontal size={16} className="text-dark shrink-0" />
                <span className="font-button font-bold text-dark text-[15px] whitespace-nowrap flex-1 text-left">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center px-2 h-[22px] rounded-md bg-primary/10 text-primary text-[11px] font-button font-semibold">
                    {activeFilterCount} active
                  </span>
                )}
                <ChevronDown size={18} className={`sm:hidden shrink-0 text-dark-muted transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row sm:items-end gap-3 mt-4`} id="enq-mobile-filters-panel">
                {/* Filters + Clear All — sit together in one row at the
                    bottom of the panel. */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 flex-1 min-w-0">
                  {/* Trip — lets an admin scope everything below (KPIs,
                      summary card, table) to one trip, or back to "All
                      Trips", without leaving this page. Same pattern as the
                      Trip filter on the Waitlist page. Spans both mobile
                      grid columns since it's the primary/most-used filter. */}
                  <div className="relative col-span-2 sm:col-span-1 w-full sm:w-auto sm:min-w-[150px]">
                    <label htmlFor="enq-filter-trip" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Trip</label>
                    <button
                      id="enq-filter-trip"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'trip'}
                      onClick={() => setOpenFilterPanel(p => (p === 'trip' ? null : 'trip'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'trip' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{activeGroup ? activeGroup.title : 'All'}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'trip' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'trip' && (
                      <FilterDropdown
                        value={selectedTripKey ?? 'all'}
                        onSelect={key => { setSelectedTripKey(key === 'all' ? null : key); setOpenFilterPanel(null); }}
                        options={[
                          { key: 'all', label: 'All trips', count: enquiries.length },
                          ...tripGroups.map(g => ({
                            key: g.key,
                            label: g.title,
                            count: g.enquiries.length,
                            section: g.key === UNLINKED_GROUP_KEY ? undefined : g.isDeletedTrip ? 'Deleted' : g.isCompletedTrip ? 'Completed' : undefined,
                          })),
                        ]}
                      />
                    )}
                  </div>

                  {/* Explicit "General Enquiries" chip (3.8) — a one-click
                      toggle for the no-trip bucket (Contact Us messages +
                      any manual entry logged without picking a trip),
                      separate from the Trip dropdown above, so it doesn't
                      require an admin to think to open that dropdown and
                      scroll past every trip to find it. Only rendered when
                      there's actually something in that bucket. */}
                  {enquiries.some(e => !e.trip_id) && (
                    <button
                      type="button"
                      onClick={() => setSelectedTripKey(k => (k === UNLINKED_GROUP_KEY ? null : UNLINKED_GROUP_KEY))}
                      title="Enquiries not linked to any trip — Contact Us messages and manual entries logged without picking a trip"
                      className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold rounded-md border-2 px-3 h-[38px] transition-colors whitespace-nowrap ${
                        selectedTripKey === UNLINKED_GROUP_KEY
                          ? 'bg-primary text-white border-primary'
                          : 'border-background-warm text-dark hover:border-primary/30'
                      }`}
                    >
                      <MessageCircle size={13} className="shrink-0" aria-hidden="true" />
                      General Enquiries
                      <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] ${
                        selectedTripKey === UNLINKED_GROUP_KEY ? 'bg-white/20' : 'bg-background-warm'
                      }`}>
                        {enquiries.filter(e => !e.trip_id).length}
                      </span>
                    </button>
                  )}

                  {/* Lead Status — renamed from "Query Status" for clarity
                      now that the table's own Status column shows the full
                      combined Booking Journey pipeline (New Enquiry ...
                      Completed) rather than this new/contacted/closed lead
                      state alone; this filter only ever reaches the three
                      lead values (see Enquiry.status). */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label htmlFor="enq-filter-query" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Lead Status</label>
                    <button
                      id="enq-filter-query"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'query'}
                      onClick={() => setOpenFilterPanel(p => (p === 'query' ? null : 'query'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'query' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{filter === 'all' ? 'All' : STATUS_CONFIG[filter].label}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'query' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'query' && (
                      <FilterDropdown
                        value={filter}
                        onSelect={key => { setFilter(key); setOpenFilterPanel(null); }}
                        options={(['all', 'new', 'contacted', 'closed'] as const).map(key => ({
                          key, label: key === 'all' ? 'All' : STATUS_CONFIG[key].label, count: counts[key],
                        }))}
                      />
                    )}
                  </div>

                  {/* Booking Journey — a separate, finer-grained dimension
                      from Lead Status above (see journeyFilter's own
                      comment). Lets an admin isolate a specific pipeline
                      stage, e.g. everyone currently "Fully Paid" or "Checked
                      In", which neither Lead Status nor the coarser Booking
                      (booked/not booked/cancelled) filter below can reach. */}
                  <div className="relative w-full sm:w-auto sm:min-w-[160px]">
                    <label htmlFor="enq-filter-journey" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Booking Journey</label>
                    <button
                      id="enq-filter-journey"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'journey'}
                      onClick={() => setOpenFilterPanel(p => (p === 'journey' ? null : 'journey'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'journey' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{journeyFilter === 'all' ? 'All' : JOURNEY_STAGE_CONFIG[journeyFilter].label}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'journey' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'journey' && (
                      <FilterDropdown
                        value={journeyFilter}
                        onSelect={key => { setJourneyFilter(key); setOpenFilterPanel(null); }}
                        options={([
                          'all', 'new_enquiry', 'contacted', 'advance_pending', 'advance_paid', 'confirmed',
                          'balance_pending', 'fully_paid', 'checked_in', 'completed', 'not_interested',
                        ] as const).map(key => ({
                          key, label: key === 'all' ? 'All' : JOURNEY_STAGE_CONFIG[key].label, count: journeyCounts[key],
                        }))}
                      />
                    )}
                  </div>

                  {/* Payment */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label htmlFor="enq-filter-pay" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Payment</label>
                    <button
                      id="enq-filter-pay"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'pay'}
                      onClick={() => setOpenFilterPanel(p => (p === 'pay' ? null : 'pay'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'pay' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{PAY_FILTER_LABELS[payFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'pay' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'pay' && (
                      <FilterDropdown
                        value={payFilter}
                        onSelect={key => { setPayFilter(key); setOpenFilterPanel(null); }}
                        options={(['all', 'paid', 'partial', 'unpaid', 'not_set'] as const).map(key => ({
                          key, label: PAY_FILTER_LABELS[key], count: payCounts[key],
                        }))}
                      />
                    )}
                  </div>

                  {/* Booking */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label htmlFor="enq-filter-booked" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Booking</label>
                    <button
                      id="enq-filter-booked"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'booked'}
                      onClick={() => setOpenFilterPanel(p => (p === 'booked' ? null : 'booked'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'booked' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{BOOKING_FILTER_LABELS[bookedFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'booked' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'booked' && (
                      <FilterDropdown
                        value={bookedFilter}
                        onSelect={key => { setBookedFilter(key); setOpenFilterPanel(null); }}
                        options={(['all', 'booked', 'not_booked', 'cancelled'] as const).map(key => ({
                          key, label: BOOKING_FILTER_LABELS[key], count: bookedCounts[key],
                        }))}
                      />
                    )}
                  </div>

                  {/* Follow-ups Due — a plain toggle chip (not a dropdown
                      like the filters above) since there's only one
                      meaningful thing to isolate: reminders due today or
                      overdue. Only rendered when there's at least one, same
                      as the General Enquiries chip above. */}
                  {followUpDueCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFollowUpDueOnly(v => !v)}
                      title="Contacted leads with a follow-up reminder due today or overdue"
                      className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold rounded-md border-2 px-3 h-[38px] transition-colors whitespace-nowrap self-end ${
                        followUpDueOnly
                          ? 'bg-primary text-white border-primary'
                          : 'border-background-warm text-dark hover:border-primary/30'
                      }`}
                    >
                      <CalendarClock size={13} className="shrink-0" aria-hidden="true" />
                      Follow-ups Due
                      <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] ${
                        followUpDueOnly ? 'bg-white/20' : 'bg-background-warm'
                      }`}>
                        {followUpDueCount}
                      </span>
                    </button>
                  )}

                  {/* Group / Solo */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label htmlFor="enq-filter-group" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Group / Solo</label>
                    <button
                      id="enq-filter-group"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'group'}
                      onClick={() => setOpenFilterPanel(p => (p === 'group' ? null : 'group'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'group' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{GROUP_FILTER_LABELS[groupFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'group' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'group' && (
                      <FilterDropdown
                        value={groupFilter}
                        onSelect={key => { setGroupFilter(key); setOpenFilterPanel(null); }}
                        options={(['all', 'group', 'solo'] as const).map(key => ({
                          key, label: GROUP_FILTER_LABELS[key], count: groupCounts[key],
                        }))}
                      />
                    )}
                  </div>

                  {/* Food */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label htmlFor="enq-filter-food" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Food</label>
                    <button
                      id="enq-filter-food"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'food'}
                      onClick={() => setOpenFilterPanel(p => (p === 'food' ? null : 'food'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'food' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{FOOD_FILTER_LABELS[foodFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'food' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'food' && (
                      <FilterDropdown
                        value={foodFilter}
                        onSelect={key => { setFoodFilter(key); setOpenFilterPanel(null); }}
                        options={(['all', 'veg', 'non_veg', 'not_set'] as const).map(key => ({
                          key, label: FOOD_FILTER_LABELS[key], count: foodCounts[key],
                        }))}
                      />
                    )}
                  </div>

                  {/* Package — Early Bird vs Normal pricing (added
                      alongside auto-pricing; see add_enquiry_auto_pricing.sql
                      and PACKAGE_FILTER_LABELS). */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label htmlFor="enq-filter-package" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Package</label>
                    <button
                      id="enq-filter-package"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'package'}
                      onClick={() => setOpenFilterPanel(p => (p === 'package' ? null : 'package'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'package' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{PACKAGE_FILTER_LABELS[packageFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'package' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'package' && (
                      <FilterDropdown
                        value={packageFilter}
                        onSelect={key => { setPackageFilter(key); setOpenFilterPanel(null); }}
                        options={(['all', 'early_bird', 'normal'] as const).map(key => ({
                          key, label: PACKAGE_FILTER_LABELS[key], count: packageCounts[key],
                        }))}
                      />
                    )}
                  </div>

                  {/* Source — overflow filter, kept in the same
                      label-on-top style as the rest of the row. */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label htmlFor="enq-filter-more" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Source</label>
                    <button
                      id="enq-filter-more"
                      aria-haspopup="listbox"
                      aria-expanded={openFilterPanel === 'more'}
                      onClick={() => setOpenFilterPanel(p => (p === 'more' ? null : 'more'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'more' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{sourceFilter === 'all' ? 'All' : SOURCE_CONFIG[sourceFilter].label}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'more' ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {openFilterPanel === 'more' && (
                      <FilterDropdown
                        align="right"
                        value={sourceFilter}
                        onSelect={key => { setSourceFilter(key); setOpenFilterPanel(null); }}
                        options={[
                          { key: 'all' as const, label: 'All sources', count: sourceCounts.all },
                          ...(Object.keys(SOURCE_CONFIG) as (keyof typeof SOURCE_CONFIG)[]).map(key => ({
                            key, label: SOURCE_CONFIG[key].label, count: sourceCounts[key] || 0,
                          })),
                        ]}
                      />
                    )}
                  </div>
                </div>

                {/* Clear All — sits at the end of the row; disabled (and
                    dimmed) whenever no filter or search term is active. */}
                <button
                  onClick={clearAllFilters}
                  disabled={activeFilterCount === 0}
                  className={`w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold rounded-md border-2 px-3 py-2 transition-colors whitespace-nowrap ${
                    activeFilterCount === 0
                      ? 'border-background-warm text-dark-muted/40 cursor-default'
                      : 'border-background-warm text-dark hover:border-primary/30'
                  }`}
                >
                  <RefreshCw size={13} aria-hidden="true" /> Clear All
                </button>
              </div>
            </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading enquiries...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-card">
            <p className="font-display text-xl text-dark-muted">No enquiries found.</p>
          </div>
        ) : (
          <>
            {/* Bulk actions toolbar — appears once at least one enquiry is selected */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg shadow-card px-4 py-3">
                <p className="text-sm font-medium text-dark" aria-live="polite">
                  {selectedIds.size} selected
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  {bulkEditAllowed ? (
                    <button
                      onClick={openBulkEdit}
                      className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-background-warm text-dark hover:border-primary/30 transition-colors"
                    >
                      <Pencil size={14} aria-hidden="true" /> Bulk Edit
                    </button>
                  ) : (
                    <span title="Bulk Edit is disabled when the selection spans more than one trip — pricing fields aren't safe to apply across trips with different prices.">
                      <button
                        disabled
                        aria-label="Bulk Edit — disabled because the selection spans more than one trip"
                        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-background-warm text-dark-muted/40 cursor-default"
                      >
                        <Pencil size={14} aria-hidden="true" /> Bulk Edit
                      </button>
                    </span>
                  )}
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-primary/30 text-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
                  >
                    <Trash2 size={14} aria-hidden="true" /> {bulkDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-background-warm text-dark-muted hover:bg-background/50 transition-colors"
                  >
                    <X size={14} aria-hidden="true" /> Clear
                  </button>
                </div>
              </div>
            )}

            <AdminEnquiriesDesktopTable
              paginatedEnquiries={paginatedEnquiries}
              enquiriesSafePage={enquiriesSafePage}
              pageSize={ENQUIRIES_PAGE_SIZE}
              enquiriesRangeStart={enquiriesRangeStart}
              enquiriesRangeEnd={enquiriesRangeEnd}
              enquiriesTotalPages={enquiriesTotalPages}
              totalFiltered={filtered.length}
              sortedFiltered={sortedFiltered}
              setCurrentPage={setCurrentPage}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onExportCsv={handleExportCsv}
              activeGroupTitle={activeGroup?.title ?? null}
              sortKey={sortKey}
              sortDir={sortDir}
              handleSort={handleSort}
              selectedIds={selectedIds}
              toggleSelectOne={toggleSelectOne}
              toggleSelectAllFiltered={toggleSelectAllFiltered}
              activeGroup={activeGroup}
              highlightId={highlightId}
              groupColor={groupColor}
              groupLabel={groupLabel}
              cardRefs={cardRefs}
              tableScrollRef={tableScrollRef}
              dragHandlers={dragHandlers}
              isDragging={isDragging}
              updating={updating}
              completingId={completingId}
              setDetailsTarget={setDetailsTarget}
              openPayment={openPayment}
              openFollowUpModal={openFollowUpModal}
              setBookingFollowUpTarget={setBookingFollowUpTarget}
              handleAdvance={handleAdvance}
              handleMarkNotInterested={handleMarkNotInterested}
              buildRowActions={buildRowActions}
            />

            <AdminEnquiriesMobileCards
              paginatedEnquiries={paginatedEnquiries}
              enquiriesSafePage={enquiriesSafePage}
              enquiriesRangeStart={enquiriesRangeStart}
              enquiriesRangeEnd={enquiriesRangeEnd}
              enquiriesTotalPages={enquiriesTotalPages}
              totalFiltered={filtered.length}
              setCurrentPage={setCurrentPage}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              selectedIds={selectedIds}
              toggleSelectOne={toggleSelectOne}
              activeGroup={activeGroup}
              highlightId={highlightId}
              groupColor={groupColor}
              groupLabel={groupLabel}
              cardRefs={cardRefs}
              updating={updating}
              invoiceBusyId={invoiceBusyId}
              handleDownloadInvoice={handleDownloadInvoice}
              handleShareInvoice={handleShareInvoice}
              openPayment={openPayment}
              openFollowUpModal={openFollowUpModal}
              setBookingFollowUpTarget={setBookingFollowUpTarget}
              handleAdvance={handleAdvance}
              buildRowActions={buildRowActions}
            />
          </>
        )}
      </div>

      <AddEnquiryModal
        isOpen={modalOpen}
        onClose={closeAddModal}
        convertingWaitlist={convertingWaitlist}
        form={form}
        setForm={setForm}
        trips={trips}
        waitlistPeople={waitlistPeople}
        updateWaitlistPerson={updateWaitlistPerson}
        possibleDuplicates={possibleDuplicates}
        applySuggestedAmount={applySuggestedAmount}
        onSave={handleSave}
        saving={saving}
      />

      <PaymentModal
        paymentTarget={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        paymentForm={paymentForm}
        setPaymentForm={setPaymentForm}
        getTripPrice={getTripPrice}
        paymentHistory={paymentHistory}
        paymentHistoryLoading={paymentHistoryLoading}
        togglingNoShow={togglingNoShow}
        onToggleNoShow={handleToggleNoShow}
        onSave={handleSavePayment}
        savingPayment={savingPayment}
      />

      <DetailsModal
        detailsTarget={detailsTarget}
        onClose={() => setDetailsTarget(null)}
        groupLabel={groupLabel}
        isGeneralContactMessage={isGeneralContactMessage}
        invoiceBusyId={invoiceBusyId}
        onDownloadInvoice={handleDownloadInvoice}
        onShareInvoice={handleShareInvoice}
        completingId={completingId}
        onMarkCompleted={handleMarkCompleted}
        detailsInvoices={detailsInvoices}
        detailsInvoicesLoading={detailsInvoicesLoading}
        onOpenGenerateInvoice={generateInvoice.open}
        invoiceRowBusyId={markPaid.busyId}
        onMarkInvoicePaid={markPaid.open}
      />

      <EditDetailsModal
        editTarget={editTarget}
        onClose={() => setEditTarget(null)}
        editForm={editForm}
        setEditForm={setEditForm}
        editTouched={editTouched}
        setEditTouched={setEditTouched}
        trips={trips}
        onSave={handleSaveEdit}
        saving={savingEdit}
      />

      <GenerateInvoiceModal
        generateInvoiceTarget={generateInvoice.target}
        onClose={generateInvoice.close}
        generateInvoiceForm={generateInvoice.form}
        setGenerateInvoiceForm={generateInvoice.setForm}
        onSave={generateInvoice.save}
        savingInvoice={generateInvoice.saving}
        paymentHistory={detailsInvoices}
        paymentHistoryLoading={detailsInvoicesLoading}
      />

      <MarkPaidModal
        target={markPaid.target}
        onClose={markPaid.close}
        form={markPaid.form}
        setForm={markPaid.setForm}
        onConfirm={markPaid.confirm}
        saving={markPaid.saving}
      />

      <ContactOutcomeModal
        target={contactOutcomeTarget}
        onClose={() => setContactOutcomeTarget(null)}
        onSave={handleSaveContactOutcome}
        saving={savingContactOutcome}
      />

      <NotInterestedModal
        notInterestedTarget={notInterestedTarget}
        onClose={() => setNotInterestedTarget(null)}
        closedReason={closedReason}
        setClosedReason={setClosedReason}
        onConfirm={handleConfirmNotInterested}
        updating={updating}
      />

      <FollowUpModal
        followUpTarget={followUpTarget}
        onClose={() => setFollowUpTarget(null)}
        followUpDate={followUpDate}
        setFollowUpDate={setFollowUpDate}
        onSave={handleSaveFollowUp}
        updating={updating}
      />

      <BookingFollowUpModal
        target={bookingFollowUpTarget}
        onClose={() => setBookingFollowUpTarget(null)}
        onSave={handleSaveBookingFollowUp}
        saving={!!bookingFollowUpTarget && updating === bookingFollowUpTarget.id}
      />

      <CancelModal
        cancelTarget={cancelTarget}
        onClose={() => setCancelTarget(null)}
        cancelCharges={cancelCharges}
        setCancelCharges={setCancelCharges}
        cancelIsNoShow={cancelIsNoShow}
        setCancelIsNoShow={setCancelIsNoShow}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        cancelNotes={cancelNotes}
        setCancelNotes={setCancelNotes}
        waitlistWaitingCounts={waitlistWaitingCounts}
        describeWaiting={describeWaiting}
        onConfirm={handleConfirmCancel}
        cancelling={cancelling}
      />

      {/* Lightweight success toast — bulk-save confirmation only, doesn't
          block the admin the way the AlertDialog (errors/validation) does */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-dark text-white text-sm font-medium px-4 py-2.5 rounded-md shadow-warm-lg"
          >
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <BulkEditModal
        isOpen={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        selectedCount={selectedIds.size}
        selectedTripName={selectedTripName}
        targets={enquiries.filter(e => selectedIds.has(e.id))}
        bulkForm={bulkForm}
        setBulkForm={setBulkForm}
        activeGroupTripId={activeGroup?.trip?.id}
        getTripPrice={getTripPrice}
        onSave={handleBulkSave}
        bulkSaving={bulkSaving}
      />
    </AdminLayout>
  );
}
