// The two actual React components that used to live in AdminEnquiryCommon.tsx.
// Split out into their own module so that file (and this one) each stay
// "only exports components" / "only exports non-components" respectively —
// mixing the two in one file breaks Fast Refresh (react-refresh/only-export-components).
import {
  Clock,
  ArrowsClockwise as RefreshCw,
  Check,
  CreditCard,
  Flag,
  Warning as AlertTriangle,
  XCircle,
  UserMinus,
} from '@phosphor-icons/react';
import type { Enquiry } from '../../types/types-index';
import { formatDate } from '../../utils/utils-index';
import { JOURNEY_STAGE_CONFIG } from './AdminEnquiryCommon';

// Full enquiry-to-completed journey, in order. The first two nodes
// (New Enquiry, Contacted) are pre-booking — enquiry.journey_stage
// territory — the last three are booking_status territory, same as
// before. Shown together so the stepper reads as the whole lifecycle, not
// just the money part of it, even though (see the guard below) it only
// ever renders once a booking exists, so New Enquiry/Contacted always
// render as already-done context rather than an active step in practice.
// 'cancelled' is a terminal off-ramp rendered separately, not a step you
// progress through. 'balance_pending' isn't its own node either — it's a
// same-step warning ("Confirmed, but the balance is now overdue") that
// applies while still sitting at the Confirmed step, rendered as an
// annotation on that node instead.
const BOOKING_LIFECYCLE_STEPS: { key: 'new_enquiry' | 'contacted' | 'booking_confirmed' | 'fully_paid' | 'completed'; label: string; icon: typeof Check }[] = [
  { key: 'new_enquiry', label: 'New Enquiry', icon: Clock },
  { key: 'contacted', label: 'Contacted', icon: RefreshCw },
  { key: 'booking_confirmed', label: 'Confirmed', icon: Check },
  { key: 'fully_paid', label: 'Fully Paid', icon: CreditCard },
  { key: 'completed', label: 'Completed', icon: Flag },
];
// Index of the first booking_status-driven node (Confirmed) — everything
// before this is always "done" by the time this component renders at all,
// since booking_status only exists once an advance payment has landed.
const CONFIRMED_STEP_INDEX = BOOKING_LIFECYCLE_STEPS.findIndex(s => s.key === 'booking_confirmed');

