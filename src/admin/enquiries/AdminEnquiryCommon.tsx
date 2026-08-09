// Shared, purely presentational/data helpers used by both AdminEnquiries
// (the list/table view) and AdminEnquiryDetail (the single-enquiry CRM
// page) — kept in their own module (rather than exported from
// AdminEnquiries.tsx directly) so:
//   1. Fast Refresh keeps working on both admin pages (a component file
//      that also exports plain constants/functions breaks it).
//   2. AdminEnquiryDetail doesn't need to pull in the entire Enquiries
//      table component just to reuse a badge/label helper.
// Everything here is intentionally stateless — no hooks, no local state —
// so it's safe to call from anywhere.
import { Clock, RefreshCw, Hourglass, IndianRupee, CheckCircle2, AlertTriangle, BadgeCheck, LogIn, PartyPopper, XCircle, Circle, Globe, MessageCircle, Phone, Camera, MapPin, HelpCircle, UserMinus, CalendarClock } from 'lucide-react';
import type { BookingFollowUpType, CancellationReason, ClosedReason, ContactOutcome, Enquiry, Payment, UpcomingTrip } from '../types/types-index';
import { formatDate, getActivePrice } from '../utils/utils-index';

// Parses a money-field <input type="number"> value into a non-negative
// number, or '' if the field is empty. The HTML `min={0}` attribute on
// these inputs is a visual hint only — some browsers still hand back a
// negative number from a programmatic read (e.g. typing "-5000" and
// tabbing away without the browser's spinner/blur clamp kicking in), so
// every money field routes through this instead of a bare `+e.target.value`.
export function parseNonNegative(raw: string): number | '' {
  if (raw === '') return '';
  const n = Number(raw);
  if (Number.isNaN(n)) return '';
  return Math.max(0, n);
}

export const PACKAGE_CONFIG = {
  early_bird: { label: 'Early Bird', color: 'bg-purple-100 text-purple-700' },
  normal: { label: 'Normal', color: 'bg-slate-100 text-slate-700' },
} as const;

export const PACKAGE_OPTIONS = [
  { value: 'normal', label: 'Normal Price' },
  { value: 'early_bird', label: 'Early Bird' },
];

// Display label for every invoice/payment-ledger type, including the ones
// only ever set server-side (booking_amount) — used wherever a raw
// payment_type value needs to read as a human label (Invoices list, Generate
// Invoice modal).
export const INVOICE_TYPE_LABEL: Record<Payment['payment_type'], string> = {
  booking_amount: 'Booking Amount',
  installment: 'Installment',
  balance: 'Balance',
  refund: 'Refund',
  full_payment: 'Full Payment',
  advance: 'Advance',
  extra_charge: 'Extra Charge',
};

// Types the admin can pick from the Generate Invoice modal. Refund isn't
// offered here — it already has its own dedicated flow in the Cancel
// Booking / Track Payment modal (recordRefund), which accounts for
// cancellation/no-show rules that this generic modal doesn't know about.
export type GenerateInvoiceType = 'full_payment' | 'advance' | 'balance' | 'installment' | 'extra_charge';

export const GENERATE_INVOICE_TYPE_OPTIONS: { value: GenerateInvoiceType; label: string }[] = [
  { value: 'full_payment', label: 'Full Payment' },
  { value: 'advance', label: 'Advance' },
  { value: 'balance', label: 'Balance' },
  { value: 'installment', label: 'Installment' },
  { value: 'extra_charge', label: 'Extra Charge' },
];

export const GENERATE_INVOICE_STATUS_OPTIONS: { value: 'paid' | 'pending'; label: string }[] = [
  { value: 'paid', label: 'Paid now — money already collected' },
  { value: 'pending', label: 'Pending — invoice only, collect later' },
];

export interface GenerateInvoiceForm {
  type: GenerateInvoiceType;
  amount: number | '';
  status: 'paid' | 'pending';
  // Only meaningful when status is 'paid' — a pending invoice hasn't
  // actually been settled yet, so there's no method/reference to record
  // (CRM spec sections 6/46).
  payment_method: string;
  utr_number: string;
  notes: string;
}

export const emptyGenerateInvoiceForm: GenerateInvoiceForm = {
  type: 'advance',
  amount: '',
  status: 'paid',
  payment_method: '',
  utr_number: '',
  notes: '',
};

