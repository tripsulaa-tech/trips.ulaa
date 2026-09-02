// Shared, purely presentational/data helpers used by both AdminEnquiries
// (the list/table view) and AdminEnquiryDetail (the single-enquiry CRM
// page) — kept in their own module (rather than exported from
// AdminEnquiries.tsx directly) so:
//   1. Fast Refresh keeps working on both admin pages (a component file
//      that also exports plain constants/functions breaks it).
//   2. AdminEnquiryDetail doesn't need to pull in the entire Enquiries
//      table component just to reuse a badge/label helper.
// Everything here is intentionally stateless — no hooks, no local state —
// so it's safe to call from anywhere. The two actual components that once
// lived alongside these helpers (BookingLifecycleStepper,
// JourneyLifecycleLegend) now live in ./AdminEnquiryLifecycle for the same
// Fast Refresh reason — a file can only be one or the other, not both.
import {
  Clock,
  ArrowsClockwise as RefreshCw,
  Hourglass,
  CurrencyInr as IndianRupee,
  CheckCircle as CheckCircle2,
  Warning as AlertTriangle,
  SealCheck as BadgeCheck,
  SignIn as LogIn,
  Confetti as PartyPopper,
  XCircle,
  Globe,
  ChatCircle as MessageCircle,
  Phone,
  Camera,
  MapPin,
  Question as HelpCircle,
  UserMinus,
  UserMinus as UserX,
  CalendarDot as CalendarClock,
} from '@phosphor-icons/react';
import type { BookingFollowUpType, CancellationReason, ClosedReason, ContactOutcome, Enquiry, Kid, KidStatus, Payment, UpcomingTrip } from '../../types/types-index';
import { formatDate, getActivePrice } from '../../utils/utils-index';
import { FOOD_PREFERENCE_OPTIONS, foodPreferenceBadge } from '../../constants/foodPreference';

export { FOOD_PREFERENCE_OPTIONS };

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

