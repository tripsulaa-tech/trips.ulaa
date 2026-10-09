-- =============================================================================
-- add_truth_or_dare_share_links.sql
-- =============================================================================
-- Short share links for Truth or Dare (e.g. /play/truth-or-dare/k7x2).
-- Run this ONCE in the Supabase SQL editor. It is safe to run again.
--
-- Admin -> Games -> Play Truth or Dare saves the chosen players under a 4
-- character code. Opening /play/truth-or-dare/<code> loads those players and
-- fills the setup screen, so travellers don't type names.
--
--   * The table holds only display names (first names) and the trip title:
--     no phones, emails or booking data. RLS is on with NO policy, so the REST
--     API can never read or write it directly.
--   * Only the functions below touch it. Creating / updating a link is
--     admin-only (public.is_admin()); anyone can open a link by its code.
--   * A link expires 30 days after it was last created or updated, and
--     expired rows are deleted whenever a new link is made.
-- =============================================================================

create table if not exists public.tod_share_links (
  code        text primary key check (code ~ '^[a-z0-9]{4}$'),
  trip_title  text not null default '' check (char_length(trip_title) <= 120),
  players     text[] not null check (cardinality(players) between 2 and 40),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);

alter table public.tod_share_links enable row level security;
revoke all on public.tod_share_links from anon, authenticated;

-- Trims names, drops control characters and blanks, caps each at 18 chars.
create or replace function public.tod_clean_players(p text[])
returns text[]
language sql immutable set search_path = public as $$
  select coalesce(
    array_agg(left(btrim(regexp_replace(n, '[[:cntrl:]]', '', 'g')), 18) order by i)
      filter (where btrim(regexp_replace(n, '[[:cntrl:]]', '', 'g')) <> ''),
    '{}'::text[]
  )
  from unnest(coalesce(p, '{}'::text[])) with ordinality as t(n, i)
$$;

-- Admin only. Returns the new 4-character code.
create or replace function public.tod_create_share(p_players text[], p_trip_title text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code text;
  v_players text[];
  v_try int := 0;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  v_players := public.tod_clean_players(p_players);
  if cardinality(v_players) < 2 or cardinality(v_players) > 40 then
    raise exception 'Truth or Dare needs 2 to 40 players';
  end if;

  delete from public.tod_share_links where expires_at < now();

  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.tod_share_links (code, trip_title, players)
      values (v_code, left(coalesce(p_trip_title, ''), 120), v_players);
      return v_code;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 25 then raise exception 'Could not make a free code, try again'; end if;
    end;
  end loop;
end $$;

-- Admin only. Keeps the same code but swaps in a new player list, so a link
-- that was already shared stays valid. Returns false if the code is unknown.
create or replace function public.tod_update_share(p_code text, p_players text[], p_trip_title text default '')
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_players text[];
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  v_players := public.tod_clean_players(p_players);
  if cardinality(v_players) < 2 or cardinality(v_players) > 40 then
    raise exception 'Truth or Dare needs 2 to 40 players';
  end if;
  update public.tod_share_links
     set players = v_players,
         trip_title = left(coalesce(p_trip_title, ''), 120),
         expires_at = now() + interval '30 days'
   where code = lower(p_code);
  return found;
end $$;

-- Anyone with the code. Null when the code is unknown or expired.
create or replace function public.tod_get_share(p_code text)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('players', players, 'trip_title', trip_title)
    from public.tod_share_links
   where code = lower(p_code) and expires_at > now()
$$;

revoke execute on function public.tod_create_share(text[], text)        from public, anon, authenticated;
revoke execute on function public.tod_update_share(text, text[], text)  from public, anon, authenticated;
revoke execute on function public.tod_get_share(text)                   from public, anon, authenticated;
grant  execute on function public.tod_create_share(text[], text)        to authenticated;
grant  execute on function public.tod_update_share(text, text[], text)  to authenticated;
grant  execute on function public.tod_get_share(text)                   to anon, authenticated;
