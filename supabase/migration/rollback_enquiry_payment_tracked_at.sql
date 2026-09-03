-- ============================================================================
-- Rollback for add_enquiry_payment_tracked_at.sql.
--
-- Undoes the payment_tracked_at column that migration added (and that the
-- app no longer references now that the "Advance Pending" fix has been
-- reverted). Nothing else in that migration touched constraints or other
-- tables, so dropping the column is the whole rollback.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.enquiries
  drop column if exists payment_tracked_at;
