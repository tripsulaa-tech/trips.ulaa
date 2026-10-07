-- ============================================================================
-- Lets an admin deliberately change an upcoming trip's public link (slug) from
-- the Edit Trip pop-up, without breaking links that were already shared.
--
-- Background: freeze_trip_and_album_slugs.sql blocks any plain UPDATE of
-- `slug`, and revokes the rename_* functions from the app, so renaming a trip
-- never changed its URL. This adds:
--   1. trip_slug_redirects: old link -> trip, so /trips/<old-slug> keeps
--      working (the trip page redirects to the new link).
--   2. admin_rename_upcoming_trip_slug(): admin-only, validates the new slug,
--      records the old one as a redirect, then changes the slug.
--
-- Existing photos keep working: they are stored as full URLs, so they are not
-- affected by the slug. Only photos uploaded after the rename go into the new
-- slug's storage folder.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

create table if not exists public.trip_slug_redirects (
  old_slug   text primary key,
  trip_id    uuid not null references public.upcoming_trips(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.trip_slug_redirects enable row level security;

drop policy if exists "Anyone can read trip slug redirects" on public.trip_slug_redirects;
create policy "Anyone can read trip slug redirects"
  on public.trip_slug_redirects for select
  using (true);

create or replace function public.admin_rename_upcoming_trip_slug(p_trip_id uuid, p_new_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_new_slug is null or p_new_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid slug: %', p_new_slug using errcode = '22023';
  end if;

  select slug into v_old from public.upcoming_trips where id = p_trip_id;
  if v_old is null then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  if v_old = p_new_slug then
    return v_old;
  end if;

  perform set_config('app.allow_slug_change', 'on', true);

  -- Keep the old link alive. If this trip is being renamed back to a slug it
  -- used to have, that slug stops being a redirect.
  delete from public.trip_slug_redirects where old_slug = p_new_slug;
  insert into public.trip_slug_redirects (old_slug, trip_id)
    values (v_old, p_trip_id)
    on conflict (old_slug) do update set trip_id = excluded.trip_id;

  -- A unique violation here (slug already used by another trip) rolls the
  -- whole function back, redirect insert included.
  update public.upcoming_trips set slug = p_new_slug where id = p_trip_id;

  return p_new_slug;
end;
$function$;

revoke execute on function public.admin_rename_upcoming_trip_slug(uuid, text) from public, anon;
grant execute on function public.admin_rename_upcoming_trip_slug(uuid, text) to authenticated;
