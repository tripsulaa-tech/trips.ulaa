import { supabase } from '../../supabase';
import { formatPrice } from '../../../utils/utils-index';
import type { Enquiry, Payment } from '../../../types/types-index';
import { PAYMENT_TYPE_LOG_LABEL, computeAutoStatus, computeBookingStatus, refreshJourneyStage } from './shared';
import { logActivity } from './activity';

// =============================================
// Enquiries — invoices
// =============================================

// Records one specific, admin-picked invoice type/amount as money already
// collected (status defaults to 'paid' via the DB column default) — unlike
// recordPayment, `amount` here is this transaction's own amount, not a new
// running total, so the admin doesn't have to do the addition themselves
// when generating e.g. an explicit "Advance" or "Balance" invoice from the
// Invoices list. Powers the "Generate Invoice" action for every type except
// addon (see addAddonCharge) and refund (see recordRefund, which
// already has its own dedicated, cancellation-aware flow).
export async function recordTypedPayment(
  current: Enquiry,
  payment: {
    type: 'full_payment' | 'advance' | 'balance' | 'installment';
    amount: number;
    payment_method?: string;
    utr_number?: string;
    notes?: string;
  }
): Promise<Enquiry> {
  if (payment.amount <= 0) {
    throw new Error('Invoice amount must be greater than zero.');
  }
  const prospectiveTotal = (current.amount_paid || 0) + payment.amount;
  if (current.total_amount != null && current.total_amount > 0 && prospectiveTotal > current.total_amount) {
    throw new Error("This would take amount paid past the booking's total amount.");
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: current.id,
    amount: payment.amount,
    payment_type: payment.type,
    payment_method: payment.payment_method,
    utr_number: payment.utr_number || null,
    notes: payment.notes,
  });
  if (paymentError) throw paymentError;

  // Re-read the trigger-updated amount_paid, same reasoning as recordPayment
  // above — never assume the new total, read back what the sync trigger
  // actually wrote.
  const { data: refreshed, error: refreshError } = await supabase
    .from('enquiries')
    .select('amount_paid, balance_due_date, booking_amount, booking_status, total_amount')
    .eq('id', current.id)
    .single();
  if (refreshError) throw refreshError;

  const isPaidFull = !!refreshed.total_amount && refreshed.total_amount > 0 && refreshed.amount_paid >= refreshed.total_amount;
  const status = computeAutoStatus(refreshed.amount_paid, refreshed.total_amount, current.status);
  const bookingStatus = computeBookingStatus(
    refreshed.amount_paid,
    refreshed.total_amount,
    refreshed.booking_amount,
    refreshed.balance_due_date,
    refreshed.booking_status
  );

  const { error } = await supabase
    .from('enquiries')
    .update({ is_paid: isPaidFull, status, booking_status: bookingStatus })
    .eq('id', current.id);
  if (error) throw error;
  const updated = await refreshJourneyStage(current.id);
  await logActivity(
    current.id,
    `${PAYMENT_TYPE_LOG_LABEL[payment.type] || payment.type} received`,
    `${formatPrice(payment.amount)}${payment.payment_method ? ` · ${payment.payment_method}` : ''}`
  );
  return updated;
}

// Raises an invoice for money that hasn't been collected yet — e.g. a
// Balance or Installment invoice generated ahead of the customer actually
// paying it (Scenario 2/3 in the invoicing flow). Inserted with
// status = 'pending', so sync_enquiry_amount_paid() leaves
// enquiries.amount_paid untouched until markInvoicePaid flips it later.
export async function generatePendingInvoice(
  enquiryId: string,
  type: 'full_payment' | 'advance' | 'balance' | 'installment',
  amount: number,
  notes?: string
): Promise<Payment> {
  if (amount <= 0) {
    throw new Error('Invoice amount must be greater than zero.');
  }
  const { data, error } = await supabase
    .from('payments')
    .insert({ enquiry_id: enquiryId, amount, payment_type: type, status: 'pending', notes })
    .select()
    .single();
  if (error) throw error;
  await logActivity(enquiryId, `Invoice generated · ${PAYMENT_TYPE_LOG_LABEL[type] || type}`, `${formatPrice(amount)} · pending`);
  return data;
}

// Adds an add-on charge to an existing booking (e.g. a hotel upgrade) —
// bumps enquiries.total_amount by the charge amount right away, since
// that's now part of what's owed whether or not it's been collected yet,
// and logs an 'addon' invoice for it. Pass collectedNow: true if the
// customer paid on the spot; otherwise the invoice is raised as 'pending'
// and can be settled later via markInvoicePaid.
export async function addAddonCharge(
  current: Enquiry,
  amount: number,
  options?: { collectedNow?: boolean; payment_method?: string; utr_number?: string; notes?: string; markAsChildAddon?: boolean }
): Promise<Enquiry> {
  if (amount <= 0) {
    throw new Error('Add-on amount must be greater than zero.');
  }
  const newTotal = (current.total_amount || 0) + amount;

  const { error: totalError } = await supabase
    .from('enquiries')
    .update(options?.markAsChildAddon ? { total_amount: newTotal, has_child_addon: true } : { total_amount: newTotal })
    .eq('id', current.id);
  if (totalError) throw totalError;

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: current.id,
    amount,
    payment_type: 'addon',
    status: options?.collectedNow ? 'paid' : 'pending',
    payment_method: options?.payment_method,
    utr_number: options?.collectedNow ? (options?.utr_number || null) : null,
    notes: options?.notes,
  });
  if (paymentError) throw paymentError;

  const { data, error } = await supabase.from('enquiries').select('*').eq('id', current.id).single();
  if (error) throw error;
  const updated = await refreshJourneyStage(data.id);
  await logActivity(current.id, 'Add-on added', `${formatPrice(amount)}${options?.collectedNow ? ' · collected' : ' · pending'}`);
  return updated;
}

// Settles a 'pending' invoice (a balance/installment invoice raised ahead of
// collection, or an extra charge not yet paid) once the money actually comes
// in. Flips status to 'paid' and stamps paid_at — the existing
// sync_amount_paid_on_payments_change trigger fires on this UPDATE the same
// way it does on insert, folding the amount into enquiries.amount_paid.
export async function markInvoicePaid(
  paymentId: string,
  options?: { payment_method?: string; utr_number?: string }
): Promise<Payment> {
  // NOTE: this was previously updating the `enquiries` table by paymentId
  // (a payments.id, not an enquiries.id) with columns (`status: 'paid'`,
  // `paid_at`) that don't exist on `enquiries` — every call would fail
  // (either no matching row, or a column-does-not-exist error). `status`/
  // `paid_at`/`payment_method` are payments columns; the intended target
  // was always this row itself. Fixed in place rather than left broken
  // since it's the "Mark Paid" action the Invoice system (spec section 11)
  // depends on.
  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      ...(options?.payment_method ? { payment_method: options.payment_method } : {}),
      ...(options?.utr_number ? { utr_number: options.utr_number } : {}),
    })
    .eq('id', paymentId)
    .select()
    .single();
  if (error) throw error;
  await refreshJourneyStage(data.enquiry_id);
  await logActivity(data.enquiry_id, 'Invoice marked paid', `${data.payment_type} · ${formatPrice(data.amount)}${data.invoice_number ? ` · ${data.invoice_number}` : ''}`);
  return data;
}
