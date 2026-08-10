-- ============================================================================
-- Freeze `slug` on upcoming_trips and completed_trips against accidental
-- updates.
--
-- Why: slug doubles as a storage-folder path (trips/{slug}/..., albums/
-- {slug}/...) and the public trip/album URL. The app code (AdminTrips.tsx,
-- AdminAlbums.tsx) already only sets slug on create and leaves it untouched
-- on edit — see the "The slug is a public URL and a storage-folder path..."
-- comments in both files. That fixed the two known code paths, but nothing
-- stopped a *future* code change, a manual SQL edit, or a different
-- admin tool from recomputing slug on save and silently orphaning a trip's
-- or album's existing photos (new DB slug -> old storage folder left
-- behind).
--
-- This migration makes that invariant impossible to violate by accident,
-- at the database layer, regardless of which app code writes to these
-- tables:
--   - Any UPDATE that changes `slug` is rejected by default.
--   - A deliberate rename is still possible via the
--     rename_upcoming_trip_slug() / rename_completed_trip_slug() functions
--     below, which the app does NOT currently call — they exist for a
--     future "rename slug + migrate storage" admin flow, done consciously
--     rather than as a side effect of editing a title.
--
-- Run this once in Supabase -> SQL Editor (or `supabase db execute`).
-- Safe to re-run: every step guards against already having been applied.
-- ============================================================================

-- 1. Generic trigger function: block changes to `slug` unless a session-
--    local flag has been explicitly set for this transaction.
create or replace function public.prevent_slug_change()
returns trigger
language plpgsql
as $function$
begin
  if new.slug is distinct from old.slug
     and coalesce(current_setting('app.allow_slug_change', true), 'off') <> 'on' then
    raise exception
      'slug is immutable once a % row exists (id=%). It is a storage-folder path and public URL — changing it silently orphans existing files. Use the dedicated rename function if this change is intentional.',
      tg_table_name, old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

-- 2. Attach the trigger to both tables.
drop trigger if exists trg_prevent_upcoming_trips_slug_change on public.upcoming_trips;
create trigger trg_prevent_upcoming_trips_slug_change
  before update on public.upcoming_trips
  for each row execute function public.prevent_slug_change();

drop trigger if exists trg_prevent_completed_trips_slug_change on public.completed_trips;
create trigger trg_prevent_completed_trips_slug_change
  before update on public.completed_trips
  for each row execute function public.prevent_slug_change();

-- 3. sync_started_trip_albums() (see add_trip_status_lifecycle.sql) copies a
--    row from upcoming_trips into completed_trips via INSERT, not UPDATE,
--    so it is unaffected by this trigger — no change needed there.

-- 4. Dedicated, explicit rename functions for the rare deliberate case.
--    These do NOT move any storage files themselves — they only update the
--    DB column. Actually relocating the existing objects in the `ulaa`
--    bucket from the old slug's folder to the new one is a separate,
--    manual step (or a future storage-migration script) that must be done
--    alongside calling these.
create or replace function public.rename_upcoming_trip_slug(trip_id uuid, new_slug text)
returns public.upcoming_trips
language plpgsql
security definer
set search_path = public
as $function$
declare
  result public.upcoming_trips;
begin
  perform set_config('app.allow_slug_change', 'on', true);
  update public.upcoming_trips set slug = new_slug where id = trip_id
    returning * into result;
  return result;
end;
$function$;

create or replace function public.rename_completed_trip_slug(album_id uuid, new_slug text)
returns public.completed_trips
language plpgsql
security definer
set search_path = public
as $function$
declare
  result public.completed_trips;
begin
  perform set_config('app.allow_slug_change', 'on', true);
  update public.completed_trips set slug = new_slug where id = album_id
    returning * into result;
  return result;
end;
$function$;
