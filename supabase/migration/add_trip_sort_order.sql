-- ============================================================================
-- Adds a manual display-order column to upcoming_trips, so an admin can
-- control the order trip cards appear in on the public site (both the
-- homepage's "Upcoming adventures" preview and the full /trips listing)
-- instead of always being locked to chronological (start_date) order.
--
-- Lower sort_order sorts first. New trips are appended to the end
-- automatically (see createUpcomingTrip in src/services/api/trips.ts).
-- Existing trips are backfilled below using their current chronological
-- order, so turning this on doesn't reshuffle anything already live —
-- from that point on, dragging trips up/down in Admin → Upcoming Trips
-- (see the ↑/↓ controls in AdminTripsTable.tsx) is what changes it.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run — the backfill only fills rows that are still null.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists sort_order integer;

with ordered as (
  select id, row_number() over (order by start_date asc, created_at asc) - 1 as rn
  from public.upcoming_trips
)
update public.upcoming_trips t
set sort_order = ordered.rn
from ordered
where t.id = ordered.id
  and t.sort_order is null;

create index if not exists idx_upcoming_trips_sort_order
  on public.upcoming_trips (sort_order);
