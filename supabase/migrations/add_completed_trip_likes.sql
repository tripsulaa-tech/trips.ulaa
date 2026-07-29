-- ============================================================================
-- ULAA — Server-side like count for completed trip albums
--
-- Context: the album page's Like button was previously client-side only
-- (a localStorage flag per browser) — it didn't persist across devices,
-- didn't survive a cleared cache, and there was no real total anyone else
-- could see. This moves the count into the DB.
--
-- completed_trips only allows admin updates via RLS ("Admin all completed
-- trips"), and that's staying as-is — we don't want the public able to
-- update arbitrary columns on a trip. Instead, two narrow SECURITY DEFINER
-- RPCs do one atomic, bounds-checked thing each (+1 / -1 on likes_count
-- only) and are the only way the public form can touch this column.
--
-- Run this once in Supabase → SQL Editor.
-- ============================================================================

alter table public.completed_trips
  add column if not exists likes_count integer not null default 0;

alter table public.completed_trips
  add constraint completed_trips_likes_count_check check (likes_count >= 0);

create or replace function public.increment_completed_trip_likes(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_count integer;
begin
  update public.completed_trips
     set likes_count = likes_count + 1
   where id = p_trip_id
  returning likes_count into new_count;
  return new_count;
end;
$function$;

create or replace function public.decrement_completed_trip_likes(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_count integer;
begin
  update public.completed_trips
     set likes_count = greatest(likes_count - 1, 0)
   where id = p_trip_id
  returning likes_count into new_count;
  return new_count;
end;
$function$;

-- SECURITY DEFINER functions run as their owner by default, bypassing RLS
-- for exactly what's inside them — but they still need EXECUTE granted to
-- the roles the public site actually connects as.
grant execute on function public.increment_completed_trip_likes(uuid) to anon, authenticated;
grant execute on function public.decrement_completed_trip_likes(uuid) to anon, authenticated;
