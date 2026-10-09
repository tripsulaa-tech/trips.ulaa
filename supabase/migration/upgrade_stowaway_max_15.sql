-- =============================================================================
-- upgrade_stowaway_max_15.sql
-- =============================================================================
-- Stowaway now takes up to 15 players (it was 12). Run this ONCE in the
-- Supabase SQL editor if add_stowaway_online.sql and add_stowaway_share_links.sql
-- were already run. It is safe to run again. (Fresh installs do not need it:
-- both original files already say 15.)
-- =============================================================================

-- Share links: allow 3 to 15 saved names.
alter table public.stowaway_share_links drop constraint if exists stowaway_share_links_players_check;
alter table public.stowaway_share_links add constraint stowaway_share_links_players_check
  check (cardinality(players) between 3 and 15);

create or replace function public._sw_roles_valid(n int, s int, l int)
returns boolean language sql immutable as $$
  select n between 3 and 15 and s >= 1 and l >= 0
     and l <= (case when n >= 10 then 2 else 1 end)
     and (n - s - l) > (s + l);
$$;

create or replace function public.stowaway_join(p_code text, p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.stowaway_rooms; v_player uuid; v_name text := _sw_clean_name(p_name); n int; base text; k int := 1;
begin
  if p_token is null then raise exception 'token_required'; end if;
  select * into r from stowaway_rooms where code = upper(btrim(p_code)) and expires_at > now();
  if not found then raise exception 'room_not_found'; end if;
  r := _sw_lock_room(r.id);

  select p.id into v_player from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
   where p.room_id = r.id and pp.token = p_token;
  if found then return jsonb_build_object('code', r.code, 'player_id', v_player); end if;

  if v_name = '' then raise exception 'name_required'; end if;
  if r.locked then raise exception 'room_locked'; end if;
  if r.phase <> 'lobby' then raise exception 'game_started'; end if;
  select count(*) into n from stowaway_players where room_id = r.id;
  if n >= 15 then raise exception 'room_full'; end if;

  base := v_name;
  while exists (select 1 from stowaway_players where room_id = r.id and lower(name) = lower(v_name)) loop
    k := k + 1;
    v_name := left(base, 18 - length(k::text) - 1) || ' ' || k;
  end loop;

  insert into stowaway_players (room_id, name) values (r.id, v_name) returning id into v_player;
  insert into stowaway_player_private (player_id, token) values (v_player, p_token);
  return jsonb_build_object('code', r.code, 'player_id', v_player);
end $$;

create or replace function public.stowaway_create_share(p_players text[], p_trip_title text default '')
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
  v_players := public.stowaway_clean_players(p_players);
  if cardinality(v_players) < 3 or cardinality(v_players) > 15 then
    raise exception 'Stowaway needs 3 to 15 players';
  end if;

  delete from public.stowaway_share_links where expires_at < now();

  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.stowaway_share_links (code, trip_title, players)
      values (v_code, left(coalesce(p_trip_title, ''), 120), v_players);
      return v_code;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 25 then raise exception 'Could not make a free code, try again'; end if;
    end;
  end loop;
end $$;

create or replace function public.stowaway_update_share(p_code text, p_players text[], p_trip_title text default '')
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_players text[];
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  v_players := public.stowaway_clean_players(p_players);
  if cardinality(v_players) < 3 or cardinality(v_players) > 15 then
    raise exception 'Stowaway needs 3 to 15 players';
  end if;
  update public.stowaway_share_links
     set players = v_players,
         trip_title = left(coalesce(p_trip_title, ''), 120),
         expires_at = now() + interval '30 days'
   where code = lower(p_code);
  return found;
end $$;