// Placeholder for a payment/refund reference-number field: disabled with
// "N/A for cash" when the method is Cash, otherwise an example reference
// format. Shared so the Cash-check stays in one place across every
// payment/refund UTR field (Add Enquiry, Payment, Refund, Generate
// Invoice, Mark Paid modals).
export function refPlaceholder(method: string | undefined, example: string): string {
  return method === 'Cash' ? 'N/A for cash' : example;
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
type GenerateInvoiceType = 'full_payment' | 'advance' | 'balance' | 'installment' | 'extra_charge';

const GENERATE_INVOICE_TYPE_OPTIONS: { value: GenerateInvoiceType; label: string }[] = [
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
  // Kept as the actual amount owed (list price - discount_amount, or the
  // free-typed value on a no-trip enquiry) — every existing consumer below
  // (clearsBalance, availablePaymentTypeOptions, validatePaymentForm) reads
  // this unchanged. The modal computes it from discount_amount whenever the
  // enquiry has a trip; see computeDiscountedTotal.
  total_amount: number | '';
  // Flat ₹ off the trip's list price — what the admin now edits instead of
  // total_amount directly, when a trip (and so a list price) is linked.
  discount_amount: number | '';
  discount_reason: string;
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
  // Kids fee's own total — same "list price, admin-adjustable" shape as
  // total_amount above, but for the kids fee instead of the adult booking.
  // Prefilled from enquiry.kids_amount (itself auto-computed once from the
  // trip's child_price × kids_count — see add_trip_kids_option.sql), and
  // editable here so an admin can correct it (e.g. child_price was added
  // to the trip after this booking existed) via recordKidsPayment's own
  // kids_amount override. Only shown/used when the enquiry has
  // kids_count > 0.
  kids_amount: number | '';
  // Kids fee — independent of everything above (see
  // add_kids_payment_tracking.sql): this transaction's own kids-fee amount,
  // same "not a running total" convention as amount_paid. Only shown/used
  // when the enquiry has kids_count > 0. recordKidsPayment does the
  // delta/running-total math the same way recordPayment does for the adult
  // amount.
  kids_amount_paid: number | '';
};

// Same types Generate Invoice offers, including Extra Charge and the
// paid/pending Status (refund is still excluded — it has its own dedicated,
// cancellation-aware flow here in Track Payment's cancelled-booking
// section). Literally the same array as GENERATE_INVOICE_TYPE_OPTIONS now —
// aliased under this name so Track Payment's imports/intent stay readable —
// so wording can never drift between the two dropdowns.
const PAYMENT_TYPE_OPTIONS: { value: PaymentForm['payment_type']; label: string }[] = GENERATE_INVOICE_TYPE_OPTIONS;

// 'Balance' is meant for the payment that clears whatever's left owing —
// unlike 'Installment', which is any partial payment with more expected
// after it. Nothing else in the data model enforces that distinction, so
// without this check an admin could pick 'Balance' on a payment that
// doesn't actually zero out the amount due, leaving the ledger's own
// labels misleading. Only 'Balance' is gated this way; every other type
// (including 'Installment') stays freely selectable.
// 'Balance' is meant for the payment that clears whatever's left owing —
// unlike 'Installment', which is any partial payment with more expected
// after it. Nothing else in the data model enforces that distinction, so
// without this check an admin could pick 'Balance' on a payment that
// doesn't actually zero out the amount due, leaving the ledger's own
// labels misleading. Only 'Balance' is gated this way; every other type
// (including 'Installment') stays freely selectable. Shared by both Track
// Payment (PaymentForm) and Generate Invoice (GenerateInvoiceForm) below.
// List price minus a flat discount, floored at 0 so a discount bigger than
// the list price never produces a negative total. `listPrice` is undefined
// when the trip (or its price for this package) isn't set yet — callers
// fall back to whatever total_amount already holds in that case.
export function computeDiscountedTotal(listPrice: number | undefined, discountAmount: number | ''): number | undefined {
  if (listPrice == null) return undefined;
  const discount = discountAmount === '' ? 0 : Number(discountAmount);
  return Math.max(0, listPrice - discount);
}

function amountClearsBalance(totalAmount: number | '', alreadyPaid: number, thisAmount: number | ''): boolean {
  if (totalAmount === '') return false;
  const amt = thisAmount === '' ? 0 : Number(thisAmount);
  if (amt <= 0) return false;
  return Number(totalAmount) - alreadyPaid - amt <= 0;
}

export function clearsBalance(paymentForm: PaymentForm, alreadyPaid: number): boolean {
  if (paymentForm.payment_type === 'extra_charge') return false;
  return amountClearsBalance(paymentForm.total_amount, alreadyPaid, paymentForm.amount_paid);
}

// Same list as PAYMENT_TYPE_OPTIONS, minus 'Balance' when this payment
// wouldn't actually clear the amount due — see clearsBalance above. Callers
// pair this with an effect that steers payment_type off 'balance' the
// moment it stops qualifying (e.g. the admin lowers the amount after
// picking it), so the Select's current value always stays in this list.
export function availablePaymentTypeOptions(paymentForm: PaymentForm, alreadyPaid: number): { value: PaymentForm['payment_type']; label: string }[] {
  return clearsBalance(paymentForm, alreadyPaid) ? PAYMENT_TYPE_OPTIONS : PAYMENT_TYPE_OPTIONS.filter(o => o.value !== 'balance');
}

// Field-level errors for the Track Payment form (AdminPaymentModal), keyed
// by the field each message should render under. Shared by the modal
// (live, as the admin types/selects) and both handleSavePayment call sites
// (AdminEnquiries.tsx list view + AdminEnquiryDetail.tsx detail view) as
// the final save-time gate — one source of truth so the two screens can
// never drift on what counts as a valid payment.
type PaymentFormErrors = Partial<Record<
  'amount_paid' | 'payment_method' | 'payment_utr' | 'refund_amount' | 'refund_utr' | 'refund_method' | 'kids_amount_paid',
  string
>>;

export function validatePaymentForm(
  paymentForm: PaymentForm,
  alreadyPaid: number,
  // Kids fee's own bounds — see add_kids_payment_tracking.sql. Optional so
  // existing callers keep working unchanged when kids_count is 0 (no kids
  // section shown, so nothing to validate).
  kids?: { total: number; alreadyPaid: number }
): PaymentFormErrors {
  const errors: PaymentFormErrors = {};
  const totalAmount = paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
  const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
  const isExtraCharge = paymentForm.payment_type === 'extra_charge';
  const isPending = paymentForm.status === 'pending';
  const newRunningTotal = alreadyPaid + thisPayment;

  if (!isExtraCharge && !isPending && totalAmount != null && thisPayment > 0 && newRunningTotal > totalAmount) {
    errors.amount_paid = 'This would take the amount paid past the total amount.';
  } else if ((isExtraCharge || isPending) && thisPayment <= 0) {
    errors.amount_paid = isExtraCharge
      ? 'Enter an extra charge amount greater than zero.'
      : 'Enter an amount greater than zero for the pending invoice.';
  }

  // Money is actually changing hands right now (not a pending invoice)
  // whenever thisPayment > 0 — whether that's a normal payment or an extra
  // charge collected immediately — so we need to know how.
  if (!isPending && thisPayment > 0 && !paymentForm.payment_method) {
    errors.payment_method = 'Select a payment method.';
  }
  if (!isPending && thisPayment > 0 && paymentForm.payment_method && paymentForm.payment_method !== 'Cash' && !paymentForm.payment_utr.trim()) {
    errors.payment_utr = 'Enter a UTR / reference number.';
  }

  const refundAmount = paymentForm.refund_amount === '' ? 0 : Number(paymentForm.refund_amount);
  if (refundAmount > 0 && !paymentForm.refund_method) {
    errors.refund_method = 'Select a refund method.';
  }
  if (refundAmount > 0 && paymentForm.refund_method && paymentForm.refund_method !== 'Cash' && !paymentForm.refund_utr.trim()) {
    errors.refund_utr = 'Enter a refund UTR / reference number.';
  }
  // Extra Charge collected now folds straight into amount_paid; Pending
  // never does, whatever the type — so the refund bound uses what
  // amount_paid will actually become, not the naive "already paid + this
  // payment" that only holds for a normal paid-now payment.
  const effectiveAmountPaid = isPending ? alreadyPaid : isExtraCharge ? alreadyPaid + thisPayment : newRunningTotal;
  if (refundAmount > effectiveAmountPaid) {
    errors.refund_amount = "Refund amount can't be more than what was actually paid.";
  }

  if (kids) {
    const thisKidsPayment = paymentForm.kids_amount_paid === '' ? 0 : Number(paymentForm.kids_amount_paid);
    if (thisKidsPayment < 0) {
      errors.kids_amount_paid = 'Kids amount cannot be negative.';
    } else if (kids.total > 0 && kids.alreadyPaid + thisKidsPayment > kids.total) {
      errors.kids_amount_paid = 'This would take the kids fee paid past its total.';
    } else if (thisKidsPayment > 0 && !paymentForm.payment_method) {
      // The adult-payment checks above only require a method when
      // thisPayment > 0 — a kids-only payment (adult amount left blank)
      // still needs one, since both legs share the same method/UTR fields.
      errors.payment_method = errors.payment_method || 'Select a payment method.';
    } else if (thisKidsPayment > 0 && paymentForm.payment_method && paymentForm.payment_method !== 'Cash' && !paymentForm.payment_utr.trim()) {
      errors.payment_utr = errors.payment_utr || 'Enter a UTR / reference number.';
    }
  }

  return errors;
}

// Generate Invoice's own amount/type fields don't carry the booking's
// total or already-paid figures — those live on the Enquiry the invoice
// is being raised against — so callers pass them in separately.
export function clearsBalanceForInvoice(form: GenerateInvoiceForm, totalAmount: number, alreadyPaid: number): boolean {
  if (form.type === 'extra_charge') return false;
  return amountClearsBalance(totalAmount, alreadyPaid, form.amount);
}

// Same list as GENERATE_INVOICE_TYPE_OPTIONS, minus 'Balance' unless this
// invoice's amount actually clears what's owed. Pair with an effect that
// steers type off 'balance' once it stops qualifying, same as Track
// Payment above.
export function availableInvoiceTypeOptions(form: GenerateInvoiceForm, totalAmount: number, alreadyPaid: number): { value: GenerateInvoiceType; label: string }[] {
  return clearsBalanceForInvoice(form, totalAmount, alreadyPaid) ? GENERATE_INVOICE_TYPE_OPTIONS : GENERATE_INVOICE_TYPE_OPTIONS.filter(o => o.value !== 'balance');
}

// Field-level errors for the Generate Invoice form (AdminGenerateInvoiceModal)
// — same shape/spirit as PaymentFormErrors above, and the same three checks
// useGenerateInvoice's save() used to only enforce after the fact via
// alert(): amount required, payment method required, UTR required. Shared
// by the modal (live, as the admin types/selects) and useGenerateInvoice's
// save() as the final save-time gate, so the two can never drift.
//
// Unlike PaymentForm's amount_paid (where 0/'' is a legitimate "not
// changing the payment right now" state), Generate Invoice always raises a
// real invoice line, so its amount is required rather than merely bounded.
// That means the "required" error would fire the instant the modal opens
// (amount starts at ''), before the admin has even looked at the field —
// so callers pass amountTouched (true once the Amount field has been
// blurred, or the save button has actually been clicked) to gate it.
type GenerateInvoiceFormErrors = Partial<Record<'amount' | 'payment_method' | 'utr_number', string>>;

export function validateGenerateInvoiceForm(form: GenerateInvoiceForm, amountTouched: boolean): GenerateInvoiceFormErrors {
  const errors: GenerateInvoiceFormErrors = {};
  const amount = form.amount === '' ? 0 : Number(form.amount);

  if (amountTouched && amount <= 0) {
    errors.amount = 'Enter an invoice amount greater than zero.';
  }

  // Payment method/UTR only matter once there's an actual amount to collect
  // and the invoice is being marked paid now — a pending invoice or a
  // still-empty amount field has nothing to nag about yet.
  if (amount > 0 && form.status === 'paid') {
    if (!form.payment_method) {
      errors.payment_method = 'Select a payment method.';
    } else if (form.payment_method !== 'Cash' && !form.utr_number.trim()) {
      errors.utr_number = 'Enter a UTR / reference number.';
    }
  }

  return errors;
}

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
  return foodPreferenceBadge(e.food_preference);
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

// Full source list including "Website" — unlike AdminEnquiriesShared's
// SOURCE_OPTIONS (which deliberately omits Website since that form is only
// for enquiries an admin is logging by hand), this is for editing an
// *existing* enquiry, which may already be a website submission.
export const SOURCE_OPTIONS_ALL = (Object.keys(SOURCE_CONFIG) as (keyof typeof SOURCE_CONFIG)[]).map(value => ({
  value,
  label: SOURCE_CONFIG[value].label,
}));

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

// A kid's own trackable state (see Kid/KidStatus in types-index.ts and
// add_kids_table.sql / add_kids_not_interested_status.sql) — deliberately
// its own small config, separate from JOURNEY_STAGE_CONFIG above, since a
// kid's status is independent of its parent enquiry's journey_stage and
// has a much smaller set of states (no payment-stage granularity — kids
// never occupy a seat). Shared by the Enquiries list (table + mobile
// cards, where each kid now gets its own row/action) and
// AdminEnquiryKidsCard on the detail page, so the badge/label/action
// eligibility can't drift between the two views.
//
// Label and color for every state a kid shares with the adult journey
// (pending~new_enquiry, confirmed, checked_in, completed, cancelled,
// not_interested) are kept identical to JOURNEY_STAGE_CONFIG's matching
// entry above — same word, same color — so an admin's "Confirmed is teal"
// mental model from the adult row above carries straight down to the kid
// rows under it instead of needing a second palette. 'pending' specifically
// is labelled "New Enquiry": it's the kid's exact equivalent of the adult's
// first, untouched state, so it gets the adult's own label rather than a
// differently-worded one for the same thing.
export const KID_STATUS_CONFIG: Record<KidStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'New Enquiry', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  confirmed: { label: 'Confirmed', color: 'bg-teal-100 text-teal-700', icon: CheckCircle2 },
  checked_in: { label: 'Checked In', color: 'bg-indigo-100 text-indigo-700', icon: LogIn },
  // Post-trip terminal state, the kid-scoped equivalent of
  // enquiries.booking_status reaching 'completed' — see
  // add_kids_completed_no_show.sql.
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: PartyPopper },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle },
  not_interested: { label: 'Not Interested', color: 'bg-slate-200 text-dark-muted', icon: UserMinus },
};