export type PaymentForm = {
  package_type: Enquiry['package_type'];
  total_amount: number | '';
  // This transaction's own amount — not a running total. Matches Generate
  // Invoice's "Amount" field: the admin enters what's coming in right now,
  // and picks payment_type directly below, the same way Generate Invoice's
  // Type dropdown works. recordPayment still does delta/running-total math
  // internally (every other caller of it needs that), but the UI here no
  // longer asks the admin to do that addition themselves.
  amount_paid: number | '';
  // Full Payment / Advance / Balance / Installment / Extra Charge — picked
  // manually here, same options and same meaning as Generate Invoice's Type
  // dropdown (see PAYMENT_TYPE_OPTIONS below, which is now literally
  // GENERATE_INVOICE_TYPE_OPTIONS — one shared list, no risk of the two
  // dropdowns drifting). 'extra_charge' routes through addExtraCharge
  // instead of recordPayment's `type` override (which still only accepts
  // the original four) — see handleSavePayment for the branch.
  payment_type: GenerateInvoiceType;
  // Paid now vs pending — same meaning and same options
  // (GENERATE_INVOICE_STATUS_OPTIONS) as Generate Invoice's Status dropdown.
  // 'pending' raises an invoice without touching amount_paid (via
  // generatePendingInvoice, or addExtraCharge's collectedNow: false for the
  // extra_charge type), for later settlement with the Mark Paid button in
  // the Invoices list — same as Generate Invoice, Track Payment just also
  // lets that pending invoice ride alongside a total/package/food edit.
  status: 'paid' | 'pending';
  // Payment Method / UTR — CRM spec sections 6/9/47: how this payment leg
  // (the amount_paid change above) was actually settled, and its bank/UPI
  // reference. Optional — only meaningful when status is 'paid' and
  // amount_paid actually changes; recordPayment/addExtraCharge silently
  // ignore them otherwise.
  payment_method: string;
  payment_utr: string;
  refund_amount: number | '';
  // Refund Method / Refund UTR / Refund Date / Notes — CRM spec section 7's
  // Refund Popup fields, only meaningful (and only shown) alongside
  // refund_amount on a cancelled booking. refund_date defaults to today
  // when the field is touched; left '' it falls back to recordRefund's own
  // now() default.
  refund_method: string;
  refund_utr: string;
  refund_date: string;
  refund_notes: string;
  food_preference: 'veg' | 'non_veg' | '';
};

// Same types Generate Invoice offers, including Extra Charge and the
// paid/pending Status (refund is still excluded — it has its own dedicated,
// cancellation-aware flow here in Track Payment's cancelled-booking
// section). Literally the same array as GENERATE_INVOICE_TYPE_OPTIONS now —
// aliased under this name so Track Payment's imports/intent stay readable —
// so wording can never drift between the two dropdowns.
export const PAYMENT_TYPE_OPTIONS: { value: PaymentForm['payment_type']; label: string }[] = GENERATE_INVOICE_TYPE_OPTIONS;

// 'Balance' is meant for the payment that clears whatever's left owing —
// unlike 'Installment', which is any partial payment with more expected
// after it. Nothing else in the data model enforces that distinction, so
// without this check an admin could pick 'Balance' on a payment that
// doesn't actually zero out the amount due, leaving the ledger's own
// labels misleading. Only 'Balance' is gated this way; every other type
// (including 'Installment') stays freely selectable.
export function clearsBalance(paymentForm: PaymentForm, alreadyPaid: number): boolean {
  if (paymentForm.payment_type === 'extra_charge') return false;
  if (paymentForm.total_amount === '') return false;
  const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
  if (thisPayment <= 0) return false;
  const remaining = Number(paymentForm.total_amount) - alreadyPaid - thisPayment;
  return remaining <= 0;
}

// Same list as PAYMENT_TYPE_OPTIONS, minus 'Balance' when this payment
// wouldn't actually clear the amount due — see clearsBalance above. Callers
// pair this with an effect that steers payment_type off 'balance' the
// moment it stops qualifying (e.g. the admin lowers the amount after
// picking it), so the Select's current value always stays in this list.
export function availablePaymentTypeOptions(paymentForm: PaymentForm, alreadyPaid: number): { value: PaymentForm['payment_type']; label: string }[] {
  return clearsBalance(paymentForm, alreadyPaid) ? PAYMENT_TYPE_OPTIONS : PAYMENT_TYPE_OPTIONS.filter(o => o.value !== 'balance');
}

