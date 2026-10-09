-- =============================================================================
-- add_stowaway_online.sql
-- =============================================================================
-- Online rooms for the Stowaway group game ("Play online" with a 4-letter code).
-- Run this ONCE in the Supabase SQL editor. It is safe to run again.
--
-- HOW SECRETS STAY SECRET
--   * Public tables (stowaway_rooms, stowaway_players) hold only what every
--     player may see: names, seat numbers, whose turn it is, scores, phase.
--     They are readable by anon so Supabase Realtime can push live updates.
--   * Roles, words and tokens live in PRIVATE tables with RLS on and NO policy,
--     so the REST API can never read them. Only the SECURITY DEFINER functions
--     below touch them, and each one checks the caller's secret token first.
--   * A player can only ever receive THEIR OWN role and word (stowaway_state).
--   * Votes are private until everyone has voted, then revealed together.
--   * Nobody writes to any table directly: no insert/update/delete policies.
--
-- No accounts, no personal data. Rooms expire after 6 hours and are deleted
-- (stowaway_cleanup runs whenever a new room is created).
-- =============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.stowaway_rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  host_id          uuid,
  trip_title       text not null default 'Ulaa',
  phase            text not null default 'lobby'
                   check (phase in ('lobby','deal','clues','vote','offboard','guess','roundEnd','final')),
  locked           boolean not null default false,
  level            text not null default 'medium' check (level in ('easy','medium','hard')),
  challenges       boolean not null default true,
  dares            boolean not null default false,
  hide_counts      boolean not null default false,
  round_no         int not null default 0,
  stop_no          int not null default 0,
  start_idx        int not null default 0,
  turn_order       uuid[] not null default '{}',
  turn_pos         int not null default 0,
  timer_started_at timestamptz,
  challenge_id     text,
  dare             text,
  out_player       uuid,
  offboard_at      timestamptz,
  guess_text       text,
  guess_match      boolean,
  outcome          text,
  last_result      jsonb,
  round_summary    jsonb,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '6 hours'
);

create table if not exists public.stowaway_players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.stowaway_rooms(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 18),
  seat          text,
  seat_idx      int not null default 0,
  alive         boolean not null default true,
  voted         boolean not null default false,
  ready         boolean not null default false,
  points        int not null default 0,
  survived      int not null default 0,
  correct_votes int not null default 0,
  wrong_votes   int not null default 0,
  lost_wins     int not null default 0,
  joined_at     timestamptz not null default now()
);
create unique index if not exists stowaway_players_room_name_idx
  on public.stowaway_players (room_id, lower(name));
create index if not exists stowaway_players_room_idx on public.stowaway_players (room_id);

-- PRIVATE: secret token + this round's role and word, one row per player.
create table if not exists public.stowaway_player_private (
  player_id  uuid primary key references public.stowaway_players(id) on delete cascade,
  token      uuid not null,
  role       text check (role in ('explorer','stowaway','lost')),
  word       text,
  last_seen  timestamptz not null default now()
);
create index if not exists stowaway_player_private_token_idx on public.stowaway_player_private (token);

-- PRIVATE: role counts, both words of the current pair, used pairs.
create table if not exists public.stowaway_room_private (
  room_id        uuid primary key references public.stowaway_rooms(id) on delete cascade,
  stowaways      int not null default 1,
  lost           int not null default 0,
  used_pairs     text[] not null default '{}',
  last_category  text,
  explorer_word  text,
  stowaway_word  text,
  category       text
);

-- PRIVATE: votes, hidden until revealed together.
create table if not exists public.stowaway_votes (
  room_id  uuid not null references public.stowaway_rooms(id) on delete cascade,
  voter    uuid not null references public.stowaway_players(id) on delete cascade,
  target   uuid not null references public.stowaway_players(id) on delete cascade,
  primary key (room_id, voter)
);

-- PRIVATE: the word bank (same pairs as stowawayWords.ts).
create table if not exists public.stowaway_word_pairs (
  id        text primary key,
  category  text not null,
  level     text not null check (level in ('easy','medium','hard')),
  a         text not null,
  b         text not null
);

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.stowaway_rooms          enable row level security;
alter table public.stowaway_players        enable row level security;
alter table public.stowaway_player_private enable row level security;
alter table public.stowaway_room_private   enable row level security;
alter table public.stowaway_votes          enable row level security;
alter table public.stowaway_word_pairs     enable row level security;

-- Only the two public tables can be read (needed for Realtime). Nothing can be
-- written through the API: every change goes through the functions below.
drop policy if exists "Public read stowaway rooms" on public.stowaway_rooms;
create policy "Public read stowaway rooms" on public.stowaway_rooms for select using (true);
drop policy if exists "Public read stowaway players" on public.stowaway_players;
create policy "Public read stowaway players" on public.stowaway_players for select using (true);

revoke all on public.stowaway_rooms, public.stowaway_players, public.stowaway_player_private,
  public.stowaway_room_private, public.stowaway_votes, public.stowaway_word_pairs from anon, authenticated;
grant select on public.stowaway_rooms, public.stowaway_players to anon, authenticated;

-- Realtime: lets phones hear about changes. Deletes need the full old row.
alter table public.stowaway_players replica identity full;
alter table public.stowaway_rooms   replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.stowaway_rooms;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.stowaway_players; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ── Internal helpers (not callable from the API) ─────────────────────────────

create or replace function public._sw_roles_valid(n int, s int, l int)
returns boolean language sql immutable as $$
  select n between 3 and 15 and s >= 1 and l >= 0
     and l <= (case when n >= 10 then 2 else 1 end)
     and (n - s - l) > (s + l);
$$;

create or replace function public._sw_clean_name(p text)
returns text language sql immutable as $$
  select left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), 18);
$$;

