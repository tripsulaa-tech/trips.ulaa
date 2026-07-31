-- ============================================================================
-- ULAA — Fix "Original Trip Plan" snapshot to read from live fields
-- Run this once in Supabase → SQL Editor.
--
-- Context:
-- completed_trips.original_highlights / original_included are a read-only
-- admin-facing snapshot (AdminAlbums.tsx → "Original Trip Plan") of what a
-- trip's Highlights / What's Included looked like when it was archived from
-- Upcoming Trips. sync_started_trip_albums() populated them from
-- upcoming_trips.highlights / upcoming_trips.included — but the Add/Edit
-- Trip form dropped manual input for those two columns long ago in favor of
-- highlight_cards (icon+heading+description) and included_items
-- (icon+description). Since then the source columns have always been
-- empty, so the snapshot's Highlights/What's Included sections have quietly
-- been blank on every trip completed since.
--
-- This adds two new snapshot columns fed from the fields that are actually
-- maintained today, and updates the sync function accordingly. The old
-- original_highlights / original_included columns are left in place
-- (untouched) so already-completed trips from before this fix keep
-- whatever historical data they have — AdminAlbums.tsx falls back to them
-- when the new columns are empty.
--
-- With sync_started_trip_albums() no longer reading upcoming_trips.highlights
-- / upcoming_trips.included, nothing in the app reads those two columns
-- anymore (same dead-end things_to_carry was in before
-- drop_legacy_things_to_carry_column.sql), so this drops them too.
-- ============================================================================

alter table public.completed_trips
  add column if not exists original_highlight_cards jsonb default '[]'::jsonb,
  add column if not exists original_included_items   jsonb default '[]'::jsonb;

comment on column public.completed_trips.original_highlight_cards is
  'Snapshot of upcoming_trips.highlight_cards at archive time. Preferred over the legacy original_highlights (plain text[]) when present — see AdminAlbums.tsx.';
comment on column public.completed_trips.original_included_items is
  'Snapshot of upcoming_trips.included_items at archive time. Preferred over the legacy original_included (plain text[]) when present — see AdminAlbums.tsx.';

create or replace function public.sync_started_trip_albums()
returns void
language plpgsql
as $function$
begin
  insert into public.completed_trips (
    id, title, destination, slug, trip_date, description,
    cover_image, gallery_images, is_published, trip_type,
    original_itinerary, original_highlight_cards, original_included_items, original_not_included,
    participants
  )
  select
    ut.id, ut.title, ut.destination, ut.slug, ut.start_date, ut.description,
    ut.cover_image, ut.gallery_images, false, ut.trip_type,
    ut.itinerary, ut.highlight_cards, ut.included_items, ut.not_included,
    ut.seats_booked
  from public.upcoming_trips ut
  where ut.start_date <= current_date
    and not exists (
      select 1 from public.completed_trips ct where ct.id = ut.id
    );

  update public.upcoming_trips
     set is_published = false
   where start_date <= current_date
     and is_published = true;
end;
$function$;

alter table public.upcoming_trips
  drop column if exists highlights,
  drop column if exists included;
