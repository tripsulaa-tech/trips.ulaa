-- ============================================================================
-- ULAA — Grouped "What's Included" (heading + bulleted sub-items)
-- Run this once in Supabase → SQL Editor.
--
-- Context: What's Included (trip.included_items) was a flat list of
-- icon+description rows. Some trips need a grouped presentation instead —
-- e.g. a "Premium Stay Experience" heading followed by a bulleted list of
-- accommodation details — so Admin → Trips → Add/Edit Trip → Inclusions &
-- Prep now also offers included_groups: an array of
-- { icon, heading, bullets[] } groups, shown on the public trip page
-- (src/pages/TripDetailPage.tsx) in place of the flat grid when present.
-- included_groups is preferred over included_items, the same way
-- included_items is preferred over the legacy included text[] column.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists included_groups jsonb default '[]'::jsonb;

comment on column public.upcoming_trips.included_groups is
  'Grouped "What''s Included" — array of {icon, heading, bullets[]}. Preferred by the admin UI and public trip page over included_items when present.';
