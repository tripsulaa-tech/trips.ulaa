import { supabase } from '../../supabase';
import type { Enquiry, JourneyStage } from '../../../types/types-index';

// =============================================
// Shared internals for the enquiries/* modules
// =============================================
// True when a Postgres error is the enforce_trip_age_eligibility trigger's
// rejection (see add_trip_age_eligibility_enforcement.sql) rather than some
// other failure. That trigger raises a plain 'AGE_NOT_ELIGIBLE' marker
// message (default SQLSTATE — not a dedicated code like the 23505 unique
// violations below), so it's matched on message text instead of error.code.
export function isAgeNotEligibleError(error: { message?: string }): boolean {
  return !!error.message?.includes('AGE_NOT_ELIGIBLE');
}

// The enforce_enquiry_capacity_or_waitlist() DB trigger (see
// add_enquiry_capacity_enforcement.sql) raises a plain 'SEATS_UNAVAILABLE'
// marker — not a dedicated SQLSTATE — when a plain enquiry insert (or a
// group's worth of them) would exceed the trip's real, live seat count.
// This is the hard backstop behind getTripSeatSnapshot()'s pre-submit
// re-check below: even if two people submit within the same instant, only
// as many as actually fit get through as real enquiries — the rest get
// this error and the caller routes them to the waitlist instead. Matched
// on message text, same pattern as isAgeNotEligibleError above.
export function isSeatsUnavailableError(error: { message?: string }): boolean {
  return !!error.message?.includes('SEATS_UNAVAILABLE');
}

// Local, log-message-only label map — deliberately NOT importing
// INVOICE_TYPE_LABEL from admin/AdminEnquiryCommon.tsx here: that file is UI
// layer (and itself imports from this services file), so pulling it in
// here would be a layering violation risking a circular import. This is
// intentionally a smaller, log-copy-specific set of labels, not a shared
// source of truth for the admin UI's own invoice-type labels.
export const PAYMENT_TYPE_LOG_LABEL: Record<string, string> = {
  advance: 'Advance',
  balance: 'Balance payment',
  installment: 'Installment',
  full_payment: 'Full payment',
  booking_amount: 'Booking amount',
  extra_charge: 'Extra charge',
  refund: 'Refund',
};

// Pure derivation of the single "Booking Journey" stage shown in the admin
// table, from the same underlying columns computeAutoStatus/
// computeBookingStatus already read — see add_booking_journey_stage.sql for
// the full rationale on why each branch is ordered the way it is.
//
// Deliberately does NOT special-case cancelled_at (it used to: an earlier
// version returned 'cancelled' as soon as cancelled_at was set, which
// overwrote the stage the booking had actually reached — see
// add_booking_state.sql). Cancellation is tracked independently in
// Enquiry.booking_state instead, so this always reports the highest
// legitimate stage reached, cancelled or not — matching the CRM spec's
// "Fully Paid + Cancelled -> Journey remains Fully Paid, State becomes
// Cancelled" rule. booking_status === 'completed' is checked first (that's
// admin-explicit, never something a payment alone can undo).
export function computeJourneyStage(e: {
  status: Enquiry['status'];
  amount_paid: number;
  total_amount?: number | null;
  booking_amount: number;
  balance_due_date?: string | null;
  checked_in_at?: string | null;
  booking_status?: Enquiry['booking_status'];
}): JourneyStage {
  if (e.booking_status === 'completed') return 'completed';
  if (e.checked_in_at) return 'checked_in';
  if (e.total_amount && e.total_amount > 0 && e.amount_paid >= e.total_amount) return 'fully_paid';
  if (
    e.amount_paid > 0 &&
    e.balance_due_date &&
    new Date(e.balance_due_date) < new Date() &&
    (!e.total_amount || e.amount_paid < e.total_amount)
  ) {
    return 'balance_pending';
  }
  if (e.booking_amount > 0 && e.amount_paid >= e.booking_amount) return 'confirmed';
  if (e.amount_paid > 0) return 'advance_paid';
  // A lead an admin closed out as "not interested" after contacting (or
  // without ever contacting) — no money ever landed on it, so it's not a
  // Cancelled booking, and status !== 'contacted' means it can't fall into
  // either of the two branches below either. Without this, a closed lead
  // silently fell all the way through to 'new_enquiry'. See
  // add_not_interested_journey_stage.sql / isNotInterested() in
  // AdminEnquiryCommon.tsx for the full rationale.
  if (e.status === 'closed') return 'not_interested';
  if (e.status === 'contacted' && e.total_amount) return 'advance_pending';
  if (e.status === 'contacted') return 'contacted';
  return 'new_enquiry';
}

