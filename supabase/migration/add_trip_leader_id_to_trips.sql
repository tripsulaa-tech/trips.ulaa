-- ============================================================================
-- Adds `trip_leader_id` to upcoming_trips — a reference into the
-- `trip_leaders` directory (see add_trip_leaders.sql) recording which
-- directory entry is a trip's assigned Trip Leader.
--
-- The public site and PDF read a trip's leader live from the linked
-- trip_leaders row (joined at fetch time — see services/api/trips.ts), not
-- from a per-trip copy, so editing a leader's directory entry updates every
-- trip that references them. The old per-trip `trip_founder` jsonb block is
-- no longer read or written by the app (left in place, unused, for data
-- safety — see schema.sql).
--
-- `on delete set null` so deleting a trip leader from the directory never
-- fails or cascades into deleting trips — it just unlinks them (the trip
-- simply stops showing a "Meet Your Trip Leader" section).
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists trip_leader_id uuid references public.trip_leaders(id) on delete set null;