-- Finds the caller's player row from room code + secret token.
create or replace function public._sw_me(p_code text, p_token uuid)
returns public.stowaway_players
language plpgsql security definer set search_path = public as $$
declare v public.stowaway_players;
begin
  select p.* into v
    from stowaway_players p
    join stowaway_player_private pp on pp.player_id = p.id
    join stowaway_rooms r on r.id = p.room_id
   where r.code = upper(btrim(p_code)) and pp.token = p_token and r.expires_at > now();
  if not found then raise exception 'not_in_room'; end if;
  return v;
end $$;

-- Locks the room row for the rest of the transaction and returns it.
create or replace function public._sw_lock_room(p_room uuid)
returns public.stowaway_rooms
language plpgsql security definer set search_path = public as $$
declare r public.stowaway_rooms;
begin
  select * into r from stowaway_rooms where id = p_room for update;
  return r;
end $$;

-- 'explorers' | 'stowaways' | null: same rule as stowawayEngine.checkWinner.
create or replace function public._sw_winner(p_room uuid)
returns text language plpgsql security definer set search_path = public as $$
declare ex int; sn int;
begin
  select count(*) filter (where pp.role = 'explorer'),
         count(*) filter (where pp.role in ('stowaway','lost'))
    into ex, sn
    from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
   where p.room_id = p_room and p.alive;
  if sn = 0 then return 'explorers'; end if;
  if sn >= ex then return 'stowaways'; end if;
  return null;
end $$;

-- Starts a new stop: alive players speak in seat order from seat `from_idx`.
create or replace function public._sw_begin_stop(p_room uuid, p_stop int, p_from int)
returns void language plpgsql security definer set search_path = public as $$
declare n int; ord uuid[];
begin
  select count(*) into n from stowaway_players where room_id = p_room;
  select coalesce(array_agg(id order by (((seat_idx - p_from) % n) + n) % n), '{}')
    into ord from stowaway_players where room_id = p_room and alive;
  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = 'clues', stop_no = p_stop, turn_order = ord, turn_pos = 0,
         timer_started_at = null, out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, last_result = null
   where id = p_room;
end $$;

-- Ends the round: scoring identical to stowawayEngine.roundPoints.
create or replace function public._sw_finish(p_room uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.stowaway_room_private; summary jsonb;
begin
  select * into rp from stowaway_room_private where room_id = p_room;

  create temp table _sw_gain on commit drop as
  select p.id,
         case
           when p_outcome = 'explorers'  and pp.role = 'explorer'                  then 2
           when p_outcome = 'stowaways'  and p.alive and pp.role <> 'explorer'     then 3
           when p_outcome = 'lost-steal' and p.alive and pp.role = 'lost'          then 4
           else 0 end as gained,
         pp.role as role
    from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
   where p.room_id = p_room;

  update stowaway_players p
     set points   = p.points + g.gained,
         survived = p.survived + (case when p_outcome = 'stowaways'  and p.alive and g.role = 'stowaway' then 1 else 0 end),
         lost_wins = p.lost_wins + (case when p_outcome = 'lost-steal' and p.alive and g.role = 'lost' then 1 else 0 end)
    from _sw_gain g where g.id = p.id;

  select jsonb_build_object(
           'outcome', p_outcome,
           'explorer_word', rp.explorer_word,
           'stowaway_word', rp.stowaway_word,
           'category', rp.category,
           'players', coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'role', g.role, 'gained', g.gained)), '[]'::jsonb))
    into summary from _sw_gain g;
  drop table _sw_gain;

  update stowaway_rooms set phase = 'roundEnd', outcome = p_outcome, round_summary = summary,
         timer_started_at = null where id = p_room;
end $$;

-- Counts votes. Tie → everyone votes again. Otherwise the top player goes offboard.
create or replace function public._sw_resolve_vote(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare top_n int; tied uuid[]; out_id uuid; out_role text; votes jsonb; tie_names jsonb;
begin
  select max(c) into top_n from (select count(*) c from stowaway_votes where room_id = p_room group by target) t;
  if top_n is null then return; end if;
  select array_agg(target) into tied from
    (select target from stowaway_votes where room_id = p_room group by target having count(*) = top_n) t;

  if cardinality(tied) > 1 then
    select jsonb_agg(p.name order by p.name) into tie_names from stowaway_players p where p.id = any(tied);
    select coalesce(jsonb_agg(jsonb_build_object('from', v.name, 'to', t.name)), '[]'::jsonb) into votes
      from stowaway_votes sv join stowaway_players v on v.id = sv.voter join stowaway_players t on t.id = sv.target
     where sv.room_id = p_room;
    delete from stowaway_votes where room_id = p_room;
    update stowaway_players set voted = false where room_id = p_room;
    update stowaway_rooms set last_result = jsonb_build_object('tie', true, 'names', tie_names, 'votes', votes)
     where id = p_room;
    return;
  end if;

  out_id := tied[1];
  select role into out_role from stowaway_player_private where player_id = out_id;

  select coalesce(jsonb_agg(jsonb_build_object('from', v.name, 'to', t.name)), '[]'::jsonb) into votes
    from stowaway_votes sv join stowaway_players v on v.id = sv.voter join stowaway_players t on t.id = sv.target
   where sv.room_id = p_room;

  -- Vote awards: pointing at a sneaky player was right, at an Explorer wrong.
  update stowaway_players p
     set correct_votes = p.correct_votes + (case when out_role <> 'explorer' then 1 else 0 end),
         wrong_votes   = p.wrong_votes   + (case when out_role =  'explorer' then 1 else 0 end)
   where p.id in (select voter from stowaway_votes where room_id = p_room and target = out_id and voter <> out_id);

  update stowaway_players set alive = false where id = out_id;
  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = 'offboard', out_player = out_id, offboard_at = now(), timer_started_at = null,
         last_result = jsonb_build_object('tie', false, 'out', out_id, 'role', out_role, 'votes', votes)
   where id = p_room;
end $$;

-- Deletes expired rooms (and, by cascade, everything attached to them).
create or replace function public.stowaway_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from stowaway_rooms where expires_at < now();
$$;

-- ── Public functions (called from the app) ───────────────────────────────────

-- Create a room. Returns the 4-letter code and your player id.
create or replace function public.stowaway_create_room(p_name text, p_token uuid, p_trip_title text default 'Ulaa')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _sw_clean_name(p_name); i int := 0;
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_name = '' then raise exception 'name_required'; end if;
  if p_token is null then raise exception 'token_required'; end if;
  perform stowaway_cleanup();
  if (select count(*) from stowaway_rooms) >= 500 then raise exception 'too_many_rooms'; end if;

  loop
    v_code := '';
    for k in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from stowaway_rooms where code = v_code);
    i := i + 1;
    if i > 30 then raise exception 'try_again'; end if;
  end loop;

  insert into stowaway_rooms (code, trip_title)
    values (v_code, left(btrim(coalesce(nullif(p_trip_title, ''), 'Ulaa')), 60)) returning id into v_room;
  insert into stowaway_players (room_id, name) values (v_room, v_name) returning id into v_player;
  insert into stowaway_player_private (player_id, token) values (v_player, p_token);
  insert into stowaway_room_private (room_id, stowaways, lost) values (v_room, 1, 0);
  update stowaway_rooms set host_id = v_player where id = v_room;
  return jsonb_build_object('code', v_code, 'player_id', v_player);