export const FOOD_PREFERENCE_OPTIONS = [
  { value: '', label: 'Not asked / unknown' },
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-veg' },
];

// Works out which price currently applies to a trip an enquiry is linked
// to — early-bird if that price/deadline are set and today is still on or
// before the deadline, normal otherwise — using the exact same clock the
// public site's TripCard/TripDetailPage use (getActivePrice), so what an
// admin sees here always matches what the traveller was actually quoted.
// Returns null when there's no trip to price against.
export function getTripActivePricing(
  trip: UpcomingTrip | undefined
): { amount: number; packageType: Enquiry['package_type']; isEarlyBird: boolean; deadline?: string | null } | null {
  if (!trip) return null;
  const { activePrice, isEarlyBird } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
  if (activePrice == null) return null;
  return {
    amount: activePrice,
    packageType: isEarlyBird ? 'early_bird' : 'normal',
    isEarlyBird,
    deadline: trip.early_bird_deadline,
  };
}

// Small inline badge shown next to each enquiry's name — lets an admin spot
// missing food preferences directly in the list, without opening the row.
export function foodBadge(e: Enquiry): { label: string; color: string } {
  if (e.food_preference === 'veg') return { label: 'Veg', color: 'bg-green-100 text-green-700' };
  if (e.food_preference === 'non_veg') return { label: 'Non-veg', color: 'bg-red-100 text-red-700' };
  return { label: 'Food not set', color: 'bg-slate-100 text-dark-muted' };
}

export function foodPreferenceKey(e: Enquiry): 'veg' | 'non_veg' | 'not_set' {
  if (e.food_preference === 'veg') return 'veg';
  if (e.food_preference === 'non_veg') return 'non_veg';
  return 'not_set';
}

export const SOURCE_CONFIG = {
  website: { label: 'Website', icon: Globe },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  phone: { label: 'Phone Call', icon: Phone },
  instagram: { label: 'Instagram', icon: Camera },
  walk_in: { label: 'Walk-in', icon: MapPin },
  other: { label: 'Other', icon: HelpCircle },
} as const;