// A kid's independent "No Show" attendance flag (kids.is_no_show) — same
// idea as attendanceBadge()'s 'No Show' branch for the adult booking
// (AdminEnquiriesShared.tsx), just a fixed label/color since a kid has no
// other attendance states to distinguish it from (no "Checked In"/"Not
// Started" variants layered in here — kid.status already covers that).
export const KID_NO_SHOW_BADGE = { label: 'No Show', color: 'bg-orange-50 text-orange-700', icon: UserX };

export function kidStatusBadge(kid: Kid) {
  return KID_STATUS_CONFIG[kid.status] || KID_STATUS_CONFIG.pending;
}

// Whether the row-level "Not Interested" quick action makes sense for this
// kid right now — hidden once the kid's already in some closed-out or
// later state (cancelled/not_interested/checked_in), and, same as
// canMarkNotInterested's gating on the adult side just above, only while
// no money has actually come in for this kid: once amount_paid > 0 a
// dropped kid needs Mark Cancelled instead (which carries the refund
// conversation Not Interested doesn't), not a one-click close-out that
// quietly leaves paid money unaccounted for.
export function canMarkKidNotInterested(kid: Kid): boolean {
  return (kid.status === 'pending' || kid.status === 'contacted' || kid.status === 'confirmed') && (kid.amount_paid || 0) <= 0;
}