end $$;

-- A quick look before joining (is the code real, is it locked).
create or replace function public.stowaway_peek(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.stowaway_rooms;
begin
  select * into r from stowaway_rooms where code = upper(btrim(p_code)) and expires_at > now();
  if not found then return jsonb_build_object('exists', false); end if;
  return jsonb_build_object('exists', true, 'locked', r.locked, 'phase', r.phase,
    'trip_title', r.trip_title,
    'players', (select count(*) from stowaway_players where room_id = r.id));
end $$;

-- Join a room (or get back into your seat if this token is already in it).
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

-- Everything one phone needs: room, players, and ONLY your own role and word.
create or replace function public.stowaway_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; rp public.stowaway_room_private;
        mypriv public.stowaway_player_private; n int; show_counts boolean; players jsonb; host_away boolean;
begin
  me := _sw_me(p_code, p_token);
  update stowaway_player_private set last_seen = now() where player_id = me.id;
  select * into r from stowaway_rooms where id = me.room_id;
  select * into rp from stowaway_room_private where room_id = r.id;
  select * into mypriv from stowaway_player_private where player_id = me.id;
  select count(*) into n from stowaway_players where room_id = r.id;
  show_counts := (me.id = r.host_id) or not r.hide_counts;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'seat', p.seat, 'seat_idx', p.seat_idx, 'alive', p.alive,
           'voted', p.voted, 'ready', p.ready, 'points', p.points, 'survived', p.survived,
           'correct_votes', p.correct_votes, 'wrong_votes', p.wrong_votes, 'lost_wins', p.lost_wins,
           'away', (pv.last_seen < now() - interval '45 seconds')
         ) order by p.joined_at), '[]'::jsonb)
    into players
    from stowaway_players p join stowaway_player_private pv on pv.player_id = p.id
   where p.room_id = r.id;

  select (pv.last_seen < now() - interval '60 seconds') into host_away
    from stowaway_player_private pv where pv.player_id = r.host_id;

  return jsonb_build_object(
    'now', now(),
    'me', jsonb_build_object('id', me.id, 'role', mypriv.role, 'word', mypriv.word),
    'room', to_jsonb(r),
    'players', players,
    'host_away', coalesce(host_away, true),
    'counts', case when show_counts then
        jsonb_build_object('explorers', n - rp.stowaways - rp.lost, 'stowaways', rp.stowaways, 'lost', rp.lost)
      else null end
  );
end $$;

