import { supabase } from '../../supabase';
import type { ClosedReason, Kid, KidStatus, Payment } from '../../../types/types-index';
import { formatPrice } from '../../../utils/utils-index';
import { PAYMENT_TYPE_LOG_LABEL } from './shared';
import { logActivity } from './activity';

// =============================================
// Kids — independently-trackable per-kid records
// =============================================
// Each kid on a booking gets its own row here (name, status, follow-up),
// layered on top of the parent enquiry's kids_count/kids_amount headcount
// (which stays the source of truth for pricing — see
// add_trip_kids_option.sql). See add_kids_table.sql for the full schema
// rationale.

// All kid rows for one enquiry, oldest first — matches the order they'd
// have been added in (either typed into the booking form or added by an
// admin), so "Kid 1"/"Kid 2" fallback labels stay stable across reloads.
export async function getKidsForEnquiry(enquiryId: string): Promise<Kid[]> {
  const { data, error } = await supabase
    .from('kids')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Same as getKidsForEnquiry, batched across several enquiries in one round
// trip — for screens that need real kid rows for a whole page of bookings
// at once (the Enquiries list table's per-kid rows) rather than one
// enquiry's detail page. Caller groups the flat result back by
// `enquiry_id` itself; still oldest-first per enquiry so "Kid 1"/"Kid 2"
// fallback ordering stays stable, same reasoning as the singular version.
export async function getKidsForEnquiries(enquiryIds: string[]): Promise<Kid[]> {
  if (enquiryIds.length === 0) return [];
  const { data, error } = await supabase
    .from('kids')
    .select('*')
    .in('enquiry_id', enquiryIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Every kid row business-wide, oldest first — same ordering convention as
// getKidsForEnquiry/getKidsForEnquiries (so "Kid 1"/"Kid 2" fallback labels
// stay stable once grouped back by enquiry_id client-side), just unfiltered.
// Powers the standalone Kids CRM page (/admin/kids), which needs to list
// every kid across every booking rather than one enquiry's handful.
export async function getAllKids(): Promise<Kid[]> {
  const { data, error } = await supabase
    .from('kids')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Seeds one row per kid on a fresh booking — called right after the
// enquiry insert succeeds (submitEnquiry/submitGroupEnquiry/
// createManualEnquiry), never directly by a form. `count` is the
// authoritative number (kids_count on the enquiry); `names` is whatever
// the form collected alongside it, index-aligned and optionally shorter
// than count — any kid past the end of `names` (or with a blank name)
// just starts out nameless, same as a pre-this-table backfilled row.
export async function createKidsForEnquiry(enquiryId: string, count: number, names: string[] = []): Promise<void> {
  if (count <= 0) return;
  const rows = Array.from({ length: count }, (_, i) => ({
    enquiry_id: enquiryId,
    name: names[i]?.trim() || null,
    status: 'pending' as KidStatus,
  }));
  const { error } = await supabase.from('kids').insert(rows);
  if (error) {
    // Best-effort, same reasoning as logActivity: the enquiry itself is
    // already committed by the time this runs, and losing the per-kid
    // detail rows (this booking falls back to looking like a pre-this-
    // table one, still fully bookable) is a far smaller problem than
    // failing an otherwise-successful booking submission over it.
    console.error('createKidsForEnquiry failed:', error.message);
  }
}

// General-purpose edit for one kid's own record — name/age/food
// preference correction, etc. Status and follow-up have their own
// dedicated helpers below since they carry extra bookkeeping (the
// pending-only follow-up rule, activity logging).
export async function updateKid(id: string, patch: Partial<Pick<Kid, 'name' | 'age' | 'food_preference'>>): Promise<void> {
  const { error } = await supabase.from('kids').update(patch).eq('id', id);
  if (error) throw error;
}

// Shared by recordKidPayment/generateKidPendingInvoice below — applies
// this kid's own total-amount correction (auto-fetched from the trip's
// child_price, see useKidPayment's openKidPayment) and/or a food
// preference change alongside a payment, in the same round trip rather
// than a second updateKid call. Only writes columns that actually
// changed, same reasoning as every other targeted update in this file.
async function syncKidProfile(
  kid: Kid,
  patch: { amount?: number | null; food_preference?: 'veg' | 'non_veg' | null }
): Promise<void> {
  const update: Partial<Pick<Kid, 'amount' | 'food_preference'>> = {};
  if (patch.amount !== undefined && patch.amount !== kid.amount) update.amount = patch.amount ?? undefined;
  if (patch.food_preference !== undefined && patch.food_preference !== kid.food_preference) update.food_preference = patch.food_preference;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('kids').update(update).eq('id', kid.id);
  if (error) throw error;
}

// Moves one kid's own status forward/back — independent of the parent
// enquiry's status. Clears this kid's follow-up the moment it leaves
// 'pending' (mirrors refreshJourneyStage's handling of
// enquiries.follow_up_at — see add_enquiry_follow_up.sql's check
// constraint, which kids_follow_up_requires_pending_status mirrors), so a
// reminder never lingers on a kid that's since moved on. `reason` mirrors
// updateEnquiryStatus's closedReason param — only written when status is
// 'not_interested' (defaulting to null if the caller didn't pick one, e.g.
// the plain Status dropdown in AdminKidDetailModal), and cleared back to
// null on every other status change. See add_kid_not_interested_reason.sql.
export async function updateKidStatus(id: string, status: KidStatus, reason?: ClosedReason): Promise<void> {
  const { error } = await supabase
    .from('kids')
    .update({
      status,
      not_interested_reason: status === 'not_interested' ? (reason ?? null) : null,
      ...(status !== 'pending' ? { follow_up_at: null, follow_up_notes: null } : {}),
    })
    .eq('id', id);
  if (error) throw error;
}

// Same idea as bulk-editing enquiries (AdminBulkEditModal) — apply one
// status to every selected kid in a single round trip. No reason picker on
// bulk actions (matching the adult side's bulk-close behaviour), so
// not_interested_reason is always cleared here regardless of status.
export async function bulkUpdateKidsStatus(ids: string[], status: KidStatus): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('kids')
    .update({ status, not_interested_reason: null, ...(status !== 'pending' ? { follow_up_at: null, follow_up_notes: null } : {}) })
    .in('id', ids);
  if (error) throw error;
}

// Sets/clears this kid's own follow-up reminder — same shape as
// setEnquiryFollowUp in status.ts, just scoped to a kid row instead of the
// enquiry. Only meaningful while the kid is still 'pending' (enforced by
// kids_follow_up_requires_pending_status), so this is only ever called
// from UI that already keeps that rule.
export async function setKidFollowUp(id: string, followUpAt: string | null, notes?: string | null): Promise<void> {
  const { error } = await supabase
    .from('kids')
    .update({ follow_up_at: followUpAt, follow_up_notes: followUpAt ? (notes ?? null) : null })
    .eq('id', id);
  if (error) throw error;
}

// Toggles this kid's own is_no_show flag — independent of status, same
// idea as setEnquiryNoShow in status.ts for the adult booking. Deliberately
// ungated (no Fully-Paid/trip-departed checks, no refund side effects, both
// directions treated the same): kids.status has never had that kind of
// eligibility gating (see add_kids_not_interested_status.sql) and kids
// carry no seat/refund consequences of their own for a no-show to affect,
// so this just follows the same "no guardrails, it's a label" treatment as
// every other kids.status transition. See add_kids_completed_no_show.sql.
export async function updateKidNoShow(id: string, isNoShow: boolean): Promise<void> {
  const { error } = await supabase.from('kids').update({ is_no_show: isNoShow }).eq('id', id);
  if (error) throw error;
}

export async function deleteKid(id: string): Promise<void> {
  const { error } = await supabase.from('kids').delete().eq('id', id);
  if (error) throw error;
}

// Every kid's food_preference across every enquiry, business-wide — for
// reporting (AdminReports' veg/non-veg breakdown), which needs to fold
// kids into the same tally as enquiries.food_preference rather than
// leaving them out of "how many veg/non-veg meals do we need" entirely.
// Deliberately a lean projection (just enough to bucket by preference and
// match a row back to its parent enquiry) rather than the full row shape
// getKidsForEnquiry returns, since this can span every kid on every
// booking rather than one enquiry's handful.
export async function getAllKidsFoodPreferences(): Promise<Pick<Kid, 'enquiry_id' | 'food_preference'>[]> {
  const { data, error } = await supabase
    .from('kids')
    .select('enquiry_id, food_preference');
  if (error) throw error;
  return data || [];
}

// Logs a kid-scoped action onto the parent enquiry's Activity Timeline, so
// "Kid Aarav marked Checked In" shows up in the same place every other
// admin action on this booking does, instead of being invisible outside
// the Kids card. Best-effort, same as logActivity itself.
export async function logKidActivity(enquiryId: string, action: string, details?: string | null): Promise<void> {
  await logActivity(enquiryId, action, details);
}

// =============================================
// Kids — their own individual payment record
// =============================================
// One kid, one Total/Paid, own ledger rows — genuinely independent of
// every other kid on the same booking and of the adult booking's own
// amount_paid, unlike the older combined enquiries.kids_amount_paid bucket
// (add_kids_payment_tracking.sql, still maintained underneath for its own
// business-wide rollup use but no longer what the admin UI edits). See
// add_kid_individual_payments.sql.

// Records a payment against one specific kid — same running-total/delta
// shape as recordPayment/recordKidsPayment in payments.ts, just scoped to
// a single kid's own `amount`/`amount_paid` instead of an enquiry's (or a
// whole booking's combined kids bucket's). No refund/pending-invoice
// branching in v1, same simplicity recordKidsPayment originally shipped
// with — a kid doesn't get its own seat or invoice-type menu, just
// Total/Paid/Pending.
//
// `newAmountPaid` is the running total after this transaction, same
// convention as recordPayment's `payment.amount_paid`. Passing a value
// equal to current.amount_paid is a no-op on the ledger.
export async function recordKidPayment(
  kid: Kid,
  payment: {
    amount_paid: number; // new running total, not a delta
    amount?: number | null; // lets the admin correct this kid's own total
    payment_method?: string;
    utr_number?: string;
    notes?: string;
    // Admin-picked type from the Kid Payment modal's own Payment Type
    // dropdown — same options/meaning as the adult Track Payment modal's
    // (see AdminKidPaymentModal). Wins over the auto-derived guess below
    // when present; left undefined for older/simpler callers that don't
    // offer the dropdown, which keeps the original auto-derived behavior.
    payment_type?: 'full_payment' | 'advance' | 'balance' | 'installment';
    // Lets the Kid Payment modal save a food preference edit in the same
    // round trip as the payment — same field as updateKid's, just folded
    // in here so the admin doesn't need a second save.
    food_preference?: 'veg' | 'non_veg' | null;
  }
): Promise<Kid> {
  const newTotal = payment.amount !== undefined && payment.amount != null ? payment.amount : kid.amount;

  if (payment.amount_paid < 0) {
    throw new Error('Amount paid cannot be negative.');
  }
  if (newTotal != null && newTotal > 0 && payment.amount_paid > newTotal) {
    throw new Error("Amount paid can't exceed this kid's total amount.");
  }

  const delta = payment.amount_paid - (kid.amount_paid || 0);

  const isFirstPayment = (kid.amount_paid || 0) <= 0;
  const completesTotal = !!newTotal && newTotal > 0 && payment.amount_paid >= newTotal;
  const invoiceType = payment.payment_type
    || (isFirstPayment ? (completesTotal ? 'full_payment' : 'advance') : (completesTotal ? 'balance' : 'installment'));

  if (delta !== 0) {
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: kid.enquiry_id,
      kid_id: kid.id,
      // Kept true for backward compatibility with anything still reading
      // this flag business-wide (Reports); kid_id is the precise
      // discriminator now — see add_kid_individual_payments.sql.
      for_kids: true,
      amount: delta,
      payment_type: invoiceType,
      payment_method: payment.payment_method,
      utr_number: payment.utr_number || null,
      notes: payment.notes,
    });
    if (paymentError) throw paymentError;
  }

  await syncKidProfile(kid, { amount: newTotal, food_preference: payment.food_preference });

  // Re-read the trigger-updated amount_paid rather than assuming it from
  // the delta, same reasoning as recordPayment/recordKidsPayment.
  const { data: refreshed, error: refreshError } = await supabase
    .from('kids')
    .select('*')
    .eq('id', kid.id)
    .single();
  if (refreshError) throw refreshError;

  if (delta !== 0) {
    await logActivity(
      kid.enquiry_id,
      delta > 0 ? `${PAYMENT_TYPE_LOG_LABEL[invoiceType] || invoiceType} received` : 'Payment adjusted',
      `${kid.name ? `${kid.name} · ` : 'Kid · '}${formatPrice(Math.abs(delta))}${payment.payment_method ? ` · ${payment.payment_method}` : ''}`
    );
  }

  return refreshed as Kid;
}

// Raises an invoice for this one kid's fee that hasn't been collected
// yet — same idea as generatePendingInvoice in invoices.ts (enquiry-level),
// just scoped to a kid_id. Inserted with status = 'pending', so
// sync_kid_amount_paid() (add_kid_individual_payments.sql) leaves
// kids.amount_paid untouched until it's later settled. Since this row still
// carries the parent enquiry_id, it already surfaces in the enquiry's own
// Invoices & Payments card (getPaymentsForEnquiry filters by enquiry_id
// only) — so the existing Mark Paid flow there (markInvoicePaid) settles a
// kid's pending invoice too, with no separate kid-scoped invoices UI needed.
export async function generateKidPendingInvoice(
  kid: Kid,
  type: 'full_payment' | 'advance' | 'balance' | 'installment',
  amount: number,
  options?: {
    notes?: string;
    // Same "correct this kid's own total while raising the invoice" idea
    // as recordKidPayment's `amount` — always the trip's live child_price
    // from the modal, not admin-typed. See syncKidProfile.
    newTotal?: number | null;
    food_preference?: 'veg' | 'non_veg' | null;
  }
): Promise<Kid> {
  if (amount <= 0) {
    throw new Error('Invoice amount must be greater than zero.');
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: kid.enquiry_id,
    kid_id: kid.id,
    for_kids: true,
    amount,
    payment_type: type,
    status: 'pending',
    notes: options?.notes,
  });
  if (paymentError) throw paymentError;

  await syncKidProfile(kid, { amount: options?.newTotal, food_preference: options?.food_preference });

  const { data: refreshed, error: refreshError } = await supabase
    .from('kids')
    .select('*')
    .eq('id', kid.id)
    .single();
  if (refreshError) throw refreshError;

  await logActivity(
    kid.enquiry_id,
    `Invoice generated · ${PAYMENT_TYPE_LOG_LABEL[type] || type}`,
    `${kid.name ? `${kid.name} · ` : 'Kid · '}${formatPrice(amount)} · pending`
  );

  return refreshed as Kid;
}

