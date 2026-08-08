-- ============================================================================
-- Adds `utr_number` to `payments` — the bank/UPI transaction reference an
-- admin manually enters when recording a real payment or refund (CRM spec
-- sections 6/9/47: "ULAA Payment ID vs UTR/Transaction ID"). Before this,
-- `payment_method` (UPI/Bank/Cash) was captured but the actual UTR/
-- reference number had nowhere structured to live — admins could only
-- free-type it into `notes`, which meant it never showed up as its own
-- field on the Payment Detail / Refund Detail views or the invoice PDF.
--
-- Deliberately NOT introducing a separate ULAA-generated "Payment ID" —
-- `payments.invoice_number` (see add_invoice_generation.sql) already fills
-- that exact role (a unique, auto-assigned, per-transaction identifier);
-- adding a second one would just be a duplicate source of truth for the
-- same concept with a different prefix.
--
-- Nullable, no format constraint: cash payments/refunds have no UTR at all
-- (N/A per spec section 6), and existing historical rows have none on
-- record. Applies to both payment_type = the real payment types and
-- 'refund' rows — one column serves both, same as payment_method already
-- does, since a refund is just another row in the same ledger.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`). Safe
-- to re-run.
-- ============================================================================

alter table public.payments
  add column if not exists utr_number text;
