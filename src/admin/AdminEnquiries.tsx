import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Clock, RefreshCw, Plus, CheckCircle2, Circle, XCircle, MessageCircle, Phone, Mail, Camera, MapPin, Globe, HelpCircle, ChevronDown, IndianRupee, Zap, SlidersHorizontal, Trash2, PartyPopper, Users, User, Utensils, Pencil, X, Hourglass, CalendarCheck, Search, AlertTriangle } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import FoodMark from '../components/ui/FoodMark';
import { TableHeaderBar, TablePagination, paginate, useDragScroll, SortableTh, ContactQuickLinks } from '../components/ui/DataTableChrome';
import type { SortDirection } from '../components/ui/DataTableChrome';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useAlert } from '../components/ui/AlertDialog';
import { getEnquiries, updateEnquiryStatus, createManualEnquiry, recordPayment, getAllUpcomingTripsAdmin, cancelEnquiry, uncancelEnquiry, recordRefund, deleteEnquiry, markWaitlistConverted, getWaitlistEntries } from '../services/api';
import type { Enquiry, UpcomingTrip, WaitlistEntry } from '../types/types-index';
import { formatDate, formatDateRange, formatTime, formatPrice, seatsLeft, buildGroupLetterMap, downloadCsv } from '../utils/utils-index';
import type { GroupUnit } from '../utils/utils-index';

// Parses a money-field <input type="number"> value into a non-negative
// number, or '' if the field is empty. The HTML `min={0}` attribute on
// these inputs is a visual hint only — some browsers still hand back a
// negative number from a programmatic read (e.g. typing "-5000" and
// tabbing away without the browser's spinner/blur clamp kicking in), so
// every money field routes through this instead of a bare `+e.target.value`.
function parseNonNegative(raw: string): number | '' {
  if (raw === '') return '';
  const n = Number(raw);
  if (Number.isNaN(n)) return '';
  return Math.max(0, n);
}

// Digits-only phone "signature" used for fuzzy duplicate matching (3.5).
// The DB's own duplicate guard only catches an *exact* string match on
// (trip, name, phone, email), so "+91 98765-43210", "098765 43210", and
// "9876543210" all count as different people to it even though they're
// the same number typed three different ways. Comparing just the last 10
// digits absorbs country-code/leading-zero/formatting differences without
// needing a full phone-parsing library. Returns null for anything too
// short to mean anything (avoids flagging two blank/junk phones as a match).
function phoneSignature(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  return digits.slice(-10);
}

// Same idea for email — trims/lowercases so casing or stray whitespace
// doesn't hide a match, and ignores the app's own "not provided" sentinel
// (see createManualEnquiry/submitWaitlist) so two people who never gave an
// email don't get flagged as duplicates of each other.
function emailSignature(email: string | null | undefined): string | null {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'not-provided@ulaa.local') return null;
  return trimmed;
}

const PACKAGE_CONFIG = {
  early_bird: { label: 'Early Bird', color: 'bg-purple-100 text-purple-700' },
  normal: { label: 'Normal', color: 'bg-slate-100 text-slate-700' },
} as const;

// Cycled across group bookings (see groupColorMap below) so that every
// group visible on screen at once gets a visually distinct row tint, left
// accent, and badge color — the main way an admin tells "these rows are one
// group" apart from "these rows just happen to be next to each other".
const GROUP_COLOR_PALETTE = [
  { row: 'bg-blue-50/60 hover:bg-blue-50', accent: 'border-blue-400', badge: 'bg-blue-100 text-blue-700' },
  { row: 'bg-purple-50/60 hover:bg-purple-50', accent: 'border-purple-400', badge: 'bg-purple-100 text-purple-700' },
  { row: 'bg-teal-50/60 hover:bg-teal-50', accent: 'border-teal-400', badge: 'bg-teal-100 text-teal-700' },
  { row: 'bg-amber-50/60 hover:bg-amber-50', accent: 'border-amber-400', badge: 'bg-amber-100 text-amber-700' },
  { row: 'bg-pink-50/60 hover:bg-pink-50', accent: 'border-pink-400', badge: 'bg-pink-100 text-pink-700' },
  { row: 'bg-lime-50/60 hover:bg-lime-50', accent: 'border-lime-400', badge: 'bg-lime-100 text-lime-700' },
  { row: 'bg-cyan-50/60 hover:bg-cyan-50', accent: 'border-cyan-400', badge: 'bg-cyan-100 text-cyan-700' },
  { row: 'bg-rose-50/60 hover:bg-rose-50', accent: 'border-rose-400', badge: 'bg-rose-100 text-rose-700' },
] as const;

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
];

const SOURCE_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'other', label: 'Other' },
];

const PACKAGE_OPTIONS = [
  { value: 'normal', label: 'Normal Price' },
  { value: 'early_bird', label: 'Early Bird' },
];

// Bulk-edit fields are all opt-in — "No change" is the default for every
// field so an admin can update just, say, Status across a selection without
// accidentally blanking out everyone's Food Preference or Package. Only
// fields the admin actually touches get applied when Bulk Save runs.
const BULK_NO_CHANGE = 'no_change' as const;

const BULK_STATUS_OPTIONS = [
  { value: BULK_NO_CHANGE, label: 'No change' },
  ...STATUS_OPTIONS,
];

const BULK_PACKAGE_OPTIONS = [
  { value: BULK_NO_CHANGE, label: 'No change' },
  ...PACKAGE_OPTIONS,
];

const BULK_FOOD_OPTIONS = [
  { value: BULK_NO_CHANGE, label: 'No change' },
  { value: 'not_set', label: 'Not asked / unknown' },
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-veg' },
];

type BulkEditForm = {
  food_preference: typeof BULK_NO_CHANGE | 'not_set' | 'veg' | 'non_veg';
  package_type: typeof BULK_NO_CHANGE | Enquiry['package_type'];
  // This is the trip price (total_amount), not what's been collected so far
  // (amount_paid) — setting only amount_paid without a total_amount is what
  // left rows stuck showing "Price not set" after a bulk save.
  total_amount: number | '';
  // What's actually been collected so far, set as a new running total (same
  // semantics as recordPayment) — not a delta added on top of each row's
  // current amount_paid. Left blank, every row's amount_paid is untouched.
  amount_paid: number | '';
  status: typeof BULK_NO_CHANGE | Enquiry['status'];
};

const emptyBulkForm: BulkEditForm = {
  food_preference: BULK_NO_CHANGE,
  package_type: BULK_NO_CHANGE,
  total_amount: '',
  amount_paid: '',
  status: BULK_NO_CHANGE,
};

function paymentStatus(e: Enquiry): { label: string; color: string } {
  if (!e.total_amount) return { label: 'Not set', color: 'bg-slate-100 text-dark-muted' };
  if (e.amount_paid <= 0) return { label: 'Unpaid', color: 'bg-red-100 text-red-700' };
  if (e.amount_paid >= e.total_amount) return { label: 'Paid in full', color: 'bg-green-100 text-green-700' };
  return { label: 'Partial', color: 'bg-amber-100 text-amber-700' };
}

// Small inline badge shown next to each enquiry's name — lets an admin spot
// missing food preferences directly in the list, without opening the row.
function foodBadge(e: Enquiry): { label: string; color: string } {
  if (e.food_preference === 'veg') return { label: 'Veg', color: 'bg-green-100 text-green-700' };
  if (e.food_preference === 'non_veg') return { label: 'Non-veg', color: 'bg-red-100 text-red-700' };
  return { label: 'Food not set', color: 'bg-slate-100 text-dark-muted' };
}