// Counterpart to canMarkKidNotInterested — whether the row-level "Reopen"
// quick action makes sense for this kid right now. Mirrors the adult
// side's Reopen Enquiry (isNotInterested(e) in useRowActions.ts): only
// offered once a kid's actually been marked not_interested, not from
// 'cancelled' (a different outcome — see add_kids_not_interested_status.sql
// — that isn't meant to be "undone" the same casual way a dropped lead is).
export function canReopenKid(kid: Kid): boolean {
  return kid.status === 'not_interested';
}

// Whether "Mark No Show" should be offered for this kid right now —
// kids.is_no_show equivalent of setEnquiryNoShow's gating, but ungated the
// same way the rest of kids.status is (see add_kids_completed_no_show.sql):
// offered once a kid is Confirmed and not already flagged. A checked-in
// kid needs Undo Check In first (same "reverse the forward step first"
// rule canCancelKid follows), and cancelled/not_interested/completed kids
// are already closed out.
export function canMarkKidNoShow(kid: Kid): boolean {
  return kid.status === 'confirmed' && !kid.is_no_show;
}

// Single "obvious next step" for a kid's kebab menu — mirrors
// nextManualAction's role for the adult row just below (one contextual
// action instead of every possible status jump listed at once), so the
// kid menu stays as short as the adult one instead of offering all 5
// "Mark X" entries every time. The forward progression
// pending -> confirmed -> checked_in -> completed gets a suggested next
// step; cancelled/not_interested are terminal here (undone via
// canReopenKid/Reopen instead) and completed has nowhere further to go.
export function nextKidManualAction(kid: Kid): { label: string; status: KidStatus; icon: typeof Clock } | null {
  switch (kid.status) {
    case 'pending':
      return { label: 'Mark Contacted', status: 'contacted', icon: RefreshCw };
    case 'contacted':
      return { label: 'Mark Confirmed', status: 'confirmed', icon: CheckCircle2 };
    case 'confirmed':
      return { label: 'Mark Checked In', status: 'checked_in', icon: LogIn };
    case 'checked_in':
      return { label: 'Mark Completed', status: 'completed', icon: PartyPopper };
    default:
      return null;
  }
}