// Single "Booking Journey" badge shown in the table/detail page,
// superseding the old status/booking_status dropdown combination — see
// supabase/migration/add_booking_journey_stage.sql for how each stage is
// derived. journey_stage is guaranteed non-null by the DB once the
// migration has run; the 'new_enquiry' fallback here only guards against a
// stale row read before that migration is applied.
export const JOURNEY_STAGE_CONFIG: Record<Enquiry['journey_stage'], { label: string; color: string; icon: typeof Clock }> = {
  new_enquiry: { label: 'New Enquiry', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  advance_pending: { label: 'Advance Pending', color: 'bg-amber-100 text-amber-700', icon: Hourglass },
  advance_paid: { label: 'Advance Paid', color: 'bg-purple-100 text-purple-700', icon: IndianRupee },
  confirmed: { label: 'Confirmed', color: 'bg-teal-100 text-teal-700', icon: CheckCircle2 },
  balance_pending: { label: 'Balance Pending', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
  fully_paid: { label: 'Fully Paid', color: 'bg-green-100 text-green-700', icon: BadgeCheck },
  checked_in: { label: 'Checked In', color: 'bg-indigo-100 text-indigo-700', icon: LogIn },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: PartyPopper },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
  // A lead that was contacted and said no — closed out before any money
  // changed hands. Distinct from `cancelled` (which is always a booking
  // that had money on it at some point). See add_not_interested_journey_stage.sql.
  not_interested: { label: 'Not Interested', color: 'bg-slate-200 text-dark-muted', icon: UserMinus },
} as const;

export function journeyBadge(e: Enquiry) {
  return JOURNEY_STAGE_CONFIG[e.journey_stage] || JOURNEY_STAGE_CONFIG.new_enquiry;
}

// True when this enquiry was closed out before ever becoming a paying
// booking — i.e. an admin followed up and the person just wasn't
// interested, as opposed to `status: 'closed'` on a booking that actually
// went through (see the Enquiry.status doc comment in types-index.ts: a
// 'closed' lead can mean either "went nowhere" or "fully paid booking").
// Used to show a distinct "Not Interested" badge/action instead of the
// ambiguous generic 'closed' status. Checks journey_stage first (the
// source of truth going forward — see add_not_interested_journey_stage.sql)
// and falls back to the same derived check as before for any row whose
// journey_stage hasn't been refreshed since that migration landed.
export function isNotInterested(e: Enquiry): boolean {
  if (e.journey_stage === 'not_interested') return true;
  return e.status === 'closed' && !e.cancelled_at && (e.amount_paid || 0) <= 0 && !e.booking_id;
}

// Whether "Not Interested" is a valid action on this enquiry right now —
// only before any money's changed hands (once there's a booking_id or a
// payment on record, closing the lead out is a Cancel Booking decision
// instead — different consequences: refunds, seat release, etc) and only
// while it isn't already closed. Shared by the kebab-menu action and the
// inline quick-action button in both AdminEnquiries.tsx and
// AdminEnquiryDetail.tsx so the eligibility rule can't drift between them.
export function canMarkNotInterested(e: Enquiry): boolean {
  return !e.cancelled_at && !e.booking_id && (e.amount_paid || 0) <= 0 && !isNotInterested(e);
}

// Whether a follow-up reminder can be set on this enquiry right now — while
// it's still a live, pre-booked conversation (journey_stage 'contacted',
// 'advance_pending', or 'advance_paid' — the three stages status ===
// 'contacted' can derive to, see computeJourneyStage/computeAutoStatus in
// services/api.ts: status only flips off 'contacted' once amount_paid
// reaches total_amount). Not offered on a fresh lead nobody's spoken to yet
// (nothing to follow up on), nor once the booking's actually confirmed
// (booking_amount reached) or later — those move it past the window
// add_enquiry_follow_up.sql's check constraint allows follow_up_at to be
// set in, and refreshJourneyStage() clears any existing reminder the
// moment that happens.
export function canSetFollowUp(e: Enquiry): boolean {
  return e.journey_stage === 'contacted' || e.journey_stage === 'advance_pending' || e.journey_stage === 'advance_paid';
}

// Follow-up reminder chip shown next to a Contacted lead — auto-escalates
// color/label as the date approaches so a due reminder actually reads as
// urgent instead of blending into the row like a plain date would. Compares
// on calendar day only (follow_up_at has no time component), so "today" is
// today regardless of what time the admin looks. Returns null when there's
// no reminder set, so callers can skip rendering the chip entirely.
export function followUpStatus(e: Enquiry): { label: string; color: string; icon: typeof CalendarClock; isDue: boolean } | null {
  if (!e.follow_up_at) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = e.follow_up_at.split('-').map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const dateLabel = formatDate(e.follow_up_at, { day: 'numeric', month: 'short' });
  if (diffDays < 0) return { label: `Overdue · ${dateLabel}`, color: 'bg-red-100 text-red-700', icon: CalendarClock, isDue: true };
  if (diffDays === 0) return { label: 'Follow up today', color: 'bg-amber-100 text-amber-700', icon: CalendarClock, isDue: true };
  return { label: `Follow up ${dateLabel}`, color: 'bg-blue-50 text-blue-700', icon: CalendarClock, isDue: false };
}

// Whether a Booking Follow-up reminder can be set on this enquiry right
// now — CRM spec section 8B: only after the booking has started (past
// Advance Pending) and while it's still active. Mirrors
// canSetFollowUp() above on the opposite side of the same row's
// lifecycle — the two windows never overlap, enforced by the DB check
// constraints in add_booking_follow_up.sql and the clearing logic in
// refreshJourneyStage() (src/services/api.ts).
export function canSetBookingFollowUp(e: Enquiry): boolean {
  return e.booking_state === 'active' && (
    e.journey_stage === 'advance_pending' || e.journey_stage === 'advance_paid'
    || e.journey_stage === 'confirmed' || e.journey_stage === 'balance_pending'
    || e.journey_stage === 'fully_paid' || e.journey_stage === 'checked_in'
  );
}

// Whether "Cancel Booking" should be offered right now — CRM spec section
// 18's Cancellation Rules: only once a booking has actually started (past
// Advance Pending), and only until the traveller checks in or the trip
// completes. Previously the UI offered Cancel Booking on any non-completed,
// non-checked-in row — including a brand-new lead nobody's even contacted
// yet, which the spec explicitly calls out as not allowed ("Cannot cancel
// because customer has not agreed to book yet"). cancelEnquiry() in
// services/api.ts enforces the same rule server-side as a backstop. Does
// NOT cover the "already cancelled -> offer Reactivate instead" case —
// callers check e.cancelled_at separately for that, same as before.
export function canCancelBooking(e: Enquiry): boolean {
  if (e.cancelled_at || e.checked_in_at || e.journey_stage === 'completed') return false;
  return e.journey_stage !== 'new_enquiry' && e.journey_stage !== 'contacted' && e.journey_stage !== 'not_interested';
}

// Human-readable label for each Booking Follow-up type — see
// BookingFollowUpType in types-index.ts.
export const BOOKING_FOLLOW_UP_TYPE_CONFIG: Record<BookingFollowUpType, { label: string }> = {
  balance_payment: { label: 'Balance Payment Reminder' },
  document: { label: 'Document Reminder' },
  passport: { label: 'Passport Reminder' },
  medical_declaration: { label: 'Medical Declaration' },
  final_itinerary: { label: 'Final Itinerary Reminder' },
  other: { label: 'Other' },
};

// Booking Follow-up reminder chip — same escalating urgency treatment as
// followUpStatus() above (overdue/today/upcoming), but labelled with what
// the reminder is actually about (e.g. "Balance Payment Reminder") instead
// of a bare date, since that's the whole point of carrying a type here.
// Returns null when no Booking Follow-up is set.
export function bookingFollowUpStatus(e: Enquiry): { label: string; color: string; icon: typeof CalendarClock; isDue: boolean } | null {
  if (!e.booking_follow_up_at) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = e.booking_follow_up_at.split('-').map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const dateLabel = formatDate(e.booking_follow_up_at, { day: 'numeric', month: 'short' });
  const typeLabel = e.booking_follow_up_type ? BOOKING_FOLLOW_UP_TYPE_CONFIG[e.booking_follow_up_type].label : 'Booking Follow-up';
  if (diffDays < 0) return { label: `${typeLabel} · Overdue · ${dateLabel}`, color: 'bg-red-100 text-red-700', icon: CalendarClock, isDue: true };
  if (diffDays === 0) return { label: `${typeLabel} · Today`, color: 'bg-amber-100 text-amber-700', icon: CalendarClock, isDue: true };
  return { label: `${typeLabel} · ${dateLabel}`, color: 'bg-blue-50 text-blue-700', icon: CalendarClock, isDue: false };
}

// Every reason an admin can pick when closing an enquiry out — see
// supabase/migration/add_closed_reason.sql. No plain "Not Interested" entry
// here: the closing action itself already carries that label everywhere
// else in the UI (journey_stage, badge, button), so a same-named reason
// would just restate it without adding information — "Other" is the
// catch-all instead. Order here is the order shown in the picker (most
// common first) and the order used for the reporting breakdown in
// AdminEnquiries.tsx.
export const CLOSED_REASON_CONFIG: Record<ClosedReason, { label: string }> = {
  no_response: { label: 'No Response' },
  price_too_high: { label: 'Price Too High' },
  date_conflict: { label: "Date Doesn't Work" },
  destination_changed: { label: 'Destination Changed' },
  booked_elsewhere: { label: 'Booked Elsewhere' },
  // No 'will_join_later' here any more — that was really "still warm,
  // checking with family/friends", which isn't a closed reason at all (see
  // canSetFollowUp / followUpStatus below and add_enquiry_follow_up.sql).
  personal_reason: { label: 'Family / Personal Reason' },
  // Also reachable directly as a Contact Outcome (see CONTACT_OUTCOME_CONFIG
  // below) — kept here too since it's still a closed_reason value under the
  // hood, e.g. for the closed-reason breakdown in reporting.
  wrong_number: { label: 'Wrong Number' },
  other: { label: 'Other' },
};

export const CLOSED_REASON_OPTIONS: { value: ClosedReason; label: string }[] =
  (Object.keys(CLOSED_REASON_CONFIG) as ClosedReason[]).map(value => ({
    value,
    label: CLOSED_REASON_CONFIG[value].label,
  }));

// Options offered in the Not Interested reason picker specifically —
// excludes 'wrong_number', which has its own dedicated Contact Outcome and
// would just duplicate it here.
export const NOT_INTERESTED_REASON_OPTIONS = CLOSED_REASON_OPTIONS.filter(
  o => o.value !== 'wrong_number'
);

// Every reason an admin can pick in the Cancel Booking popup — see
// CancellationReason in types-index.ts and add_cancellation_reason.sql.
// No 'no_show' entry: that's captured separately by the no-show checkbox in
// the same popup (attendance is independent of why a booking was
// cancelled — CRM spec section 4).
export const CANCELLATION_REASON_CONFIG: Record<CancellationReason, { label: string }> = {
  medical: { label: 'Medical' },
  personal: { label: 'Personal' },
  emergency: { label: 'Emergency' },
  visa: { label: 'Visa' },
  price: { label: 'Price' },
  other: { label: 'Other' },
};

export const CANCELLATION_REASON_OPTIONS: { value: CancellationReason; label: string }[] =
  (Object.keys(CANCELLATION_REASON_CONFIG) as CancellationReason[]).map(value => ({
    value,
    label: CANCELLATION_REASON_CONFIG[value].label,
  }));

// Methods offered when recording any real money movement — a payment
// (Track Payment / Generate Invoice) or a refund (Refund popup). One
// canonical list (CRM spec sections 6/8) instead of two that could drift
// apart; payment_method stays a free-text column on `payments` (same as
// every other payment type), this is just a curated picker so admins
// record a consistent value instead of free-typing "upi"/"UPI"/"Upi"
// differently each time.
export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank', label: 'Bank Transfer' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Other', label: 'Other' },
];

