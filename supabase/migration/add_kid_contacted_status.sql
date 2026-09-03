-- NOTE: the Kids feature this migration builds on was later removed — see
-- remove_kids_feature.sql. Kept here only as history of what was applied.

-- ============================================================================
-- Adds 'contacted' as a valid kids.status value, between 'pending' and
-- 'confirmed' — the kid-scoped equivalent of the adult journey's
-- new_enquiry -> contacted step (see add_booking_journey_stage.sql).
--
-- Before this, a kid's status jumped straight from 'pending' (nothing
-- confirmed yet) to 'confirmed' (booking actually locked in), with no way
-- to record "we've spoken to this lead about their kid" in between — the
-- exact distinction the adult side already draws with Mark Contacted.
-- nextKidManualAction() in AdminEnquiryCommon.ts now offers this as the
-- kid's own "Mark Contacted" step (pending -> contacted -> confirmed ->
-- checked_in -> completed), same shape as nextManualAction()'s adult
-- chain.
--
-- Also widens kids_follow_up_requires_pending_status to explicitly allow
-- 'contacted' and 'confirmed' alongside 'pending' — canSetKidFollowUp() in
-- AdminEnquiryCommon.ts has allowed a reminder on a 'confirmed' kid since
-- before this migration, so this constraint (which only ever allowed
-- 'pending') was already stricter than the app it's meant to back up; this
-- brings the two back in sync while widening it for 'contacted' too,
-- mirroring canSetFollowUp() allowing the adult reminder across all three
-- of its own pre-confirmed stages (contacted/advance_pending/advance_paid).
--
-- Run this once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.kids
  drop constraint if exists kids_status_check;

alter table public.kids
  add constraint kids_status_check
  check (status = any (array[
    'pending'::text, 'contacted'::text, 'confirmed'::text, 'checked_in'::text,
    'completed'::text, 'cancelled'::text, 'not_interested'::text
  ]));

alter table public.kids
  drop constraint if exists kids_follow_up_requires_pending_status;

alter table public.kids
  add constraint kids_follow_up_requires_pending_status
  check (follow_up_at is null or status = any (array['pending'::text, 'contacted'::text, 'confirmed'::text]));
