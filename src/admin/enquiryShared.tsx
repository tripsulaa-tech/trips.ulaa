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
import { Clock, RefreshCw, Hourglass, IndianRupee, CheckCircle2, AlertTriangle, BadgeCheck, LogIn, PartyPopper, XCircle, Circle, Globe, MessageCircle, Phone, Camera, MapPin, HelpCircle } from 'lucide-react';
import type { Enquiry, Payment } from '../types/types-index';
import { formatDate } from '../utils/utils-index';

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
  notes: string;
}

export const emptyGenerateInvoiceForm: GenerateInvoiceForm = {
  type: 'advance',
  amount: '',
  status: 'paid',
  notes: '',
};

export type PaymentForm = {
  package_type: Enquiry['package_type'];
  total_amount: number | '';
  amount_paid: number | '';
  refund_amount: number | '';
  food_preference: 'veg' | 'non_veg' | '';
};

export const FOOD_PREFERENCE_OPTIONS = [
  { value: '', label: 'Not asked / unknown' },
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-veg' },
];

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
};

export function journeyBadge(e: Enquiry) {
  return JOURNEY_STAGE_CONFIG[e.journey_stage] || JOURNEY_STAGE_CONFIG.new_enquiry;
}

// The one, single manual action that moves a booking's journey forward a
// step — every other transition (Advance Pending -> Advance Paid ->
// Confirmed -> Balance Pending -> Fully Paid) happens automatically as a
// side effect of recording a payment, so there's nothing for a generic
// "next stage" button to do there; it's hidden for those stages instead of
// shown disabled, since the Payment modal is the actual next action.
export function nextManualAction(e: Enquiry): { label: string; icon: typeof Clock } | null {
  if (e.cancelled_at) return null;
  switch (e.journey_stage) {
    case 'new_enquiry':
      return { label: 'Mark Contacted', icon: RefreshCw };
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
// 'cancelled' replaces the stepper entirely with a single red state, since
// it can be reached from any step and isn't part of the forward sequence.
export function BookingLifecycleStepper({ enquiry }: { enquiry: Enquiry }) {
  if (!enquiry.booking_status) return null;

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
      {enquiry.booking_status === 'balance_pending' && (
        <div className="flex items-center gap-1.5 mt-2.5 bg-amber-50 text-amber-700 rounded-md px-2.5 py-1.5 text-[11px] font-button font-semibold">
          <AlertTriangle size={12} className="shrink-0" />
          Balance overdue{enquiry.balance_due_date ? ` — due ${formatDate(enquiry.balance_due_date, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        </div>
      )}
    </div>
  );
}