function paymentBalance(e: Enquiry): number | null {
  if (!e.total_amount) return null;
  return Math.max(0, e.total_amount - (e.amount_paid || 0));
}

function paymentFilterKey(e: Enquiry): 'paid' | 'partial' | 'unpaid' | 'not_set' {
  if (!e.total_amount) return 'not_set';
  if (e.amount_paid <= 0) return 'unpaid';
  if (e.amount_paid >= e.total_amount) return 'paid';
  return 'partial';
}

// A seat is only actually held when money's been paid AND the booking
// hasn't been cancelled since. amount_paid itself is left untouched by
// cancellation — it's the historical record of what they paid — so
// "booked" can't just check amount_paid > 0 anymore.
function isBooked(e: Enquiry): boolean {
  return !e.cancelled_at && e.amount_paid > 0;
}

// Cancelled is its own booking-filter bucket now (previously folded into
// "Not booked"), so an admin can isolate cancellations without also seeing
// enquiries that were simply never paid.
function isCancelled(e: Enquiry): boolean {
  return !!e.cancelled_at;
}

// Group vs Solo is purely about whether this row is part of a multi-seat
// signup (group_size > 1) — same test used everywhere else in this file
// (row tinting, "Group x/y" badges) so the filter matches what's on screen.
function isGroupEntry(e: Enquiry): boolean {
  return !!(e.group_size && e.group_size > 1);
}

// Only relevant for cancelled bookings that had money on them. Tracks
// refund_amount against amount_paid independently, so partial refunds
// (processed in installments) show correctly as "pending" until they
// fully catch up.
function refundStatus(e: Enquiry): { label: string; color: string } | null {
  if (!e.cancelled_at || e.amount_paid <= 0) return null;
  const refunded = e.refund_amount || 0;
  if (refunded >= e.amount_paid) return { label: 'Refunded', color: 'bg-green-100 text-green-700' };
  if (refunded > 0) return { label: `Refund pending — ${formatPrice(e.amount_paid - refunded)} left`, color: 'bg-amber-100 text-amber-700' };
  return { label: `Refund pending — ${formatPrice(e.amount_paid)}`, color: 'bg-red-100 text-red-700' };
}

const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  closed: { label: 'Closed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

const PAY_FILTER_LABELS = {
  all: 'All',
  paid: 'Paid in full',
  partial: 'Partial',
  unpaid: 'Unpaid',
  not_set: 'Price not set',
} as const;

const FOOD_FILTER_LABELS = {
  all: 'All',
  veg: 'Veg',
  non_veg: 'Non-veg',
  not_set: 'Not set',
} as const;

const BOOKING_FILTER_LABELS = {
  all: 'All',
  booked: 'Booked',
  not_booked: 'Not booked',
  cancelled: 'Cancelled',
} as const;

const GROUP_FILTER_LABELS = {
  all: 'All',
  group: 'Group',
  solo: 'Solo',
} as const;

function foodPreferenceKey(e: Enquiry): 'veg' | 'non_veg' | 'not_set' {
  return e.food_preference === 'veg' || e.food_preference === 'non_veg' ? e.food_preference : 'not_set';
}

const SOURCE_CONFIG = {
  website: { label: 'Website', icon: Globe },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  phone: { label: 'Phone Call', icon: Phone },
  instagram: { label: 'Instagram', icon: Camera },
  walk_in: { label: 'Walk-in', icon: MapPin },
  other: { label: 'Other', icon: HelpCircle },
} as const;

type EnquiryForm = {
  full_name: string;
  phone: string;
  email: string;
  age: number | '';
  city: string;
  trip_id: string;
  source: Enquiry['source'];
  message: string;
  package_type: Enquiry['package_type'];
  total_amount: number | '';
  amount_paid: number | '';
  food_preference: 'veg' | 'non_veg' | '';
};

const emptyForm: EnquiryForm = {
  full_name: '', phone: '', email: '', age: '', city: '', trip_id: '', source: 'whatsapp', message: '',
  package_type: 'normal', total_amount: '', amount_paid: '', food_preference: '',
};

const FOOD_PREFERENCE_OPTIONS = [
  { value: '', label: 'Not asked / unknown' },
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-veg' },
];

// One row of the bulk waitlist-conversion form — trip/package/notes stay
// shared across the whole group (see `form`), but each person needs their
// own identity + their own advance payment since a waitlist conversion
// requires money on the booking before it counts as seated.
type WaitlistPersonForm = {
  full_name: string;
  phone: string;
  email: string;
  age: number | '';
  city: string;
  food_preference: 'veg' | 'non_veg' | '';
  amount_paid: number | '';
};

const emptyWaitlistPerson: WaitlistPersonForm = {
  full_name: '', phone: '', email: '', age: '', city: '', food_preference: '', amount_paid: '',
};

type PaymentForm = {
  package_type: Enquiry['package_type'];
  total_amount: number | '';
  amount_paid: number | '';
  refund_amount: number | '';
  food_preference: 'veg' | 'non_veg' | '';
};

// Shared dropdown menu used by every filter box in the filter bar — a
// vertical list of options with counts, the selected one highlighted.
// Kept generic so the same component serves Query Status, Payment,
// Booking, Group/Solo, Food, and Source without repeating markup.
function FilterDropdown<T extends string>({
  options,
  value,
  onSelect,
  align = 'left',
}: {
  options: { key: T; label: string; count: number }[];
  value: T;
  onSelect: (key: T) => void;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-full sm:w-52 bg-white rounded-xl shadow-warm-lg border border-background-warm py-1.5 z-30 max-h-72 overflow-y-auto`}
    >
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => onSelect(opt.key)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-button text-left transition-colors ${
            value === opt.key ? 'bg-primary/10 text-primary font-semibold' : 'text-dark-muted hover:bg-background-warm'
          }`}
        >
          <span className="truncate">{opt.label}</span>
          <span className="opacity-60 shrink-0">{opt.count}</span>
        </button>
      ))}
    </div>
  );
}

