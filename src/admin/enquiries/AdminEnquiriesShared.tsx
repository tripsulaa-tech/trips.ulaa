// Types, constants, and small pure helper functions shared between
// AdminEnquiries.tsx and its modal components (./modals/*). Split out of
// AdminEnquiries.tsx so that file only has to hold state/handlers/render —
// nothing in here depends on component state, so it's all safe to import
// from anywhere without prop drilling.
import { CheckCircle2, Clock, RefreshCw, CheckCircle, XCircle, Circle } from 'lucide-react';
import type { Enquiry } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { PACKAGE_OPTIONS } from './AdminEnquiryCommon';

// Digits-only phone "signature" used for fuzzy duplicate matching (3.5).
// The DB's own duplicate guard only catches an *exact* string match on
// (trip, name, phone, email), so "+91 98765-43210", "098765 43210", and
// "9876543210" all count as different people to it even though they're
// the same number typed three different ways. Comparing just the last 10
// digits absorbs country-code/leading-zero/formatting differences without
// needing a full phone-parsing library. Returns null for anything too
// short to mean anything (avoids flagging two blank/junk phones as a match).
export function phoneSignature(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  return digits.slice(-10);
}

// Same idea for email — trims/lowercases so casing or stray whitespace
// doesn't hide a match, and ignores the app's own "not provided" sentinel
// (see createManualEnquiry/submitWaitlist) so two people who never gave an
// email don't get flagged as duplicates of each other.
export function emailSignature(email: string | null | undefined): string | null {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'not-provided@ulaa.local') return null;
  return trimmed;
}

// Cycled across group bookings (see groupColorMap in AdminEnquiries.tsx) so
// that every group visible on screen at once gets a visually distinct row
// tint, left accent, and badge color — the main way an admin tells "these
// rows are one group" apart from "these rows just happen to be next to each
// other".
export const GROUP_COLOR_PALETTE = [
  { row: 'bg-blue-50/60 hover:bg-blue-50', accent: 'border-blue-400', badge: 'bg-blue-100 text-blue-700' },
  { row: 'bg-purple-50/60 hover:bg-purple-50', accent: 'border-purple-400', badge: 'bg-purple-100 text-purple-700' },
  { row: 'bg-teal-50/60 hover:bg-teal-50', accent: 'border-teal-400', badge: 'bg-teal-100 text-teal-700' },
  { row: 'bg-amber-50/60 hover:bg-amber-50', accent: 'border-amber-400', badge: 'bg-amber-100 text-amber-700' },
  { row: 'bg-pink-50/60 hover:bg-pink-50', accent: 'border-pink-400', badge: 'bg-pink-100 text-pink-700' },
  { row: 'bg-lime-50/60 hover:bg-lime-50', accent: 'border-lime-400', badge: 'bg-lime-100 text-lime-700' },
  { row: 'bg-cyan-50/60 hover:bg-cyan-50', accent: 'border-cyan-400', badge: 'bg-cyan-100 text-cyan-700' },
  { row: 'bg-rose-50/60 hover:bg-rose-50', accent: 'border-rose-400', badge: 'bg-rose-100 text-rose-700' },
] as const;

export const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
];

export const SOURCE_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'other', label: 'Other' },
];

// Bulk-edit fields are all opt-in — "No change" is the default for every
// field so an admin can update just, say, Status across a selection without
// accidentally blanking out everyone's Food Preference or Package. Only
// fields the admin actually touches get applied when Bulk Save runs.
export const BULK_NO_CHANGE = 'no_change' as const;

export const BULK_STATUS_OPTIONS = [
  { value: BULK_NO_CHANGE, label: 'No change' },
  ...STATUS_OPTIONS,
];

