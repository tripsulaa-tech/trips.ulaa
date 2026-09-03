-- NOTE: the Kids feature this migration builds on was later removed — see
-- remove_kids_feature.sql. Kept here only as history of what was applied.

-- ============================================================================
-- Adds 'not_interested' as a valid kids.status value (add_kids_table.sql),
-- alongside the existing 'cancelled' — covers the same "this one kid isn't
-- coming" outcome, kept as its own value rather than folded into
-- 'cancelled' so the Kids card can distinguish a kid that was booked and
-- backed out from one that was never going to come in the first place.
-- Same distinction the adult side already draws between journey_stage
-- 'cancelled' and 'not_interested' (see types-index.ts).
--
-- Deliberately NOT mirroring canMarkNotInterested()'s adult-side gating
-- (amount_paid <= 0, no booking_id, etc) or the dedicated
-- AdminEnquiryNotInterestedModal's closed-reason capture — kids.status
-- has never had that kind of eligibility gating (an admin can already
-- freely move a kid between pending/confirmed/checked_in/cancelled with no
-- checks), and kids never occupy a seat or carry booking-level consequences
-- the way the parent enquiry does, so there's nothing here that needs
-- guarding. This is purely a status label, same as 'cancelled' already is.
--
-- Run this once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.kids
  drop constraint if exists kids_status_check;

alter table public.kids
  add constraint kids_status_check
  check (status = any (array['pending'::text, 'confirmed'::text, 'checked_in'::text, 'cancelled'::text, 'not_interested'::text]));