// Adds an extra charge to this one kid's own fee (e.g. a costume rental, a
// late add-on) — same idea as addExtraCharge (invoices.ts) for the adult
// booking, just scoped to a kid_id. Bumps this kid's own `amount` (the
// per-kid analog of enquiries.total_amount) right away, since that's now
// part of what's owed for this kid whether or not it's been collected yet,
// and logs an 'extra_charge' payments row for it. Pass collectedNow: true
// if the customer paid on the spot; otherwise the row is raised as
// 'pending' and — same as generateKidPendingInvoice — still carries the
// parent enquiry_id, so it's settleable later via the existing
// markInvoicePaid ("Mark Paid") flow with no separate kid-scoped UI needed.
export async function addExtraChargeForKid(
  kid: Kid,
  amount: number,
  options?: { collectedNow?: boolean; payment_method?: string; utr_number?: string; notes?: string }
): Promise<Kid> {
  if (amount <= 0) {
    throw new Error('Extra charge amount must be greater than zero.');
  }
  const newTotal = (kid.amount || 0) + amount;

  const { error: totalError } = await supabase
    .from('kids')
    .update({ amount: newTotal })
    .eq('id', kid.id);
  if (totalError) throw totalError;

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: kid.enquiry_id,
    kid_id: kid.id,
    for_kids: true,
    amount,
    payment_type: 'extra_charge',
    status: options?.collectedNow ? 'paid' : 'pending',
    payment_method: options?.payment_method,
    utr_number: options?.collectedNow ? (options?.utr_number || null) : null,
    notes: options?.notes,
  });
  if (paymentError) throw paymentError;

  const { data, error } = await supabase.from('kids').select('*').eq('id', kid.id).single();
  if (error) throw error;

  await logActivity(
    kid.enquiry_id,
    'Extra charge added',
    `${kid.name ? `${kid.name} · ` : 'Kid · '}${formatPrice(amount)}${options?.collectedNow ? ' · collected' : ' · pending'}`
  );

  return data as Kid;
}

// One kid's own payment ledger, oldest first — same idea as
// getPaymentsForEnquiry, just filtered to a single kid_id instead of a
// whole enquiry_id.
export async function getPaymentsForKid(kidId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('kid_id', kidId)
    .order('paid_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
