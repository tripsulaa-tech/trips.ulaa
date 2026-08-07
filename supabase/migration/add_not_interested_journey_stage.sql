-- ============================================================================
-- Adds a 'not_interested' journey_stage alongside the existing new_enquiry/
-- contacted/advance_pending/advance_paid/confirmed/balance_pending/
-- fully_paid/checked_in/completed/cancelled values.
--
-- Before this migration, marking an enquiry as "not interested" (status ->
-- 'closed', no money ever paid) fell all the way through
-- computeJourneyStage()'s if-chain in src/services/api.ts and silently
-- landed back on 'new_enquiry' — so a lead an admin had explicitly closed
-- out still showed a "New Enquiry" badge in the list. This migration only
-- widens the check constraint; computeJourneyStage() itself (updated
-- alongside this migration) is what actually returns 'not_interested' for
-- that case, and JOURNEY_STAGE_CONFIG in src/admin/enquiryShared.tsx is
-- what renders it.
--
-- Ships with a one-time backfill: any enquiry currently sitting on
-- 'new_enquiry' that was actually closed as not-interested (status =
-- 'closed', never cancelled, never paid, never booked) is corrected to
-- 'not_interested'. isNotInterested() in enquiryShared.tsx already treats
-- this the same way even before the backfill runs — the backfill is just
-- to make the journey_stage badge itself correct for existing rows, not a
-- prerequisite for the feature to work.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.enquiries
  drop constraint if exists enquiries_journey_stage_check;
alter table public.enquiries
  add constraint enquiries_journey_stage_check
  check (journey_stage = any (array[
    'new_enquiry'::text, 'contacted'::text, 'advance_pending'::text, 'advance_paid'::text,
    'confirmed'::text, 'balance_pending'::text, 'fully_paid'::text, 'checked_in'::text,
    'completed'::text, 'cancelled'::text, 'not_interested'::text
  ]));

update public.enquiries
   set journey_stage = 'not_interested'
 where status = 'closed'
   and cancelled_at is null
   and coalesce(amount_paid, 0) <= 0
   and booking_id is null
   and journey_stage <> 'not_interested';