// Refunds settle through the exact same methods as payments — reuse the
// same canonical list rather than a second, potentially-diverging one.
export const REFUND_METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS;

// Outcomes offered in the "Record Contact Outcome" popup (see
// ContactOutcomeModal.tsx) — the single entry point for moving a lead from
// New to Contacted. Order here is the order shown in the popup.
export const CONTACT_OUTCOME_CONFIG: Record<ContactOutcome, {
  label: string;
  description: string;
  // What this outcome does to the lead once saved — drives
  // ContactOutcomeModal's conditional fields and recordContactOutcome()'s
  // branching. 'stays_contacted' outcomes always create a Lead Follow-up
  // (follow_up_at/time); 'closed' outcomes always end in status = 'closed'.
  effect: 'advance' | 'stays_contacted' | 'closed';
}> = {
  interested: {
    label: 'Interested',
    description: "They want to book — this opens Track Payment to move them to Advance Pending.",
    effect: 'advance',
  },
  needs_time: {
    label: 'Needs Time',
    description: 'Checking with family/friends — stays Contacted with a follow-up reminder.',
    effect: 'stays_contacted',
  },
  call_later: {
    label: 'Call Later',
    description: "Asked to be called back — stays Contacted with a follow-up reminder.",
    effect: 'stays_contacted',
  },
  payment_arrangement: {
    label: 'Payment Arrangement Needed',
    description: 'Wants to book but needs time to arrange funds — stays Contacted with a follow-up reminder.',
    effect: 'stays_contacted',
  },
  no_response: {
    label: 'No Response',
    description: "Didn't pick up — stays Contacted with a retry reminder.",
    effect: 'stays_contacted',
  },
  not_interested: {
    label: 'Not Interested',
    description: 'Closes this lead. Pick a reason below.',
    effect: 'closed',
  },
  wrong_number: {
    label: 'Wrong Number',
    description: 'Closes this lead as an invalid contact.',
    effect: 'closed',
  },
};

