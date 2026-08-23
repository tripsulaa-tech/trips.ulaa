import { supabase } from '../../supabase';
import { formatPrice } from '../../../utils/utils-index';
import type { Enquiry, Payment } from '../../../types/types-index';
import { PAYMENT_TYPE_LOG_LABEL, computeAutoStatus, computeBookingStatus, refreshJourneyStage } from './shared';
import { logActivity } from './activity';

// =============================================
// Enquiries — payments
// =============================================

// Records a new payment (delta from what's already been paid, not an
// absolute total) against an enquiry. Inserting into the payments ledger
// triggers a DB-side recalculation of enquiries.amount_paid — this function
// never writes amount_paid directly, to avoid it drifting from the ledger.
//
// `newAmountPaid` is the running total after this transaction is applied —
// every caller (bulk edit, manual-enquiry creation, and the Track Payment
// modal) computes it before calling in, so this function only has to do the
// delta math once. Passing a newAmountPaid equal to current.amount_paid is
// a no-op (e.g. saving the form after only changing total_amount/package_type).
//
// `type`, if passed, is an explicit Full Payment/Advance/Balance/Installment
// override — used by the Track Payment modal, which (like Generate Invoice)
// has the admin pick the label directly rather than inferring it. Omitted,
// the label is auto-classified from isFirstPayment/completesTotal below, as
// every other caller of this function still relies on.
export async function recordPayment(
  current: Enquiry,
  payment: {
    amount_paid: number; // new running total, not a delta
    total_amount?: number | null;
    package_type?: Enquiry['package_type'];
    food_preference?: 'veg' | 'non_veg' | null;
    payment_method?: string;
    utr_number?: string;
    notes?: string;
    type?: 'full_payment' | 'advance' | 'balance' | 'installment';
  }
): Promise<Enquiry> {
  const newTotal = payment.total_amount !== undefined ? payment.total_amount : current.total_amount;

  // Server-side bound-checking: the UI validates this too, but recordPayment
  // is the one choke point every payment path (single edit, bulk edit,
  // manual-enquiry creation) eventually calls, so guard here regardless of
  // what a caller passes in. Without this, a typo'd amount_paid inserts a
  // ledger delta straight into `payments` — the DB's amount_paid <=
  // total_amount CHECK constraint only catches it once the sync trigger
  // tries to write the recomputed total back to `enquiries`, by which point
  // the bad ledger row already exists and the update just fails.
  if (payment.amount_paid < 0) {
    throw new Error('Amount paid cannot be negative.');
  }
  if (newTotal != null && newTotal > 0 && payment.amount_paid > newTotal) {
    throw new Error("Amount paid can't exceed the total amount.");
  }

  const delta = payment.amount_paid - (current.amount_paid || 0);

  // Labels this transaction the way the invoice list shows it: the first
  // money in is 'full_payment' if it settles the whole total in one go,
  // otherwise 'advance'; anything after that is 'balance' if it's the
  // payment that brings the booking to fully paid, otherwise 'installment'.
  // Computed once, outside the `delta !== 0` guard below, so the same
  // label is available for both the ledger insert and the activity-log
  // entry further down without going out of scope between them. Skipped
  // entirely when the caller already supplied an explicit type.
  const isFirstPayment = (current.amount_paid || 0) <= 0;
  const completesTotal = !!newTotal && newTotal > 0 && payment.amount_paid >= newTotal;
  const invoiceType = payment.type ?? (isFirstPayment
    ? (completesTotal ? 'full_payment' : 'advance')
    : (completesTotal ? 'balance' : 'installment'));

  if (delta !== 0) {
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: invoiceType,
      payment_method: payment.payment_method,
      utr_number: payment.utr_number || null,
      notes: payment.notes,
    });
    if (paymentError) throw paymentError;
  }

  // Re-read the trigger-updated amount_paid so is_paid/status/booking_status
  // are computed from the actual synced value, not assumed from the delta.
  const { data: refreshed, error: refreshError } = await supabase
    .from('enquiries')
    .select('amount_paid, balance_due_date, booking_amount, booking_status')
    .eq('id', current.id)
    .single();
  if (refreshError) throw refreshError;

  // Seat booking follows automatically: the payment insert above already
  // updated enquiries.amount_paid via a DB trigger, which in turn triggers
  // the trip's seats_booked to be recomputed from real data. No manual
  // adjustment needed here.
  const isPaidFull = !!newTotal && newTotal > 0 && refreshed.amount_paid >= newTotal;
  const status = computeAutoStatus(refreshed.amount_paid, newTotal, current.status);
  const bookingStatus = computeBookingStatus(
    refreshed.amount_paid,
    newTotal,
    refreshed.booking_amount,
    refreshed.balance_due_date,
    refreshed.booking_status
  );

  const { error } = await supabase
    .from('enquiries')
    .update({
      total_amount: newTotal,
      package_type: payment.package_type ?? current.package_type,
      food_preference: payment.food_preference !== undefined ? payment.food_preference : current.food_preference,
      is_paid: isPaidFull,
      status,
      booking_status: bookingStatus,
    })
    .eq('id', current.id);
  if (error) throw error;
  const updated = await refreshJourneyStage(current.id);
  if (delta !== 0) {
    await logActivity(
      current.id,
      delta > 0 ? `${PAYMENT_TYPE_LOG_LABEL[invoiceType] || invoiceType} received` : 'Payment adjusted',
      `${formatPrice(Math.abs(delta))}${payment.payment_method ? ` · ${payment.payment_method}` : ''}`
    );
  }
  return updated;
}

// Full payment ledger for one enquiry (booking_amount / installment /
// balance / refund rows), oldest first — the transaction history section
// of the invoice PDF, and also useful for any future "payment history"
// admin view. Distinct from enquiries.amount_paid/refund_amount, which are
// just the running totals this ledger is the source of truth for.
export async function getPaymentsForEnquiry(enquiryId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('paid_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
