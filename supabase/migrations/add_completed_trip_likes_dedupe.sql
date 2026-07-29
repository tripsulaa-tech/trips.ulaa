-- ============================================================================
-- ULAA — Enforce one Like per (anonymous) visitor, at the DB level
--
-- Context: the previous version of the Like button (increment_completed_
-- trip_likes / decrement_completed_trip_likes) just bumped a raw counter —
-- nothing stopped the same person liking repeatedly (clearing localStorage,
-- an incognito window, or a direct API call would all work). Since the
-- public site has no login, there's no real user to scope a like to — but
-- we can still get a DB-enforced "one like per visitor" using a random
-- visitor_id the browser generates once and keeps in localStorage
-- (getVisitorId in src/utils/utils-index.ts), backed by a primary key
-- constraint so a duplicate is rejected by Postgres itself, not just
-- politely skipped by client code.
--
-- This is safe to run whether or not add_completed_trip_likes.sql (the
-- earlier increment/decrement version) was ever applied — it drops those
-- functions if present and replaces them with the versions below.
--
-- Run this once in Supabase → SQL Editor.
-- ============================================================================

drop function if exists public.increment_completed_trip_likes(uuid);
drop function if exists public.decrement_completed_trip_likes(uuid);

-- Make sure likes_count exists even if add_completed_trip_likes.sql was
-- never run.
alter table public.completed_trips
  add column if not exists likes_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'completed_trips_likes_count_check'
  ) then
    alter table public.completed_trips
      add constraint completed_trips_likes_count_check check (likes_count >= 0);
  end if;
end $$;

-- One row per (trip, visitor) — the primary key is what actually enforces
-- "only once", not client trust.
create table if not exists public.completed_trip_likes (
  trip_id     uuid not null references public.completed_trips (id) on delete cascade,
  visitor_id  text not null,
  created_at  timestamptz not null default now(),
  constraint completed_trip_likes_pkey primary key (trip_id, visitor_id)
);

alter table public.completed_trip_likes enable row level security;

drop policy if exists "Public insert completed trip likes" on public.completed_trip_likes;
drop policy if exists "Public delete completed trip likes" on public.completed_trip_likes;
drop policy if exists "Admin read completed trip likes" on public.completed_trip_likes;

create policy "Public insert completed trip likes" on public.completed_trip_likes
  for insert with check (true);
create policy "Public delete completed trip likes" on public.completed_trip_likes
  for delete using (true);
create policy "Admin read completed trip likes" on public.completed_trip_likes
  for select using (auth.role() = 'authenticated');

create or replace function public.recompute_completed_trip_likes(p_trip_id uuid)
returns integer
language plpgsql
as $function$
declare
  new_count integer;
begin
  update public.completed_trips t
     set likes_count = (
       select count(*) from public.completed_trip_likes l
        where l.trip_id = p_trip_id
     )
   where t.id = p_trip_id
  returning likes_count into new_count;
  return new_count;
end;
$function$;

create or replace function public.trg_completed_trip_likes_sync()
returns trigger
language plpgsql
as $function$
begin
  perform public.recompute_completed_trip_likes(coalesce(new.trip_id, old.trip_id));
  return null;
end;
$function$;

drop trigger if exists on_completed_trip_likes_sync on public.completed_trip_likes;
create trigger on_completed_trip_likes_sync
  after insert or delete on public.completed_trip_likes
  for each row execute function public.trg_completed_trip_likes_sync();

create or replace function public.like_completed_trip(p_trip_id uuid, p_visitor_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.completed_trip_likes (trip_id, visitor_id)
  values (p_trip_id, p_visitor_id)
  on conflict (trip_id, visitor_id) do nothing;
  return public.recompute_completed_trip_likes(p_trip_id);
end;
$function$;

create or replace function public.unlike_completed_trip(p_trip_id uuid, p_visitor_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
begin
  delete from public.completed_trip_likes
   where trip_id = p_trip_id and visitor_id = p_visitor_id;
  return public.recompute_completed_trip_likes(p_trip_id);
end;
$function$;

grant execute on function public.like_completed_trip(uuid, text) to anon, authenticated;
grant execute on function public.unlike_completed_trip(uuid, text) to anon, authenticated;

-- Backfill: if any likes_count values already exist from the old raw
-- counter, they have no matching completed_trip_likes rows yet, so reset
-- them to 0 (accurate — nobody's dedupe-checked like is actually recorded
-- yet under the new scheme).
update public.completed_trips set likes_count = 0 where likes_count > 0;