// Re-reads an enquiry's current columns and writes the journey_stage they
// derive to, if it's changed. Every mutating enquiry path across
// enquiries/*.ts that can possibly move the journey forward (or back to
// 'cancelled') calls this once it's done, instead of trying to compute the
// new stage inline from values that might not reflect what a DB trigger
// just wrote.
export async function refreshJourneyStage(enquiryId: string): Promise<Enquiry> {
  const { data: e, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', enquiryId)
    .single();
  if (error) throw error;

  const stage = computeJourneyStage(e);
  // booking_state is normally kept in sync by the on_enquiry_cancelled DB
  // trigger the moment cancelled_at changes (see add_booking_state.sql).
  // Recomputed here too, defensively, so a row read before that trigger
  // has run (or a legacy row from before the migration) still shows the
  // right value without needing a second round-trip.
  const bookingState: Enquiry['booking_state'] = e.cancelled_at ? 'cancelled' : 'active';

  // follow_up_at (see add_enquiry_follow_up.sql) is only meaningful while
  // the lead is still a live, pre-booked conversation — the DB's own check
  // constraint enforces status === 'contacted', which covers 'contacted',
  // 'advance_pending', and 'advance_paid' (status only flips off
  // 'contacted' once amount_paid reaches total_amount — see
  // computeAutoStatus above). Kept in sync with canSetFollowUp() in
  // AdminEnquiryCommon.tsx. Every mutating path that can move a lead past that
  // point (booking confirmed, fully paid, closed as Not Interested,
  // reopened, cancelled, etc.) already routes through here, so this is the
  // one place a stale reminder needs clearing rather than every call site
  // remembering to do it individually.
  const stillFollowable = stage === 'contacted' || stage === 'advance_pending' || stage === 'advance_paid';
  const clearFollowUp = (!!e.follow_up_at || !!e.follow_up_time) && !stillFollowable;

  // Booking Follow-up (see add_booking_follow_up.sql) is only meaningful
  // once a booking has actually started (past Advance Pending) and while
  // it's still active — the DB's own check constraint enforces both, this
  // is the same defensive belt-and-suspenders clear as clearFollowUp
  // above, on the mirror-image window.
  const stillBookingFollowable = bookingState === 'active' && (
    stage === 'advance_pending' || stage === 'advance_paid' || stage === 'confirmed'
    || stage === 'balance_pending' || stage === 'fully_paid' || stage === 'checked_in'
  );
  const clearBookingFollowUp = !!e.booking_follow_up_at && !stillBookingFollowable;

  if (stage === e.journey_stage && bookingState === e.booking_state && !clearFollowUp && !clearBookingFollowUp) return e;

  const patch: Record<string, unknown> = {};
  if (stage !== e.journey_stage) patch.journey_stage = stage;
  if (bookingState !== e.booking_state) patch.booking_state = bookingState;
  if (clearFollowUp) {
    patch.follow_up_at = null;
    patch.follow_up_time = null;
  }
  if (clearBookingFollowUp) {
    patch.booking_follow_up_at = null;
    patch.booking_follow_up_time = null;
    patch.booking_follow_up_type = null;
    patch.booking_follow_up_notes = null;
  }

  const { data, error: updateError } = await supabase
    .from('enquiries')
    .update(patch)
    .eq('id', enquiryId)
    .select()
    .single();
  if (updateError) throw updateError;
  return data;
}

// Any payment — full or partial — reserves a seat, since a deposit is a
// booking in practice. Status auto-advances: fully paid -> closed,
// partially paid -> contacted. Unpaid (0) never auto-downgrades status,
// so an admin's manual "closed"/"contacted" note isn't silently undone.
export function computeAutoStatus(
  amountPaid: number,
  totalAmount: number | null | undefined,
  currentStatus: Enquiry['status']
): Enquiry['status'] {
  if (totalAmount && totalAmount > 0 && amountPaid >= totalAmount) return 'closed';
  if (amountPaid > 0) return 'contacted';
  return currentStatus;
}

// Booking/payment lifecycle — a separate dimension from the lead `status`
// above. Never downgrades away from 'cancelled' or 'completed' here; those
// are set explicitly (cancelled via the DB trigger on cancelEnquiry,
// completed manually by an admin after the trip wraps).
export function computeBookingStatus(
  amountPaid: number,
  totalAmount: number | null | undefined,
  bookingAmount: number,
  balanceDueDate: string | null | undefined,
  current: Enquiry['booking_status']
): Enquiry['booking_status'] {
  if (current === 'cancelled' || current === 'completed') return current;
  if (amountPaid <= 0) return undefined;
  if (totalAmount && totalAmount > 0 && amountPaid >= totalAmount) return 'fully_paid';
  if (bookingAmount > 0 && amountPaid >= bookingAmount && balanceDueDate) {
    return new Date(balanceDueDate) < new Date() ? 'balance_pending' : 'booking_confirmed';
  }
  return 'booking_confirmed';
}

// NOTE: trips.seats_booked is no longer adjusted manually from here. The
// on_enquiries_seat_sync DB trigger recomputes it straight from real
// enquiries data (count of non-cancelled rows with amount_paid > 0) after
// every insert/update/delete on `enquiries` — including the amount_paid
// updates that cascade in from the `payments` table. Keeping a second,
// manual +/-1 adjustment here double-counted every change (e.g. a
// cancellation would free the seat via the trigger AND get decremented
// again by this function), which is what caused seat counts to drift.
