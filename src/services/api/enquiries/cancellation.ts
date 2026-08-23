import { supabase } from '../../supabase';
import { formatPrice } from '../../../utils/utils-index';
import type { Enquiry, CancellationReason } from '../../../types/types-index';
import { computeBookingStatus, refreshJourneyStage } from './shared';
import { logActivity } from './activity';

// =============================================
// Enquiries — cancellation / refunds
// =============================================

// Cancels an enquiry / booking. Frees the trip seat immediately if one was
// held (amount_paid > 0 and not already cancelled). amount_paid itself is
// untouched — that's the historical record of what they actually paid,
// separate from refund_amount which tracks what's been paid back.
//
// Setting cancelled_at fires a DB trigger that auto-computes
// suggested_refund_amount and sets booking_state to 'cancelled' (journey_stage
// and booking_status are left untouched — see add_booking_state.sql, and
// computeJourneyStage's doc comment for why cancellation no longer
// overwrites the stage a booking had reached) — this is a SUGGESTION only,
// never authoritative; the admin still enters the real refund_amount via
// recordRefund. Pass thirdPartyCharges if known at cancellation time
// (airline/hotel penalties aren't derivable from stored data) so the
// suggestion accounts for them. Pass isNoShow if the admin is cancelling
// *because* the guest was a no-show — the DB trigger forces the suggested
// refund to 0 in that case, per the site's no-refund-for-no-shows policy,
// overriding the normal cancellation-window math.
//
// Refuses to cancel a booking that's already Completed — per the CRM
// spec's "Completed should never become Cancelled" rule, that's not a
// legitimate transition (a completed trip is in the past; use a refund/
// credit note against it instead of cancelling the booking record).
//
// Also refuses once the traveller has actually checked in — spec section
// 18's Cancellation Rules stop at Fully Paid; Checked In explicitly can't
// Cancel Booking ("If a traveller has physically checked in, cancellation
// is no longer allowed"). Undo Check In first if a check-in needs
// reversing before a cancellation can go through.
//
// The trip's seats_booked count frees up on its own: the
// on_enquiries_seat_sync DB trigger recomputes it from real enquiries data
// right after this update commits, so no manual adjustment is made here.
//
// reason/notes capture *why* the booking was cancelled (CRM spec section
// 10's Cancellation Reason + Notes) — see CancellationReason in
// types-index.ts and add_cancellation_reason.sql. Both are optional so
// existing callers (and a bulk/legacy cancel with no reason picked) keep
// working; the DB constraint only requires they be null when the booking
// isn't cancelled, not that a cancelled booking has one.
export async function cancelEnquiry(
  enquiry: Enquiry,
  thirdPartyCharges?: number,
  isNoShow?: boolean,
  reason?: CancellationReason,
  notes?: string
): Promise<Enquiry> {
  if (enquiry.journey_stage === 'completed' || enquiry.booking_status === 'completed') {
    throw new Error('A completed booking can\u2019t be cancelled.');
  }
  if (enquiry.checked_in_at) {
    throw new Error('This traveller has already checked in — cancellation is no longer allowed. Undo Check In first if that was a mistake.');
  }
  // Spec section 18's Cancellation Rules: cancelling only makes sense once
  // a booking has actually started (past Advance Pending) — a lead that
  // hasn't agreed to book yet has nothing to cancel. Mirrors
  // canCancelBooking() in AdminEnquiryCommon.tsx, which already keeps the
  // button hidden in this state; this is the server-side backstop.
  if (
    enquiry.journey_stage === 'new_enquiry' || enquiry.journey_stage === 'contacted'
    || enquiry.journey_stage === 'not_interested'
  ) {
    throw new Error('Cannot cancel — this lead hasn\u2019t agreed to book yet.');
  }

  if (thirdPartyCharges !== undefined) {
    const { error: chargesError } = await supabase
      .from('enquiries')
      .update({ third_party_charges: thirdPartyCharges })
      .eq('id', enquiry.id);
    if (chargesError) throw chargesError;
  }

  const { error } = await supabase
    .from('enquiries')
    .update({
      cancelled_at: new Date().toISOString(),
      ...(isNoShow !== undefined ? { is_no_show: isNoShow } : {}),
      cancellation_reason: reason ?? null,
      cancellation_notes: notes?.trim() ? notes.trim() : null,
    })
    .eq('id', enquiry.id);
  if (error) throw error;

  const updated = await refreshJourneyStage(enquiry.id);
  await logActivity(
    enquiry.id,
    'Cancelled',
    [reason?.replace(/_/g, ' ') || null, notes?.trim() || null].filter(Boolean).join(' · ') || null
  );
  return updated;
}

