import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Plus, CheckCircle2, XCircle, MessageCircle, Phone, Globe, ChevronDown, IndianRupee, SlidersHorizontal, Trash2, Users, User, Utensils, Pencil, X, Hourglass, CalendarCheck, CalendarClock, Search, Briefcase, Building2, Package, CalendarDays, Bird, FileText, Share2, Eye, UserX, UserCheck, LogIn, ExternalLink, UserMinus } from 'lucide-react';
import AdminLayout from '../AdminLayout';
import Button from '../../components/ui/Button';
import FoodMark from '../../components/ui/FoodMark';
import { TableHeaderBar, TablePagination, SortableTh, ContactQuickLinks } from '../../components/ui/DataTableChrome';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import { paginate, useDragScroll } from '../../components/ui/dataTableUtils';
import type { SortDirection } from '../../components/ui/dataTableUtils';
import { useConfirm } from '../../components/ui/useConfirm';
import { useAlert } from '../../components/ui/useAlert';
import { getEnquiries, updateEnquiryStatus, createManualEnquiry, recordPayment, getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin, cancelEnquiry, uncancelEnquiry, recordRefund, deleteEnquiry, markWaitlistConverted, getWaitlistEntries, setEnquiryNoShow, getPaymentsForEnquiry, recordTypedPayment, generatePendingInvoice, addExtraCharge, markInvoicePaid, markEnquiryCompleted, checkInEnquiry, undoCheckInEnquiry, setEnquiryFollowUp, setBookingFollowUp, recordContactOutcome } from '../../services/api';
import type { CancellationReason, ClosedReason, Enquiry, UpcomingTrip, CompletedTrip, WaitlistEntry, Payment } from '../../types/types-index';
import { downloadInvoicePdf, invoiceAsFile } from '../../utils/invoicePdf';
import { formatDate, formatDateRange, formatTime, formatPrice, seatsLeft, buildGroupLetterMap, downloadCsv, getWhatsAppLink } from '../../utils/utils-index';
import type { GroupUnit } from '../../utils/utils-index';
import {
  PACKAGE_CONFIG, emptyGenerateInvoiceForm,
  foodBadge, foodPreferenceKey, SOURCE_CONFIG,
  journeyBadge, nextManualAction, isNotInterested, canMarkNotInterested, JourneyLifecycleLegend, JOURNEY_STAGE_CONFIG,
  closedReasonLabel, closedReasonBreakdown, canSetFollowUp, followUpStatus,
  canSetBookingFollowUp, bookingFollowUpStatus, canCancelBooking,
} from './AdminEnquiryCommon';
import type { GenerateInvoiceForm, PaymentForm } from './AdminEnquiryCommon';

import {
  phoneSignature, emailSignature, GROUP_COLOR_PALETTE,
  BULK_NO_CHANGE,
  paymentStatus, paymentBalance, paymentFilterKey, isBooked, isCancelled, seatStatus,
  isGroupEntry, refundStatus, STATUS_CONFIG, PAY_FILTER_LABELS, FOOD_FILTER_LABELS,
  BOOKING_FILTER_LABELS, GROUP_FILTER_LABELS, PACKAGE_FILTER_LABELS, packageFilterKey,
  emptyForm, emptyWaitlistPerson, emptyBulkForm,
} from './AdminEnquiriesShared';
import type { BulkEditForm, EnquiryForm, WaitlistPersonForm } from './AdminEnquiriesShared';
import FilterDropdown from './AdminFilterDropdown';
import AddEnquiryModal from './AdminAddEnquiryModal';
import PaymentModal from './AdminPaymentModal';
import DetailsModal from './AdminDetailsModal';
import GenerateInvoiceModal from './AdminGenerateInvoiceModal';
import MarkPaidModal, { emptyMarkPaidForm, type MarkPaidForm } from './AdminMarkPaidModal';
import NotInterestedModal from './AdminNotInterestedModal';
import FollowUpModal from './AdminFollowUpModal';
import BookingFollowUpModal, { type BookingFollowUpResult } from './AdminBookingFollowUpModal';
import ContactOutcomeModal from './AdminContactOutcomeModal';
import type { ContactOutcomeResult } from './AdminContactOutcomeModal';
import CancelModal from './AdminCancelModal';
import BulkEditModal from './AdminBulkEditModal';