// A kid's own follow-up reminder chip — mirrors followUpStatus() for the
// adult side (same escalating overdue/today/upcoming coloring via
// computeDueStatus), just reading kid.follow_up_at instead of the
// enquiry's. Kept separate from the parent enquiry's own follow-up so a
// kid row's Follow-up column reflects that kid's own reminder rather than
// silently reusing the booking's.
export function kidFollowUpStatus(kid: Kid): { label: string; color: string; icon: typeof Clock; isDue: boolean; isOverdue: boolean } | null {
  if (!kid.follow_up_at) return null;
  const status = computeDueStatus(kid.follow_up_at, {
    overdue: (dateLabel) => `Overdue · ${dateLabel}`,
    today: 'Follow up today',
    upcoming: (dateLabel) => `Follow up ${dateLabel}`,
  });
  return { ...status, icon: CalendarClock };
}

// Whether a follow-up reminder can be set on this kid right now — mirrors
// canSetFollowUp()'s "only while the lead is still open" window on the
// adult side, translated to the kid's smaller status set: pending/
// confirmed are the only states a reminder still makes sense in (once
// checked in/cancelled/not_interested there's nothing left to follow up
// on).
export function canSetKidFollowUp(kid: Kid): boolean {
  return kid.status === 'pending' || kid.status === 'contacted' || kid.status === 'confirmed';
}

