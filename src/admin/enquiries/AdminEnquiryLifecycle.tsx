// The two actual React components that used to live in AdminEnquiryCommon.tsx.
// Split out into their own module so that file (and this one) each stay
// "only exports components" / "only exports non-components" respectively —
// mixing the two in one file breaks Fast Refresh (react-refresh/only-export-components).
import {
  Warning as AlertTriangle,
  XCircle,
  UserMinus,
} from '@phosphor-icons/react';
import type { Enquiry } from '../../types/types-index';
import { formatDate } from '../../utils/utils-index';
import { JOURNEY_STAGE_CONFIG } from './AdminEnquiryCommon';

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
        <XCircle size={14} className="shrink-0" aria-hidden="true" /> Booking Cancelled
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
          <XCircle size={12} className="shrink-0" aria-hidden="true" /> Cancelled — progress below is where it stood before cancellation
        </div>
      )}
      <div className="flex items-center">
        {BOOKING_LIFECYCLE_STEPS.map((step, i) => {
          const isDone = i < activeIndex;
          const isActive = i === activeIndex;
          return (
            <div key={step.key} aria-current={isActive ? 'step' : undefined} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    isDone
                      ? 'bg-green-600'
                      : isActive
                        ? 'bg-white border-2 border-primary'
                        : 'bg-white border-2 border-dark/15'
                  }`}
                >
                  {isDone && (
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8.5L6.2 11.5L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {isActive && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <span className={`text-[10px] font-button font-semibold whitespace-nowrap ${isActive ? 'text-primary' : isDone ? 'text-green-700' : 'text-dark-muted'}`}>
                  {step.label}
                </span>
              </div>
              {i < BOOKING_LIFECYCLE_STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1.5 rounded-full mb-4 ${i < activeIndex ? 'bg-green-500' : 'bg-dark/10'}`} />
              )}
            </div>
          );
        })}
      </div>
      {enquiry.booking_status === 'balance_pending' && !isCancelled && (
        <div className="flex items-center gap-1.5 mt-2.5 bg-amber-50 text-amber-700 rounded-md px-2.5 py-1.5 text-[11px] font-button font-semibold">
          <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
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