export default function AdminEnquiries() {
  const confirm = useConfirm();
  const alert = useAlert();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Enquiry['status']>('all');
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'not_set'>('all');
  const [bookedFilter, setBookedFilter] = useState<'all' | 'booked' | 'not_booked' | 'cancelled'>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | 'group' | 'solo'>('all');
  const [foodFilter, setFoodFilter] = useState<'all' | 'veg' | 'non_veg' | 'not_set'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | Enquiry['source']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Table pagination — 50 rows per page, matching the reference table
  // design. Reset to page 1 whenever a filter or search term changes (see
  // effect below), so the admin never lands on a now-empty page.
  const [currentPage, setCurrentPage] = useState(1);
  const ENQUIRIES_PAGE_SIZE = 10;
  const { ref: tableScrollRef, isDragging, handlers: dragHandlers } = useDragScroll<HTMLDivElement>();
  // Column sorting — clicking a sortable header sorts the filtered list by
  // that column; clicking the same header again flips the direction.
  type EnquirySortKey = 'name' | 'group' | 'food' | 'source' | 'date' | 'package' | 'payment' | 'status';
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
  const [openFilterPanel, setOpenFilterPanel] = useState<'trip' | 'query' | 'pay' | 'booked' | 'group' | 'food' | 'more' | null>(null);
  const [selectedTripKey, setSelectedTripKey] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
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
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ package_type: 'normal', total_amount: '', amount_paid: '', refund_amount: '', food_preference: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Enquiry | null>(null);
  const [cancelCharges, setCancelCharges] = useState<number | ''>('');
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
    loadWaitlistCounts();
  }, []);

  useEffect(() => {
    if (enquiries.length === 0) return;
    const tripParam = searchParams.get('trip');
    const enquiryParam = searchParams.get('enquiry');
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
  }, [enquiries, searchParams]);

  // Someone hit "Convert to Enquiry" on the Waitlist page — a seat opened up
  // (usually from a cancellation) and this person is next in line. Prefill
  // the add-enquiry form with what we already know about them so the admin
  // only has to fill in the payment.
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

  // Trip prices load asynchronously, separately from the handoff above, so
  // fill in the suggested total once both the converting entry and the
  // trip list are available.
  useEffect(() => {
    if (!convertingWaitlist || !form.trip_id || trips.length === 0 || form.total_amount !== '') return;
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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedTripKey]);

  // Single-record status change from the per-row dropdown. Bulk status
  // changes never go through here — they're applied in handleBulkSave
  // instead — which is what keeps the Track Payment popup from appearing
  // during a bulk update to Contacted.
  const handleStatusChange = async (enquiry: Enquiry, status: Enquiry['status']) => {
    const wasContacted = enquiry.status === status;
    setUpdating(enquiry.id);
    await updateEnquiryStatus(enquiry.id, status).catch(console.error);
    load();
    setUpdating(null);
    // Only pop up Track Payment when this single update actually moved the
    // status to Contacted — not on a no-op re-select of the same value.
    if (status === 'contacted' && !wasContacted) {
      openPayment({ ...enquiry, status });
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

  const openPayment = (enquiry: Enquiry) => {
    setPaymentTarget(enquiry);
    const packageType = enquiry.package_type || 'normal';
    // If no amount has been recorded yet, pull the trip's price for whichever
    // package this booking is under so the admin isn't starting from blank.
    const suggested = enquiry.total_amount ?? getTripPrice(enquiry.trip_id, packageType);
    setPaymentForm({
      package_type: packageType,
      total_amount: suggested ?? '',
      amount_paid: enquiry.amount_paid ?? 0,
      refund_amount: enquiry.refund_amount ?? 0,
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
    }
  };

  // Cancels an enquiry. Frees the trip seat immediately but never touches
  // amount_paid — that stays as the record of what was actually collected,
  // separate from whatever gets refunded.
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const charges = cancelCharges === '' ? undefined : Number(cancelCharges);
      await cancelEnquiry(cancelTarget, charges);
      setCancelTarget(null);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to cancel booking.');
    } finally {
      setCancelling(false);
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

  const handleSavePayment = async () => {
    if (!paymentTarget) return;
    const totalAmount = paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
    const amountPaid = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
    if (totalAmount != null && amountPaid > totalAmount) {
      alert("Amount paid can't be more than the total amount.");
      return;
    }
    const refundAmount = paymentForm.refund_amount === '' ? 0 : Number(paymentForm.refund_amount);
    if (refundAmount > amountPaid) {
      alert("Refund amount can't be more than what was actually paid.");
      return;
    }
    try {
      setSavingPayment(true);
      await recordPayment(paymentTarget, {
        amount_paid: amountPaid,
        total_amount: totalAmount,
        package_type: paymentForm.package_type,
        food_preference: paymentForm.food_preference || null,
      });
      if (paymentTarget.cancelled_at) {
        await recordRefund(paymentTarget, refundAmount);
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
      await Promise.all(targets.map(e => deleteEnquiry(e)));
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
      });
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
        });
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
        map.set(key, {
          key,
          title: e.trip_title || 'General Enquiries (No Trip)',
          trip: e.trip_id ? trips.find(t => t.id === e.trip_id) : undefined,
          enquiries: [],
        });
      }
      map.get(key)!.enquiries.push(e);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === UNLINKED_GROUP_KEY) return -1;
      if (b.key === UNLINKED_GROUP_KEY) return 1;
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
    .filter(e => payFilter === 'all' || paymentFilterKey(e) === payFilter)
    .filter(e => bookedFilter === 'all' || (
      bookedFilter === 'cancelled' ? isCancelled(e)
      : bookedFilter === 'booked' ? isBooked(e)
      : !isBooked(e) && !isCancelled(e)
    ))
    .filter(e => groupFilter === 'all' || (groupFilter === 'group' ? isGroupEntry(e) : !isGroupEntry(e)))
    .filter(e => foodFilter === 'all' || foodPreferenceKey(e) === foodFilter)
    .filter(e => sourceFilter === 'all' || e.source === sourceFilter)
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
  // filters, trip scope, or search term change.
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, payFilter, bookedFilter, groupFilter, foodFilter, sourceFilter, selectedTripKey, trimmedSearch]);

  const counts = {
    all: scopedEnquiries.length,
    new: scopedEnquiries.filter(e => e.status === 'new').length,
    contacted: scopedEnquiries.filter(e => e.status === 'contacted').length,
    closed: scopedEnquiries.filter(e => e.status === 'closed').length,
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
  const sourceCounts = Object.keys(SOURCE_CONFIG).reduce((acc, key) => {
    acc[key] = scopedEnquiries.filter(e => e.source === key).length;
    return acc;
  }, { all: scopedEnquiries.length } as Record<string, number>);
  const activeFilterCount = (selectedTripKey !== null ? 1 : 0) + (filter !== 'all' ? 1 : 0) + (payFilter !== 'all' ? 1 : 0) + (bookedFilter !== 'all' ? 1 : 0) + (groupFilter !== 'all' ? 1 : 0) + (foodFilter !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0) + (trimmedSearch ? 1 : 0);

  // Drives the "Clear all" action in the filter bar below.
  const clearAllFilters = () => {
    setSelectedTripKey(null);
    setFilter('all');
    setPayFilter('all');
    setBookedFilter('all');
    setGroupFilter('all');
    setFoodFilter('all');
    setSourceFilter('all');
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
            className="bg-white rounded-2xl p-4 shadow-card min-w-0"
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
              className="shrink-0 w-[132px] snap-start bg-white rounded-2xl p-3 shadow-card"
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

  const inputClass = `w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors`;

  return (
    <AdminLayout title="Enquiries">
      <div className="space-y-4 sm:space-y-6">
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
            className="w-full pl-10 pr-10 py-3 rounded-2xl border-2 border-background-warm bg-white font-body text-dark text-sm focus:border-primary outline-none transition-colors shadow-card"
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
        <div className="bg-white rounded-2xl p-4 shadow-card flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-display font-bold text-dark">{activeGroup ? activeGroup.title : 'All Trips'}</p>
            {activeGroup?.trip && (
              <p className="text-dark-muted text-xs">
                {activeGroup.trip.seats_booked}/{activeGroup.trip.total_seats} seats booked
                {activeGroup.trip.start_date && activeGroup.trip.end_date && (
                  <> · {formatDateRange(activeGroup.trip.start_date, activeGroup.trip.end_date)}</>
                )}
              </p>
            )}
            {(() => {
              const food = foodTotals(scopedEnquiries);
              return (food.veg > 0 || food.nonVeg > 0 || food.notSet > 0) ? (
                <p className="text-dark-muted text-xs mt-1 inline-flex items-center gap-1">
                  <Utensils size={11} className="shrink-0" />
                  {food.veg} veg · {food.nonVeg} non-veg{food.notSet > 0 ? ` · ${food.notSet} not set` : ''}
                </p>
              ) : null;
            })()}
          </div>
          <div className="text-right">
            <p className="text-dark-muted text-xs">Collected · Pending</p>
            <p className="text-sm font-semibold whitespace-nowrap">
              <span className="text-green-700">{formatPrice(paymentTotals(scopedEnquiries).collected)}</span>
              {' · '}
              <span className="text-amber-600">{formatPrice(paymentTotals(scopedEnquiries).pending)}</span>
            </p>
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
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
            <Users size={18} className="text-orange-600 shrink-0" />
            <p className="text-sm text-orange-800 flex-1">
              <span className="font-semibold">
                {describeWaiting(waitlistWaitingCounts[activeGroup.key])} {waitlistWaitingCounts[activeGroup.key].entries === 1 ? 'is' : 'are'} waiting
              </span>{' '}
              for a seat on this trip, and one's open right now.
            </p>
            <Link
              to={`/admin/waitlist?trip=${activeGroup.key}`}
              className="shrink-0 text-xs font-button font-semibold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors whitespace-nowrap"
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
            <div className="bg-white rounded-2xl shadow-card p-4">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(o => !o)}
                className="w-full flex items-center gap-2 sm:pointer-events-none sm:cursor-default"
              >
                <SlidersHorizontal size={16} className="text-dark shrink-0" />
                <span className="font-button font-bold text-dark text-[15px] whitespace-nowrap flex-1 text-left">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center px-2 h-[22px] rounded-full bg-primary/10 text-primary text-[11px] font-button font-semibold">
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
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 bg-white transition-colors ${
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
                          ...tripGroups.map(g => ({ key: g.key, label: g.title, count: g.enquiries.length })),
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
                      className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold rounded-xl border-2 px-3 h-[38px] transition-colors whitespace-nowrap ${
                        selectedTripKey === UNLINKED_GROUP_KEY
                          ? 'bg-primary text-white border-primary'
                          : 'border-background-warm text-dark hover:border-primary/30'
                      }`}
                    >
                      <MessageCircle size={13} className="shrink-0" />
                      General Enquiries
                      <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] ${
                        selectedTripKey === UNLINKED_GROUP_KEY ? 'bg-white/20' : 'bg-background-warm'
                      }`}>
                        {enquiries.filter(e => !e.trip_id).length}
                      </span>
                    </button>
                  )}

                  {/* Query Status */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Query Status</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'query' ? null : 'query'))}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 bg-white transition-colors ${
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

                  {/* Payment */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Payment</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'pay' ? null : 'pay'))}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 bg-white transition-colors ${
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
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 bg-white transition-colors ${
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

                  {/* Group / Solo */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Group / Solo</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'group' ? null : 'group'))}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 bg-white transition-colors ${
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
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 bg-white transition-colors ${
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

                  {/* Source — overflow filter, kept in the same
                      label-on-top style as the rest of the row. */}
                  <div className="relative w-full sm:w-auto sm:min-w-[140px]">
                    <label className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Source</label>
                    <button
                      onClick={() => setOpenFilterPanel(p => (p === 'more' ? null : 'more'))}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 bg-white transition-colors ${
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
                  className={`w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold rounded-xl border-2 px-3 py-2 transition-colors whitespace-nowrap ${
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
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <p className="font-display text-xl text-dark-muted">No enquiries found.</p>
          </div>
        ) : (
          <>
            {/* Bulk actions toolbar — appears once at least one enquiry is selected */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl shadow-card px-4 py-3">
                <p className="text-sm font-medium text-dark">
                  {selectedIds.size} selected
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={openBulkEdit}>
                    <Pencil size={14} /> Bulk Edit
                  </Button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                  >
                    <Trash2 size={14} /> {bulkDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-xl border border-background-warm text-dark-muted hover:bg-background/50 transition-colors"
                  >
                    <X size={14} /> Clear
                  </button>
                </div>
              </div>
            )}

            {/* Desktop / tablet table */}
            <div className="hidden sm:block bg-white rounded-2xl shadow-card overflow-hidden">
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
                className={`overflow-x-auto overflow-y-auto scrollbar-hide mx-4 sm:mx-5 mb-4 sm:mb-5 max-h-[620px] rounded-xl border border-background-warm ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
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
                      <th className="px-2 py-3 text-center whitespace-nowrap">Seat</th>
                      <th className="px-2 py-3 text-right whitespace-nowrap">Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-background-warm">
                    {paginatedEnquiries.map((e, pageIdx) => {
                      const idx = (enquiriesSafePage - 1) * ENQUIRIES_PAGE_SIZE + pageIdx;
                      const cfg = STATUS_CONFIG[e.status];
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
                                    className="inline-flex items-center gap-1 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-dark-muted shrink-0"
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
                                className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                              >
                                <Users size={12} className="shrink-0" /> {groupLabel(e)} · {e.group_seq}/{e.group_size}
                              </span>
                            ) : (
                              <span
                                title="Booked individually, not part of a group"
                                className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap bg-slate-100 text-dark-muted"
                              >
                                <User size={12} className="shrink-0" /> Solo
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap ${food.color}`}>
                              <FoodMark type={foodPreferenceKey(e)} size={12} /> {food.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden sm:table-cell">
                            <p className="flex items-center gap-1 text-xs truncate"><Mail size={11} className="shrink-0" /> <span className="truncate">{e.email}</span></p>
                            <p className="flex items-center gap-1 text-xs mt-0.5"><Phone size={11} className="shrink-0" /> {e.phone}</p>
                            <div className="mt-1.5">
                              <ContactQuickLinks phone={e.phone} email={e.email} name={e.full_name} tripTitle={e.trip_title} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden lg:table-cell truncate">
                            <span className="inline-flex items-center gap-1 text-xs">
                              <srcCfg.icon size={12} className="shrink-0" />
                              {srcCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">
                            <p>{formatDate(e.created_at, { day: 'numeric', month: 'short' })}</p>
                            <p className="text-[11px] text-dark-muted/80">{formatTime(e.created_at)}</p>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${PACKAGE_CONFIG[e.package_type || 'normal'].color}`}>
                              {e.package_type === 'early_bird' && <Zap size={12} className="shrink-0" />}
                              {PACKAGE_CONFIG[e.package_type || 'normal'].label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-left whitespace-nowrap">
                            <button onClick={() => openPayment(e)} className="text-left hover:opacity-75 transition-opacity">
                              <p className="text-dark font-medium text-xs">
                                {formatPrice(e.amount_paid || 0)}{e.total_amount ? ` / ${formatPrice(e.total_amount)}` : ''}
                              </p>
                              <span className={`inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${paymentStatus(e).color}`}>
                                {paymentStatus(e).label}
                              </span>
                              {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                                <p className="text-amber-600 text-[10px] font-medium mt-0.5">
                                  Balance {formatPrice(paymentBalance(e)!)}
                                </p>
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                              <cfg.icon size={12} className="shrink-0" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span
                              title={isBooked(e) ? 'Seat booked automatically from payment' : e.cancelled_at ? 'Cancelled — seat released' : 'No payment recorded yet, so no seat is held'}
                              className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                                isBooked(e) ? 'bg-green-100 text-green-700' : e.cancelled_at ? 'bg-red-100 text-red-700' : 'bg-background-warm text-dark-muted'
                              }`}
                            >
                              {isBooked(e) ? <CheckCircle2 size={12} /> : e.cancelled_at ? <XCircle size={12} /> : <Circle size={12} />}
                              {isBooked(e) ? 'Booked' : e.cancelled_at ? 'Cancelled' : 'Not booked'}
                            </span>
                            {refundStatus(e) && (
                              <p className={`text-[10px] font-medium mt-1 px-1.5 py-0.5 rounded-full inline-block whitespace-nowrap ${refundStatus(e)!.color}`}>
                                {refundStatus(e)!.label}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-3 text-right">
                            <Select
                              value={e.status}
                              disabled={updating === e.id}
                              onChange={val => handleStatusChange(e, val as Enquiry['status'])}
                              options={STATUS_OPTIONS}
                              size="sm"
                            />
                            <div className="mt-1.5 flex items-stretch gap-1">
                              <button
                                onClick={() => handleCancelToggle(e)}
                                disabled={updating === e.id}
                                className={`flex-1 text-[11px] font-button font-semibold px-1.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                                  e.cancelled_at
                                    ? 'border-green-200 text-green-700 hover:bg-green-50'
                                    : 'border-red-200 text-red-600 hover:bg-red-50'
                                }`}
                              >
                                {e.cancelled_at ? 'Reactivate' : 'Cancel'}
                              </button>
                              <button
                                onClick={() => handleDelete(e)}
                                disabled={updating === e.id}
                                title="Delete enquiry"
                                aria-label="Delete enquiry"
                                className="shrink-0 w-7 flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
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
                const cfg = STATUS_CONFIG[e.status];
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
                    className={`bg-white rounded-2xl shadow-card overflow-hidden transition-shadow duration-1000 ${
                      isHighlighted ? 'ring-2 ring-primary/40' : ''
                    }`}
                  >
                    <div className={`w-full flex items-center gap-1 px-2 py-1.5 ${clr ? clr.row : ''}`}>
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
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left py-2 pr-1"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-dark truncate flex items-center gap-1.5">
                          <span className="text-dark-muted text-xs font-normal shrink-0">#{idx + 1}</span>
                          {e.full_name}
                          {e.group_size && e.group_size > 1 ? (
                            <span
                              title={`${groupLabel(e)} — part of a group booking of ${e.group_size}`}
                              className={`inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${clr ? clr.badge : 'bg-slate-100 text-dark-muted'}`}
                            >
                              <Users size={9} /> {groupLabel(e)} · {e.group_seq}/{e.group_size}
                            </span>
                          ) : (
                            <span
                              title="Booked individually, not part of a group"
                              className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-slate-100 text-dark-muted"
                            >
                              <User size={9} /> Solo
                            </span>
                          )}
                          {e.package_type === 'early_bird' && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">
                              <Zap size={9} /> Early Bird
                            </span>
                          )}
                          {e.cancelled_at && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
                              <XCircle size={9} /> Cancelled
                            </span>
                          )}
                          {!e.trip_id && !activeGroup && (
                            <span
                              title={isGeneralContactMessage(e) ? 'A "Contact Us" message from the website — not linked to any trip' : 'Logged without picking a trip'}
                              className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-dark-muted shrink-0"
                            >
                              <MessageCircle size={9} /> General
                            </span>
                          )}
                        </p>
                        <p className="text-dark-muted text-xs truncate">{e.phone}</p>
                        <div className="flex items-center flex-wrap gap-1 mt-1">
                          <span className={`inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${paymentStatus(e).color}`}>
                            {formatPrice(e.amount_paid || 0)}{e.total_amount ? ` / ${formatPrice(e.total_amount)}` : ''} · {paymentStatus(e).label}
                          </span>
                          {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                            <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-amber-50 text-amber-700">
                              Balance {formatPrice(paymentBalance(e)!)}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${foodBadge(e).color}`}>
                            <FoodMark type={foodPreferenceKey(e)} size={9} /> {foodBadge(e).label}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                          <cfg.icon size={12} className="shrink-0" />
                          {cfg.label}
                        </span>
                        <ChevronDown size={16} className={`text-dark-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    </div>

                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 border-t border-background-warm space-y-3">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm pt-2">
                          <div>
                            <p className="text-dark-muted text-xs">Phone</p>
                            <p className="text-dark truncate">{e.phone}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Email</p>
                            <p className="text-dark truncate">{e.email}</p>
                          </div>
                          <div className="col-span-2">
                            <ContactQuickLinks phone={e.phone} email={e.email} name={e.full_name} tripTitle={e.trip_title} />
                          </div>
                          {/* Trip (3.8) — spelled out explicitly, including
                              the no-trip case, instead of only being
                              inferable from which Trip filter group the
                              admin happens to be scoped to. */}
                          <div className="col-span-2">
                            <p className="text-dark-muted text-xs">Trip</p>
                            <p className="text-dark truncate">
                              {e.trip_id ? e.trip_title : (
                                <span className="text-dark-muted italic">
                                  {isGeneralContactMessage(e) ? 'None — Contact Us message' : 'None — logged without a trip'}
                                </span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">City</p>
                            <p className="text-dark truncate">{e.city || '—'}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Age</p>
                            <p className="text-dark truncate">{e.age ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Food Preference</p>
                            <p className="text-dark truncate">{e.food_preference === 'veg' ? 'Veg' : e.food_preference === 'non_veg' ? 'Non-veg' : '—'}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Source</p>
                            <p className="text-dark truncate inline-flex items-center gap-1">
                              <srcCfg.icon size={12} className="shrink-0" /> {srcCfg.label}
                            </p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Date &amp; Time</p>
                            <p className="text-dark truncate">{formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            <p className="text-dark-muted text-xs truncate">{formatTime(e.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Package</p>
                            <p className="text-dark truncate">{PACKAGE_CONFIG[e.package_type || 'normal'].label}</p>
                          </div>
                        </div>

                        {e.message && (
                          <div>
                            <p className="text-dark-muted text-xs">Notes</p>
                            <p className="text-dark text-sm">{e.message}</p>
                          </div>
                        )}

                        {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                          <div className="bg-amber-50 rounded-xl px-3 py-2">
                            <p className="text-amber-700 text-xs font-medium">Balance due: {formatPrice(paymentBalance(e)!)}</p>
                          </div>
                        )}

                        {refundStatus(e) && (
                          <div className={`rounded-xl px-3 py-2 ${refundStatus(e)!.color}`}>
                            <p className="text-xs font-medium">{refundStatus(e)!.label}</p>
                          </div>
                        )}

                        <div className="flex items-center flex-wrap gap-2 pt-1">
                          <button
                            onClick={() => openPayment(e)}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-xl whitespace-nowrap bg-background-warm text-dark-muted"
                          >
                            <IndianRupee size={14} /> Payment
                          </button>
                          <span
                            title={isBooked(e) ? 'Seat booked automatically from payment' : e.cancelled_at ? 'Cancelled — seat released' : 'No payment recorded yet, so no seat is held'}
                            className={`flex-1 inline-flex items-center justify-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-xl whitespace-nowrap ${
                              isBooked(e) ? 'bg-green-100 text-green-700' : e.cancelled_at ? 'bg-red-100 text-red-700' : 'bg-background-warm text-dark-muted'
                            }`}
                          >
                            {isBooked(e) ? <CheckCircle2 size={14} /> : e.cancelled_at ? <XCircle size={14} /> : <Circle size={14} />}
                            {isBooked(e) ? 'Booked' : e.cancelled_at ? 'Cancelled' : 'Not booked'}
                          </span>
                          <div className="flex-1">
                            <Select
                              value={e.status}
                              disabled={updating === e.id}
                              onChange={val => handleStatusChange(e, val as Enquiry['status'])}
                              options={STATUS_OPTIONS}
                              size="sm"
                            />
                          </div>
                        </div>

                        <div className="flex items-stretch gap-2">
                          <button
                            onClick={() => handleCancelToggle(e)}
                            disabled={updating === e.id}
                            className={`flex-1 text-xs font-button font-semibold px-3 py-2 rounded-xl border transition-colors ${
                              e.cancelled_at
                                ? 'border-green-200 text-green-700 hover:bg-green-50'
                                : 'border-red-200 text-red-600 hover:bg-red-50'
                            }`}
                          >
                            {e.cancelled_at ? 'Reactivate Booking' : 'Mark as Cancelled'}
                          </button>
                          <button
                            onClick={() => handleDelete(e)}
                            disabled={updating === e.id}
                            title="Delete enquiry"
                            aria-label="Delete enquiry"
                            className="shrink-0 px-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center"
                          >
                            <Trash2 size={14} />
                          </button>
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
            <div className="sm:hidden bg-white rounded-2xl shadow-card overflow-hidden">
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

      {/* Manual Add Enquiry Modal */}
      <Modal isOpen={modalOpen} onClose={closeAddModal} title={convertingWaitlist ? 'Convert Waitlist Signup' : 'Log an Enquiry'} size="md">
        {convertingWaitlist && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 mb-4 text-sm text-green-800">
            <PartyPopper size={16} className="shrink-0 mt-0.5" />
            <p>
              {convertingWaitlist.slots > 1 ? (
                <>
                  <span className="font-semibold">{convertingWaitlist.slots} seats</span> just opened up for{' '}
                  <span className="font-semibold">{convertingWaitlist.name}</span>'s group. Fill in each person below and
                  record their payment — all {convertingWaitlist.slots} will be booked and marked "converted" on the
                  waitlist together.
                </>
              ) : (
                <>
                  A seat opened up for <span className="font-semibold">{convertingWaitlist.name}</span>. Confirm the details
                  below and record their payment to book the seat — they'll be marked "converted" on the waitlist automatically.
                </>
              )}
            </p>
          </div>
        )}

        {convertingWaitlist && convertingWaitlist.slots > 1 ? (
          <>
            {/* Shared trip/package/pricing — one trip, one price, several people */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Trip</label>
                <Select
                  value={form.trip_id}
                  onChange={val => {
                    setForm(f => ({ ...f, trip_id: val }));
                    applySuggestedAmount(val, form.package_type);
                  }}
                  options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Package</label>
                <Select
                  value={form.package_type}
                  onChange={val => {
                    const packageType = val as Enquiry['package_type'];
                    setForm(f => ({ ...f, package_type: packageType }));
                    applySuggestedAmount(form.trip_id, packageType);
                  }}
                  options={PACKAGE_OPTIONS}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹) <span className="text-dark-muted font-normal">— per person</span></label>
                <input
                  type="number"
                  min={0}
                  value={form.total_amount}
                  onChange={e => setForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                  className={inputClass}
                  placeholder="e.g. 15000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
                <Select
                  value={form.source}
                  onChange={val => setForm(f => ({ ...f, source: val as Enquiry['source'] }))}
                  options={SOURCE_OPTIONS}
                />
              </div>
            </div>

            {/* One card per seat being filled this pass */}
            <div className="space-y-4">
              {waitlistPeople.map((p, i) => (
                <div key={i} className="border-2 border-background-warm rounded-xl p-3">
                  <p className="text-xs font-button font-semibold text-dark-muted mb-2 flex items-center gap-1.5">
                    <Users size={12} /> Seat {convertingWaitlist.groupSeq + i} of {convertingWaitlist.groupSize}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-dark mb-1">Full Name *</label>
                      <input value={p.full_name} onChange={e => updateWaitlistPerson(i, { full_name: e.target.value })} className={inputClass} placeholder="e.g. Priya Sharma" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Phone *</label>
                      <input value={p.phone} onChange={e => updateWaitlistPerson(i, { phone: e.target.value })} className={inputClass} placeholder="e.g. 98765 43210" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Email</label>
                      <input value={p.email} onChange={e => updateWaitlistPerson(i, { email: e.target.value })} className={inputClass} placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Age</label>
                      <input type="number" min={0} value={p.age} onChange={e => updateWaitlistPerson(i, { age: e.target.value === '' ? '' : +e.target.value })} className={inputClass} placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Food Preference</label>
                      <Select
                        value={p.food_preference}
                        onChange={val => updateWaitlistPerson(i, { food_preference: val as WaitlistPersonForm['food_preference'] })}
                        options={FOOD_PREFERENCE_OPTIONS}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-dark mb-1">Amount Paid (₹) *</label>
                      <input
                        type="number"
                        min={0}
                        value={p.amount_paid}
                        onChange={e => updateWaitlistPerson(i, { amount_paid: parseNonNegative(e.target.value) })}
                        className={inputClass}
                        placeholder="e.g. 5000 (advance)"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-dark mb-1">Notes</label>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this group" />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Full Name *</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputClass} placeholder="e.g. Priya Sharma" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Phone *</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} placeholder="e.g. 98765 43210" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Email</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputClass} placeholder="Optional" />
            </div>

            {/* Possible-duplicate soft warning (3.5) — fuzzy phone/email
                match against every enquiry already in the system, not just
                this trip. Advisory only; doesn't block Save. */}
            {possibleDuplicates.length > 0 && (
              <div className="md:col-span-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-amber-800">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Possible duplicate{possibleDuplicates.length > 1 ? 's' : ''} — {possibleDuplicates.length === 1 ? 'someone' : `${possibleDuplicates.length} people`} already in the system {possibleDuplicates.length === 1 ? 'shares' : 'share'} this phone or email
                  </p>
                  <p className="text-xs mt-0.5 text-amber-700">Double-check this isn't the same traveler before saving a new entry.</p>
                  <ul className="mt-1.5 space-y-1">
                    {possibleDuplicates.slice(0, 5).map(d => (
                      <li key={d.id} className="text-xs flex items-center gap-1 flex-wrap">
                        <span className="font-medium">{d.full_name}</span>
                        <span className="text-amber-700/80">
                          — {d.trip_title || 'No trip linked'} · {d.status}{d.cancelled_at ? ' · cancelled' : ''}
                        </span>
                      </li>
                    ))}
                    {possibleDuplicates.length > 5 && (
                      <li className="text-xs text-amber-700/80">+ {possibleDuplicates.length - 5} more</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Age</label>
              <input type="number" min={0} value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value === '' ? '' : +e.target.value }))} className={inputClass} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputClass} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
              <Select
                value={form.source}
                onChange={val => setForm(f => ({ ...f, source: val as Enquiry['source'] }))}
                options={SOURCE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Food Preference</label>
              <Select
                value={form.food_preference}
                onChange={val => setForm(f => ({ ...f, food_preference: val as EnquiryForm['food_preference'] }))}
                options={FOOD_PREFERENCE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Trip</label>
              <Select
                value={form.trip_id}
                onChange={val => {
                  setForm(f => ({ ...f, trip_id: val }));
                  applySuggestedAmount(val, form.package_type);
                }}
                options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Package</label>
              <Select
                value={form.package_type}
                onChange={val => {
                  const packageType = val as Enquiry['package_type'];
                  setForm(f => ({ ...f, package_type: packageType }));
                  applySuggestedAmount(form.trip_id, packageType);
                }}
                options={PACKAGE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
              <input
                type="number"
                min={0}
                value={form.total_amount}
                onChange={e => setForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                className={inputClass}
                placeholder="e.g. 15000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
              <input
                type="number"
                min={0}
                value={form.amount_paid}
                onChange={e => setForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
                className={inputClass}
                placeholder="e.g. 5000 (advance) — leave blank if unpaid"
              />
              <p className="text-[11px] text-dark-muted mt-1">Any amount here books a seat right away. Full amount auto-closes the enquiry.</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Notes</label>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this enquiry" />
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" onClick={closeAddModal}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleSave} loading={saving}>
            {convertingWaitlist
              ? convertingWaitlist.slots > 1
                ? `Convert ${convertingWaitlist.slots} & Save`
                : 'Convert & Save'
              : 'Save Enquiry'}
          </Button>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal isOpen={!!paymentTarget} onClose={() => setPaymentTarget(null)} title="Track Payment" size="sm">
        {paymentTarget && (
          <div className="space-y-4">
            <div className="bg-background-warm rounded-xl px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-dark truncate">{paymentTarget.full_name}</p>
                <p className="text-dark-muted text-xs truncate">{paymentTarget.trip_title || 'No trip linked'}</p>
              </div>
              <span className={`inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${foodBadge(paymentTarget).color}`}>
                <FoodMark type={foodPreferenceKey(paymentTarget)} size={11} /> {foodBadge(paymentTarget).label}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Food Preference</label>
              <Select
                value={paymentForm.food_preference}
                onChange={val => setPaymentForm(f => ({ ...f, food_preference: val as PaymentForm['food_preference'] }))}
                options={FOOD_PREFERENCE_OPTIONS}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Package</label>
              <Select
                value={paymentForm.package_type}
                onChange={val => {
                  const packageType = val as Enquiry['package_type'];
                  const suggested = getTripPrice(paymentTarget.trip_id, packageType);
                  setPaymentForm(f => ({ ...f, package_type: packageType, total_amount: suggested ?? f.total_amount }));
                }}
                options={PACKAGE_OPTIONS}
              />
              {paymentTarget.trip_id && (
                <div className="text-xs mt-1">
                  {(() => {
                    const normal = getTripPrice(paymentTarget.trip_id, 'normal');
                    const earlyBird = getTripPrice(paymentTarget.trip_id, 'early_bird');
                    const parts = [];
                    if (normal != null) parts.push(`Normal ${formatPrice(normal)}`);
                    if (earlyBird != null) parts.push(`Early Bird ${formatPrice(earlyBird)}`);
                    const missingOne = normal == null || earlyBird == null;
                    const missingField = normal == null && earlyBird == null
                      ? 'Regular Price per person and Early-Bird Price per person'
                      : normal == null
                        ? 'Regular Price per person'
                        : 'Early-Bird Price per person';

                    return (
                      <>
                        {parts.length > 0 && (
                          <p className="text-dark-muted">Trip price — {parts.join(' · ')}</p>
                        )}
                        {missingOne && (
                          <p className="text-amber-600 mt-0.5">
                            {parts.length === 0
                              ? "This trip has no price set, so we can't suggest an amount. "
                              : `This trip's ${missingField} isn't set yet. `}
                            Add it under{' '}
                            <Link to="/admin/trips" className="underline font-medium" onClick={() => setPaymentTarget(null)}>
                              Upcoming Trips → edit this trip → {missingField}
                            </Link>.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={paymentForm.total_amount}
                  onChange={e => setPaymentForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                  className={inputClass}
                  placeholder="e.g. 15000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={paymentForm.amount_paid}
                  onChange={e => setPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
                  className={inputClass}
                  placeholder="e.g. 5000 (advance)"
                />
              </div>
            </div>

            {paymentForm.total_amount !== '' && paymentForm.amount_paid !== '' && (
              <p className="text-sm text-dark-muted">
                Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, Number(paymentForm.total_amount) - Number(paymentForm.amount_paid)))}</span>
              </p>
            )}

            {paymentTarget.cancelled_at && (
              <div className="bg-red-50 rounded-xl p-3 space-y-2">
                <p className="text-red-700 text-xs font-medium">This booking is cancelled. Track any refund here as you process it.</p>
                {paymentTarget.suggested_refund_amount != null && (
                  <p className="text-xs text-dark-muted bg-white/60 rounded-lg px-2 py-1.5">
                    Suggested refund (estimate — not binding, confirm before use): <span className="font-semibold text-dark">{formatPrice(paymentTarget.suggested_refund_amount)}</span>
                    {paymentTarget.third_party_charges ? ` — after ${formatPrice(paymentTarget.third_party_charges)} in third-party charges` : ''}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">Refund Amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={paymentForm.refund_amount}
                    onChange={e => setPaymentForm(f => ({ ...f, refund_amount: parseNonNegative(e.target.value) }))}
                    className={inputClass}
                    placeholder="How much has been refunded so far"
                  />
                  <p className="text-[11px] text-dark-muted mt-1">
                    They paid {formatPrice(paymentTarget.amount_paid || 0)} in total.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="md" onClick={() => setPaymentTarget(null)}>Cancel</Button>
              <Button variant="primary" size="md" onClick={handleSavePayment} loading={savingPayment}>Save Payment</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Enquiry Details Popup — desktop replacement for the old inline
          expand-in-row panel. Clicking a name in the table opens this
          instead of pushing the row below it down. */}
      <Modal isOpen={!!detailsTarget} onClose={() => setDetailsTarget(null)} title={detailsTarget?.full_name || 'Enquiry Details'} size="md">
        {detailsTarget && (() => {
          const srcCfg = SOURCE_CONFIG[detailsTarget.source] || SOURCE_CONFIG.other;
          const food = foodBadge(detailsTarget);
          return (
            <div className="space-y-4">
              <div className="flex items-center flex-wrap gap-1.5">
                {detailsTarget.group_size && detailsTarget.group_size > 1 ? (
                  <span
                    title={`${groupLabel(detailsTarget)} — part of a group booking of ${detailsTarget.group_size}`}
                    className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-dark-muted"
                  >
                    <Users size={10} /> {groupLabel(detailsTarget)} · {detailsTarget.group_seq}/{detailsTarget.group_size}
                  </span>
                ) : (
                  <span
                    title="Booked individually, not part of a group"
                    className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-dark-muted"
                  >
                    <User size={10} /> Solo
                  </span>
                )}
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${food.color}`}>
                  <FoodMark type={foodPreferenceKey(detailsTarget)} size={10} /> {food.label}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-dark-muted text-xs">Email</p>
                  <p className="text-dark truncate">{detailsTarget.email}</p>
                </div>
                <div>
                  <p className="text-dark-muted text-xs">Phone</p>
                  <p className="text-dark truncate">{detailsTarget.phone}</p>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <ContactQuickLinks phone={detailsTarget.phone} email={detailsTarget.email} name={detailsTarget.full_name} tripTitle={detailsTarget.trip_title} size="md" />
                </div>
                {/* Trip (3.8) — spelled out explicitly, including the
                    no-trip case, instead of only being inferable from
                    which Trip filter group the admin happens to be
                    scoped to. */}
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-dark-muted text-xs">Trip</p>
                  <p className="text-dark truncate">
                    {detailsTarget.trip_id ? detailsTarget.trip_title : (
                      <span className="text-dark-muted italic">
                        {isGeneralContactMessage(detailsTarget) ? 'None — Contact Us message' : 'None — logged without a trip'}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-dark-muted text-xs">City</p>
                  <p className="text-dark truncate">{detailsTarget.city || '—'}</p>
                </div>
                <div>
                  <p className="text-dark-muted text-xs">Age</p>
                  <p className="text-dark truncate">{detailsTarget.age ?? '—'}</p>
                </div>
                <div>
                  <p className="text-dark-muted text-xs">Source</p>
                  <p className="text-dark truncate inline-flex items-center gap-1">
                    <srcCfg.icon size={12} className="shrink-0" /> {srcCfg.label}
                  </p>
                </div>
                <div>
                  <p className="text-dark-muted text-xs">Package</p>
                  <p className="text-dark truncate">{PACKAGE_CONFIG[detailsTarget.package_type || 'normal'].label}</p>
                </div>
                <div>
                  <p className="text-dark-muted text-xs">Date &amp; Time</p>
                  <p className="text-dark truncate">
                    {formatDate(detailsTarget.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(detailsTarget.created_at)}
                  </p>
                </div>
              </div>
              {detailsTarget.message && (
                <div>
                  <p className="text-dark-muted text-xs mb-1">Notes</p>
                  <p className="text-dark text-sm bg-background-warm rounded-xl px-3 py-2.5">{detailsTarget.message}</p>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Cancel Booking Modal */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Booking" size="sm">
        {cancelTarget && (
          <div className="space-y-4">
            <div className="bg-background-warm rounded-xl px-4 py-3">
              <p className="font-medium text-dark">{cancelTarget.full_name}</p>
              <p className="text-dark-muted text-xs">{cancelTarget.trip_title || 'No trip linked'}</p>
            </div>

            <p className="text-sm text-dark-muted">
              This frees up their seat right away. {cancelTarget.amount_paid > 0 && `They've paid ${formatPrice(cancelTarget.amount_paid)} so far — `}
              amount paid stays on record; refunds are tracked separately from the Payment screen.
            </p>

            {cancelTarget.trip_id && waitlistWaitingCounts[cancelTarget.trip_id]?.entries > 0 && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-sm text-orange-800">
                <Users size={16} className="shrink-0 mt-0.5" />
                <p>
                  <span className="font-semibold">
                    {describeWaiting(waitlistWaitingCounts[cancelTarget.trip_id])} {waitlistWaitingCounts[cancelTarget.trip_id].entries === 1 ? 'is' : 'are'} waiting
                  </span>{' '}
                  for a seat on this trip. Once you cancel, that freed seat is bookable by anyone on the website — convert
                  them first if you want to give them priority.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Third-Party Charges (₹)</label>
              <input
                type="number"
                min={0}
                value={cancelCharges}
                onChange={ev => setCancelCharges(parseNonNegative(ev.target.value))}
                className={inputClass}
                placeholder="Airline/hotel penalties, if known — optional"
              />
              <p className="text-[11px] text-dark-muted mt-1">
                Used to compute the suggested refund estimate. You can leave this blank and add it later.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="md" onClick={() => setCancelTarget(null)}>Back</Button>
              <Button variant="primary" size="md" onClick={handleConfirmCancel} loading={cancelling}>Confirm Cancellation</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Lightweight success toast — bulk-save confirmation only, doesn't
          block the admin the way the AlertDialog (errors/validation) does */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-dark text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-warm-lg"
          >
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Edit Modal */}
      <Modal isOpen={bulkEditOpen} onClose={() => setBulkEditOpen(false)} title={`Bulk Edit — ${selectedIds.size} selected`} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-dark-muted bg-background-warm rounded-xl px-3 py-2">
            Only fields you change here are applied — anything left on "No change" is left exactly as it is for every selected enquiry.
          </p>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              value={bulkForm.food_preference}
              onChange={val => setBulkForm(f => ({ ...f, food_preference: val as BulkEditForm['food_preference'] }))}
              options={BULK_FOOD_OPTIONS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Package</label>
            <Select
              value={bulkForm.package_type}
              onChange={val => {
                const packageType = val as BulkEditForm['package_type'];
                // Mirrors the single-row Track Payment modal: picking a
                // package pulls in that package's configured trip price as
                // the suggested Total Amount, so picking "Normal Price"
                // actually sets a price instead of just relabeling the row.
                const suggested = packageType !== BULK_NO_CHANGE && activeGroup?.trip
                  ? getTripPrice(activeGroup.trip.id, packageType)
                  : undefined;
                setBulkForm(f => ({
                  ...f,
                  package_type: packageType,
                  total_amount: suggested ?? f.total_amount,
                }));
              }}
              options={BULK_PACKAGE_OPTIONS}
            />
            {bulkForm.package_type !== BULK_NO_CHANGE && !activeGroup?.trip && (
              <p className="text-amber-600 text-[11px] mt-1">
                These enquiries aren't linked to a trip, so there's no configured price to pull in — enter the amount manually below.
              </p>
            )}
            {bulkForm.package_type !== BULK_NO_CHANGE && activeGroup?.trip && getTripPrice(activeGroup.trip.id, bulkForm.package_type) == null && (
              <p className="text-amber-600 text-[11px] mt-1">
                This trip's price for this package isn't set yet — enter the amount manually below, or add it under Upcoming Trips first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Enter Money — Total Amount (₹)</label>
            <input
              type="number"
              min={0}
              value={bulkForm.total_amount}
              onChange={ev => setBulkForm(f => ({ ...f, total_amount: parseNonNegative(ev.target.value) }))}
              className={inputClass}
              placeholder="Leave blank to leave unchanged"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
            <input
              type="number"
              min={0}
              value={bulkForm.amount_paid}
              onChange={ev => setBulkForm(f => ({ ...f, amount_paid: parseNonNegative(ev.target.value) }))}
              className={inputClass}
              placeholder="Leave blank to leave unchanged"
            />
            <p className="text-[11px] text-dark-muted mt-1">
              Sets what's been collected so far for every selected enquiry, as a new total — not added on top of what's already recorded. Leave blank to leave each one's amount paid as-is.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Status</label>
            <Select
              value={bulkForm.status}
              onChange={val => setBulkForm(f => ({ ...f, status: val as BulkEditForm['status'] }))}
              options={BULK_STATUS_OPTIONS}
            />
            {bulkForm.status === 'contacted' && (
              <p className="text-[11px] text-dark-muted mt-1">
                The Track Payment popup only appears for single-record updates, so it won't open here.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setBulkEditOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleBulkSave} loading={bulkSaving}>
              Bulk Save
            </Button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
