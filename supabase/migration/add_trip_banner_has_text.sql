-- ============================================================================
-- Adds `banner_has_text` to upcoming_trips so Admin → Upcoming Trips can stop
-- the Trip Detail hero from drawing the trip title on top of a banner image
-- that already has the title written into its artwork (the title would
-- otherwise appear twice and overlap the artwork). The title stays on the
-- page as screen-reader/SEO text.
--
-- Defaults to false (title shown), so every existing trip keeps behaving
-- exactly as before with no data backfill needed.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists banner_has_text boolean not null default false;
