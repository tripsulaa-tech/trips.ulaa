-- ============================================================================
-- ULAA — Payment/refund ledger bound checks
-- Run this once in Supabase → SQL Editor.
--
-- Context: `enquiries` already has enquiries_amount_paid_check (amount_paid
-- <= total_amount), but nothing stops amount_paid, refund_amount, or
-- total_amount from going negative, and nothing stops refund_amount from
-- exceeding amount_paid (refunding more than was ever collected). The admin
-- UI (AdminEnquiries.tsx) and the API layer (recordPayment/recordRefund/
-- createManualEnquiry in src/services/api.ts) both validate these now, but
-- every write to `enquiries` ultimately lands here regardless of which code
-- path produced it — including the sync_enquiry_amount_paid trigger that
-- recomputes amount_paid/refund_amount straight from the `payments` ledger.
-- This is the last line of defense against a bad ledger row (e.g. a typo'd
-- extra zero) silently corrupting is_paid/booking_status/seat-count logic,
-- all of which trust amount_paid as ground truth.
-- ============================================================================

alter table public.enquiries
  add constraint enquiries_amount_paid_nonnegative_check
    check (amount_paid >= 0),
  add constraint enquiries_refund_amount_nonnegative_check
    check (refund_amount >= 0),
  add constraint enquiries_total_amount_nonnegative_check
    check (total_amount is null or total_amount >= 0),
  add constraint enquiries_refund_not_exceeding_paid_check
    check (refund_amount <= amount_paid);