// The invoice PDF pipeline (src/utils/invoicePdf.ts and pdf/invoice/*)
// only ever knows how to draw an Enquiry — it was built long before kids
// had their own payment ledger (see add_kid_individual_payments.sql). This
// adapts one kid + its parent enquiry into an Enquiry-shaped object that
// invoice renders correctly, so a kid's Download/Share Invoice action can
// reuse downloadInvoicePdf()/invoiceAsFile() unchanged. Reuses the parent
// booking's contact/trip fields (a kid has no phone/email/departure date
// of its own) but substitutes the kid's own name, price, and a
// booking-ID suffix so the file/download doesn't collide with the adult's
// own invoice — see kidRowLabel for where `kidLabel` (the "Kid N"
// fallback) comes from.
export function kidAsInvoiceEnquiry(kid: Kid, enquiry: Enquiry, kidLabel: string): Enquiry {
  return {
    ...enquiry,
    id: kid.id,
    full_name: kid.name || kidLabel,
    total_amount: kid.amount,
    amount_paid: kid.amount_paid,
    // Discounts are tracked per adult booking only — kids have no
    // discount field of their own (see the Kid interface), so this never
    // carries one over from the parent enquiry.
    discount_amount: 0,
    discount_reason: null,
    booking_id: enquiry.booking_id ? `${enquiry.booking_id}-${kidLabel.replace(/\s+/g, '').toUpperCase()}` : null,
    // A kid's fee is never part of a multi-seat group the way the adult
    // booking can be — always render as a single, standalone line.
    group_id: null,
    group_size: null,
    group_seq: 1,
  };
}