// Hard-deletes an enquiry and every piece of data tied to it — matches the
// confirm-dialog copy admins actually see ("permanently removes... cannot
// be undone"). Routed through the delete_enquiry_cascade RPC (see
// add_enquiry_hard_delete_cascade.sql) rather than a plain client-side
// `.delete()`, because that migration's comment explains: activity_log has
// no DELETE policy anywhere (by design, so logged rows are never removable
// through the ordinary API), and payments.enquiry_id/activity_log.enquiry_id
// cascading on the enquiries delete would otherwise get blocked by that
// RLS gap. The RPC runs as SECURITY DEFINER to get past that for this one
// controlled path, deleting:
//  - the enquiry row itself
//  - its payments (cascade)
//  - its activity log (cascade)
//  - unlinking (not deleting) any waitlist entry that had converted into it
//  - freeing its seat, via on_enquiries_seat_sync firing on DELETE
// This is a different, deliberately softer path than
// deleteUpcomingTripCascade/deleteCompletedTripCascade above, which
// soft-delete (deleted_at) enquiries when a whole trip/album is removed
// specifically to keep that accounting ledger recoverable. This function is
// only for an admin explicitly deleting one enquiry (or a bulk selection)
// from the Enquiries screen, where "permanently removes" is what's promised
// and hard-delete is what should happen.
export async function deleteEnquiry(enquiry: Enquiry): Promise<void> {
  const { error } = await supabase.rpc('delete_enquiry_cascade', {
    p_enquiry_id: enquiry.id,
  });
  if (error) throw error;
}

// Re-books the seat if they'd already paid something. Since booking_status
// is no longer overwritten on cancellation (see add_booking_state.sql), it
// still reflects the stage the booking had reached before it was
// cancelled — including 'completed', which computeBookingStatus can't
// derive from amount/dates alone — so this only recomputes it when it
// wasn't already something legitimate (a defensive fallback for legacy
// rows cancelled before this migration, where booking_status really was
// stomped to 'cancelled'). Re-booking a seat this way is still
// capacity-checked by the enforce_trip_capacity DB trigger, and
// seats_booked is recomputed by on_enquiries_seat_sync right after — no
// manual adjustment needed here.
export async function uncancelEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  const bookingStatus = enquiry.booking_status && enquiry.booking_status !== 'cancelled'
    ? enquiry.booking_status
    : computeBookingStatus(
        enquiry.amount_paid,
        enquiry.total_amount,
        enquiry.booking_amount,
        enquiry.balance_due_date,
        undefined // force recompute rather than trusting the legacy 'cancelled' value
      );

  const { error } = await supabase
    .from('enquiries')
    .update({
      cancelled_at: null,
      booking_state: 'active',
      booking_status: bookingStatus,
      suggested_refund_amount: null,
      // Cleared on reactivation, same pattern as closed_reason on reopening
      // — a reason for a cancellation that no longer stands shouldn't
      // linger (see add_cancellation_reason.sql).
      cancellation_reason: null,
      cancellation_notes: null,
    })
    .eq('id', enquiry.id);
  if (error) throw error;

  const updated = await refreshJourneyStage(enquiry.id);
  await logActivity(enquiry.id, 'Reactivated (cancellation reversed)');
  return updated;
}

// Logs how much has been refunded so far for a cancelled booking.
// `newRefundAmount` is the running total (matching recordPayment's pattern)
// — this inserts a ledger row for the delta rather than overwriting
// refund_amount directly, so refund_amount stays in sync via the same DB
// trigger that maintains amount_paid.
export async function recordRefund(
  current: Enquiry,
  newRefundAmount: number,
  options?: { payment_method?: string; utr_number?: string; notes?: string; paid_at?: string }
): Promise<Enquiry> {
  // Same reasoning as the guard at the top of recordPayment above — this is
  // the one choke point every refund path calls, so bound-check here even
  // though the UI already does too.
  if (newRefundAmount < 0) {
    throw new Error('Refund amount cannot be negative.');
  }
  if (newRefundAmount > (current.amount_paid || 0)) {
    throw new Error("Refund amount can't exceed what was actually paid.");
  }
  // No-shows forfeit the full amount paid, no exceptions — the UI already
  // locks this field to 0, but guard here too since this is the one choke
  // point every refund path calls.
  if (current.is_no_show && newRefundAmount > 0) {
    throw new Error('No refund is permitted for a no-show.');
  }

  const delta = newRefundAmount - (current.refund_amount || 0);
  if (delta !== 0) {
    const { error: refundError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: 'refund',
      payment_method: options?.payment_method,
      utr_number: options?.utr_number || null,
      notes: options?.notes,
      // Refund Date from the popup (CRM spec section 7) — falls back to the
      // payments table's own now() default when not supplied, same as
      // every other payment path.
      ...(options?.paid_at ? { paid_at: options.paid_at } : {}),
    });
    if (refundError) throw refundError;
  }

  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', current.id)
    .single();
  if (error) throw error;
  if (delta !== 0) {
    await logActivity(
      current.id,
      'Refund processed',
      `${formatPrice(Math.abs(delta))}${options?.payment_method ? ` · ${options.payment_method}` : ''}`
    );
  }
  return data;
}
