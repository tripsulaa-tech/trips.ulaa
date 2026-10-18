-- =============================================================================
-- yaaru_avan_keep_points_when_removed.sql
-- =============================================================================
-- Online Yaaru Avan?: a player the host removes (or who leaves) from the lobby between
-- rounds keeps their points, and gets them back when they join the room again later
-- with the same name. Same idea as the one-phone game's "Change players or settings".
--
--   * A removed player is deleted from the room as before (so they sit out, and leave the
--     scoreboard and awards), but their stats are parked in a PRIVATE table,
--     yaaru_avan_benched, one row per name per room.
--   * Joining the lobby again with the same name (capitals do not matter) restores those
--     stats and clears the parked row. A different spelling is a new player on 0 points.
--   * "Play again" (a reset to round 0) clears every parked row for that room, so old
--     points never come back into a fresh game. Rooms deleted after 6 hours take their
--     parked rows with them.
--   * Nothing is parked in a room that has not played a round yet.
--
-- New / replaced objects
--   table    yaaru_avan_benched                (private: RLS on, no policy, no grants)
--   function _ya_bench_player(uuid)            (internal)
--   function yaaru_avan_kick, yaaru_avan_leave, yaaru_avan_join   (replaced)
--   trigger  yaaru_avan_rooms_clear_benched    (clears parked rows on a reset)
--   function yaaru_avan_benched(code, token)   (new: who is sitting out, for the lobby)
--
-- Run ONCE in the Supabase SQL editor, AFTER every other yaaru_avan migration (it needs
-- yaaru_avan_join from raise_yaaru_avan_max_players_to_20.sql and the pickpocket_wins
-- column). Safe to run again. Deploy the matching app build for the "Sitting out" list.
-- No existing data changes.
-- =============================================================================

-- ── 1. Parked stats ─────────────────────────────────────────────────────────
create table if not exists public.yaaru_avan_benched (
  room_id         uuid not null references public.yaaru_avan_rooms(id) on delete cascade,
  name_key        text not null,
  name            text not null,
  points          int  not null default 0,
  survived        int  not null default 0,
  correct_votes   int  not null default 0,
  wrong_votes     int  not null default 0,
  pickpocket_wins int  not null default 0,
  benched_at      timestamptz not null default now(),
  primary key (room_id, name_key)
);
alter table public.yaaru_avan_benched enable row level security;
revoke all on public.yaaru_avan_benched from anon, authenticated;

-- ── 2. Park a player's stats (only once the room has played a round) ────────
create or replace function public._ya_bench_player(p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.yaaru_avan_players; rn int;
begin
  select * into pl from yaaru_avan_players where id = p_player;
  if not found then return; end if;
  select round_no into rn from yaaru_avan_rooms where id = pl.room_id;
  if coalesce(rn, 0) < 1 then return; end if;
  insert into yaaru_avan_benched (room_id, name_key, name, points, survived, correct_votes, wrong_votes, pickpocket_wins)
  values (pl.room_id, lower(pl.name), pl.name, pl.points, pl.survived, pl.correct_votes, pl.wrong_votes, pl.pickpocket_wins)
  on conflict (room_id, name_key) do update
    set name = excluded.name, points = excluded.points, survived = excluded.survived,
        correct_votes = excluded.correct_votes, wrong_votes = excluded.wrong_votes,
        pickpocket_wins = excluded.pickpocket_wins, benched_at = now();
end $$;
revoke all on function public._ya_bench_player(uuid) from public, anon, authenticated;

-- ── 3. Host removes a player (lobby only, as before) ────────────────────────
create or replace function public.yaaru_avan_kick(p_code text, p_token uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_player = me.id then raise exception 'cannot_kick_self'; end if;
  perform _ya_bench_player(p_player);
  delete from yaaru_avan_players where id = p_player and room_id = r.id;
end $$;

-- ── 4. A player leaves from the lobby (host hands over to the next player) ──
create or replace function public.yaaru_avan_leave(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; nxt uuid;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase <> 'lobby' then return; end if;
  perform _ya_bench_player(me.id);
  delete from yaaru_avan_players where id = me.id;
  if r.host_id = me.id then
    select id into nxt from yaaru_avan_players where room_id = r.id order by joined_at limit 1;
    if nxt is null then delete from yaaru_avan_rooms where id = r.id;
    else update yaaru_avan_rooms set host_id = nxt where id = r.id; end if;
  end if;
end $$;

-- ── 5. Joining: the same name gets its old points back ──────────────────────
create or replace function public.yaaru_avan_join(p_code text, p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.yaaru_avan_rooms; v_player uuid; v_name text := _ya_clean_name(p_name); n int; base text; k int := 1;
        b public.yaaru_avan_benched; had_bench boolean := false;
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

  -- Was this name removed earlier in this game? (Matched before any " 2" is added.)
  select * into b from yaaru_avan_benched where room_id = r.id and name_key = lower(v_name);
  had_bench := found;

  base := v_name;
  while exists (select 1 from yaaru_avan_players where room_id = r.id and lower(name) = lower(v_name)) loop
    k := k + 1;
    v_name := left(base, 18 - length(k::text) - 1) || ' ' || k;
  end loop;

  insert into yaaru_avan_players (room_id, name) values (r.id, v_name) returning id into v_player;
  insert into yaaru_avan_player_private (player_id, token) values (v_player, p_token);

  -- Only when the name was free (k = 1): someone else already using it is a different person.
  if had_bench and k = 1 then
    update yaaru_avan_players
       set points = b.points, survived = b.survived, correct_votes = b.correct_votes,
           wrong_votes = b.wrong_votes, pickpocket_wins = b.pickpocket_wins
     where id = v_player;
    delete from yaaru_avan_benched where room_id = r.id and name_key = b.name_key;
  end if;

  return jsonb_build_object('code', r.code, 'player_id', v_player);
end $$;

-- ── 6. "Play again" (reset to round 0) forgets everyone who was sitting out ─
create or replace function public._ya_clear_benched_on_reset()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from yaaru_avan_benched where room_id = new.id;
  return new;
end $$;
revoke all on function public._ya_clear_benched_on_reset() from public, anon, authenticated;

drop trigger if exists yaaru_avan_rooms_clear_benched on public.yaaru_avan_rooms;
create trigger yaaru_avan_rooms_clear_benched
  after update of round_no on public.yaaru_avan_rooms
  for each row when (new.round_no = 0 and old.round_no > 0)
  execute function public._ya_clear_benched_on_reset();

-- ── 7. Who is sitting out? (names and points only, for people inside the room) ─
create or replace function public.yaaru_avan_benched(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players;
begin
  me := _ya_me(p_code, p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'points', b.points) order by b.benched_at)
                     from yaaru_avan_benched b where b.room_id = me.room_id), '[]'::jsonb);
end $$;
revoke all on function public.yaaru_avan_benched(text, uuid) from public;
grant execute on function public.yaaru_avan_benched(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