export const CONTACT_OUTCOME_OPTIONS: { value: ContactOutcome; label: string }[] =
  (Object.keys(CONTACT_OUTCOME_CONFIG) as ContactOutcome[]).map(value => ({
    value,
    label: CONTACT_OUTCOME_CONFIG[value].label,
  }));

// Human label for why a closed enquiry didn't convert, or null when it
// either isn't closed or predates add_closed_reason.sql (closed with no
// reason on record). Used to enrich the "Not Interested" badge's tooltip
// without cluttering the badge itself.
export function closedReasonLabel(e: Enquiry): string | null {
  if (!isNotInterested(e) || !e.closed_reason) return null;
  return CLOSED_REASON_CONFIG[e.closed_reason]?.label ?? null;
}

// Counts closed-without-booking enquiries by reason, for the reporting
// strip in AdminEnquiries.tsx (mirrors the "35 closed before booking: 15 no
// response, 10 price..." breakdown). Rows closed before add_closed_reason.sql
// shipped (or bulk-closed without picking a reason) have no closed_reason —
// counted separately as "Unspecified" rather than silently dropped, so the
// breakdown total always matches the Closed tab's count. Zero-count reasons
// are omitted; the list is sorted highest-count first.
export function closedReasonBreakdown(
  enquiries: Enquiry[]
): { label: string; count: number }[] {
  const closed = enquiries.filter(isNotInterested);
  const counts = new Map<string, number>();
  for (const e of closed) {
    const label = e.closed_reason ? CLOSED_REASON_CONFIG[e.closed_reason]?.label : undefined;
    const key = label ?? 'Unspecified';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// The one, single manual action that moves a booking's journey forward a
// step — every other transition (Advance Pending -> Advance Paid ->
// Confirmed -> Balance Pending -> Fully Paid) happens automatically as a
// side effect of recording a payment, so there's nothing for a generic
// "next stage" button to do there; it's hidden for those stages instead of
// shown disabled, since the Payment modal is the actual next action.
//
// 'contacted' re-opens the same Record Contact Outcome popup used for the
// New -> Contacted transition — a lead that came back "Needs Time"/"Call
// Later"/"No Response" still needs a way to log what the *next* call
// actually resulted in (Interested, Not Interested, another retry, etc).
// Deliberately stops offering this once total_amount is set (journey_stage
// past 'contacted' — advance_pending/advance_paid/…): at that point Lead
// Management has handed off to Booking Journey (per the CRM spec, Lead
// Management "exists before a booking starts"), and Cancel Booking /
// Payment actions are the right tools instead.
export function nextManualAction(e: Enquiry): { label: string; icon: typeof Clock } | null {
  if (e.cancelled_at) return null;
  switch (e.journey_stage) {
    case 'new_enquiry':
      return { label: 'Mark Contacted', icon: RefreshCw };
    case 'contacted':
      return { label: 'Record Contact Outcome', icon: RefreshCw };
    case 'fully_paid':
      return { label: 'Check In', icon: LogIn };
    case 'checked_in':
      return { label: 'Mark Completed', icon: PartyPopper };
    default:
      return null;
  }
}

// booking_status's forward-moving lifecycle, in order. Deliberately excludes
// 'cancelled' — that's a terminal off-ramp rendered separately (see
// BookingLifecycleStepper below), not a step you progress through.
// 'balance_pending' isn't in here either: it's not forward progress, it's a
// same-step warning ("Confirmed, but the balance is now overdue") that can
// apply while still sitting at the Confirmed step, so it's rendered as an
// annotation on that node instead of its own node.
const BOOKING_LIFECYCLE_STEPS: { key: 'booking_confirmed' | 'fully_paid' | 'completed'; label: string }[] = [
  { key: 'booking_confirmed', label: 'Confirmed' },
  { key: 'fully_paid', label: 'Fully Paid' },
  { key: 'completed', label: 'Completed' },
];

// Renders enquiries.booking_status as a horizontal progress stepper.
// booking_status is undefined until the first payment lands (no booking
// exists yet), so this only shows once there's actually something to track.
//
// Cancellation is Booking State (see Enquiry.booking_state /
// add_booking_state.sql), not a journey stage, so a cancelled booking still
// renders its real progress through the steps below — the red banner is an
// overlay on top of that, not a replacement for it. This matches the CRM
// spec's "Fully Paid + Cancelled -> Journey remains Fully Paid, State
// becomes Cancelled" example. Legacy rows whose booking_status was already
// overwritten to the old 'cancelled' value (written before this migration)
// fall back to the plain banner below, since their real progress can't be
// recovered.
export function BookingLifecycleStepper({ enquiry }: { enquiry: Enquiry }) {
  if (!enquiry.booking_status) return null;

  const isCancelled = enquiry.booking_state === 'cancelled';

  if (enquiry.booking_status === 'cancelled') {
    return (
      <div className="flex items-center gap-1.5 bg-red-50 text-red-700 rounded-md px-3 py-2 text-xs font-button font-semibold">
        <XCircle size={14} className="shrink-0" /> Booking Cancelled
      </div>
    );
  }

  // 'balance_pending' sits at the same lifecycle position as
  // 'booking_confirmed' (both are pre-fully_paid), just with an overdue
  // balance — so the active step index treats them the same.
  const effectiveStatus = enquiry.booking_status === 'balance_pending' ? 'booking_confirmed' : enquiry.booking_status;
  const activeIndex = BOOKING_LIFECYCLE_STEPS.findIndex(s => s.key === effectiveStatus);

  return (
    <div className="bg-white border border-background-warm rounded-md px-3 py-3">
      {isCancelled && (
        <div className="flex items-center gap-1.5 mb-2.5 bg-red-50 text-red-700 rounded-md px-2.5 py-1.5 text-[11px] font-button font-semibold">
          <XCircle size={12} className="shrink-0" /> Cancelled — progress below is where it stood before cancellation
        </div>
      )}
      <div className="flex items-center">
        {BOOKING_LIFECYCLE_STEPS.map((step, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          const StepIcon = isDone || isActive ? CheckCircle2 : Circle;
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <StepIcon
                  size={18}
                  className={isDone ? 'text-green-600' : isActive ? 'text-primary' : 'text-background-warm'}
                  fill={isDone ? 'currentColor' : 'none'}
                />
                <span className={`text-[10px] font-button font-semibold whitespace-nowrap ${isActive ? 'text-primary' : isDone ? 'text-green-700' : 'text-dark-muted'}`}>
                  {step.label}
                </span>
              </div>
              {i < BOOKING_LIFECYCLE_STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1.5 rounded-full ${i < activeIndex ? 'bg-green-500' : 'bg-background-warm'}`} />
              )}
            </div>
          );
        })}
      </div>
      {enquiry.booking_status === 'balance_pending' && !isCancelled && (
        <div className="flex items-center gap-1.5 mt-2.5 bg-amber-50 text-amber-700 rounded-md px-2.5 py-1.5 text-[11px] font-button font-semibold">
          <AlertTriangle size={12} className="shrink-0" />
          Balance overdue{enquiry.balance_due_date ? ` — due ${formatDate(enquiry.balance_due_date, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        </div>
      )}
    </div>
  );
}

// The forward-moving path through JOURNEY_STAGE_CONFIG, in order — mirrors
// BOOKING_LIFECYCLE_STEPS above but includes the two pre-payment stages
// (new_enquiry, contacted) since this legend is meant to explain the whole
// enquiry-to-completed journey at a glance, not just the money part of it.
// balance_pending is left out here too, same reasoning as
// BOOKING_LIFECYCLE_STEPS: it's a same-step warning on Confirmed, not a
// distinct stage of forward progress.
const LIFECYCLE_FLOW_STAGES: Enquiry['journey_stage'][] = [
  'new_enquiry', 'contacted', 'advance_paid', 'confirmed', 'fully_paid', 'checked_in', 'completed',
];

// Compact "how a booking gets from enquiry to completed" reference strip —
// meant to sit near the Add Enquiry button so it's the first thing an
// admin orients against before logging or working an enquiry. Purely
// informational (no clicks, no state); scrolls horizontally on narrow
// screens instead of wrapping.
export function JourneyLifecycleLegend() {
  return (
    <div className="bg-white border border-background-warm rounded-lg px-3 py-2.5 overflow-x-auto scrollbar-hide">
      <div className="flex items-center gap-1.5 w-max">
        <span className="text-[11px] font-button font-semibold text-dark-muted uppercase tracking-wide shrink-0 mr-1">
          Booking Journey
        </span>
        {LIFECYCLE_FLOW_STAGES.map((key, i) => {
          const cfg = JOURNEY_STAGE_CONFIG[key];
          return (
            <div key={key} className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                <cfg.icon size={11} className="shrink-0" /> {cfg.label}
              </span>
              {i < LIFECYCLE_FLOW_STAGES.length - 1 && (
                <span className="text-dark-muted/50 text-xs" aria-hidden="true">→</span>
              )}
            </div>
          );
        })}
        <span className="text-dark-muted/60 text-[11px] mx-1 shrink-0 whitespace-nowrap">or, at any point —</span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${JOURNEY_STAGE_CONFIG.not_interested.color}`}>
          <UserMinus size={11} className="shrink-0" /> Not Interested
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${JOURNEY_STAGE_CONFIG.cancelled.color}`}>
          <XCircle size={11} className="shrink-0" /> Cancelled
        </span>
      </div>
    </div>
  );
}