export default function AdminEnquiries() {
  const confirm = useConfirm();
  const alert = useAlert();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  // Only used to resolve trip titles / tell a genuinely-deleted trip apart
  // from one that simply graduated into a completed album (see
  // sync_started_trip_albums in schema.sql — the album keeps the same id,
  // but the upcoming_trips row itself gets removed once the album is
  // published). Not refreshed after every mutation like `trips` is, since
  // it's only needed for this lookup, not for editing/booking flows.
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Enquiry['status']>('all');
  // Booking Journey filter — a separate, finer-grained dimension from
  // `filter` above (Lead Status: new/contacted/closed only). Lets an admin
  // isolate a specific stage of the pipeline the Status column already
  // shows per row (e.g. just "Fully Paid" or "Checked In"), which the
  // existing Lead Status/Booking filters couldn't reach on their own.
  // Excludes 'cancelled' — that's Booking State, already covered by the
  // Booking filter's Cancelled option (isCancelled()), not a journey stage
  // going forward (see JOURNEY_STAGE_CONFIG's comment on that legacy value).
  const [journeyFilter, setJourneyFilter] = useState<'all' | Exclude<Enquiry['journey_stage'], 'cancelled'>>('all');
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'not_set'>('all');
  const [bookedFilter, setBookedFilter] = useState<'all' | 'booked' | 'not_booked' | 'cancelled'>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | 'group' | 'solo'>('all');
  const [foodFilter, setFoodFilter] = useState<'all' | 'veg' | 'non_veg' | 'not_set'>('all');
  const [packageFilter, setPackageFilter] = useState<'all' | 'early_bird' | 'normal'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | Enquiry['source']>('all');
  // Quick toggle for "follow-ups due" — deliberately just a boolean chip
  // (not a full FilterDropdown like Payment/Booking above) since there's
  // only ever one meaningful thing to isolate here: reminders that are due
  // today or overdue. See followUpStatus() in AdminEnquiryCommon.tsx for what
  // counts as "due".
  const [followUpDueOnly, setFollowUpDueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Table pagination — 50 rows per page, matching the reference table
  // design. Reset to page 1 whenever a filter or search term changes (see
  // effect below), so the admin never lands on a now-empty page.
  const [currentPage, setCurrentPage] = useState(1);
  const ENQUIRIES_PAGE_SIZE = 10;
  const { ref: tableScrollRef, isDragging, handlers: dragHandlers } = useDragScroll<HTMLDivElement>();
  // Column sorting — clicking a sortable header sorts the filtered list by
  // that column; clicking the same header again flips the direction.
  type EnquirySortKey = 'name' | 'group' | 'food' | 'source' | 'date' | 'package' | 'payment' | 'status' | 'follow_up';
  const [sortKey, setSortKey] = useState<EnquirySortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const handleSort = (key: EnquirySortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  // Which single filter's dropdown is open — only one at a time. 'more'
  // is the overflow menu for less-frequently-used filters (currently just
  // Source), keeping the main bar to five compact boxes.
  const [openFilterPanel, setOpenFilterPanel] = useState<'trip' | 'query' | 'journey' | 'pay' | 'booked' | 'group' | 'food' | 'package' | 'more' | null>(null);
  const [selectedTripKey, setSelectedTripKey] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  // Enquiry id currently generating/sharing its invoice PDF — disables the
  // invoice buttons on that one row only while the payments ledger fetch +
  // PDF build (or the native share sheet) is in flight.
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
  // Per-payment invoices for whichever enquiry is open in the Details
  // modal — fetched on demand (see the useEffect keyed on detailsTarget?.id
  // below), same lazy-load pattern as handleDownloadInvoice already used
  // for the cumulative PDF.
  const [detailsInvoices, setDetailsInvoices] = useState<Payment[]>([]);
  const [detailsInvoicesLoading, setDetailsInvoicesLoading] = useState(false);
  const [invoiceRowBusyId, setInvoiceRowBusyId] = useState<string | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<Payment | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState<MarkPaidForm>(emptyMarkPaidForm);
  const [savingMarkPaid, setSavingMarkPaid] = useState(false);
  const [generateInvoiceTarget, setGenerateInvoiceTarget] = useState<Enquiry | null>(null);
  const [generateInvoiceForm, setGenerateInvoiceForm] = useState<GenerateInvoiceForm>(emptyGenerateInvoiceForm);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EnquiryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  // Set when we arrived here via "Convert to Enquiry" from the Waitlist page —
  // once the enquiry below is actually saved, this waitlist row gets marked
  // 'converted' too, instead of the moment the admin merely navigates here.
  // groupId/groupSize/groupSeq let a multi-seat waitlist group (group_size
  // > 1) end up linked the same way a public "Group" booking is: every
  // enquiry converted from the same waitlist row shares one group_id, so
  // they render together (shared color, "Group X/Y" badge) in the list
  // below instead of looking like unrelated solo bookings. The waitlist
  // row's own id is reused as the group_id — stable across however many
  // separate Convert & Save passes it takes to seat the whole group, with
  // no extra column or coordination needed.
  const [convertingWaitlist, setConvertingWaitlist] = useState<{ id: string; name: string; groupId: string | null; groupSize: number | null; groupSeq: number; slots: number } | null>(null);
  // Filled in whenever slots > 1 — one entry per seat being converted in
  // this pass, so admins can seat everyone that fits in the seats actually
  // available right now instead of repeating the whole flow per person.
  // Left empty for solo/single-slot conversions, which still use the plain
  // `form` fields below exactly as before.
  const [waitlistPeople, setWaitlistPeople] = useState<WaitlistPersonForm[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Desktop: clicking a name opens a details popup instead of expanding an
  // inline row (mobile keeps the tap-to-expand card behavior via
  // expandedId above).
  const [detailsTarget, setDetailsTarget] = useState<Enquiry | null>(null);
  // Separate from expandedId: expandedId also drives the mobile
  // expand/collapse toggle and should stay set. highlightId is purely a
  // "you arrived here via a link" visual cue for the desktop table (which
  // has no expand/collapse concept) and fades out on its own.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [paymentTarget, setPaymentTarget] = useState<Enquiry | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ package_type: 'normal', total_amount: '', amount_paid: '', payment_type: 'advance', status: 'paid', payment_method: '', payment_utr: '', refund_amount: '', refund_method: '', refund_utr: '', refund_date: '', refund_notes: '', food_preference: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  // Read-only ledger shown inline in the Track Payment modal (Phase F) —
  // same on-demand fetch pattern as detailsInvoices above, just keyed to
  // paymentTarget instead of detailsTarget.
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Enquiry | null>(null);
  const [cancelCharges, setCancelCharges] = useState<number | ''>('');
  const [cancelIsNoShow, setCancelIsNoShow] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancellationReason | ''>('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [togglingNoShow, setTogglingNoShow] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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
  // at once. Selection is keyed by enquiry id and is intentionally cleared
  // whenever the admin drills into a different trip group, since the
  // checkboxes only ever reflect what's currently on screen.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Bulk Edit writes pricing fields (total_amount/amount_paid) as one flat
  // value across every selected row — safe only when they all belong to
  // the same trip (different trips have different prices). Group members
  // share trip_id by construction, so this is really just guarding against
  // a mixed selection made while the Trip filter is "All". Null trip_id
  // (general enquiries) still counts as its own bucket so a mix of
  // trip-linked and general enquiries is caught too.
  const selectedTripIds = useMemo(
    () => new Set(enquiries.filter(e => selectedIds.has(e.id)).map(e => e.trip_id ?? 'none')),
    [enquiries, selectedIds]
  );
  const bulkEditAllowed = selectedTripIds.size <= 1;
  // trip_title is snapshotted directly on each enquiry row at submit time
  // (see submitEnquiry/createManualEnquiry in api.ts), so it's available
  // here without needing to cross-reference the trips list — which only
  // covers upcoming trips anyway, not completed ones.
  const selectedTripName = useMemo(() => {
    if (selectedTripIds.size !== 1) return null;
    const selected = enquiries.find(e => selectedIds.has(e.id));
    return selected?.trip_id ? selected.trip_title || 'Untitled trip' : 'General enquiry (no trip)';
  }, [enquiries, selectedIds, selectedTripIds]);
  // Mobile only: filter panel is collapsed by default (it's 7 stacked
  // fields — always showing it pushes the actual list off-screen on a
  // phone) and is opened via the toggle in the Filters header. Desktop
  // ignores this entirely and always shows the panel expanded.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkEditForm>(emptyBulkForm);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
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

  // Loads the per-payment invoice list whenever the Enquiry Details modal is
  // opened for a different (or no) enquiry — same on-demand fetch pattern as
  // handleDownloadInvoice, just kept around so the Invoices section can
  // render without an extra click.
  useEffect(() => {
    if (!detailsTarget) {
      setDetailsInvoices([]);
      return;
    }
    let cancelled = false;
    setDetailsInvoicesLoading(true);
    getPaymentsForEnquiry(detailsTarget.id)
      .then(rows => { if (!cancelled) setDetailsInvoices(rows); })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setDetailsInvoicesLoading(false); });
    return () => { cancelled = true; };
  }, [detailsTarget?.id]);

  // Same lazy-load pattern, for the Track Payment modal's inline history.
  useEffect(() => {
    if (!paymentTarget) {
      setPaymentHistory([]);
      return;
    }
    let cancelled = false;
    setPaymentHistoryLoading(true);
    getPaymentsForEnquiry(paymentTarget.id)
      .then(rows => { if (!cancelled) setPaymentHistory(rows); })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setPaymentHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [paymentTarget?.id]);

  const load = () => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  };

  const loadWaitlistCounts = () => {
    getWaitlistEntries()
      .then(entries => {
        setWaitlistEntriesForGroups(entries);
        const counts: Record<string, { entries: number; people: number }> = {};
        entries.forEach(e => {
          if (e.status !== 'waiting') return;
          const needed = e.group_size && e.group_size > 1 ? e.group_size : 1;
          const prev = counts[e.trip_id] || { entries: 0, people: 0 };
          counts[e.trip_id] = { entries: prev.entries + 1, people: prev.people + needed };
        });
        setWaitlistWaitingCounts(counts);
      })
      .catch(console.error);
  };

  // Phrases a trip's waiting count so a group signup reads as a group, not
  // as "1 person" — e.g. a lone group-of-3 signup becomes "1 group of 3",
  // and a mix of signups becomes "5 people across 2 waitlist signups".
  const describeWaiting = (summary: { entries: number; people: number }): string => {
    if (summary.entries === 1) {
      return summary.people > 1 ? `1 group of ${summary.people}` : '1 person';
    }
    return `${summary.people} people across ${summary.entries} waitlist signups`;
  };

  useEffect(() => {
    load();
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error);
    getAllCompletedTripsAdmin().then(setCompletedTrips).catch(console.error);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tripParam) setSelectedTripKey(tripParam);
    if (enquiryParam) {
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
  }, [enquiries, searchParams, setSearchParams]);

  // Someone hit "Convert to Enquiry" on the Waitlist page — a seat opened up
  // (usually from a cancellation) and this person is next in line. Prefill
  // the add-enquiry form with what we already know about them so the admin
  // only has to fill in the payment.
  // Syncs local state FROM router navigation state (external system, set by
  // AdminWaitlist's navigate() call) and also calls navigate() itself to
  // clear that state once consumed — genuinely effect territory, not a
  // simple prop-driven reset.
  useEffect(() => {
    const incoming = (location.state as { convertWaitlist?: { id: string; full_name: string; phone: string; email: string; age?: number | null; city?: string | null; food_preference?: 'veg' | 'non_veg' | null; trip_id?: string; trip_title?: string; message?: string; group_size?: number | null; already_converted?: number; slots?: number } } | null)?.convertWaitlist;
    if (!incoming) return;
    // This can now be a partial group conversion — some of the group may
    // already have been converted in an earlier pass (see
    // AdminWaitlist.handleConvert / markWaitlistConverted), so the note
    // should only ask the admin to log whatever's genuinely still
    // outstanding after this pass, not the original group size.
    const alreadyConverted = incoming.already_converted ?? 0;
    // How many people AdminWaitlist determined we can actually seat right
    // now (never more than what's still needed, never more than what's
    // physically free) — 1 for a solo entry or when only one seat is open.
    const slots = Math.max(incoming.slots ?? 1, 1);
    const stillToLog = incoming.group_size && incoming.group_size > 1
      ? Math.max(incoming.group_size - alreadyConverted - slots, 0)
      : 0;
    const groupNote = incoming.group_size && incoming.group_size > 1
      ? [
          `Converted from waitlist (group of ${incoming.group_size}`,
          alreadyConverted > 0 ? ` — ${alreadyConverted} already logged, logging ${slots} more now` : ` — logging ${slots} now`,
          stillToLog > 0 ? `, ${stillToLog} seat${stillToLog === 1 ? '' : 's'} still to go after this` : ', completes the group',
          ').',
        ].join('')
      : 'Converted from waitlist.';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      ...emptyForm,
      full_name: incoming.full_name,
      phone: incoming.phone,
      email: incoming.email || '',
      age: incoming.age ?? '',
      city: incoming.city ?? '',
      food_preference: incoming.food_preference ?? '',
      trip_id: incoming.trip_id || '',
      source: 'other',
      message: incoming.message
        ? `${groupNote} ${incoming.message}`
        : groupNote,
    });
    // Bulk mode (slots > 1): one editable row per seat, first one prefilled
    // with the contact who actually signed up for the waitlist, the rest
    // blank for the admin to fill in with the other group members' details
    // (the waitlist signup itself only ever captures one contact for the
    // whole group).
    setWaitlistPeople(
      slots > 1
        ? [
            {
              full_name: incoming.full_name,
              phone: incoming.phone,
              email: incoming.email || '',
              age: incoming.age ?? '',
              city: incoming.city ?? '',
              food_preference: incoming.food_preference ?? '',
              amount_paid: '',
            },
            ...Array.from({ length: slots - 1 }, () => ({ ...emptyWaitlistPerson })),
          ]
        : []
    );
    setConvertingWaitlist({
      id: incoming.id,
      name: incoming.full_name,
      // Only a real group (size > 1) needs linking — a solo waitlist entry
      // stays group_id: null, same as any other solo enquiry.
      groupId: incoming.group_size && incoming.group_size > 1 ? incoming.id : null,
      groupSize: incoming.group_size && incoming.group_size > 1 ? incoming.group_size : null,
      // alreadyConverted people already hold seats 1..alreadyConverted in
      // the group, so this pass starts at the next open slot.
      groupSeq: alreadyConverted + 1,
      slots,
    });
    setModalOpen(true);
    // Clear the handoff state so refreshing or navigating back doesn't
    // reopen the modal with stale data.
    navigate(location.pathname, { replace: true });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Looks up what a trip actually charges for a given package (early-bird or
  // normal). Returns undefined if the trip or that price isn't set.
  const getTripPrice = (tripId: string | undefined, packageType: Enquiry['package_type']): number | undefined => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return undefined;
    const price = packageType === 'early_bird' ? trip.early_bird_price : trip.price;
    return price ?? undefined;
  };

  // Suggests the trip's active price (early-bird or normal) as a starting
  // point for total_amount whenever the trip or package changes. The admin
  // can still type over it — this is just to save a lookup.
  const applySuggestedAmount = (tripId: string, packageType: Enquiry['package_type']) => {
    const suggested = getTripPrice(tripId, packageType);
    if (suggested != null) {
      setForm(f => ({ ...f, total_amount: suggested }));
    }
  };

  // Trip prices load asynchronously, separately from the handoff above, so
  // fill in the suggested total once both the converting entry and the
  // trip list are available. Depends on the combination of three pieces of
  // state settling together (not a single prop change), so this isn't a
  // good fit for the render-time-adjustment pattern used elsewhere in this
  // file — an effect is the right tool here.
  useEffect(() => {
    if (!convertingWaitlist || !form.trip_id || trips.length === 0 || form.total_amount !== '') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applySuggestedAmount(form.trip_id, form.package_type);
  }, [convertingWaitlist, trips, form.trip_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expandedId) return;
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

  const [prevSelectedTripKey, setPrevSelectedTripKey] = useState(selectedTripKey);
  if (selectedTripKey !== prevSelectedTripKey) {
    setPrevSelectedTripKey(selectedTripKey);
    setSelectedIds(new Set());
  }

  // ---- Record Contact Outcome (New -> Contacted, and re-logging the next
  // call while still Contacted) --------------------------------------------
  // Replaces the old direct "Mark Contacted" status flip: status only ever
  // becomes 'contacted' (or 'closed', for Not Interested/Wrong Number)
  // once this popup is saved — see ContactOutcomeModal.tsx and
  // recordContactOutcome() in services/api.ts.
  const [contactOutcomeTarget, setContactOutcomeTarget] = useState<Enquiry | null>(null);
  const [savingContactOutcome, setSavingContactOutcome] = useState(false);
  const handleSaveContactOutcome = async (result: ContactOutcomeResult) => {
    if (!contactOutcomeTarget) return;
    setSavingContactOutcome(true);
    try {
      await recordContactOutcome(contactOutcomeTarget.id, {
        outcome: result.outcome,
        notes: result.notes,
        followUpAt: result.followUpAt || null,
        followUpTime: result.followUpTime || null,
        closedReason: result.closedReason,
      });
      const target = contactOutcomeTarget;
      setContactOutcomeTarget(null);
      load();
      // Interested is the one outcome that moves towards a booking — open
      // Track Payment right away, same as the old auto-open-on-Contacted
      // behaviour, so the admin can record the advance in one flow.
      if (result.outcome === 'interested') {
        openPayment({ ...target, status: 'contacted' });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to record contact outcome.');
    } finally {
      setSavingContactOutcome(false);
    }
  };

  const openAdd = () => {
    setForm(emptyForm);
    setConvertingWaitlist(null);
    setWaitlistPeople([]);
    setModalOpen(true);
  };

  const closeAddModal = () => {
    setModalOpen(false);
    setConvertingWaitlist(null);
    setWaitlistPeople([]);
  };

  const updateWaitlistPerson = (index: number, patch: Partial<WaitlistPersonForm>) => {
    setWaitlistPeople(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const openPayment = (enquiry: Enquiry) => {
    setPaymentTarget(enquiry);
    const packageType = enquiry.package_type || 'normal';
    // If no amount has been recorded yet, pull the trip's price for whichever
    // package this booking is under so the admin isn't starting from blank.
    const suggested = enquiry.total_amount ?? getTripPrice(enquiry.trip_id, packageType);
    setPaymentForm({
      package_type: packageType,
      total_amount: suggested ?? '',
      // Blank, not enquiry.amount_paid — this field is now "amount for this
      // payment," matching Generate Invoice, not a running total to edit
      // down to. Package/total/food-preference edits below can still be
      // saved with amount_paid left blank; that's a no-op on the ledger.
      amount_paid: '',
      payment_type: 'advance',
      status: 'paid',
      payment_method: '',
      payment_utr: '',
      // No-shows forfeit the full amount paid, no exceptions — refund
      // amount is locked at 0 rather than showing whatever was last on record.
      refund_amount: enquiry.is_no_show ? 0 : enquiry.refund_amount ?? 0,
      refund_method: '',
      refund_utr: '',
      refund_date: '',
      refund_notes: '',
      food_preference: enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : '',
    });
  };

  // Reactivates a previously cancelled enquiry. Re-books the seat if
  // something had been paid, and resets booking_status via uncancelEnquiry.
  const handleReactivate = async (e: Enquiry) => {
    setUpdating(e.id);
    try {
      await uncancelEnquiry(e);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to reactivate booking.');
    } finally {
      setUpdating(null);
    }
  };

  // Cancel/reactivate entry point for the row-level button. Reactivating
  // happens immediately; cancelling opens a modal first so third-party
  // charges (airline/hotel penalties) can be recorded up front — cancelEnquiry
  // uses them to compute suggested_refund_amount.
  const handleCancelToggle = (e: Enquiry) => {
    if (e.cancelled_at) {
      handleReactivate(e);
    } else {
      setCancelTarget(e);
      setCancelCharges('');
      setCancelIsNoShow(false);
      setCancelReason('');
      setCancelNotes('');
    }
  };

  // Cancels an enquiry. Frees the trip seat immediately but never touches
  // amount_paid — that stays as the record of what was actually collected,
  // separate from whatever gets refunded. isNoShow forces the suggested
  // refund to 0 server-side (see cancelEnquiry).
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const charges = cancelCharges === '' ? undefined : Number(cancelCharges);
      await cancelEnquiry(cancelTarget, charges, cancelIsNoShow, cancelReason || undefined, cancelNotes);
      setCancelTarget(null);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to cancel booking.');
    } finally {
      setCancelling(false);
    }
  };

  // Toggles is_no_show independent of cancellation — e.g. an admin
  // realizing after the trip departed that a still-"confirmed" booking was
  // actually a no-show. The DB trigger recomputes suggested_refund_amount
  // in response, so refresh paymentTarget from the returned row.
  const handleToggleNoShow = async (e: Enquiry, isNoShow: boolean) => {
    setTogglingNoShow(true);
    try {
      const updated = await setEnquiryNoShow(e, isNoShow);
      setPaymentTarget(updated);
      // No refund for no-shows — clear whatever was in the field so it
      // can't be saved through by accident.
      if (isNoShow) {
        setPaymentForm(f => ({ ...f, refund_amount: 0 }));
      }
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to update no-show status.');
    } finally {
      setTogglingNoShow(false);
    }
  };

  // Permanently removes an enquiry. If it currently holds a seat, that seat
  // is released first (handled inside deleteEnquiry) so trip counts stay
  // accurate.
  const handleDelete = async (e: Enquiry) => {
    const ok = await confirm({
      title: 'Delete this enquiry?',
      message: 'This permanently removes the enquiry and its payment history. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setUpdating(e.id);
    try {
      await deleteEnquiry(e);
      if (e.trip_id) {
        const freshTrips = await getAllUpcomingTripsAdmin();
        setTrips(freshTrips);
      }
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to delete enquiry.');
    } finally {
      setUpdating(null);
    }
  };

  // Downloads (or, on devices that support the Web Share API with files,
  // shares to WhatsApp/etc.) the invoice PDF for a booked enquiry. Only
  // meaningful once a booking_id exists — that's assigned server-side the
  // first time amount_paid > 0 (see add_booking_id_invoice.sql), which is
  // the same test isBooked() below uses, so the button is only shown/enabled
  // for rows that are actually booked.
  const handleDownloadInvoice = async (e: Enquiry) => {
    setInvoiceBusyId(e.id);
    try {
      const payments = await getPaymentsForEnquiry(e.id);
      await downloadInvoicePdf(e, payments);
    } catch (err) {
      console.error(err);
      alert('Failed to generate invoice.');
    } finally {
      setInvoiceBusyId(null);
    }
  };

  // Web Share API (level 2, file sharing) lets mobile browsers hand the PDF
  // straight to WhatsApp/etc. as an attachment. Desktop browsers (and older
  // mobile ones) don't support sharing files this way, so those fall back
  // to opening a wa.me chat with a text summary instead — the admin can
  // then attach the file they just downloaded manually.
  const handleShareInvoice = async (e: Enquiry) => {
    setInvoiceBusyId(e.id);
    try {
      const payments = await getPaymentsForEnquiry(e.id);
      const file = await invoiceAsFile(e, payments);
      const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: `ULAA Invoice — ${e.booking_id || ''}`,
          text: `Invoice for booking ${e.booking_id || ''} (${e.trip_title || 'ULAA trip'})`,
        });
      } else {
        await downloadInvoicePdf(e, payments);
        const text = encodeURIComponent(
          `Hi ${e.full_name}, here's your ULAA booking summary:\n` +
          `Booking ID: ${e.booking_id || '—'}\n` +
          `Trip: ${e.trip_title || '—'}\n` +
          `Amount paid: ${formatPrice(e.amount_paid || 0)}${e.total_amount ? ` of ${formatPrice(e.total_amount)}` : ''}\n` +
          `The invoice PDF has been downloaded — please attach it to this chat.`
        );
        const digits = (e.phone || '').replace(/\D/g, '');
        window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      // AbortError just means the admin cancelled the native share sheet —
      // not a real failure, so don't show an error toast for it.
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error(err);
      alert('Failed to share invoice.');
    } finally {
      setInvoiceBusyId(null);
    }
  };

  // Opens the Generate Invoice modal for a given booking — reset to a fresh
  // form each time so a leftover amount/type from the last invoice doesn't
  // carry over.
  const handleOpenGenerateInvoice = (e: Enquiry) => {
    setGenerateInvoiceForm(emptyGenerateInvoiceForm);
    setGenerateInvoiceTarget(e);
  };

  // Generates one invoice line for the booking, routed to the right
  // services/api.ts function depending on type + status:
  //   - extra_charge          -> addExtraCharge (also bumps total_amount)
  //   - anything else, pending -> generatePendingInvoice (invoice only, no
  //                                money counted yet)
  //   - anything else, paid    -> recordTypedPayment (money collected now)
  // Refund isn't offered here — see GENERATE_INVOICE_TYPE_OPTIONS above.
  const handleGenerateInvoice = async () => {
    if (!generateInvoiceTarget) return;
    const amount = generateInvoiceForm.amount === '' ? 0 : Number(generateInvoiceForm.amount);
    if (amount <= 0) {
      alert('Enter an amount greater than zero.');
      return;
    }
    try {
      setSavingInvoice(true);
      const notes = generateInvoiceForm.notes.trim() || undefined;
      let updatedEnquiry: Enquiry = generateInvoiceTarget;

      const payment_method = generateInvoiceForm.status === 'paid' ? (generateInvoiceForm.payment_method || undefined) : undefined;
      const utr_number = generateInvoiceForm.status === 'paid' ? (generateInvoiceForm.utr_number || undefined) : undefined;

      if (generateInvoiceForm.type === 'extra_charge') {
        updatedEnquiry = await addExtraCharge(generateInvoiceTarget, amount, {
          collectedNow: generateInvoiceForm.status === 'paid',
          payment_method,
          utr_number,
          notes,
        });
      } else if (generateInvoiceForm.status === 'pending') {
        await generatePendingInvoice(generateInvoiceTarget.id, generateInvoiceForm.type, amount, notes);
      } else {
        updatedEnquiry = await recordTypedPayment(generateInvoiceTarget, {
          type: generateInvoiceForm.type,
          amount,
          payment_method,
          utr_number,
          notes,
        });
      }

      setGenerateInvoiceTarget(null);
      const freshInvoices = await getPaymentsForEnquiry(generateInvoiceTarget.id);
      setDetailsInvoices(freshInvoices);
      setDetailsTarget(updatedEnquiry);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to generate invoice.');
    } finally {
      setSavingInvoice(false);
    }
  };

  // Settles a pending invoice once the money's actually in hand. Updates
  // the invoice row and the booking's running total in place, then
  // refreshes the enquiries list in the background so the table (and any
  // seat/status side effects the DB trigger produced) stay in sync.
  // Opens the Mark Paid confirmation modal so the admin can capture payment
  // method + UTR/reference for this settlement (spec §6/9/46-48) instead of
  // firing the update straight away.
  const handleMarkInvoicePaid = (payment: Payment) => {
    setMarkPaidForm(emptyMarkPaidForm);
    setMarkPaidTarget(payment);
  };

  const handleConfirmMarkPaid = async () => {
    if (!markPaidTarget) return;
    const payment = markPaidTarget;
    try {
      setSavingMarkPaid(true);
      setInvoiceRowBusyId(payment.id);
      const updatedPayment = await markInvoicePaid(payment.id, {
        payment_method: markPaidForm.payment_method || undefined,
        utr_number: markPaidForm.utr_number || undefined,
      });
      setDetailsInvoices(prev => prev.map(p => (p.id === updatedPayment.id ? updatedPayment : p)));
      setDetailsTarget(prev => {
        if (!prev) return prev;
        const isRefund = updatedPayment.payment_type === 'refund';
        return { ...prev, amount_paid: (prev.amount_paid || 0) + (isRefund ? 0 : updatedPayment.amount) };
      });
      setMarkPaidTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to mark invoice as paid.');
    } finally {
      setInvoiceRowBusyId(null);
      setSavingMarkPaid(false);
    }
  };

  // Marks the trip as done — the one transition in booking_status's
  // lifecycle that a payment event can never infer on its own (see
  // markEnquiryCompleted's comment in services/api.ts).
  const handleMarkCompleted = async (enquiry: Enquiry) => {
    try {
      setCompletingId(enquiry.id);
      const updated = await markEnquiryCompleted(enquiry.id);
      setDetailsTarget(updated);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to mark booking as completed.');
    } finally {
      setCompletingId(null);
    }
  };

  // Stamps/clears checked_in_at — the one journey stage with no
  // payment/status signal to derive it from.
  const handleCheckIn = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await checkInEnquiry(enquiry);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to check in.');
    } finally {
      setUpdating(null);
    }
  };

  const handleUndoCheckIn = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await undoCheckInEnquiry(enquiry.id);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to undo check-in.');
    } finally {
      setUpdating(null);
    }
  };

  // Single entry point for the table's "Advance" button — dispatches to
  // whichever manual action nextManualAction() says is next for this row.
  const handleAdvance = (enquiry: Enquiry) => {
    switch (enquiry.journey_stage) {
      case 'new_enquiry':
      case 'contacted':
        return setContactOutcomeTarget(enquiry);
      case 'fully_paid':
        return handleCheckIn(enquiry);
      case 'checked_in':
        return handleMarkCompleted(enquiry);
      default:
        return undefined;
    }
  };

  // ---- Not Interested / Reopen (this is just a query, not a booking) ----
  // Mirrors AdminEnquiryDetail.tsx's handling exactly — this only applies
  // before anything's been paid, i.e. closing out a lead that went nowhere
  // after being contacted, as opposed to Cancel Booking (money already on
  // it). See isNotInterested()'s comment in AdminEnquiryCommon.tsx for why
  // 'closed' status alone is ambiguous without this. Added here (not just
  // on the CRM detail page) so the admin doesn't have to open a row just
  // to drop a lead that said no.
  // Opens the reason-picker modal below instead of closing immediately —
  // capturing *why* a lead didn't convert (see CLOSED_REASON_OPTIONS) is
  // what makes the "35 closed before booking" number in reporting
  // actionable instead of a dead end. Mirrors AdminEnquiryDetail.tsx.
  const [notInterestedTarget, setNotInterestedTarget] = useState<Enquiry | null>(null);
  const [closedReason, setClosedReason] = useState<ClosedReason>('no_response');
  const handleMarkNotInterested = (enquiry: Enquiry) => {
    setClosedReason('no_response');
    setNotInterestedTarget(enquiry);
  };
  const handleConfirmNotInterested = async () => {
    if (!notInterestedTarget) return;
    setUpdating(notInterestedTarget.id);
    try {
      await updateEnquiryStatus(notInterestedTarget.id, 'closed', closedReason);
      setNotInterestedTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
    } finally {
      setUpdating(null);
    }
  };

  // ---- Follow-up reminder (still warm, not ready to close either way) ----
  // Mirrors the Not Interested modal's shape (target + form state, confirm
  // handler) but writes just follow_up_at via setEnquiryFollowUp — this
  // never touches status/journey_stage itself. See canSetFollowUp/
  // followUpStatus in AdminEnquiryCommon.tsx and add_enquiry_follow_up.sql.
  const [followUpTarget, setFollowUpTarget] = useState<Enquiry | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const openFollowUpModal = (enquiry: Enquiry) => {
    setFollowUpDate(enquiry.follow_up_at || '');
    setFollowUpTarget(enquiry);
  };
  const handleSaveFollowUp = async () => {
    if (!followUpTarget || !followUpDate) return;
    setUpdating(followUpTarget.id);
    try {
      await setEnquiryFollowUp(followUpTarget.id, followUpDate);
      setFollowUpTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to set follow-up date.');
    } finally {
      setUpdating(null);
    }
  };
  const handleClearFollowUp = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await setEnquiryFollowUp(enquiry.id, null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to clear follow-up date.');
    } finally {
      setUpdating(null);
    }
  };

  // ---- Booking Follow-up (CRM spec section 8B) — post-booking reminder ----
  // Mirrors the Lead Follow-up block above, but for balance-payment/
  // document/passport-type reminders that only make sense once a booking
  // has actually started. See canSetBookingFollowUp/bookingFollowUpStatus
  // in AdminEnquiryCommon.tsx and add_booking_follow_up.sql.
  const [bookingFollowUpTarget, setBookingFollowUpTarget] = useState<Enquiry | null>(null);
  const handleSaveBookingFollowUp = async (result: BookingFollowUpResult) => {
    if (!bookingFollowUpTarget) return;
    setUpdating(bookingFollowUpTarget.id);
    try {
      await setBookingFollowUp(bookingFollowUpTarget.id, result.at, { time: result.time, type: result.type, notes: result.notes });
      setBookingFollowUpTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to set booking follow-up.');
    } finally {
      setUpdating(null);
    }
  };
  const handleClearBookingFollowUp = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await setBookingFollowUp(enquiry.id, null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to clear booking follow-up.');
    } finally {
      setUpdating(null);
    }
  };

  const handleReopenEnquiry = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await updateEnquiryStatus(enquiry.id, 'contacted');
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to reopen enquiry.');
    } finally {
      setUpdating(null);
    }
  };

  // Consolidates every per-row action that used to be a separate icon
  // button (or, for Cancel/Delete, still is on narrower layouts) into one
  // kebab menu — Cancel/Reactivate, Mark/Undo No Show, invoice
  // download/share, View Details, WhatsApp, Call, Delete.
  const buildRowActions = (e: Enquiry): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      { label: 'View Details', icon: Eye, onClick: () => setDetailsTarget(e) },
      { label: 'Open Full CRM Page', icon: ExternalLink, onClick: () => navigate(`/admin/enquiries/${e.id}`) },
    ];
    if (e.booking_id) {
      items.push(
        { label: 'Download Invoice', icon: FileText, onClick: () => handleDownloadInvoice(e), disabled: invoiceBusyId === e.id },
        { label: 'Share Invoice', icon: Share2, onClick: () => handleShareInvoice(e), disabled: invoiceBusyId === e.id },
      );
    }
    if (e.phone) {
      const firstName = e.full_name?.trim().split(/\s+/)[0];
      const greeting = firstName ? `Hi ${firstName}` : 'Hi';
      items.push(
        {
          label: 'WhatsApp',
          icon: MessageCircle,
          onClick: () => window.open(
            getWhatsAppLink(e.phone, `${greeting}, following up on your ${e.trip_title || 'enquiry'} with ULAA — `),
            '_blank',
            'noopener,noreferrer'
          ),
        },
        { label: 'Call', icon: Phone, onClick: () => { window.location.href = `tel:${e.phone}`; } },
      );
    }
    // Mark/Undo No Show — gated the same way setEnquiryNoShow() is
    // server-side (spec section 18's No Show Rules): only offered on an
    // active, Fully Paid booking whose Attendance hasn't started yet (not
    // checked in), and only once the trip date has actually arrived. Undo
    // No Show has no such gate — it's a correction path.
    if (e.is_no_show) {
      items.push({ label: 'Undo No Show', icon: UserCheck, onClick: () => handleToggleNoShow(e, false) });
    } else if (
      !e.cancelled_at && e.journey_stage === 'fully_paid' && !e.checked_in_at
      && (!e.departure_date || new Date(e.departure_date) <= new Date())
    ) {
      items.push({ label: 'Mark No Show', icon: UserX, onClick: () => handleToggleNoShow(e, true) });
    }
    if (e.journey_stage === 'checked_in') {
      items.push({ label: 'Undo Check In', icon: LogIn, onClick: () => handleUndoCheckIn(e) });
    }
    // Follow-up reminder — only offered while still genuinely Contacted
    // (see canSetFollowUp); also reachable via the inline chip in the
    // Follow-up column for rows where it's already set.
    if (canSetFollowUp(e)) {
      items.push(
        e.follow_up_at
          ? { label: 'Edit Follow-up Date', icon: CalendarClock, onClick: () => openFollowUpModal(e) }
          : { label: 'Set Follow-up Reminder', icon: CalendarClock, onClick: () => openFollowUpModal(e) }
      );
      if (e.follow_up_at) {
        items.push({ label: 'Clear Follow-up', icon: X, onClick: () => handleClearFollowUp(e) });
      }
    }
    // Booking Follow-up — only offered once the booking has actually
    // started (see canSetBookingFollowUp); also reachable via the inline
    // chip in the Follow-up column for rows where it's already set.
    if (canSetBookingFollowUp(e)) {
      items.push(
        e.booking_follow_up_at
          ? { label: 'Edit Booking Follow-up', icon: CalendarClock, onClick: () => setBookingFollowUpTarget(e) }
          : { label: 'Set Booking Follow-up', icon: CalendarClock, onClick: () => setBookingFollowUpTarget(e) }
      );
      if (e.booking_follow_up_at) {
        items.push({ label: 'Clear Booking Follow-up', icon: X, onClick: () => handleClearBookingFollowUp(e) });
      }
    }
    // "Not Interested" / "Reopen" only make sense before any money's
    // changed hands — once there's a booking_id or a payment on record,
    // closing the lead out is a Cancel Booking decision instead (different
    // consequences: refunds, seat release, etc).
    if (!e.cancelled_at && !e.booking_id && (e.amount_paid || 0) <= 0) {
      items.push(
        isNotInterested(e)
          ? { label: 'Reopen Enquiry', icon: RefreshCw, onClick: () => handleReopenEnquiry(e) }
          // Also available as a one-click inline button next to "Mark
          // Contacted" in the Update column (desktop table + mobile card)
          // — kept here too so it's still reachable from the kebab for
          // admins already in the habit of using it, or on rows where the
          // inline button doesn't fit.
          : { label: 'Not Interested (Close Query)', icon: UserMinus, onClick: () => handleMarkNotInterested(e) }
      );
    }
    // A Completed booking can't be cancelled, and neither can one that's
    // already checked in (spec section 18: "Checked In ... Not Allowed:
    // Cancel Booking" — undo the check-in first) — see cancelEnquiry's
    // guards in services/api.ts. Omit the action entirely rather than
    // showing it disabled or letting the click round-trip into an error
    // alert.
    if (e.cancelled_at || canCancelBooking(e)) {
      items.push(
        e.cancelled_at
          ? { label: 'Reactivate Booking', icon: RefreshCw, onClick: () => handleCancelToggle(e) }
          : { label: 'Cancel Booking', icon: XCircle, danger: true, onClick: () => handleCancelToggle(e) }
      );
    }
    items.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => handleDelete(e) });
    return items;
  };

  // Extra Charge and Pending both raise their own invoice row via the same
  // services/api.ts functions Generate Invoice uses (addExtraCharge /
  // generatePendingInvoice) rather than moving amount_paid through
  // recordPayment's running-total math — recordPayment's `type` override
  // still only covers the original four (full_payment/advance/balance/
  // installment) since Extra Charge changes total_amount itself and
  // Pending doesn't touch amount_paid at all. Either way, any total/
  // package/food edits sitting in the same form still need saving, so
  // those always go through a recordPayment call first (a no-op on the
  // ledger when the payment itself is routed elsewhere).
  const handleSavePayment = async () => {
    if (!paymentTarget) return;
    const totalAmount = paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
    // amount_paid is this transaction's own amount now (Generate Invoice's
    // semantics), so the running total recordPayment actually needs is the
    // existing amount_paid plus whatever's being entered here.
    const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
    const isExtraCharge = paymentForm.payment_type === 'extra_charge';
    const isPending = paymentForm.status === 'pending';
    const newRunningTotal = (paymentTarget.amount_paid || 0) + thisPayment;
    if (!isExtraCharge && !isPending && totalAmount != null && newRunningTotal > totalAmount) {
      alert("This payment would take the amount paid past the total amount.");
      return;
    }
    if ((isExtraCharge || isPending) && thisPayment <= 0) {
      alert(isExtraCharge ? 'Enter an extra charge amount greater than zero.' : 'Enter an amount greater than zero for the pending invoice.');
      return;
    }
    const refundAmount = paymentForm.refund_amount === '' ? 0 : Number(paymentForm.refund_amount);
    // Extra Charge collected now folds straight into amount_paid (below);
    // Pending never does, whatever the type — so the refund bound uses
    // what amount_paid will actually become, not the naive "already paid +
    // this payment" that only holds for a normal paid-now payment.
    const effectiveAmountPaid = isPending
      ? (paymentTarget.amount_paid || 0)
      : isExtraCharge
        ? (paymentTarget.amount_paid || 0) + thisPayment
        : newRunningTotal;
    if (refundAmount > effectiveAmountPaid) {
      alert("Refund amount can't be more than what was actually paid.");
      return;
    }
    try {
      setSavingPayment(true);
      let updated: Enquiry = paymentTarget;

      if (isExtraCharge) {
        // Total Amount is disabled in the UI for this type — addExtraCharge
        // bumps it by thisPayment itself, so there's nothing to reconcile.
        updated = await recordPayment(paymentTarget, {
          amount_paid: paymentTarget.amount_paid || 0,
          package_type: paymentForm.package_type,
          food_preference: paymentForm.food_preference || null,
        });
        updated = await addExtraCharge(updated, thisPayment, {
          collectedNow: !isPending,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
        });
      } else if (isPending) {
        updated = await recordPayment(paymentTarget, {
          amount_paid: paymentTarget.amount_paid || 0,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          food_preference: paymentForm.food_preference || null,
        });
        if (thisPayment > 0) {
          // Not extra_charge in this branch (handled above), so this is
          // always one of the four types generatePendingInvoice accepts.
          await generatePendingInvoice(paymentTarget.id, paymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment', thisPayment);
        }
      } else {
        updated = await recordPayment(paymentTarget, {
          amount_paid: newRunningTotal,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          food_preference: paymentForm.food_preference || null,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
          // Only meaningful when money is actually moving — recordPayment's
          // delta !== 0 guard already no-ops the ledger insert otherwise, so
          // there's no case where an unused type value could mislabel a
          // profile-only edit (total/package/food with no payment amount).
          // Not extra_charge in this branch (handled above), so this is
          // always one of the four types recordPayment's override accepts.
          type: thisPayment > 0 ? (paymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment') : undefined,
        });
      }

      if (paymentTarget.cancelled_at) {
        await recordRefund(updated, refundAmount, {
          payment_method: paymentForm.refund_method || undefined,
          utr_number: paymentForm.refund_utr || undefined,
          notes: paymentForm.refund_notes || undefined,
          paid_at: paymentForm.refund_date || undefined,
        });
      }
      setPaymentTarget(null);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save payment details.');
    } finally {
      setSavingPayment(false);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = paginatedEnquiries.length > 0 && paginatedEnquiries.every(e => next.has(e.id));
      if (allSelected) {
        paginatedEnquiries.forEach(e => next.delete(e.id));
      } else {
        paginatedEnquiries.forEach(e => next.add(e.id));
      }
      return next;
    });
  };

  const openBulkEdit = () => {
    setBulkForm(emptyBulkForm);
    setBulkEditOpen(true);
  };

  // Applies whichever bulk-edit fields the admin actually touched (anything
  // still on "No change" is left alone) across every selected enquiry.
  // Status is applied last and via the plain status-only endpoint — never
  // through recordPayment — and never opens the Track Payment popup, no
  // matter how many of the selected rows move to Contacted.
  const handleBulkSave = async () => {
    const targets = enquiries.filter(e => selectedIds.has(e.id));
    if (targets.length === 0) return;

    const touchesPaymentFields = bulkForm.food_preference !== BULK_NO_CHANGE
      || bulkForm.package_type !== BULK_NO_CHANGE
      || bulkForm.total_amount !== ''
      || bulkForm.amount_paid !== '';
    const touchesStatus = bulkForm.status !== BULK_NO_CHANGE;

    // Every field defaults to "No change" — if the admin hits Bulk Save
    // without touching anything, the loop below would silently do nothing
    // and still look like a success. Catch that here instead of guessing.
    if (!touchesPaymentFields && !touchesStatus) {
      alert('Pick at least one field to change before saving — everything is still set to "No change".');
      return;
    }

    // Unlike the single-enquiry payment modal, bulk edit applies one
    // total_amount/amount_paid pair across a whole selection whose rows can
    // each already have different total_amounts. Check every affected row
    // up front instead of letting the DB's per-row CHECK constraint reject
    // some rows partway through the loop below, which would leave the
    // batch half-applied with a confusing generic error.
    if (touchesPaymentFields) {
      const bulkTotal = bulkForm.total_amount === '' ? null : Number(bulkForm.total_amount);
      const bulkPaid = bulkForm.amount_paid === '' ? null : Number(bulkForm.amount_paid);
      if (bulkPaid != null) {
        const overpaid = targets.find(e => {
          const effectiveTotal = bulkTotal != null ? bulkTotal : e.total_amount;
          return effectiveTotal != null && bulkPaid > effectiveTotal;
        });
        if (overpaid) {
          alert(`Amount paid can't exceed the total amount — this would overpay ${overpaid.full_name}. Adjust the amount or set a matching total amount for the selection.`);
          return;
        }
      }
    }

    setBulkSaving(true);
    try {
      // Sequential, not Promise.all — firing these concurrently for
      // enquiries on the same trip means each recordPayment's capacity
      // check can race against the others (each briefly sees a stale
      // seats_booked before the previous one commits). The DB-side lock in
      // enforce_trip_capacity makes that race safe now, but it'd still
      // mean these calls queue up waiting on each other anyway — doing it
      // one at a time here avoids that contention and gives a clean,
      // predictable order if one of them fails partway through.
      for (const enquiry of targets) {
        if (touchesPaymentFields) {
          await recordPayment(enquiry, {
            amount_paid: bulkForm.amount_paid !== '' ? Number(bulkForm.amount_paid) : enquiry.amount_paid,
            total_amount: bulkForm.total_amount !== '' ? Number(bulkForm.total_amount) : enquiry.total_amount,
            package_type: bulkForm.package_type !== BULK_NO_CHANGE ? bulkForm.package_type : enquiry.package_type,
            food_preference: bulkForm.food_preference !== BULK_NO_CHANGE
              ? (bulkForm.food_preference === 'not_set' ? null : bulkForm.food_preference)
              : (enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : null),
          });
        }
        if (bulkForm.status !== BULK_NO_CHANGE) {
          await updateEnquiryStatus(enquiry.id, bulkForm.status);
        }
      }
      setBulkEditOpen(false);
      setBulkForm(emptyBulkForm);
      setSelectedIds(new Set());
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
      // Toast, not the blocking AlertDialog — this is just a confirmation,
      // not something that needs an "OK" click to dismiss. Otherwise a
      // successful save where the new value happens to match what most
      // rows already had (e.g. Package already Normal) looks identical to
      // nothing having happened at all, with no gentler way to say "done."
      showToast(`Updated ${targets.length} enquir${targets.length === 1 ? 'y' : 'ies'}.`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to update some of the selected enquiries.');
    } finally {
      setBulkSaving(false);
    }
  };

  // Permanently removes every selected enquiry. Same underlying delete as
  // the single-row action, just fanned out across the selection.
  //
  // Sequential, not Promise.all — same reasoning as the bulk save above:
  // deleting multiple booked enquiries for the same trip each triggers a
  // seat release, and firing those concurrently means they'd race on
  // seats_booked. Rare in practice (the DB trigger handles it safely
  // either way), but there's no reason not to be consistent here too.
  const handleBulkDelete = async () => {
    const targets = enquiries.filter(e => selectedIds.has(e.id));
    if (targets.length === 0) return;
    const ok = await confirm({
      title: `Delete ${targets.length} enquir${targets.length === 1 ? 'y' : 'ies'}?`,
      message: 'This permanently removes the selected enquiries and their payment history. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      for (const e of targets) {
        await deleteEnquiry(e);
      }
      const tripIds = new Set(targets.map(e => e.trip_id).filter(Boolean));
      if (tripIds.size > 0) {
        const freshTrips = await getAllUpcomingTripsAdmin();
        setTrips(freshTrips);
      }
      setSelectedIds(new Set());
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to delete some of the selected enquiries.');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Possible-duplicate soft warning (3.5) — fuzzy-matches the phone/email
  // being typed into the manual "Log an Enquiry" form against every
  // enquiry already in the system, across every trip, not just an exact
  // string match on the current trip the way the DB's own unique
  // constraint does. Catches the cases that constraint misses: the same
  // phone typed in a different format, or a second walk-in logged for
  // someone who already has a website enquiry under a slightly different
  // spelling of their name. Purely advisory — it never blocks Save, it
  // just gives the admin a chance to notice and merge by hand instead of
  // silently creating a second, untracked record for the same traveler.
  const possibleDuplicates = (() => {
    if (convertingWaitlist) return []; // this flow is already tied to one specific waitlist signup
    const phoneSig = phoneSignature(form.phone);
    const emailSig = emailSignature(form.email);
    if (!phoneSig && !emailSig) return [];
    return enquiries.filter(e =>
      (phoneSig && phoneSignature(e.phone) === phoneSig) ||
      (emailSig && emailSignature(e.email) === emailSig)
    );
  })();

  const handleSave = async () => {
    if (convertingWaitlist && convertingWaitlist.slots > 1) {
      return handleSaveWaitlistGroup();
    }
    if (!form.full_name.trim() || !form.phone.trim()) {
      alert('Name and phone are required.');
      return;
    }
    const totalAmount = form.total_amount === '' ? undefined : Number(form.total_amount);
    const amountPaid = form.amount_paid === '' ? 0 : Number(form.amount_paid);
    if (totalAmount != null && amountPaid > totalAmount) {
      alert("Amount paid can't be more than the total amount.");
      return;
    }
    // A waitlist entry can only become "converted" once real money is on
    // the booking — the DB trigger enforces this too, but check here first
    // so the admin gets a clear message instead of a generic save failure.
    if (convertingWaitlist && amountPaid <= 0) {
      alert('An advance payment is required to convert a waitlist entry into a booking. Enter at least the booking amount before saving.');
      return;
    }
    try {
      setSaving(true);
      const trip = trips.find(t => t.id === form.trip_id);
      const created = await createManualEnquiry({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || 'not-provided@ulaa.local',
        age: form.age === '' ? undefined : form.age,
        city: form.city.trim() || undefined,
        trip_id: form.trip_id || undefined,
        trip_title: trip?.title,
        source: form.source,
        message: form.message.trim() || undefined,
        food_preference: form.food_preference || undefined,
        status: 'new',
        package_type: form.package_type,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        // Link this seat to the rest of its waitlist group (if any) so it
        // renders grouped in the list below instead of as a standalone
        // enquiry — see the convertingWaitlist state comment above.
        ...(convertingWaitlist?.groupId
          ? { group_id: convertingWaitlist.groupId, group_size: convertingWaitlist.groupSize ?? undefined, group_seq: convertingWaitlist.groupSeq }
          : {}),
      }, amountPaid > 0 ? { payment_method: form.payment_method || undefined, utr_number: form.payment_utr || undefined } : undefined);
      if (convertingWaitlist) {
        await markWaitlistConverted(convertingWaitlist.id, created.id).catch(console.error);
        setConvertingWaitlist(null);
        loadWaitlistCounts();
      }
      setModalOpen(false);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      // Supabase throws plain PostgrestError objects for DB-rejected
      // inserts (e.g. the enforce_trip_capacity trigger), not instances of
      // Error — so `err instanceof Error` was false for those and this
      // always fell through to the generic fallback below, hiding the
      // trigger's actual message from the admin.
      const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      if (message === 'DUPLICATE_ENQUIRY') {
        alert('There\'s already an active enquiry for this trip with this exact name, phone, and email. If this is meant to be a different traveler, tweak one of those fields — a shared family phone/email with a different name is fine.');
      } else if (message === 'AGE_NOT_ELIGIBLE') {
        alert('The age entered falls outside this trip\'s age range (set in Admin → Trips → Basic Info). Adjust the age or the trip\'s age range and try again.');
      } else if (message && /no seats left/i.test(message)) {
        alert(convertingWaitlist
          ? 'All slots are filled. Unable to complete the conversion.'
          : 'This trip is fully booked — there are no seats left to log this enquiry against.');
      } else {
        alert(message || 'Failed to save enquiry.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Seats every person entered for this pass in one click — up to
  // convertingWaitlist.slots people (never more than the seats that were
  // actually free when this flow started). Each becomes its own enquiry,
  // sharing convertingWaitlist.groupId/groupSize so they render together
  // afterwards, same as any other group booking.
  //
  // Runs sequentially rather than Promise.all — markWaitlistConverted does
  // a fetch-then-update on the waitlist row's converted_enquiry_ids array,
  // so parallel calls would race and could silently drop an id. It also
  // means if the trip fills up partway through (e.g. someone else grabbed
  // a seat at the same time), whatever was already saved stays saved
  // instead of the whole batch failing.
  const handleSaveWaitlistGroup = async () => {
    if (!convertingWaitlist) return;

    const missing = waitlistPeople.find(p => !p.full_name.trim() || !p.phone.trim());
    if (missing) {
      alert('Every person needs at least a name and phone number.');
      return;
    }
    const totalAmount = form.total_amount === '' ? undefined : Number(form.total_amount);
    for (const p of waitlistPeople) {
      const amountPaid = p.amount_paid === '' ? 0 : Number(p.amount_paid);
      // Same rule as the single-conversion path: no waitlist entry becomes
      // a real booking without an advance payment on it (the DB trigger
      // enforces this too).
      if (amountPaid <= 0) {
        alert(`An advance payment is required to convert ${p.full_name.trim() || 'each person'} into a booking. Enter at least the booking amount for everyone before saving.`);
        return;
      }
      if (totalAmount != null && amountPaid > totalAmount) {
        alert(`${p.full_name.trim() || 'One person'}'s amount paid can't be more than the total amount.`);
        return;
      }
    }

    setSaving(true);
    const trip = trips.find(t => t.id === form.trip_id);
    let seated = 0;
    try {
      for (let i = 0; i < waitlistPeople.length; i++) {
        const p = waitlistPeople[i];
        const amountPaid = p.amount_paid === '' ? 0 : Number(p.amount_paid);
        const created = await createManualEnquiry({
          full_name: p.full_name.trim(),
          phone: p.phone.trim(),
          email: p.email.trim() || 'not-provided@ulaa.local',
          age: p.age === '' ? undefined : p.age,
          city: p.city.trim() || undefined,
          trip_id: form.trip_id || undefined,
          trip_title: trip?.title,
          source: form.source,
          message: form.message.trim() || undefined,
          food_preference: p.food_preference || undefined,
          status: 'new',
          package_type: form.package_type,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          group_id: convertingWaitlist.groupId ?? undefined,
          group_size: convertingWaitlist.groupSize ?? undefined,
          group_seq: convertingWaitlist.groupSeq + i,
        }, { payment_method: form.payment_method || undefined, utr_number: form.payment_utr || undefined });
        await markWaitlistConverted(convertingWaitlist.id, created.id);
        seated++;
      }
      setConvertingWaitlist(null);
      setWaitlistPeople([]);
      setModalOpen(false);
      loadWaitlistCounts();
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
      showToast(`Seated ${seated} of ${waitlistPeople.length} people from this group.`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      const partial = seated > 0 ? ` ${seated} of ${waitlistPeople.length} were saved before this happened.` : '';
      if (message === 'DUPLICATE_ENQUIRY') {
        alert(`There's already an active enquiry for this trip with that exact name, phone, and email.${partial} Tweak that person's details and try the remaining seats again.`);
      } else if (message === 'AGE_NOT_ELIGIBLE') {
        alert(`That person's age falls outside this trip's age range.${partial} Adjust their age (or the trip's age range in Admin → Trips) and try the remaining seats again.`);
      } else if (message && /no seats left/i.test(message)) {
        alert(`Ran out of free seats partway through this batch.${partial}`);
      } else {
        alert((message || 'Failed to save one of the enquiries.') + partial);
      }
      // Whatever did get saved is real — reflect it immediately rather than
      // leaving the admin looking at stale counts after a partial failure.
      if (seated > 0) {
        loadWaitlistCounts();
        const freshTrips = await getAllUpcomingTripsAdmin();
        setTrips(freshTrips);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

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

  // Is this enquiry a genuine "Contact Us" website message, as opposed to
  // a manual no-trip entry an admin logged? The manual-entry form's source
  // dropdown never offers 'website' (see SOURCE_OPTIONS), so trip_id null
  // + source 'website' can only come from submitContactEnquiry.
  const isGeneralContactMessage = (e: Enquiry) => !e.trip_id && e.source === 'website';

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
  const groupLabel = (e: Enquiry) =>
    e.group_id && groupLetterMap.has(e.group_id) ? `Group ${groupLetterMap.get(e.group_id)}` : 'Group';

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
  // groups first appear top-to-bottom in the (now-clustered) list — so any
  // two groups visible near each other on screen always get different
  // colors, which is what actually matters for telling them apart at a
  // glance. The color ties together a group's row background/left-accent
  // and its "Group x/y" badge everywhere it's rendered.
  const groupColorMap = new Map<string, number>();
  let nextGroupColorIdx = 0;
  sortedScoped.forEach(e => {
    if (e.group_id && !groupColorMap.has(e.group_id)) {
      groupColorMap.set(e.group_id, nextGroupColorIdx % GROUP_COLOR_PALETTE.length);
      nextGroupColorIdx++;
    }
  });
  const groupColor = (e: Enquiry) => (e.group_id ? GROUP_COLOR_PALETTE[groupColorMap.get(e.group_id)!] : null);

  const trimmedSearch = searchQuery.trim().toLowerCase();
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

  // Any change to what's being filtered/searched can shrink the result set
  // out from under the current page, so land back on page 1 whenever the
  // filters, trip scope, or search term change. Done during render
  // (comparing against the previous filter signature) rather than in an
  // effect — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const filterSignature = `${filter}|${journeyFilter}|${payFilter}|${bookedFilter}|${groupFilter}|${foodFilter}|${packageFilter}|${sourceFilter}|${followUpDueOnly}|${selectedTripKey}|${trimmedSearch}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setCurrentPage(1);
  }

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
  const activeFilterCount = (selectedTripKey !== null ? 1 : 0) + (filter !== 'all' ? 1 : 0) + (journeyFilter !== 'all' ? 1 : 0) + (payFilter !== 'all' ? 1 : 0) + (bookedFilter !== 'all' ? 1 : 0) + (groupFilter !== 'all' ? 1 : 0) + (foodFilter !== 'all' ? 1 : 0) + (packageFilter !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0) + (followUpDueOnly ? 1 : 0) + (trimmedSearch ? 1 : 0);

  // Drives the "Clear all" action in the filter bar below.
  const clearAllFilters = () => {
    setSelectedTripKey(null);
    setFilter('all');
    setJourneyFilter('all');
    setPayFilter('all');
    setBookedFilter('all');
    setGroupFilter('all');
    setFoodFilter('all');
    setPackageFilter('all');
    setSourceFilter('all');
    setFollowUpDueOnly(false);
    setSearchQuery('');
    setOpenFilterPanel(null);
  };

  // Exports exactly what's on screen: the current search/filter/sort, and —
  // since "Trip" is itself one of the filters (selectedTripKey) — scoping to
  // one trip before exporting gives a per-trip passenger list for free, no
  // separate "export this trip" button needed. All client-side: serializes
  // sortedFiltered straight to a download, no backend round-trip.
  const handleExportCsv = () => {
    const headers = [
      'Name', 'Phone', 'Email', 'Age', 'City', 'Trip', 'Group',
      'Package', 'Food Preference', 'Total Amount', 'Amount Paid',
      'Payment Status', 'Booking Status', 'Refund Amount', 'Lead Status',
      'Source', 'Cancelled', 'Created At',
    ];
    const rows = sortedFiltered.map(e => [
      e.full_name,
      e.phone,
      e.email,
      e.age ?? '',
      e.city ?? '',
      e.trip_id ? (e.trip_title ?? '') : 'General (No Trip)',
      isGroupEntry(e) ? groupLabel(e) : '',
      PACKAGE_CONFIG[e.package_type]?.label ?? e.package_type,
      e.food_preference ?? 'Not set',
      e.total_amount ?? '',
      e.amount_paid,
      paymentStatus(e).label,
      e.booking_status ?? '',
      e.refund_amount,
      e.status,
      e.source,
      e.cancelled_at ? 'Yes' : 'No',
      formatDate(e.created_at),
    ]);
    const scopeSuffix = activeGroup ? `-${activeGroup.title.replace(/\s+/g, '_')}` : '';
    downloadCsv(`enquiries${scopeSuffix}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const paymentTotals = (list: Enquiry[]) => ({
    collected: list.reduce((sum, e) => sum + (e.amount_paid || 0), 0),
    pending: list.reduce((sum, e) => {
      if (!e.total_amount) return sum;
      return sum + Math.max(0, e.total_amount - (e.amount_paid || 0));
    }, 0),
    paidFull: list.filter(e => e.total_amount && e.amount_paid >= e.total_amount).length,
    partial: list.filter(e => e.total_amount && e.amount_paid > 0 && e.amount_paid < e.total_amount).length,
    unpaid: list.filter(e => e.total_amount && e.amount_paid <= 0).length,
    notSet: list.filter(e => !e.total_amount).length,
  });

  // Meal-planning counts for a trip: how many veg vs non-veg vs not-yet-known.
  const foodTotals = (list: Enquiry[]) => ({
    veg: list.filter(e => foodPreferenceKey(e) === 'veg').length,
    nonVeg: list.filter(e => foodPreferenceKey(e) === 'non_veg').length,
    notSet: list.filter(e => foodPreferenceKey(e) === 'not_set').length,
  });

  // KPI snapshot builder for the summary cards up top — called with
  // scopedEnquiries so the numbers reflect whichever trip is currently
  // selected in the Trip filter (or business-wide when "All trips").
  const buildKpiCards = (list: Enquiry[]) => {
    const total = list.length;
    const openPending = list.filter(e => e.status === 'new').length;
    const contacted = list.filter(e => e.status === 'contacted').length;
    const booked = list.filter(isBooked).length;
    const cancelled = list.filter(isCancelled).length;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    return [
      { label: 'Total Enquiries', value: total, sub: 'All time', icon: MessageCircle },
      { label: 'Open / Pending', value: openPending, sub: `${pct(openPending)}% of total`, icon: Hourglass },
      { label: 'Contacted', value: contacted, sub: `${pct(contacted)}% of total`, icon: Phone },
      { label: 'Booked', value: booked, sub: `${pct(booked)}% of total`, icon: CalendarCheck },
      { label: 'Cancelled', value: cancelled, sub: `${pct(cancelled)}% of total`, icon: XCircle },
    ] as const;
  };

  // Small presentational helper so the exact same card markup renders both
  // the business-wide row up top and the per-trip row inside a drilled-into
  // trip view below. Plain function returning JSX (not a component defined
  // during render) to avoid remounting/resetting state on every render.
  // Icon style matches the Dashboard's KPI cards: no background circle,
  // every icon in the same brand color.
  const renderKpiCards = (cards: ReturnType<typeof buildKpiCards>) => (
    <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-white rounded-lg p-4 shadow-card min-w-0"
          >
            <div className="flex items-center gap-2">
              <Icon size={20} className="shrink-0 text-primary" />
              <p className="font-display text-2xl font-bold text-dark leading-tight">{card.value}</p>
            </div>
            <p className="text-dark-muted text-xs font-medium truncate mt-1">{card.label}</p>
          </div>
        );
      })}
    </div>
  );

  // Mobile-only: same KPI data as renderKpiCards, but laid out as a
  // horizontally-scrolling carousel of compact cards, rather than a
  // cramped 2-col grid.
  const renderKpiCarousel = (cards: ReturnType<typeof buildKpiCards>) => (
    <div className="sm:hidden">
      <div
        className="flex gap-2.5 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide"
      >
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="shrink-0 w-[132px] snap-start bg-white rounded-lg p-3 shadow-card"
            >
              <div className="flex items-center gap-2">
                <Icon size={18} className="shrink-0 text-primary" />
                <p className="font-display text-2xl font-bold text-dark leading-tight">{card.value}</p>
              </div>
              <p className="text-dark-muted text-xs font-medium truncate mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

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
            <Plus size={16} /> Add Enquiry
          </Button>
        </div>

        {/* KPI summary — desktop grid + mobile carousel, both scoped to
            whichever trip is selected in the Trip filter below (or
            business-wide when "All trips" is selected). */}
        {renderKpiCards(buildKpiCards(scopedEnquiries))}
        {renderKpiCarousel(buildKpiCards(scopedEnquiries))}

        {/* Mobile-only search bar — sits right under the KPI carousel so
            it's reachable with a thumb without hunting through the
            (collapsed-by-default) filter panel below. Bound to the same
            searchQuery state the desktop TableHeaderBar search uses. */}
        <div className="relative sm:hidden">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" />
          <input
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
              <X size={16} />
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
                    <CalendarDays size={11} className="shrink-0" /> {formatDateRange(activeGroup.trip.start_date, activeGroup.trip.end_date)}
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
                className="w-full flex items-center gap-2 sm:pointer-events-none sm:cursor-default"
              >
                <SlidersHorizontal size={16} className="text-dark shrink-0" />
                <span className="font-button font-bold text-dark text-[15px] whitespace-nowrap flex-1 text-left">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center px-2 h-[22px] rounded-md bg-primary/10 text-primary text-[11px] font-button font-semibold">
                    {activeFilterCount} active
                  </span>
                )}
                <ChevronDown size={18} className={`sm:hidden shrink-0 text-dark-muted transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
              </button>

              <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row sm:items-end gap-3 mt-4`}>
                {/* Filters + Clear All — sit together in one row at the
                    bottom of the panel. */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 flex-1 min-w-0">
                  {/* Trip — lets an admin scope everything below (KPIs,
                      summary card, table) to one trip, or back to "All
                      Trips", without leaving this page. Same pattern as the
                      Trip filter on the Waitlist page. Spans both mobile
                      grid columns since it's the primary/most-used filter. */}
                  <div className="relative col-span-2 sm:col-span-1 w-full sm:w-auto sm:min-w-[150px]">
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Trip</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'trip' ? null : 'trip'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'trip' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{activeGroup ? activeGroup.title : 'All'}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'trip' ? 'rotate-180' : ''}`} />
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
                      <MessageCircle size={13} className="shrink-0" />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Lead Status</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'query' ? null : 'query'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'query' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{filter === 'all' ? 'All' : STATUS_CONFIG[filter].label}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'query' ? 'rotate-180' : ''}`} />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Booking Journey</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'journey' ? null : 'journey'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'journey' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{journeyFilter === 'all' ? 'All' : JOURNEY_STAGE_CONFIG[journeyFilter].label}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'journey' ? 'rotate-180' : ''}`} />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Payment</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'pay' ? null : 'pay'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'pay' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{PAY_FILTER_LABELS[payFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'pay' ? 'rotate-180' : ''}`} />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Booking</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'booked' ? null : 'booked'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'booked' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{BOOKING_FILTER_LABELS[bookedFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'booked' ? 'rotate-180' : ''}`} />
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
                      <CalendarClock size={13} className="shrink-0" />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Group / Solo</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'group' ? null : 'group'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'group' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{GROUP_FILTER_LABELS[groupFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'group' ? 'rotate-180' : ''}`} />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Food</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'food' ? null : 'food'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'food' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{FOOD_FILTER_LABELS[foodFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'food' ? 'rotate-180' : ''}`} />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Package</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'package' ? null : 'package'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'package' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{PACKAGE_FILTER_LABELS[packageFilter]}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'package' ? 'rotate-180' : ''}`} />
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
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Source</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'more' ? null : 'more'))}
                      className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
                        openFilterPanel === 'more' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                      }`}
                    >
                      <span className="text-sm font-button font-medium text-primary truncate">{sourceFilter === 'all' ? 'All' : SOURCE_CONFIG[sourceFilter].label}</span>
                      <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'more' ? 'rotate-180' : ''}`} />
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
                  <RefreshCw size={13} /> Clear All
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
                <p className="text-sm font-medium text-dark">
                  {selectedIds.size} selected
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  {bulkEditAllowed ? (
                    <button
                      onClick={openBulkEdit}
                      className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-background-warm text-dark hover:border-primary/30 transition-colors"
                    >
                      <Pencil size={14} /> Bulk Edit
                    </button>
                  ) : (
                    <span title="Bulk Edit is disabled when the selection spans more than one trip — pricing fields aren't safe to apply across trips with different prices.">
                      <button
                        disabled
                        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-background-warm text-dark-muted/40 cursor-default"
                      >
                        <Pencil size={14} /> Bulk Edit
                      </button>
                    </span>
                  )}
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                  >
                    <Trash2 size={14} /> {bulkDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-md border border-background-warm text-dark-muted hover:bg-background/50 transition-colors"
                  >
                    <X size={14} /> Clear
                  </button>
                </div>
              </div>
            )}

            {/* Desktop / tablet table */}
            <div className="hidden sm:block bg-white rounded-lg shadow-card overflow-hidden">
              <TableHeaderBar
                title="Enquiry details"
                rangeStart={enquiriesRangeStart}
                rangeEnd={enquiriesRangeEnd}
                total={filtered.length}
                itemLabel="enquiries"
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search case #, title, owner..."
                onExport={handleExportCsv}
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
                      <th className="px-3 py-3 text-left w-8">
                        <input
                          type="checkbox"
                          checked={paginatedEnquiries.length > 0 && paginatedEnquiries.every(e => selectedIds.has(e.id))}
                          onChange={toggleSelectAllFiltered}
                          aria-label="Select all"
                          className="w-4 h-4 rounded border-background-warm accent-primary cursor-pointer"
                        />
                      </th>
                      <th className="px-3 py-3 text-left hidden md:table-cell">S.No</th>
                      <SortableTh label="Name" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-4 py-3 text-left" />
                      <SortableTh label="Group" sortKey="group" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-3 text-left whitespace-nowrap" />
                      <SortableTh label="Food" sortKey="food" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-3 text-left whitespace-nowrap" />
                      <th className="px-4 py-3 text-left hidden sm:table-cell">Contact</th>
                      <SortableTh label="Source" sortKey="source" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-4 py-3 text-left hidden lg:table-cell" />
                      <SortableTh label="Date & Time" sortKey="date" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-4 py-3 text-left hidden lg:table-cell" />
                      <SortableTh label="Package" sortKey="package" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-3 text-center whitespace-nowrap" />
                      <SortableTh label="Payment" sortKey="payment" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-3 text-left whitespace-nowrap" />
                      <SortableTh label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-3 text-center whitespace-nowrap" />
                      <SortableTh label="Follow-up" sortKey="follow_up" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="px-2 py-3 text-left whitespace-nowrap hidden md:table-cell" />
                      <th className="px-2 py-3 text-center whitespace-nowrap">Seat</th>
                      <th className="px-2 py-3 text-right whitespace-nowrap">Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-background-warm">
                    {paginatedEnquiries.map((e, pageIdx) => {
                      const idx = (enquiriesSafePage - 1) * ENQUIRIES_PAGE_SIZE + pageIdx;
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
                          <td className="px-4 py-3 max-w-[150px] sm:max-w-none">
                            <button
                              onClick={() => setDetailsTarget(e)}
                              className="text-left w-full group"
                              title="Click for full details"
                            >
                              <p className="font-medium text-dark truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                                {e.full_name}
                                {!e.trip_id && !activeGroup && (
                                  <span
                                    title={isGeneralContactMessage(e) ? 'A "Contact Us" message from the website — not linked to any trip' : 'Logged without picking a trip'}
                                    className="inline-flex items-center gap-1 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-dark-muted shrink-0"
                                  >
                                    <MessageCircle size={9} className="shrink-0" /> General
                                  </span>
                                )}
                              </p>
                              <p className="text-dark-muted text-xs truncate sm:hidden">{e.email}</p>
                            </button>
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap">
                            {e.group_size && e.group_size > 1 ? (
                              <span
                                title={`${groupLabel(e)} — part of a group booking of ${e.group_size}`}
                                className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                              >
                                <Users size={12} className="shrink-0" /> {groupLabel(e)} · {e.group_seq}/{e.group_size}
                              </span>
                            ) : (
                              <span
                                title="Booked individually, not part of a group"
                                className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md shrink-0 whitespace-nowrap bg-slate-100 text-dark-muted"
                              >
                                <User size={12} className="shrink-0" /> Solo
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold whitespace-nowrap ${
                              e.food_preference === 'veg' ? 'text-green-700' : e.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark-muted'
                            }`}>
                              <FoodMark type={foodPreferenceKey(e)} size={12} /> {food.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden sm:table-cell">
                            <p className="text-xs truncate">{e.email}</p>
                            <p className="text-xs mt-0.5">{e.phone}</p>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden lg:table-cell truncate">
                            <span className="text-xs">
                              {srcCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">
                            <p>{formatDate(e.created_at, { day: 'numeric', month: 'short' })}</p>
                            <p className="text-[11px] text-dark-muted/80">{formatTime(e.created_at)}</p>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold whitespace-nowrap ${
                              e.package_type === 'early_bird' ? 'text-purple-700' : 'text-slate-700'
                            }`}>
                              {e.package_type === 'early_bird' && <Bird size={12} className="shrink-0" />}
                              {PACKAGE_CONFIG[e.package_type || 'normal'].label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-left whitespace-nowrap">
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
                          <td className="px-2 py-3 text-center">
                            <span title={closedReasonLabel(e) ? `Booking Journey: ${jb.label} — ${closedReasonLabel(e)}` : `Booking Journey: ${jb.label}`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                              <jb.icon size={12} className="shrink-0" />
                              {jb.label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-left whitespace-nowrap hidden md:table-cell">
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
                                    <fu.icon size={12} className="shrink-0" />
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
                                    <CalendarClock size={12} className="shrink-0" /> Set
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
                                    <bfu.icon size={12} className="shrink-0" />
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
                                    <CalendarClock size={12} className="shrink-0" /> Set
                                  </button>
                                );
                              }
                              return <span className="text-dark-muted/50 text-xs">—</span>;
                            })()}
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span
                              title={seat.title}
                              className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${seat.color}`}
                            >
                              <seat.icon size={12} className="shrink-0" />
                              {seat.label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {nma && (
                                <button
                                  onClick={() => handleAdvance(e)}
                                  disabled={updating === e.id || completingId === e.id}
                                  title={nma.label}
                                  className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/5 transition-colors whitespace-nowrap disabled:opacity-50"
                                >
                                  <nma.icon size={12} className="shrink-0" />
                                  {nma.label}
                                </button>
                              )}
                              {canMarkNotInterested(e) && (
                                <button
                                  onClick={() => handleMarkNotInterested(e)}
                                  disabled={updating === e.id || completingId === e.id}
                                  title="Not Interested (Close Query)"
                                  className="inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1.5 rounded border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50"
                                >
                                  <UserMinus size={12} className="shrink-0" />
                                </button>
                              )}
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

            {/* Mobile: tap a card to expand full details */}
            <div className="sm:hidden space-y-3">
              {paginatedEnquiries.map((e, idx) => {
                const jb = journeyBadge(e);
                const nma = nextManualAction(e);
                const seat = seatStatus(e);
                const srcCfg = SOURCE_CONFIG[e.source] || SOURCE_CONFIG.other;
                const isOpen = expandedId === e.id;
                const isHighlighted = highlightId === e.id;
                const clr = groupColor(e);
                return (
                  <motion.div
                    key={e.id}
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
                      className="flex-1 min-w-0 flex items-start justify-between gap-3 text-left py-2.5 pr-1"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-dark truncate flex items-center gap-1.5">
                          <span className="text-dark-muted text-xs font-normal shrink-0">#{idx + 1}</span>
                          {e.full_name}
                          {e.group_size && e.group_size > 1 ? (
                            <span
                              title={`${groupLabel(e)} — part of a group booking of ${e.group_size}`}
                              className={`inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                            >
                              <Users size={9} /> {groupLabel(e)} · {e.group_seq}/{e.group_size}
                            </span>
                          ) : (
                            <span
                              title="Booked individually, not part of a group"
                              className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 bg-slate-100 text-dark-muted"
                            >
                              <User size={9} /> Solo
                            </span>
                          )}
                          {e.package_type === 'early_bird' && (
                            <span
                              title="Early Bird"
                              className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 shrink-0"
                            >
                              <Bird size={11} />
                            </span>
                          )}
                          {e.cancelled_at && (
                            <span className={`inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${e.is_no_show ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                              <XCircle size={9} /> {e.is_no_show ? 'No Show' : 'Cancelled'}
                            </span>
                          )}
                          {!e.trip_id && !activeGroup && (
                            <span
                              title={isGeneralContactMessage(e) ? 'A "Contact Us" message from the website — not linked to any trip' : 'Logged without picking a trip'}
                              className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-dark-muted shrink-0"
                            >
                              <MessageCircle size={9} /> General
                            </span>
                          )}
                        </p>
                        <p className="text-dark-muted text-xs truncate mt-0.5">{e.phone}</p>
                        <div className="flex items-center flex-wrap gap-1 mt-1.5">
                          {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                            <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap bg-green-100 text-green-700">
                              Due {formatPrice(paymentBalance(e)!)}
                            </span>
                          )}
                          {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                            <span className="text-dark-muted/40 text-xs select-none" aria-hidden="true">|</span>
                          )}
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold whitespace-nowrap ${
                            e.food_preference === 'veg' ? 'text-green-700' : e.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark-muted'
                          }`}>
                            <FoodMark type={foodPreferenceKey(e)} size={9} /> {foodBadge(e).label}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {followUpStatus(e)?.isDue && (
                          <span title={followUpStatus(e)!.label} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${followUpStatus(e)!.color}`}>
                            <CalendarClock size={12} className="shrink-0" />
                          </span>
                        )}
                        {bookingFollowUpStatus(e)?.isDue && (
                          <span title={bookingFollowUpStatus(e)!.label} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${bookingFollowUpStatus(e)!.color}`}>
                            <CalendarClock size={12} className="shrink-0" />
                          </span>
                        )}
                        <span title={closedReasonLabel(e) ? `Booking Journey: ${jb.label} — ${closedReasonLabel(e)}` : `Booking Journey: ${jb.label}`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
                          <jb.icon size={12} className="shrink-0" />
                          {jb.label}
                        </span>
                        <ChevronDown size={16} className={`text-dark-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
                                <Briefcase size={15} />
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
                                <User size={15} />
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
                                <Building2 size={15} />
                              </span>
                              <div className="min-w-0">
                                <p className="text-dark-muted text-xs">City</p>
                                <p className="text-dark text-sm truncate">{e.city || '—'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                                <Utensils size={15} />
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
                                <CalendarDays size={15} />
                              </span>
                              <div className="min-w-0">
                                <p className="text-dark-muted text-xs">Date &amp; Time</p>
                                <p className="text-dark text-sm truncate">{formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                <p className="text-dark-muted text-xs truncate">{formatTime(e.created_at)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                                <Globe size={15} />
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
                                {e.package_type === 'early_bird' ? <Bird size={15} /> : <Package size={15} />}
                              </span>
                              <div className="min-w-0">
                                <p className="text-dark-muted text-xs">Package</p>
                                <p className="text-dark text-sm truncate">{PACKAGE_CONFIG[e.package_type || 'normal'].label}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
                                <MessageCircle size={15} />
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
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleDownloadInvoice(e)}
                                disabled={invoiceBusyId === e.id}
                                title="Download invoice"
                                aria-label="Download invoice"
                                className="text-primary hover:text-primary-dark disabled:opacity-50"
                              >
                                <FileText size={16} />
                              </button>
                              <button
                                onClick={() => handleShareInvoice(e)}
                                disabled={invoiceBusyId === e.id}
                                title="Share invoice"
                                aria-label="Share invoice"
                                className="text-primary hover:text-primary-dark disabled:opacity-50"
                              >
                                <Share2 size={16} />
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center flex-wrap gap-2 pt-3">
                          <button
                            onClick={() => openPayment(e)}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-full whitespace-nowrap bg-background-warm text-dark-muted"
                          >
                            <IndianRupee size={14} /> Payment
                          </button>
                          <span
                            title={seat.title}
                            className={`flex-1 inline-flex items-center justify-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-full whitespace-nowrap ${seat.color}`}
                          >
                            <seat.icon size={14} />
                            {seat.label}
                          </span>
                        </div>

                        {/* Follow-up reminder — same eligibility/chip logic
                            as the desktop table's dedicated column, just
                            laid out as a full-width row here since there's
                            no spare column on a mobile card. */}
                        {(followUpStatus(e) || canSetFollowUp(e)) && (
                          <button
                            onClick={() => openFollowUpModal(e)}
                            disabled={updating === e.id}
                            className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold px-3 py-2 rounded-full whitespace-nowrap disabled:opacity-50 ${
                              followUpStatus(e) ? followUpStatus(e)!.color : 'border border-background-warm text-dark-muted'
                            }`}
                          >
                            <CalendarClock size={14} />
                            {followUpStatus(e)?.label || 'Set Follow-up Reminder'}
                          </button>
                        )}

                        {/* Booking Follow-up — the post-booking counterpart,
                            same layout, only shown once the Lead Follow-up
                            window above no longer applies. */}
                        {!followUpStatus(e) && !canSetFollowUp(e) && (bookingFollowUpStatus(e) || canSetBookingFollowUp(e)) && (
                          <button
                            onClick={() => setBookingFollowUpTarget(e)}
                            disabled={updating === e.id}
                            className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold px-3 py-2 rounded-full whitespace-nowrap disabled:opacity-50 ${
                              bookingFollowUpStatus(e) ? bookingFollowUpStatus(e)!.color : 'border border-background-warm text-dark-muted'
                            }`}
                          >
                            <CalendarClock size={14} />
                            {bookingFollowUpStatus(e)?.label || 'Set Booking Follow-up'}
                          </button>
                        )}

                        {/* Journey Advance + kebab ActionsMenu — mirrors the
                            desktop table's "Update" column so mobile isn't
                            stuck with the old status dropdown / separate
                            Cancel & Delete buttons. */}
                        <div className="flex items-center gap-2">
                          {nma && (
                            <button
                              onClick={() => handleAdvance(e)}
                              disabled={updating === e.id}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold px-3 py-2 rounded-full border border-primary/30 text-primary hover:bg-primary/5 transition-colors whitespace-nowrap disabled:opacity-50"
                            >
                              <nma.icon size={14} /> {nma.label}
                            </button>
                          )}
                          {canMarkNotInterested(e) && (
                            <button
                              onClick={() => handleMarkNotInterested(e)}
                              disabled={updating === e.id}
                              title="Not Interested (Close Query)"
                              className={`inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold px-3 py-2 rounded-full border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap disabled:opacity-50 ${nma ? 'shrink-0' : 'flex-1'}`}
                            >
                              <UserMinus size={14} /> {nma ? '' : 'Not Interested'}
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                            className={`inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold px-3 py-2 rounded-full border border-background-warm text-dark-muted hover:bg-background-warm transition-colors whitespace-nowrap ${nma ? 'shrink-0' : 'flex-1'}`}
                          >
                            <ExternalLink size={14} /> {nma ? '' : 'Full CRM Page'}
                          </button>
                          <ActionsMenu disabled={updating === e.id} items={buildRowActions(e)} />
                        </div>
                      </div>
                    )}
                  </motion.div>
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
                {filtered.length === 0 ? 'No enquiries found' : `Showing ${enquiriesRangeStart}\u2013${enquiriesRangeEnd} of ${filtered.length} enquiries`}
              </p>
              <TablePagination
                currentPage={enquiriesSafePage}
                totalPages={enquiriesTotalPages}
                onPageChange={setCurrentPage}
              />
            </div>
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
        onOpenGenerateInvoice={handleOpenGenerateInvoice}
        invoiceRowBusyId={invoiceRowBusyId}
        onMarkInvoicePaid={handleMarkInvoicePaid}
      />

      <GenerateInvoiceModal
        generateInvoiceTarget={generateInvoiceTarget}
        onClose={() => setGenerateInvoiceTarget(null)}
        generateInvoiceForm={generateInvoiceForm}
        setGenerateInvoiceForm={setGenerateInvoiceForm}
        onSave={handleGenerateInvoice}
        savingInvoice={savingInvoice}
      />

      <MarkPaidModal
        target={markPaidTarget}
        onClose={() => setMarkPaidTarget(null)}
        form={markPaidForm}
        setForm={setMarkPaidForm}
        onConfirm={handleConfirmMarkPaid}
        saving={savingMarkPaid}
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
