-- ============================================================================
-- Adds an 'expired' waitlist status alongside the existing waiting/notified/
-- converted/declined values, so an admin can explicitly mark a stale offer
-- as expired instead of leaving it stuck on 'notified' forever (or manually
-- declining it, which reads as "the traveller said no" rather than "we
-- never heard back in time").
--
-- 'converted' remains programmatic-only (set exclusively by
-- markWaitlistConverted in src/services/api.ts) — this migration doesn't
-- change that; it only widens the constraint.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.waitlist
  drop constraint if exists waitlist_status_check;
alter table public.waitlist
  add constraint waitlist_status_check
  check (status in ('waiting', 'notified', 'converted', 'declined', 'expired'));