create or replace function public.stowaway_ping(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players;
begin
  me := _sw_me(p_code, p_token);
  update stowaway_player_private set last_seen = now() where player_id = me.id;
end $$;

-- If the host's phone has gone quiet for over a minute, anyone can take over.
create or replace function public.stowaway_claim_host(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; seen timestamptz;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  select last_seen into seen from stowaway_player_private where player_id = r.host_id;
  if r.host_id is not null and found and seen > now() - interval '60 seconds' then raise exception 'host_present'; end if;
  update stowaway_rooms set host_id = me.id where id = r.id;
end $$;

create or replace function public.stowaway_set_settings(
  p_code text, p_token uuid, p_stowaways int, p_lost int, p_level text,
  p_hide_counts boolean, p_challenges boolean, p_dares boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'bad_level'; end if;
  update stowaway_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         challenges = coalesce(p_challenges, true), dares = coalesce(p_dares, false) where id = r.id;
  update stowaway_room_private set stowaways = greatest(1, least(coalesce(p_stowaways, 1), 12)),
         lost = greatest(0, least(coalesce(p_lost, 0), 2)) where room_id = r.id;
end $$;

create or replace function public.stowaway_set_locked(p_code text, p_token uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  update stowaway_rooms set locked = coalesce(p_locked, false) where id = r.id;
end $$;

create or replace function public.stowaway_kick(p_code text, p_token uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_player = me.id then raise exception 'cannot_kick_self'; end if;
  delete from stowaway_players where id = p_player and room_id = r.id;
end $$;

-- Leave while still in the lobby. The host leaving hands the room to the next player.
create or replace function public.stowaway_leave(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; nxt uuid;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'lobby' then return; end if;
  delete from stowaway_players where id = me.id;
  if r.host_id = me.id then
    select id into nxt from stowaway_players where room_id = r.id order by joined_at limit 1;
    if nxt is null then delete from stowaway_rooms where id = r.id;
    else update stowaway_rooms set host_id = nxt where id = r.id; end if;
  end if;
end $$;

-- Host deals a new round. p_reset = true starts a fresh game with zero scores.
create or replace function public.stowaway_start_round(
  p_code text, p_token uuid, p_challenge text default null, p_dare text default null, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; rp public.stowaway_room_private;
        n int; s int; l int; pair public.stowaway_word_pairs; flip boolean; ew text; sw text;
        roles text[]; i int := 0; pid uuid; seat_no text; seats text[] := '{}';
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase not in ('lobby','roundEnd','final') then raise exception 'wrong_phase'; end if;
  select * into rp from stowaway_room_private where room_id = r.id;
  select count(*) into n from stowaway_players where room_id = r.id;
  if n < 3 then raise exception 'need_more_players'; end if;

  -- Shrink to a valid split if players changed since the host picked roles.
  s := rp.stowaways; l := rp.lost;
  l := least(l, case when n >= 10 then 2 else 1 end);
  while not _sw_roles_valid(n, s, l) and l > 0 loop l := l - 1; end loop;
  while not _sw_roles_valid(n, s, l) and s > 1 loop s := s - 1; end loop;
  if not _sw_roles_valid(n, s, l) then raise exception 'bad_roles'; end if;

  if p_reset then
    update stowaway_players set points = 0, survived = 0, correct_votes = 0, wrong_votes = 0, lost_wins = 0
     where room_id = r.id;
    update stowaway_rooms set round_no = 0 where id = r.id;
    update stowaway_room_private set used_pairs = '{}', last_category = null where room_id = r.id;
    select * into rp from stowaway_room_private where room_id = r.id;
  end if;

  -- Word pair: not used yet, and not the same category twice in a row.
  select * into pair from stowaway_word_pairs
   where level = r.level and not (id = any(rp.used_pairs)) and category is distinct from rp.last_category
   order by random() limit 1;
  if not found then
    select * into pair from stowaway_word_pairs
     where level = r.level and not (id = any(rp.used_pairs)) order by random() limit 1;
  end if;
  if not found then
    update stowaway_room_private set used_pairs = '{}' where room_id = r.id;
    select * into pair from stowaway_word_pairs where level = r.level
     and category is distinct from rp.last_category order by random() limit 1;
    if not found then select * into pair from stowaway_word_pairs where level = r.level order by random() limit 1; end if;
  end if;
  if pair.id is null then raise exception 'no_words'; end if;

  flip := random() < 0.5;
  ew := case when flip then pair.a else pair.b end;
  sw := case when flip then pair.b else pair.a end;

  roles := array_cat(array_cat(array_fill('explorer'::text, array[n - s - l]),
                               array_fill('stowaway'::text, array[s])),
                     case when l > 0 then array_fill('lost'::text, array[l]) else '{}'::text[] end);

  -- Shuffle players: seat order and roles are independent random shuffles.
  for pid in select id from stowaway_players where room_id = r.id order by random() loop
    i := i + 1;
    loop
      seat_no := (1 + floor(random() * 28))::int || substr('ABCDEF', 1 + floor(random() * 6)::int, 1);
      exit when not (seat_no = any(seats));
    end loop;
    seats := array_append(seats, seat_no);
    update stowaway_players set seat_idx = i - 1, seat = seat_no, alive = true, voted = false, ready = false where id = pid;
  end loop;

  i := 0;
  for pid in select id from stowaway_players where room_id = r.id order by random() loop
    i := i + 1;
    update stowaway_player_private
       set role = roles[i], word = case roles[i] when 'explorer' then ew when 'stowaway' then sw else null end
     where player_id = pid;
  end loop;

  delete from stowaway_votes where room_id = r.id;
  update stowaway_room_private
     set used_pairs = array_append(used_pairs, pair.id), last_category = pair.category,
         explorer_word = ew, stowaway_word = sw, category = pair.category
   where room_id = r.id;
  update stowaway_rooms
     set phase = 'deal', round_no = round_no + 1, stop_no = 1, start_idx = floor(random() * n)::int,
         turn_order = '{}', turn_pos = 0, timer_started_at = null, out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, outcome = null, last_result = null, round_summary = null,
         challenge_id = case when r.challenges then left(p_challenge, 40) else null end,
         dare = case when r.dares then left(p_dare, 140) else null end
   where id = r.id;
end $$;

-- "I have seen my boarding pass."
create or replace function public.stowaway_ready(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players;
begin
  me := _sw_me(p_code, p_token);
  update stowaway_players set ready = true where id = me.id
    and exists (select 1 from stowaway_rooms where id = me.room_id and phase = 'deal');
end $$;

create or replace function public.stowaway_begin_clues(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'deal' then raise exception 'wrong_phase'; end if;
  perform _sw_begin_stop(r.id, 1, r.start_idx);
end $$;

-- Start (true) or reset (false) the shared 15 second speaking timer.
create or replace function public.stowaway_timer(p_code text, p_token uuid, p_running boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'clues' then return; end if;
  if r.host_id <> me.id and r.turn_order[r.turn_pos + 1] is distinct from me.id then raise exception 'not_your_turn'; end if;
  update stowaway_rooms set timer_started_at = case when p_running then now() else null end where id = r.id;
end $$;

-- The speaker (or host) passes the turn on. After the last speaker, voting opens.
create or replace function public.stowaway_next_speaker(p_code text, p_token uuid, p_from_pos int default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'clues' then return; end if;
  if p_from_pos is not null and p_from_pos <> r.turn_pos then return; end if; -- double tap
  if r.host_id <> me.id and r.turn_order[r.turn_pos + 1] is distinct from me.id then raise exception 'not_your_turn'; end if;
  if r.turn_pos + 1 >= cardinality(r.turn_order) then
    update stowaway_rooms set phase = 'vote', timer_started_at = null, last_result = null where id = r.id;
  else
    update stowaway_rooms set turn_pos = r.turn_pos + 1, timer_started_at = null where id = r.id;
  end if;
end $$;

create or replace function public.stowaway_skip_to_vote(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'clues' then return; end if;
  update stowaway_rooms set phase = 'vote', timer_started_at = null, last_result = null where id = r.id;
end $$;

-- Private vote. Once every alive player has voted the result is revealed.
create or replace function public.stowaway_cast_vote(p_code text, p_token uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; alive_n int; vote_n int;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'vote' then raise exception 'wrong_phase'; end if;
  if not me.alive then raise exception 'offboard_cannot_vote'; end if;
  if p_target = me.id then raise exception 'cannot_vote_self'; end if;
  if not exists (select 1 from stowaway_players where id = p_target and room_id = r.id and alive) then
    raise exception 'bad_target';
  end if;
  insert into stowaway_votes (room_id, voter, target) values (r.id, me.id, p_target)
    on conflict (room_id, voter) do update set target = excluded.target;
  update stowaway_players set voted = true where id = me.id;
  select count(*) into alive_n from stowaway_players where room_id = r.id and alive;
  select count(*) into vote_n from stowaway_votes where room_id = r.id;
  if vote_n >= alive_n then perform _sw_resolve_vote(r.id); end if;
end $$;

-- Host closes the vote early (players who have not voted are skipped).
create or replace function public.stowaway_resolve_now(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'vote' then return; end if;
  if not exists (select 1 from stowaway_votes where room_id = r.id) then raise exception 'no_votes_yet'; end if;
  perform _sw_resolve_vote(r.id);
end $$;

-- After the reveal animation. Any player's phone can trigger it; only the first one counts.
create or replace function public.stowaway_after_reveal(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; out_role text; out_seat int; w text;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'offboard' or r.offboard_at is null then return; end if;
  if now() < r.offboard_at + interval '4 seconds' then return; end if;
  select role into out_role from stowaway_player_private where player_id = r.out_player;
  select seat_idx into out_seat from stowaway_players where id = r.out_player;
  if out_role = 'lost' then
    update stowaway_rooms set phase = 'guess', guess_text = null, guess_match = null where id = r.id;
    return;
  end if;
  w := _sw_winner(r.id);
  if w is not null then perform _sw_finish(r.id, w);
  else perform _sw_begin_stop(r.id, r.stop_no + 1, out_seat + 1); end if;
end $$;

-- The Lost Soul types her guess for the Explorers' word.
create or replace function public.stowaway_submit_guess(p_code text, p_token uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; ew text; g text := left(btrim(coalesce(p_text, '')), 40);
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'guess' or r.out_player <> me.id then raise exception 'wrong_phase'; end if;
  if g = '' then raise exception 'guess_required'; end if;
  select explorer_word into ew from stowaway_room_private where room_id = r.id;
  update stowaway_rooms set guess_text = g,
         guess_match = (lower(regexp_replace(g, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(ew, '[^a-zA-Z0-9]', '', 'g')))
   where id = r.id;
end $$;

-- The group judges the guess. Anyone except the guesser can tap; the first tap counts.
create or replace function public.stowaway_judge_guess(p_code text, p_token uuid, p_correct boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; out_seat int; w text;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'guess' then return; end if;
  if r.out_player = me.id then raise exception 'cannot_judge_own_guess'; end if;
  if r.guess_text is null then raise exception 'no_guess_yet'; end if;
  select seat_idx into out_seat from stowaway_players where id = r.out_player;
  if p_correct then
    update stowaway_players set alive = true where id = r.out_player; -- she stole the round
    perform _sw_finish(r.id, 'lost-steal');
    return;
  end if;
  w := _sw_winner(r.id);
  if w is not null then perform _sw_finish(r.id, w);
  else perform _sw_begin_stop(r.id, r.stop_no + 1, out_seat + 1); end if;
end $$;

create or replace function public.stowaway_end_game(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase not in ('roundEnd','final') then raise exception 'wrong_phase'; end if;
  update stowaway_rooms set phase = 'final' where id = r.id;
end $$;

-- Back to the lobby (to add people or change roles). Scores are kept.
create or replace function public.stowaway_to_lobby(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase not in ('roundEnd','final') then raise exception 'wrong_phase'; end if;
  update stowaway_players set alive = true, voted = false, ready = false where room_id = r.id;
  update stowaway_player_private set role = null, word = null
   where player_id in (select id from stowaway_players where room_id = r.id);
  update stowaway_rooms set phase = 'lobby', locked = false, last_result = null, round_summary = null,
         outcome = null, out_player = null, turn_order = '{}', timer_started_at = null where id = r.id;
end $$;

-- ── Who may call what ────────────────────────────────────────────────────────
revoke all on function
  public._sw_roles_valid(int,int,int), public._sw_clean_name(text), public._sw_me(text,uuid),
  public._sw_lock_room(uuid), public._sw_winner(uuid), public._sw_begin_stop(uuid,int,int),
  public._sw_finish(uuid,text), public._sw_resolve_vote(uuid), public.stowaway_cleanup()
  from public, anon, authenticated;

grant execute on function
  public.stowaway_create_room(text,uuid,text), public.stowaway_peek(text), public.stowaway_join(text,text,uuid),
  public.stowaway_state(text,uuid), public.stowaway_ping(text,uuid), public.stowaway_claim_host(text,uuid),
  public.stowaway_set_settings(text,uuid,int,int,text,boolean,boolean,boolean),
  public.stowaway_set_locked(text,uuid,boolean), public.stowaway_kick(text,uuid,uuid), public.stowaway_leave(text,uuid),
  public.stowaway_start_round(text,uuid,text,text,boolean), public.stowaway_ready(text,uuid),
  public.stowaway_begin_clues(text,uuid), public.stowaway_timer(text,uuid,boolean),
  public.stowaway_next_speaker(text,uuid,int), public.stowaway_skip_to_vote(text,uuid),
  public.stowaway_cast_vote(text,uuid,uuid), public.stowaway_resolve_now(text,uuid),
  public.stowaway_after_reveal(text,uuid), public.stowaway_submit_guess(text,uuid,text),
  public.stowaway_judge_guess(text,uuid,boolean), public.stowaway_end_game(text,uuid),
  public.stowaway_to_lobby(text,uuid)
  to anon, authenticated;

-- ── Word bank (generated from src/components/ui/stowawayWords.ts) ────────────
-- If you add word pairs in stowawayWords.ts, add them here too (or re-run the
-- generator). Re-running this file is safe: existing pairs are left alone.
insert into public.stowaway_word_pairs (id, category, level, a, b) values
  ('beach_mountain', 'places', 'easy', 'Beach', 'Mountain'),
  ('dunes_rainforest', 'places', 'easy', 'Dunes', 'Rainforest'),
  ('waterfall_cave', 'places', 'easy', 'Waterfall', 'Cave'),
  ('island_valley', 'places', 'easy', 'Island', 'Valley'),
  ('monument_lighthouse', 'places', 'easy', 'Monument', 'Lighthouse'),
  ('palace_glacier', 'places', 'easy', 'Palace', 'Glacier'),
  ('village_skyline', 'places', 'easy', 'Village', 'Skyline'),
  ('canyon_lagoon', 'places', 'easy', 'Canyon', 'Lagoon'),
  ('goa_gokarna', 'places', 'medium', 'Goa', 'Gokarna'),
  ('coorg_wayanad', 'places', 'medium', 'Coorg', 'Wayanad'),
  ('munnar_ooty', 'places', 'medium', 'Munnar', 'Ooty'),
  ('manali_shimla', 'places', 'medium', 'Manali', 'Shimla'),
  ('jaipur_udaipur', 'places', 'medium', 'Jaipur', 'Udaipur'),
  ('hampi_badami', 'places', 'medium', 'Hampi', 'Badami'),
  ('pondicherry_varkala', 'places', 'medium', 'Pondicherry', 'Varkala'),
  ('rishikesh_haridwar', 'places', 'medium', 'Rishikesh', 'Haridwar'),
  ('leh_spiti', 'places', 'medium', 'Leh', 'Spiti'),
  ('kodaikanal_yercaud', 'places', 'medium', 'Kodaikanal', 'Yercaud'),
  ('alleppey_kumarakom', 'places', 'medium', 'Alleppey', 'Kumarakom'),
  ('darjeeling_gangtok', 'places', 'medium', 'Darjeeling', 'Gangtok'),
  ('jaisalmer_bikaner', 'places', 'medium', 'Jaisalmer', 'Bikaner'),
  ('andaman_lakshadweep', 'places', 'medium', 'Andaman', 'Lakshadweep'),
  ('viewpoint_lookout-tower', 'places', 'hard', 'Viewpoint', 'Lookout tower'),
  ('fortress_citadel', 'places', 'hard', 'Fortress', 'Citadel'),
  ('lake_reservoir', 'places', 'hard', 'Lake', 'Reservoir'),
  ('dam_barrage', 'places', 'hard', 'Dam', 'Barrage'),
  ('old-goa_fort-kochi', 'places', 'hard', 'Old Goa', 'Fort Kochi'),
  ('tea-garden_spice-garden', 'places', 'hard', 'Tea garden', 'Spice garden'),
  ('bazaar_flea-market', 'places', 'hard', 'Bazaar', 'Flea market'),
  ('monastery_ashram', 'places', 'hard', 'Monastery', 'Ashram'),
  ('ridge_summit', 'places', 'hard', 'Ridge', 'Summit'),
  ('rann-of-kutch_salt-flats', 'places', 'hard', 'Rann of Kutch', 'Salt flats'),
  ('dosa_pizza', 'food', 'easy', 'Dosa', 'Pizza'),
  ('buttermilk_cola', 'food', 'easy', 'Buttermilk', 'Cola'),
  ('biryani_salad', 'food', 'easy', 'Biryani', 'Salad'),
  ('momos_burger', 'food', 'easy', 'Momos', 'Burger'),
  ('ice-cream_soup', 'food', 'easy', 'Ice cream', 'Soup'),
  ('samosa_sandwich', 'food', 'easy', 'Samosa', 'Sandwich'),
  ('maggi_pasta', 'food', 'easy', 'Maggi', 'Pasta'),
  ('idli_pancake', 'food', 'easy', 'Idli', 'Pancake'),
  ('masala-chai_filter-coffee', 'food', 'medium', 'Masala chai', 'Filter coffee'),
  ('vada-pav_pav-bhaji', 'food', 'medium', 'Vada pav', 'Pav bhaji'),
  ('parotta_chapati', 'food', 'medium', 'Parotta', 'Chapati'),
  ('appam_puttu', 'food', 'medium', 'Appam', 'Puttu'),
  ('pani-puri_bhel-puri', 'food', 'medium', 'Pani puri', 'Bhel puri'),
  ('kulfi_gelato', 'food', 'medium', 'Kulfi', 'Gelato'),
  ('jalebi_gulab-jamun', 'food', 'medium', 'Jalebi', 'Gulab jamun'),
  ('thali_buffet', 'food', 'medium', 'Thali', 'Buffet'),
  ('fish-curry_prawn-fry', 'food', 'medium', 'Fish curry', 'Prawn fry'),
  ('chole-bhature_aloo-paratha', 'food', 'medium', 'Chole bhature', 'Aloo paratha'),
  ('tandoori-chicken_butter-chicken', 'food', 'medium', 'Tandoori chicken', 'Butter chicken'),
  ('corn-on-the-cob_roasted-peanuts', 'food', 'medium', 'Corn on the cob', 'Roasted peanuts'),
  ('bonda_bajji', 'food', 'medium', 'Bonda', 'Bajji'),
  ('payasam_halwa', 'food', 'medium', 'Payasam', 'Halwa'),
  ('mango-lassi_mango-shake', 'food', 'hard', 'Mango lassi', 'Mango shake'),
  ('sweet-lime-soda_lemon-soda', 'food', 'hard', 'Sweet lime soda', 'Lemon soda'),
  ('rasgulla_rasmalai', 'food', 'hard', 'Rasgulla', 'Rasmalai'),
  ('idiyappam_noolputtu', 'food', 'hard', 'Idiyappam', 'Noolputtu'),
  ('egg-roll_kathi-roll', 'food', 'hard', 'Egg roll', 'Kathi roll'),
  ('banana-chips_jackfruit-chips', 'food', 'hard', 'Banana chips', 'Jackfruit chips'),
  ('poha_upma', 'food', 'hard', 'Poha', 'Upma'),
  ('mysore-pak_besan-ladoo', 'food', 'hard', 'Mysore pak', 'Besan ladoo'),
  ('tender-coconut_sugarcane-juice', 'food', 'hard', 'Tender coconut', 'Sugarcane juice'),
  ('dhokla_khandvi', 'food', 'hard', 'Dhokla', 'Khandvi'),
  ('tent_hotel', 'gear', 'easy', 'Tent', 'Hotel'),
  ('backpack_suitcase', 'gear', 'easy', 'Backpack', 'Suitcase'),
  ('sleeping-bag_bed', 'gear', 'easy', 'Sleeping bag', 'Bed'),
  ('flashlight_candle', 'gear', 'easy', 'Flashlight', 'Candle'),
  ('sunscreen_umbrella', 'gear', 'easy', 'Sunscreen', 'Umbrella'),
  ('hammock_sofa', 'gear', 'easy', 'Hammock', 'Sofa'),
  ('boots_sandals', 'gear', 'easy', 'Boots', 'Sandals'),
  ('raincoat_sweater', 'gear', 'easy', 'Raincoat', 'Sweater'),
  ('homestay_resort', 'gear', 'medium', 'Homestay', 'Resort'),
  ('trolley-bag_duffel-bag', 'gear', 'medium', 'Trolley bag', 'Duffel bag'),
  ('power-bank_charger', 'gear', 'medium', 'Power bank', 'Charger'),
  ('houseboat_cottage', 'gear', 'medium', 'Houseboat', 'Cottage'),
  ('treehouse_cabin', 'gear', 'medium', 'Treehouse', 'Cabin'),
  ('hostel_guesthouse', 'gear', 'medium', 'Hostel', 'Guesthouse'),
  ('dorm_villa', 'gear', 'medium', 'Dorm', 'Villa'),
  ('selfie-stick_tripod', 'gear', 'medium', 'Selfie stick', 'Tripod'),
  ('water-bottle_thermos', 'gear', 'medium', 'Water bottle', 'Thermos'),
  ('sunglasses_cap', 'gear', 'medium', 'Sunglasses', 'Cap'),
  ('windcheater_poncho', 'gear', 'medium', 'Windcheater', 'Poncho'),
  ('binoculars_camera', 'gear', 'medium', 'Binoculars', 'Camera'),
  ('compass_paper-map', 'gear', 'medium', 'Compass', 'Paper map'),
  ('travel-pillow_eye-mask', 'gear', 'medium', 'Travel pillow', 'Eye mask'),
  ('campfire_bonfire', 'gear', 'hard', 'Campfire', 'Bonfire'),
  ('headlamp_torch', 'gear', 'hard', 'Headlamp', 'Torch'),
  ('hoodie_jacket', 'gear', 'hard', 'Hoodie', 'Jacket'),
  ('sling-bag_tote-bag', 'gear', 'hard', 'Sling bag', 'Tote bag'),
  ('earbuds_headphones', 'gear', 'hard', 'Earbuds', 'Headphones'),
  ('lantern_lamp', 'gear', 'hard', 'Lantern', 'Lamp'),
  ('pocket-knife_multitool', 'gear', 'hard', 'Pocket knife', 'Multitool'),
  ('beanie_balaclava', 'gear', 'hard', 'Beanie', 'Balaclava'),
  ('thermal-wear_fleece', 'gear', 'hard', 'Thermal wear', 'Fleece'),
  ('alpenstock_walking-cane', 'gear', 'hard', 'Alpenstock', 'Walking cane'),
  ('swimming_hiking', 'activities', 'easy', 'Swimming', 'Hiking'),
  ('trekking_shopping', 'activities', 'easy', 'Trekking', 'Shopping'),
  ('surfing_skiing', 'activities', 'easy', 'Surfing', 'Skiing'),
  ('cycling_rowing', 'activities', 'easy', 'Cycling', 'Rowing'),
  ('kayaking_golfing', 'activities', 'easy', 'Kayaking', 'Golfing'),
  ('photography_painting', 'activities', 'easy', 'Photography', 'Painting'),
  ('dancing_reading', 'activities', 'easy', 'Dancing', 'Reading'),
  ('fishing_napping', 'activities', 'easy', 'Fishing', 'Napping'),
  ('rafting_canoeing', 'activities', 'medium', 'Rafting', 'Canoeing'),
  ('paragliding_skydiving', 'activities', 'medium', 'Paragliding', 'Skydiving'),
  ('scuba-diving_snorkelling', 'activities', 'medium', 'Scuba diving', 'Snorkelling'),
  ('stargazing_bird-watching', 'activities', 'medium', 'Stargazing', 'Bird watching'),
  ('zipline_flying-fox', 'activities', 'medium', 'Zipline', 'Flying fox'),
  ('jeep-ride_boat-ride', 'activities', 'medium', 'Jeep ride', 'Boat ride'),
  ('pottery-class_cooking-class', 'activities', 'medium', 'Pottery class', 'Cooking class'),
  ('yoga_meditation', 'activities', 'medium', 'Yoga', 'Meditation'),
  ('road-trip_flight', 'activities', 'medium', 'Road trip', 'Flight'),
  ('cafe-hopping_pub-crawl', 'activities', 'medium', 'Cafe hopping', 'Pub crawl'),
  ('moonlit-walk_heritage-walk', 'activities', 'medium', 'Moonlit walk', 'Heritage walk'),
  ('volleyball_cricket', 'activities', 'medium', 'Volleyball', 'Cricket'),
  ('horse-riding_camel-riding', 'activities', 'medium', 'Horse riding', 'Camel riding'),
  ('singalong_movie-night', 'activities', 'medium', 'Singalong', 'Movie night'),
  ('sunrise-trek_sunset-trek', 'activities', 'hard', 'Sunrise trek', 'Sunset trek'),
  ('bungee-jump_rope-swing', 'activities', 'hard', 'Bungee jump', 'Rope swing'),
  ('rock-climbing_rappelling', 'activities', 'hard', 'Rock climbing', 'Rappelling'),
  ('jungle-safari_desert-safari', 'activities', 'hard', 'Jungle safari', 'Desert safari'),
  ('karaoke_antakshari', 'activities', 'hard', 'Karaoke', 'Antakshari'),
  ('sightseeing_city-tour', 'activities', 'hard', 'Sightseeing', 'City tour'),
  ('sketching_doodling', 'activities', 'hard', 'Sketching', 'Doodling'),
  ('journaling_scrapbooking', 'activities', 'hard', 'Journaling', 'Scrapbooking'),
  ('cliff-jumping_springboard', 'activities', 'hard', 'Cliff jumping', 'Springboard'),
  ('wild-camping_glamping', 'activities', 'hard', 'Wild camping', 'Glamping'),
  ('monsoon_winter', 'vibes', 'easy', 'Monsoon', 'Winter'),
  ('dawn_midnight', 'vibes', 'easy', 'Dawn', 'Midnight'),
  ('festival_library', 'vibes', 'easy', 'Festival', 'Library'),
  ('rain_heatwave', 'vibes', 'easy', 'Rain', 'Heatwave'),
  ('crowd_solitude', 'vibes', 'easy', 'Crowd', 'Solitude'),
  ('moonlight_thunder', 'vibes', 'easy', 'Moonlight', 'Thunder'),
  ('traffic_birdsong', 'vibes', 'easy', 'Traffic', 'Birdsong'),
  ('snowfall_sandstorm', 'vibes', 'easy', 'Snowfall', 'Sandstorm'),
  ('sleeper-bus_steam-engine', 'vibes', 'medium', 'Sleeper bus', 'Steam engine'),
  ('ferry_cable-car', 'vibes', 'medium', 'Ferry', 'Cable car'),
  ('local-train_metro', 'vibes', 'medium', 'Local train', 'Metro'),
  ('dhaba_bistro', 'vibes', 'medium', 'Dhaba', 'Bistro'),
  ('roadside-stall_street-cart', 'vibes', 'medium', 'Roadside stall', 'Street cart'),
  ('folk-dance_puppet-show', 'vibes', 'medium', 'Folk dance', 'Puppet show'),
  ('temple-bells_church-bells', 'vibes', 'medium', 'Temple bells', 'Church bells'),
  ('kolam_rangoli', 'vibes', 'medium', 'Kolam', 'Rangoli'),
  ('bangles_anklets', 'vibes', 'medium', 'Bangles', 'Anklets'),
  ('henna_tattoo', 'vibes', 'medium', 'Henna', 'Tattoo'),
  ('handloom_handicraft', 'vibes', 'medium', 'Handloom', 'Handicraft'),
  ('sarees_dupattas', 'vibes', 'medium', 'Sarees', 'Dupattas'),
  ('dumb-charades_truth-or-dare', 'vibes', 'medium', 'Dumb charades', 'Truth or dare'),
  ('window-seat_aisle-seat', 'vibes', 'medium', 'Window seat', 'Aisle seat'),
  ('auto-rickshaw_tuk-tuk', 'vibes', 'hard', 'Auto rickshaw', 'Tuk tuk'),
  ('bargaining_haggling', 'vibes', 'hard', 'Bargaining', 'Haggling'),
  ('gossip_banter', 'vibes', 'hard', 'Gossip', 'Banter'),
  ('photo-dump_reels-binge', 'vibes', 'hard', 'Photo dump', 'Reels binge'),
  ('hill-breeze_sea-breeze', 'vibes', 'hard', 'Hill breeze', 'Sea breeze'),
  ('golden-hour_blue-hour', 'vibes', 'hard', 'Golden hour', 'Blue hour'),
  ('homesick_wanderlust', 'vibes', 'hard', 'Homesick', 'Wanderlust'),
  ('nostalgia_deja-vu', 'vibes', 'hard', 'Nostalgia', 'Deja vu'),
  ('giggles_laughter', 'vibes', 'hard', 'Giggles', 'Laughter'),
  ('sunny-day_clear-sky', 'vibes', 'hard', 'Sunny day', 'Clear sky')
on conflict (id) do nothing;

-- Make the API see the new functions straight away.
notify pgrst, 'reload schema';
