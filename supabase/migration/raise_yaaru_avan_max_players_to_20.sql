-- =============================================================================
-- raise_yaaru_avan_max_players_to_20.sql
-- =============================================================================
-- Two changes to Yaaru Avan? online play, matching the Undercover rules:
--
--   1. Rooms take 3 to 20 players (it was 3 to 15).
--        * _ya_roles_valid          : accepts 3..20 players
--        * yaaru_avan_join          : a room is full at 20
--        * yaaru_avan_share_links   : saved name lists may hold up to 20
--        * yaaru_avan_create_share / yaaru_avan_update_share: same limit
--
--   2. The Goddess of Justice is announced to everyone once the words are dealt.
--        * yaaru_avan_state now sets players[].public_special = 'tripLeader' for the
--          player who holds that ability (a Falafel Vendor's drawn ability counts too),
--          from the deal until the round ends. Every other role stays secret.
--
-- Run ONCE in the Supabase SQL editor, AFTER rename_stowaway_to_yaaru_avan.sql and
-- yaaru_avan_pickpocket_always_guesses.sql. Safe to run again. Deploy the matching app
-- build (the "room full" message and the Goddess banner come from it).
-- Nothing is dropped, and no table data changes.
-- =============================================================================

-- ── 1. Up to 20 players ─────────────────────────────────────────────────────

create or replace function public._ya_roles_valid(n int, s int, l int)
returns boolean language sql immutable as $$
  select n between 3 and 20 and s >= 0 and l >= 0 and (s + l) >= 1
     and l <= (case when n >= 10 then 2 else 1 end)
     and (n - s - l) > (s + l);
$$;

create or replace function public.yaaru_avan_join(p_code text, p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.yaaru_avan_rooms; v_player uuid; v_name text := _ya_clean_name(p_name); n int; base text; k int := 1;
begin
  if p_token is null then raise exception 'token_required'; end if;
  select * into r from yaaru_avan_rooms where code = upper(btrim(p_code)) and expires_at > now();
  if not found then raise exception 'room_not_found'; end if;
  r := _ya_lock_room(r.id);

  select p.id into v_player from yaaru_avan_players p join yaaru_avan_player_private pp on pp.player_id = p.id
   where p.room_id = r.id and pp.token = p_token;
  if found then return jsonb_build_object('code', r.code, 'player_id', v_player); end if;

  if v_name = '' then raise exception 'name_required'; end if;
  if r.locked then raise exception 'room_locked'; end if;
  if r.phase <> 'lobby' then raise exception 'game_started'; end if;
  select count(*) into n from yaaru_avan_players where room_id = r.id;
  if n >= 20 then raise exception 'room_full'; end if;

  base := v_name;
  while exists (select 1 from yaaru_avan_players where room_id = r.id and lower(name) = lower(v_name)) loop
    k := k + 1;
    v_name := left(base, 18 - length(k::text) - 1) || ' ' || k;
  end loop;

  insert into yaaru_avan_players (room_id, name) values (r.id, v_name) returning id into v_player;
  insert into yaaru_avan_player_private (player_id, token) values (v_player, p_token);
  return jsonb_build_object('code', r.code, 'player_id', v_player);
end $$;

-- Saved name lists (share links): replace the old "3 to 15" check with "3 to 20".
do $$
declare c record;
begin
  if to_regclass('public.yaaru_avan_share_links') is null then return; end if;
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.yaaru_avan_share_links'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%cardinality(players)%'
  loop
    execute format('alter table public.yaaru_avan_share_links drop constraint %I', c.conname);
  end loop;
  alter table public.yaaru_avan_share_links
    add constraint yaaru_avan_share_links_players_check
    check (cardinality(players) between 3 and 20);
end $$;

create or replace function public.yaaru_avan_create_share(p_players text[], p_trip_title text default '')
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
  v_players := public.yaaru_avan_clean_players(p_players);
  if cardinality(v_players) < 3 or cardinality(v_players) > 20 then
    raise exception 'Yaaru Avan? needs 3 to 20 players';
  end if;

  delete from public.yaaru_avan_share_links where expires_at < now();

  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.yaaru_avan_share_links (code, trip_title, players)
      values (v_code, left(coalesce(p_trip_title, ''), 120), v_players);
      return v_code;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 25 then raise exception 'Could not make a free code, try again'; end if;
    end;
  end loop;
end $$;

create or replace function public.yaaru_avan_update_share(p_code text, p_players text[], p_trip_title text default '')
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_players text[];
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  v_players := public.yaaru_avan_clean_players(p_players);
  if cardinality(v_players) < 3 or cardinality(v_players) > 20 then
    raise exception 'Yaaru Avan? needs 3 to 20 players';
  end if;
  update public.yaaru_avan_share_links
     set players = v_players,
         trip_title = left(coalesce(p_trip_title, ''), 120),
         expires_at = now() + interval '30 days'
   where code = lower(p_code);
  return found;
end $$;

-- ── 2. The Goddess of Justice is announced ──────────────────────────────────

create or replace function public.yaaru_avan_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; rp public.yaaru_avan_room_private;
        mypriv public.yaaru_avan_player_private; n int; show_counts boolean; players jsonb; host_away boolean;
        fs int; fl int; room_json jsonb; partner_name text; i_vote boolean;
begin
  me := _ya_me(p_code, p_token);
  update yaaru_avan_player_private set last_seen = now() where player_id = me.id;
  select * into r from yaaru_avan_rooms where id = me.room_id;
  select * into rp from yaaru_avan_room_private where room_id = r.id;
  select * into mypriv from yaaru_avan_player_private where player_id = me.id;
  select count(*) into n from yaaru_avan_players where room_id = r.id;
  show_counts := (me.id = r.host_id) or not r.hide_counts;

  if n >= 3 then
    select f.fit_s, f.fit_l into fs, fl from public._ya_fit_roles(n, rp.stowaways, rp.lost) f;
  else
    fs := rp.stowaways; fl := rp.lost;
  end if;

  room_json := to_jsonb(r);
  if r.out_player is not distinct from me.id then
    room_json := room_json || jsonb_build_object('guess_match', null);
  end if;

  select name into partner_name from yaaru_avan_players where id = mypriv.partner;
  i_vote := me.alive or (mypriv.out_order is not null and coalesce(mypriv.dip_as, mypriv.special) = 'backseatRider');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'seat', p.seat, 'seat_idx', p.seat_idx, 'alive', p.alive,
           'voted', p.voted, 'ready', p.ready, 'points', p.points, 'survived', p.survived,
           'correct_votes', p.correct_votes, 'wrong_votes', p.wrong_votes, 'lost_wins', p.lost_wins,
           'away', (pv.last_seen < now() - interval '45 seconds'),
           'voter', (p.alive or (pv.out_order is not null and coalesce(pv.dip_as, pv.special) = 'backseatRider')),
           -- The Goddess of Justice is announced to everyone once the words are dealt.
           -- Every other role stays secret.
           'public_special', case when r.specials
                                   and r.phase in ('deal','describe','vote','tiebreak','offboard','guess','payback')
                                   and coalesce(pv.dip_as, pv.special) = 'tripLeader'
                                  then 'tripLeader' else null end
         ) order by p.joined_at), '[]'::jsonb)
    into players
    from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
   where p.room_id = r.id;

  select (pv.last_seen < now() - interval '60 seconds') into host_away
    from yaaru_avan_player_private pv where pv.player_id = r.host_id;

  return jsonb_build_object(
    'now', now(),
    'me', jsonb_build_object('id', me.id, 'role', mypriv.role, 'word', mypriv.word,
                             'special', coalesce(mypriv.dip_as, mypriv.special),
                             'dip', (mypriv.dip_as is not null),
                             'partner', partner_name,
                             'can_vote', i_vote),
    'room', room_json,
    'players', players,
    'host_away', coalesce(host_away, true),
    'counts', case when show_counts then
        jsonb_build_object('explorers', n - fs - fl, 'stowaways', fs, 'lost', fl)
      else null end
  );
end $$;

notify pgrst, 'reload schema';
