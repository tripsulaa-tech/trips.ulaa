-- =============================================================================
-- add_find_my_twin_roster.sql
-- =============================================================================
-- Find My Twin: a room can carry the trip group's names. Players then TAP their
-- own name instead of typing one, a name can only be taken once, and the admin
-- can see who has joined. Rooms made without a list work exactly as before.
-- Run ONCE in the Supabase SQL editor, after add_find_my_twin.sql. Safe to re-run.
-- =============================================================================

alter table public.ftwin_rooms add column if not exists roster text[] not null default '{}';

-- Replace create_room (it gains the p_roster argument). The old 3-argument version
-- must go first, otherwise a call with 3 arguments would match both.
drop function if exists public.ftwin_create_room(text, uuid, text);

create or replace function public.ftwin_create_room(p_name text, p_token uuid, p_trip_title text default 'Ulaa', p_roster text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _ft_clean_name(p_name); i int := 0;
        v_roster text[];
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_name = '' then raise exception 'name_required'; end if;
  if p_token is null then raise exception 'token_required'; end if;
  -- The names the group may join as (cleaned, no repeats, in the order given). Empty = anyone, any name.
  select coalesce(array_agg(x order by ord), '{}') into v_roster from (
    select distinct on (lower(x)) x, ord
      from (select _ft_clean_name(n) as x, ord from unnest(coalesce(p_roster, '{}'::text[])) with ordinality as t(n, ord)) a
     where x <> ''
     order by lower(x), ord
  ) b;
  if cardinality(v_roster) > 24 then v_roster := v_roster[1:24]; end if;
  perform ftwin_cleanup();
  if (select count(*) from ftwin_rooms) >= 500 then raise exception 'too_many_rooms'; end if;

  loop
    v_code := '';
    for k in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from ftwin_rooms where code = v_code);
    i := i + 1;
    if i > 30 then raise exception 'try_again'; end if;
  end loop;

  insert into ftwin_rooms (code, trip_title, roster)
    values (v_code, left(btrim(coalesce(nullif(p_trip_title, ''), 'Ulaa')), 60), v_roster) returning id into v_room;
  insert into ftwin_players (room_id, name) values (v_room, v_name) returning id into v_player;
  insert into ftwin_player_private (player_id, token) values (v_player, p_token);
  update ftwin_rooms set host_id = v_player where id = v_room;
  return jsonb_build_object('code', v_code, 'player_id', v_player);
end $$;

create or replace function public.ftwin_join(p_code text, p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.ftwin_rooms; v_name text := _ft_clean_name(p_name); v_player uuid; v_count int; v_listed text;
begin
  if v_name = '' then raise exception 'name_required'; end if;
  if p_token is null then raise exception 'token_required'; end if;
  select * into r from ftwin_rooms where code = upper(btrim(p_code)) and expires_at > now();
  if not found then raise exception 'room_not_found'; end if;
  r := _ft_lock_room(r.id);

  select p.id into v_player from ftwin_players p join ftwin_player_private pp on pp.player_id = p.id
   where p.room_id = r.id and pp.token = p_token;
  if found then
    return jsonb_build_object('code', r.code, 'player_id', v_player);
  end if;

  if r.locked then raise exception 'room_locked'; end if;
  if r.phase <> 'lobby' then raise exception 'game_started'; end if;
  select count(*) into v_count from ftwin_players where room_id = r.id;
  if v_count >= 24 then raise exception 'room_full'; end if;
  -- A room made for a trip group only takes the names on its list (stored with the list's spelling).
  if cardinality(r.roster) > 0 then
    select n into v_listed from unnest(r.roster) as n where lower(n) = lower(v_name) limit 1;
    if v_listed is null then raise exception 'name_not_listed'; end if;
    v_name := v_listed;
  end if;
  if exists (select 1 from ftwin_players where room_id = r.id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;

  insert into ftwin_players (room_id, name) values (r.id, v_name) returning id into v_player;
  insert into ftwin_player_private (player_id, token) values (v_player, p_token);
  perform _ft_bump(r.id);
  return jsonb_build_object('code', r.code, 'player_id', v_player);
end $$;

-- Who may join, and who already has: for the "tap your name" screen. No token needed.
create or replace function public.ftwin_roster(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.ftwin_rooms;
begin
  select * into r from ftwin_rooms where code = upper(btrim(p_code)) and expires_at > now();
  if not found then return jsonb_build_object('exists', false); end if;
  return jsonb_build_object('exists', true, 'locked', r.locked, 'phase', r.phase,
    'names', to_jsonb(r.roster),
    'taken', coalesce((select jsonb_agg(name) from ftwin_players where room_id = r.id), '[]'::jsonb));
end $$;

grant execute on function
  public.ftwin_create_room(text, uuid, text, text[]),
  public.ftwin_join(text, text, uuid),
  public.ftwin_roster(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