export type BulkEditForm = {
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

export const emptyBulkForm: BulkEditForm = {
  food_preference: BULK_NO_CHANGE,
  package_type: BULK_NO_CHANGE,
  total_amount: '',
  amount_paid: '',
  status: BULK_NO_CHANGE,
};

export const BULK_PACKAGE_OPTIONS = [
  { value: BULK_NO_CHANGE, label: 'No change' },
  ...PACKAGE_OPTIONS,
];

export const BULK_FOOD_OPTIONS = [
  { value: BULK_NO_CHANGE, label: 'No change' },
  { value: 'not_set', label: 'Not asked / unknown' },
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-veg' },
];

// The "Not set" (grey) label is the right, low-urgency default for a fresh
// lead nobody's spoken to yet — there's nothing to flag. But once an admin
// has marked the lead Contacted (see handleAdvance/recordContactOutcome) and
// still hasn't opened Track Payment to record a package/total, that same
// grey "Not set" blended into the row and got missed — nothing distinguished
// "haven't gotten to it yet" from "actively fell through the cracks after
// being contacted". journey_stage === 'contacted' is exactly that second
// case (computeJourneyStage only stays on 'contacted' when total_amount is
// still unset — see src/services/api.ts), so it gets its own red, harder-to-
// miss label instead.
export function paymentStatus(e: Enquiry): { label: string; color: string } {
  if (!e.total_amount) {
    if (e.journey_stage === 'contacted') return { label: 'Needs Pricing', color: 'bg-red-100 text-red-700' };
    return { label: 'Not set', color: 'bg-slate-100 text-dark-muted' };
  }
  if (e.amount_paid <= 0) return { label: 'Unpaid', color: 'bg-red-100 text-red-700' };
  if (e.amount_paid >= e.total_amount) return { label: 'Paid in full', color: 'bg-green-100 text-green-700' };
  return { label: 'Partial', color: 'bg-amber-100 text-amber-700' };
}

export function paymentBalance(e: Enquiry): number | null {
  if (!e.total_amount) return null;
  return Math.max(0, e.total_amount - (e.amount_paid || 0));
}

export function paymentFilterKey(e: Enquiry): 'paid' | 'partial' | 'unpaid' | 'not_set' {
  if (!e.total_amount) return 'not_set';
  if (e.amount_paid <= 0) return 'unpaid';
  if (e.amount_paid >= e.total_amount) return 'paid';
  return 'partial';
}

// A seat is only actually held when money's been paid AND the booking
// hasn't been cancelled since. amount_paid itself is left untouched by
// cancellation — it's the historical record of what they paid — so
// "booked" can't just check amount_paid > 0 anymore.
export function isBooked(e: Enquiry): boolean {
  return !e.cancelled_at && e.amount_paid > 0;
}

// Cancelled is its own booking-filter bucket now (previously folded into
// "Not booked"), so an admin can isolate cancellations without also seeing
// enquiries that were simply never paid. Checks cancelled_at (the
// authoritative timestamp) rather than booking_state so this keeps working
// unchanged even against a row read before add_booking_state.sql landed —
// see bookingState() below for the CRM "Booking State" field itself.
export function isCancelled(e: Enquiry): boolean {
  return !!e.cancelled_at;
}

// "Booking State" (CRM spec section 3) as its own labelled badge, distinct
// from the Booking Journey badge (journeyBadge() in AdminEnquiryCommon.tsx) —
// used on the enquiry detail page so Journey and State render as two
// separate pieces of information instead of one field trying to carry
// both, per the spec's core principle of not mixing responsibilities.
export function bookingStateBadge(e: Enquiry): { label: string; color: string } {
  return isCancelled(e)
    ? { label: 'Cancelled', color: 'bg-red-100 text-red-700' }
    : { label: 'Active', color: 'bg-green-100 text-green-700' };
}

// "Attendance" (CRM spec section 4) — independent of Booking Journey and
// Booking State. A fully paid booking that never shows up stays
// journey_stage 'fully_paid' / booking_state 'active' (or 'cancelled' if
// also cancelled); only this badge changes. Derived from the same
// checked_in_at / is_no_show columns already used elsewhere rather than a
// new column, since both are already tracked independently — this is just
// giving that pair a single named badge to render together.
export function attendanceBadge(e: Enquiry): { label: string; color: string } {
  if (e.is_no_show) return { label: 'No Show', color: 'bg-orange-100 text-orange-700' };
  if (e.checked_in_at) return { label: 'Checked In', color: 'bg-indigo-100 text-indigo-700' };
  return { label: 'Not Started', color: 'bg-slate-100 text-dark-muted' };
}

// Seat-status badge shown in the table/card — same underlying
// booked/cancelled/not-booked states as before, but a cancelled booking
// marked is_no_show gets its own label/color so admins can tell a no-show
// apart from an ordinary cancellation at a glance (it forfeits the refund,
// per policy, where a normal cancellation doesn't).
export function seatStatus(e: Enquiry): { label: string; title: string; color: string; icon: typeof CheckCircle2 } {
  if (isBooked(e)) {
    return { label: 'Booked', title: 'Seat booked automatically from payment', color: 'bg-green-100 text-green-700', icon: CheckCircle2 };
  }
  if (e.cancelled_at) {
    return e.is_no_show
      ? { label: 'No Show', title: 'No-show — seat released, forfeits refund per policy', color: 'bg-orange-100 text-orange-700', icon: XCircle }
      : { label: 'Cancelled', title: 'Cancelled — seat released', color: 'bg-red-100 text-red-700', icon: XCircle };
  }
  return { label: 'Not booked', title: 'No payment recorded yet, so no seat is held', color: 'bg-background-warm text-dark-muted', icon: Circle };
}

// Group vs Solo is purely about whether this row is part of a multi-seat
// signup (group_size > 1) — same test used everywhere else in this file
// (row tinting, "Group x/y" badges) so the filter matches what's on screen.
export function isGroupEntry(e: Enquiry): boolean {
  return !!(e.group_size && e.group_size > 1);
}

// Only relevant for cancelled bookings that had money on them. Tracks
// refund_amount against amount_paid independently, so partial refunds
// (processed in installments) show correctly as "pending" until they
// fully catch up.
export function refundStatus(e: Enquiry): { label: string; color: string } | null {
  if (!e.cancelled_at || e.amount_paid <= 0) return null;
  const refunded = e.refund_amount || 0;
  if (refunded >= e.amount_paid) return { label: 'Refunded', color: 'bg-green-100 text-green-700' };
  if (refunded > 0) return { label: `Refund pending — ${formatPrice(e.amount_paid - refunded)} left`, color: 'bg-amber-100 text-amber-700' };
  return { label: `Refund pending — ${formatPrice(e.amount_paid)}`, color: 'bg-red-100 text-red-700' };
}

export const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  closed: { label: 'Closed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

// JOURNEY_STAGE_CONFIG / journeyBadge / nextManualAction / BookingLifecycleStepper
// now all live in AdminEnquiryCommon.tsx (imported by AdminEnquiries.tsx).

export const PAY_FILTER_LABELS = {
  all: 'All',
  paid: 'Paid in full',
  partial: 'Partial',
  unpaid: 'Unpaid',
  not_set: 'Price not set',
} as const;

export const FOOD_FILTER_LABELS = {
  all: 'All',
  veg: 'Veg',
  non_veg: 'Non-veg',
  not_set: 'Not set',
} as const;

export const BOOKING_FILTER_LABELS = {
  all: 'All',
  booked: 'Booked',
  not_booked: 'Not booked',
  cancelled: 'Cancelled',
} as const;

export const GROUP_FILTER_LABELS = {
  all: 'All',
  group: 'Group',
  solo: 'Solo',
} as const;

// Package filter — Early Bird vs Normal pricing (see add_enquiry_auto_pricing.sql).
// Same "row is undefined defaults to normal" convention used everywhere else
// package_type is read (PACKAGE_CONFIG[e.package_type || 'normal']), so an
// older row with no package_type set still lands under "Normal" here rather
// than being invisible to both options.
export const PACKAGE_FILTER_LABELS = {
  all: 'All',
  early_bird: 'Early Bird',
  normal: 'Normal',
} as const;

export function packageFilterKey(e: Enquiry): 'early_bird' | 'normal' {
  return e.package_type === 'early_bird' ? 'early_bird' : 'normal';
}

// foodPreferenceKey / SOURCE_CONFIG now live in AdminEnquiryCommon.tsx (imported
// by AdminEnquiries.tsx).

export type EnquiryForm = {
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
  // How the initial advance (amount_paid above) was actually settled, if
  // anything was paid up front — CRM spec sections 6/9. Only meaningful
  // when amount_paid > 0.
  payment_method: string;
  payment_utr: string;
  food_preference: 'veg' | 'non_veg' | '';
};

export const emptyForm: EnquiryForm = {
  full_name: '', phone: '', email: '', age: '', city: '', trip_id: '', source: 'whatsapp', message: '',
  package_type: 'normal', total_amount: '', amount_paid: '', payment_method: '', payment_utr: '', food_preference: '',
};

// One row of the bulk waitlist-conversion form — trip/package/notes stay
// shared across the whole group (see `form`), but each person needs their
// own identity + their own advance payment since a waitlist conversion
// requires money on the booking before it counts as seated.
export type WaitlistPersonForm = {
  full_name: string;
  phone: string;
  email: string;
  age: number | '';
  city: string;
  food_preference: 'veg' | 'non_veg' | '';
  amount_paid: number | '';
};

export const emptyWaitlistPerson: WaitlistPersonForm = {
  full_name: '', phone: '', email: '', age: '', city: '', food_preference: '', amount_paid: '',
};

// Field-level errors for the solo "Log an Enquiry" / single-seat "Convert
// Waitlist Signup" form (AddEnquiryModal). Same three checks handleSave
// used to only enforce after the fact via alert(): name & phone required,
// amount paid can't exceed the total, and (only when converting a
// waitlist entry) an advance is required to actually seat the booking.
// Shared by the modal (live, as the admin types) and handleSave as the
// final save-time gate, so the two can never drift.
export type EnquiryFormErrors = Partial<Record<'full_name' | 'phone' | 'amount_paid', string>>;

export function validateEnquiryForm(form: EnquiryForm, isConvertingWaitlist: boolean): EnquiryFormErrors {
  const errors: EnquiryFormErrors = {};
  if (!form.full_name.trim()) errors.full_name = 'Full name is required.';
  if (!form.phone.trim()) errors.phone = 'Phone number is required.';

  const totalAmount = form.total_amount === '' ? null : Number(form.total_amount);
  const amountPaid = form.amount_paid === '' ? 0 : Number(form.amount_paid);
  if (totalAmount != null && amountPaid > totalAmount) {
    errors.amount_paid = "Amount paid can't be more than the total amount.";
  } else if (isConvertingWaitlist && amountPaid <= 0) {
    errors.amount_paid = 'An advance payment is required to convert a waitlist entry into a booking.';
  }

  return errors;
}

// Same shape as EnquiryFormErrors, for one row of the bulk waitlist-group
// conversion form — every seat in the group needs its own name/phone and
// its own qualifying advance (the shared per-person total_amount is passed
// in separately since it lives on the parent `form`, not each person).
export type WaitlistPersonFormErrors = Partial<Record<'full_name' | 'phone' | 'amount_paid', string>>;

export function validateWaitlistPersonForm(p: WaitlistPersonForm, totalAmount: number | ''): WaitlistPersonFormErrors {
  const errors: WaitlistPersonFormErrors = {};
  if (!p.full_name.trim()) errors.full_name = 'Full name is required.';
  if (!p.phone.trim()) errors.phone = 'Phone number is required.';

  const amountPaid = p.amount_paid === '' ? 0 : Number(p.amount_paid);
  const total = totalAmount === '' ? null : Number(totalAmount);
  if (amountPaid <= 0) {
    errors.amount_paid = 'An advance payment is required to convert this person into a booking.';
  } else if (total != null && amountPaid > total) {
    errors.amount_paid = "Amount paid can't be more than the total amount.";
  }

  return errors;
}

// Live version of handleBulkSave's two save-time checks — "pick at least
// one field to change" and "amount paid can't exceed the total amount for
// anyone in the selection" — so the Bulk Edit modal can surface both as the
// admin fills the form instead of only behind an alert() after Save.
// Unlike the single-enquiry validators above, this one needs the actual
// selected rows (targets) to check the per-row total_amount fallback, so it
// takes them as a parameter rather than closing over component state.
export function validateBulkEditForm(bulkForm: BulkEditForm, targets: Enquiry[]): {
  touchesPaymentFields: boolean;
  touchesStatus: boolean;
  hasChanges: boolean;
  overpaid: Enquiry | null;
} {
  const touchesPaymentFields = bulkForm.food_preference !== BULK_NO_CHANGE
    || bulkForm.package_type !== BULK_NO_CHANGE
    || bulkForm.total_amount !== ''
    || bulkForm.amount_paid !== '';
  const touchesStatus = bulkForm.status !== BULK_NO_CHANGE;

  let overpaid: Enquiry | null = null;
  if (touchesPaymentFields && bulkForm.amount_paid !== '') {
    const bulkTotal = bulkForm.total_amount === '' ? null : Number(bulkForm.total_amount);
    const bulkPaid = Number(bulkForm.amount_paid);
    overpaid = targets.find(e => {
      const effectiveTotal = bulkTotal != null ? bulkTotal : e.total_amount;
      return effectiveTotal != null && bulkPaid > effectiveTotal;
    }) || null;
  }

  return { touchesPaymentFields, touchesStatus, hasChanges: touchesPaymentFields || touchesStatus, overpaid };
}

// Shared input styling used by every plain text/number field across the
// Admin Enquiries page and its modals.
export const inputClass = `w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors`;