// Renders the enquiry's full journey — New Enquiry → Contacted → Confirmed
// → Fully Paid → Completed — as a horizontal progress bar. Only the last 3
// nodes are driven by enquiries.booking_status, which is undefined until
// the first payment lands, so this only shows once there's actually a
// booking to track (the first 2 nodes always render as already-done
// context by the time that's true).
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
        <XCircle size={14} className="shrink-0" aria-hidden="true" /> Booking Cancelled
      </div>
    );
  }

  // 'balance_pending' sits at the same lifecycle position as
  // 'booking_confirmed' (both are pre-fully_paid), just with an overdue
  // balance — so the active step index treats them the same. The first two
  // nodes (New Enquiry, Contacted) never end up "active" here — this
  // component only renders once booking_status exists, which itself only
  // exists once an advance payment landed, i.e. well past those two.
  const effectiveStatus = enquiry.booking_status === 'balance_pending' ? 'booking_confirmed' : enquiry.booking_status;
  const activeIndex = BOOKING_LIFECYCLE_STEPS.findIndex(s => s.key === effectiveStatus);
  const lastIndex = BOOKING_LIFECYCLE_STEPS.length - 1;

  // Single continuous bar (instead of separate segment fills) with a
  // floating "% complete" callout riding the fill, like the rest of the
  // admin's progress-bar pattern. Each of the 5 stages anchors the bar at
  // an even 25% step (0/25/50/75/100); while sitting at Confirmed
  // (pre-fully-paid) the fill also creeps forward with how much of the
  // balance is cleared, so it visibly tracks payments landing rather than
  // just jumping in fixed steps.
  const stepPercent = 100 / lastIndex;
  const totalAmount = enquiry.total_amount || 0;
  const paidAmount = enquiry.amount_paid || 0;
  const paymentRatio = totalAmount > 0 ? Math.min(1, paidAmount / totalAmount) : 0;
  const barPercent = activeIndex === CONFIRMED_STEP_INDEX
    ? CONFIRMED_STEP_INDEX * stepPercent + paymentRatio * stepPercent
    : activeIndex * stepPercent;
  const displayPercent = Math.round(barPercent);

  return (
    <div className="relative bg-gradient-to-br from-white via-white to-background-warm/70 border border-background-warm rounded-xl px-4 pt-9 pb-4 sm:px-6 sm:pt-10 sm:pb-5 shadow-sm">
      {/* Faint decorative glow in the corner — purely cosmetic, sits behind
          everything (z-0) so it never interferes with hit targets or
          readability of the steps above it. Clipped in its own layer (not
          the whole card) so it doesn't cut off the progress thumb/callout
          when they sit near the 0%/100% edges. */}
      <div className="pointer-events-none absolute inset-0 rounded-xl overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/5 blur-2xl" aria-hidden="true" />
      </div>
      {isCancelled && (
        <div className="relative flex items-center gap-1.5 mb-3 bg-red-50 text-red-700 rounded-md px-2.5 py-1.5 text-[11px] font-button font-semibold">
          <XCircle size={12} className="shrink-0" aria-hidden="true" /> Cancelled — progress below is where it stood before cancellation
        </div>
      )}

      {/* Progress bar + floating percent callout */}
      <div className="relative mx-2 sm:mx-3">
        <div className="h-2 rounded-full bg-dark/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-dark to-primary-light transition-[width] duration-500"
            style={{ width: `${barPercent}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-primary shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-[left] duration-500"
          style={{ left: `${barPercent}%` }}
          aria-hidden="true"
        />
        <div
          className="absolute -top-10 -translate-x-1/2 transition-[left] duration-500"
          style={{ left: `${barPercent}%` }}
          aria-hidden="true"
        >
          <div className="relative bg-gradient-to-br from-primary-dark to-primary text-white text-xs font-button font-bold px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
            {displayPercent}%
            <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-primary rotate-45" />
          </div>
        </div>
      </div>

      {/* Milestones — dashed connector down to an icon, label, and status,
          one per lifecycle step. Scrolls horizontally on very narrow
          screens instead of squeezing 5 labels unreadably tight. */}
      <div className="relative mt-1 flex items-start justify-between gap-1 overflow-x-auto scrollbar-hide">
        {BOOKING_LIFECYCLE_STEPS.map((step, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          const Icon = step.icon;
          return (
            <div key={step.key} aria-current={isActive ? 'step' : undefined} className="flex flex-col items-center gap-1.5 flex-1 min-w-[4.5rem]">
              <span className="w-px h-3 border-l border-dashed border-dark/25" aria-hidden="true" />
              <span
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full inline-flex items-center justify-center shrink-0 transition-all ${
                  isDone || isActive
                    ? 'bg-gradient-to-br from-primary-dark to-primary text-white shadow-[0_3px_10px_-2px_rgba(168,90,42,0.5)]'
                    : 'bg-dark/5 text-dark-muted'
                }`}
              >
                <Icon size={15} weight={isDone || isActive ? 'bold' : 'regular'} aria-hidden="true" />
              </span>
              <span className={`text-[10px] sm:text-[11px] font-button font-bold uppercase tracking-wide text-center leading-tight ${isActive ? 'text-primary' : isDone ? 'text-dark' : 'text-dark-muted/60'}`}>
                {step.label}
              </span>
              <span className="text-dark-muted text-[10px] sm:text-[11px] whitespace-nowrap">
                {isDone ? 'Done' : isActive ? 'In Progress' : 'Pending'}
              </span>
            </div>
          );
        })}
      </div>

      {enquiry.booking_status === 'balance_pending' && !isCancelled && (
        <div className="relative flex items-center gap-1.5 mt-3 bg-amber-50 text-amber-700 rounded-md px-2.5 py-1.5 text-[11px] font-button font-semibold">
          <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
          Balance overdue{enquiry.balance_due_date ? ` — due ${formatDate(enquiry.balance_due_date, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        </div>
      )}
    </div>
  );
}

// The forward-moving path through JOURNEY_STAGE_CONFIG, in order — a finer-
// grained breakdown than BOOKING_LIFECYCLE_STEPS above (this splits
// Confirmed into advance_paid/confirmed and Fully Paid into
// fully_paid/checked_in), since this legend is a reference strip meant to
// explain every journey_stage value at a glance, not the 5-node summary
// shown on a single enquiry. balance_pending is left out here too, same
// reasoning as BOOKING_LIFECYCLE_STEPS: it's a same-step warning on
// Confirmed, not a distinct stage of forward progress.
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
                <cfg.icon size={11} className="shrink-0" aria-hidden="true" /> {cfg.label}
              </span>
              {i < LIFECYCLE_FLOW_STAGES.length - 1 && (
                <span className="text-dark-muted/50 text-xs" aria-hidden="true">→</span>
              )}
            </div>
          );
        })}
        <span className="text-dark-muted/60 text-[11px] mx-1 shrink-0 whitespace-nowrap">or, at any point —</span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${JOURNEY_STAGE_CONFIG.not_interested.color}`}>
          <UserMinus size={11} className="shrink-0" aria-hidden="true" /> Not Interested
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap shrink-0 ${JOURNEY_STAGE_CONFIG.cancelled.color}`}>
          <XCircle size={11} className="shrink-0" aria-hidden="true" /> Cancelled
        </span>
      </div>
    </div>
  );
}
