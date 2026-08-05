-- ============================================================================
-- Replace upcoming_trips' two independent booleans (is_published,
-- is_coming_soon) with a single lifecycle `status` column.
--
-- Why: is_published/is_coming_soon are orthogonal flags, so the Admin →
-- Upcoming Trips table could show combinations like "Draft" + "Coming Soon"
-- at once, even though a draft (unpublished) trip is never actually visible
-- on the public site regardless of is_coming_soon. There are really only
-- 3 meaningful states a trip can be in — this makes that explicit as one
-- column instead of a flag combination the UI has to reconstruct:
--   draft        - hidden everywhere on the public site
--   coming_soon  - public, but only cover image + title (teaser) shown
--   published    - public, full bookable trip page
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run: every step guards against already having been applied.
-- ============================================================================

-- 1. Add the new column (nullable at first so the backfill below can run).
alter table public.upcoming_trips
  add column if not exists status text;

-- 2. Backfill from the existing flags.
update public.upcoming_trips
   set status = case
     when is_published and is_coming_soon then 'coming_soon'
     when is_published and not is_coming_soon then 'published'
     else 'draft'
   end
 where status is null;

-- 3. Lock the column down: not null, default 'draft' for new rows, and a
--    check constraint so it can never drift outside the 3 known states.
alter table public.upcoming_trips
  alter column status set default 'draft',
  alter column status set not null;

alter table public.upcoming_trips
  drop constraint if exists upcoming_trips_status_check;
alter table public.upcoming_trips
  add constraint upcoming_trips_status_check
  check (status in ('draft', 'coming_soon', 'published'));

-- 4. Public RLS read policy now keys off status instead of is_published —
--    coming_soon trips still need to be publicly readable (for the teaser),
--    just not published ones.
drop policy if exists "Public read upcoming trips" on public.upcoming_trips;
create policy "Public read upcoming trips" on public.upcoming_trips
  for select using (status in ('coming_soon', 'published'));

-- 5. sync_started_trip_albums() un-published a trip once its start_date
--    passed (after copying it into completed_trips) by flipping
--    is_published to false — do the equivalent with status.
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
     set status = 'draft'
   where start_date <= current_date
     and status <> 'draft';
end;
$function$;

-- 6. Drop the now-redundant flags.
alter table public.upcoming_trips
  drop column if exists is_published,
  drop column if exists is_coming_soon;
