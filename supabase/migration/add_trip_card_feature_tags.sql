-- ============================================================================
-- Adds `card_feature_tags` to upcoming_trips so Admin → Upcoming Trips can
-- set up to 4 fixed marketing tags (icon + label + sublabel) shown in the
-- icon row on the public Trip Card, e.g. "Girls-Only" / "Safe & fun",
-- "Luxury Stays" / "Handpicked".
--
-- Defaults to '[]', so every existing trip keeps its current TripCard
-- behaviour (auto-generated tags built from real trip data — travelers,
-- age range, duration, destination count) with no data backfill needed.
-- An empty/unset array on a trip means "use the auto-generated tags", not
-- "show zero tags" — see TripCard.tsx for the fallback logic.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists card_feature_tags jsonb default '[]'::jsonb;