// Whether "Mark Cancelled" should be offered for this kid right now —
// mirrors canCancelBooking()'s "not once checked in" rule on the adult
// side: a checked-in kid needs Undo Check In first, same as a checked-in
// booking needs its own Undo Check In before Cancel Booking reappears. A
// completed kid can't be cancelled either, same "trip already happened"
// reasoning canCancelBooking applies via journey_stage === 'completed'.
// Also excludes 'pending' and 'contacted' (the kid's own New Enquiry/
// Contacted stages), mirroring canCancelBooking's refusal to cancel
// journey_stage 'new_enquiry'/'contacted' — a lead nobody's agreed to book
// yet gets closed out via Not Interested, not Cancel.
export function canCancelKid(kid: Kid): boolean {
  return kid.status !== 'pending' && kid.status !== 'contacted' && kid.status !== 'cancelled' && kid.status !== 'not_interested' && kid.status !== 'checked_in' && kid.status !== 'completed';
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

// Shared escalating-urgency computation behind both followUpStatus() and
// bookingFollowUpStatus() below: parses a `YYYY-MM-DD` date-only string
// (no time component) as a local date, compares it to today at midnight,
// and returns the overdue/due-today/upcoming color + isDue/isOverdue flags
// both chips render with. Callers layer their own label text (a bare date
// vs. a Booking Follow-up type + date) on top via `labels`. Pulled out so
// the two call sites can't drift on the color thresholds or day-diff math.
function computeDueStatus(
  dateStr: string,
  labels: { overdue: (dateLabel: string) => string; today: string; upcoming: (dateLabel: string) => string }
): { label: string; color: string; isDue: boolean; isOverdue: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const dateLabel = formatDate(dateStr, { day: 'numeric', month: 'short', year: undefined });
  if (diffDays < 0) return { label: labels.overdue(dateLabel), color: 'bg-red-100 text-red-700', isDue: true, isOverdue: true };
  if (diffDays === 0) return { label: labels.today, color: 'bg-amber-100 text-amber-700', isDue: true, isOverdue: false };
  return { label: labels.upcoming(dateLabel), color: 'bg-blue-50 text-blue-700', isDue: false, isOverdue: false };
}

// Follow-up reminder chip shown next to a Contacted lead — auto-escalates
// color/label as the date approaches so a due reminder actually reads as
// urgent instead of blending into the row like a plain date would. Compares
// on calendar day only (follow_up_at has no time component), so "today" is
// today regardless of what time the admin looks. Returns null when there's
// no reminder set, so callers can skip rendering the chip entirely.
export function followUpStatus(e: Enquiry): { label: string; color: string; icon: typeof CalendarClock; isDue: boolean; isOverdue: boolean } | null {
  if (!e.follow_up_at) return null;
  const status = computeDueStatus(e.follow_up_at, {
    overdue: (dateLabel) => `Overdue · ${dateLabel}`,
    today: 'Follow up today',
    upcoming: (dateLabel) => `Follow up ${dateLabel}`,
  });
  return { ...status, icon: CalendarClock };
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
export function bookingFollowUpStatus(e: Enquiry): { label: string; color: string; icon: typeof CalendarClock; isDue: boolean; isOverdue: boolean } | null {
  if (!e.booking_follow_up_at) return null;
  const typeLabel = e.booking_follow_up_type ? BOOKING_FOLLOW_UP_TYPE_CONFIG[e.booking_follow_up_type].label : 'Booking Follow-up';
  const status = computeDueStatus(e.booking_follow_up_at, {
    overdue: (dateLabel) => `${typeLabel} · Overdue · ${dateLabel}`,
    today: `${typeLabel} · Today`,
    upcoming: (dateLabel) => `${typeLabel} · ${dateLabel}`,
  });
  return { ...status, icon: CalendarClock };
}

// Every reason an admin can pick when closing an enquiry out — see
// supabase/migration/add_closed_reason.sql. No plain "Not Interested" entry
// here: the closing action itself already carries that label everywhere
// else in the UI (journey_stage, badge, button), so a same-named reason
// would just restate it without adding information — "Other" is the
// catch-all instead. Order here is the order shown in the picker (most
// common first) and the order used for the reporting breakdown in
// AdminEnquiries.tsx.
const CLOSED_REASON_CONFIG: Record<ClosedReason, { label: string }> = {
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

const CLOSED_REASON_OPTIONS: { value: ClosedReason; label: string }[] =
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
const CANCELLATION_REASON_CONFIG: Record<CancellationReason, { label: string }> = {
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
// (Copied rather than re-exported by reference so this is its own export
// binding, not a duplicate alias of PAYMENT_METHOD_OPTIONS.)
export const REFUND_METHOD_OPTIONS: { value: string; label: string }[] = [...PAYMENT_METHOD_OPTIONS];

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
    description: "They want to book — this opens Payment to move them to Advance Pending.",
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

// Human label for why a kid was marked not interested, or null when the
// kid isn't in that state or predates add_kid_not_interested_reason.sql
// (marked not interested via a path with no reason picker — the plain
// Status dropdown, a bulk action). Same idea as closedReasonLabel above,
// used to enrich the kid status badge's tooltip.
export function kidNotInterestedReasonLabel(kid: Kid): string | null {
  if (kid.status !== 'not_interested' || !kid.not_interested_reason) return null;
  return CLOSED_REASON_CONFIG[kid.not_interested_reason]?.label ?? null;
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
      return { label: 'Log Call Outcome', icon: RefreshCw };
    case 'fully_paid':
      return { label: 'Check In', icon: LogIn };
    case 'checked_in':
      return { label: 'Mark Completed', icon: PartyPopper };
    default:
      return null;
  }
}

// BookingLifecycleStepper and JourneyLifecycleLegend (the two actual React
// components that used to live here) now live in ./AdminEnquiryLifecycle —
// this file stays helpers/constants-only so Fast Refresh works on both
// modules (see the file header comment above).
