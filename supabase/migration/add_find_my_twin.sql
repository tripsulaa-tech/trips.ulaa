-- =============================================================================
-- add_find_my_twin.sql
-- =============================================================================
-- Online rooms for the "Find My Twin" group game (4-letter room code).
-- Run this ONCE in the Supabase SQL editor. It is safe to run again.
--
-- HOW IT WORKS
--   1. Everyone joins a room and answers 5 quick this-or-that questions.
--   2. The host taps "Reveal twins". The database secretly scores every pair
--      of players and pairs people up (best match first). Nobody can read the
--      scores or answers of other players.
--   3. Each phone only learns its OWN twin(s): "You + Kavya, 92% match".
--      ULAA says "Find Kavya!". Both tap "Found them" when they meet.
--   4. A conversation prompt unlocks for the pair. When both tap "We talked",
--      the pair is done. When every pair is done, anyone can start the next
--      round: new twins (never the same person twice), new prompt.
--
-- HOW SECRETS STAY SECRET
--   * Public tables (ftwin_rooms, ftwin_players) hold only names, who has
--     answered, the phase and a counter that changes on every action (so
--     Supabase Realtime can tell phones to refresh).
--   * Answers, tokens and pairings live in PRIVATE tables with RLS on and NO
--     policy. Only the SECURITY DEFINER functions below touch them, and each
--     one checks the caller's secret token first.
--   * Nobody writes to any table directly.
--
-- No accounts, no personal data. Rooms expire after 6 hours and are deleted.
-- =============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.ftwin_rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  host_id     uuid,
  trip_title  text not null default 'Ulaa',
  phase       text not null default 'lobby'
              check (phase in ('lobby','hunt','roundEnd','final')),
  locked      boolean not null default false,
  round_no    int not null default 0,
  rev         int not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '6 hours'
);

create table if not exists public.ftwin_players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.ftwin_rooms(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 18),
  answered   boolean not null default false,
  joined_at  timestamptz not null default now()
);
create unique index if not exists ftwin_players_room_name_idx
  on public.ftwin_players (room_id, lower(name));
create index if not exists ftwin_players_room_idx on public.ftwin_players (room_id);

-- PRIVATE: secret token + this player's 5 answers ('0'/'1' per question).
create table if not exists public.ftwin_player_private (
  player_id  uuid primary key references public.ftwin_players(id) on delete cascade,
  token      uuid not null,
  answers    text check (answers ~ '^[01]{5}$'),
  last_seen  timestamptz not null default now()
);
create index if not exists ftwin_player_private_token_idx on public.ftwin_player_private (token);

-- PRIVATE: who was paired with whom, in which round, and how they progressed.
create table if not exists public.ftwin_edges (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.ftwin_rooms(id) on delete cascade,
  round_no  int not null,
  a         uuid not null references public.ftwin_players(id) on delete cascade,
  b         uuid not null references public.ftwin_players(id) on delete cascade,
  score     int not null,
  a_found   boolean not null default false,
  b_found   boolean not null default false,
  a_done    boolean not null default false,
  b_done    boolean not null default false
);
create index if not exists ftwin_edges_room_idx on public.ftwin_edges (room_id, round_no);

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.ftwin_rooms          enable row level security;
alter table public.ftwin_players        enable row level security;
alter table public.ftwin_player_private enable row level security;
alter table public.ftwin_edges          enable row level security;

drop policy if exists "Public read ftwin rooms" on public.ftwin_rooms;
create policy "Public read ftwin rooms" on public.ftwin_rooms for select using (true);
drop policy if exists "Public read ftwin players" on public.ftwin_players;
create policy "Public read ftwin players" on public.ftwin_players for select using (true);

revoke all on public.ftwin_rooms, public.ftwin_players, public.ftwin_player_private, public.ftwin_edges
  from anon, authenticated;
grant select on public.ftwin_rooms, public.ftwin_players to anon, authenticated;

-- Realtime: lets phones hear about changes. Deletes need the full old row.
alter table public.ftwin_players replica identity full;
alter table public.ftwin_rooms   replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.ftwin_rooms;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ftwin_players; exception when duplicate_object then null; end;
exception when undefined_object then null;
end $$;

-- ── Internal helpers (not callable from the API) ─────────────────────────────

create or replace function public._ft_clean_name(p text)
returns text language sql immutable as $$
  select left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), 18);
$$;

-- Finds the caller's player row from room code + secret token.
create or replace function public._ft_me(p_code text, p_token uuid)
returns public.ftwin_players
language plpgsql security definer set search_path = public as $$
declare v public.ftwin_players;
begin
  select p.* into v
    from ftwin_players p
    join ftwin_player_private pp on pp.player_id = p.id
    join ftwin_rooms r on r.id = p.room_id
   where r.code = upper(btrim(p_code)) and pp.token = p_token and r.expires_at > now();
  if not found then raise exception 'not_in_room'; end if;
  return v;
end $$;

-- Tells every phone in the room to refresh (Realtime fires on this update).
create or replace function public._ft_bump(p_room uuid)
returns void language sql security definer set search_path = public as $$
  update ftwin_rooms set rev = rev + 1 where id = p_room;
$$;

-- The secret compatibility score (50..99) for two answer strings.
-- Each question has its own weight (so "Beach or Mountain" counts a little more
-- than "Photos or Videos"). A tiny pair-specific wobble keeps two pairs who
-- agree on the same questions from always tying.
-- Question ORDER must match QUESTIONS in src/components/ui/findMyTwinEngine.ts.
create or replace function public._ft_score(a text, b text, seed text)
returns int language plpgsql immutable as $$
declare
  w constant int[] := array[24, 18, 20, 20, 18];  -- sums to 100
  sim int := 0;
  wobble int;
begin
  for i in 1..5 loop
    if substr(a, i, 1) = substr(b, i, 1) then sim := sim + w[i]; end if;
  end loop;
  wobble := abs(hashtext(seed)) % 5;               -- 0..4
  return least(99, 50 + (sim * 45) / 100 + wobble);
end $$;

-- Pairs people up for the given round. Best score first, never repeating a
-- pair that already met. With an odd number, the leftover person joins the
-- pair they match best with (a trio: they get two twins).
create or replace function public._ft_pair_round(p_room uuid, p_round int)
returns int language plpgsql security definer set search_path = public as $$
declare
  used uuid[] := '{}';
  made int := 0;
  rec record;
  extra record;
begin
  loop
    select x.a, x.b, x.score into rec
      from (
        select p1.id as a, p2.id as b,
               _ft_score(q1.answers, q2.answers, least(p1.id::text, p2.id::text) || greatest(p1.id::text, p2.id::text) || p_round::text) as score
          from ftwin_players p1
          join ftwin_player_private q1 on q1.player_id = p1.id
          join ftwin_players p2 on p2.room_id = p1.room_id and p2.id > p1.id
          join ftwin_player_private q2 on q2.player_id = p2.id
         where p1.room_id = p_room
           and q1.answers is not null and q2.answers is not null
           and not (p1.id = any(used)) and not (p2.id = any(used))
           and not exists (
             select 1 from ftwin_edges e
              where e.room_id = p_room
                and ((e.a = p1.id and e.b = p2.id) or (e.a = p2.id and e.b = p1.id)))
      ) x
     order by x.score desc, x.a, x.b
     limit 1;
    exit when not found;
    insert into ftwin_edges (room_id, round_no, a, b, score) values (p_room, p_round, rec.a, rec.b, rec.score);
    used := used || rec.a || rec.b;
    made := made + 1;
  end loop;

  -- Odd one out: attach to the best partner they have not met yet.
  for extra in
    select p.id from ftwin_players p
      join ftwin_player_private q on q.player_id = p.id
     where p.room_id = p_room and q.answers is not null and not (p.id = any(used))
  loop
    select x.partner, x.score into rec
      from (
        select p2.id as partner,
               _ft_score(q1.answers, q2.answers, least(extra.id::text, p2.id::text) || greatest(extra.id::text, p2.id::text) || p_round::text) as score
          from ftwin_players p2
          join ftwin_player_private q2 on q2.player_id = p2.id
          join ftwin_player_private q1 on q1.player_id = extra.id
         where p2.room_id = p_room and p2.id <> extra.id and q2.answers is not null
           and p2.id = any(used)
           and not exists (
             select 1 from ftwin_edges e
              where e.room_id = p_room
                and ((e.a = extra.id and e.b = p2.id) or (e.a = p2.id and e.b = extra.id)))
      ) x
     order by x.score desc, x.partner
     limit 1;
    if found then
      insert into ftwin_edges (room_id, round_no, a, b, score) values (p_room, p_round, extra.id, rec.partner, rec.score);
      used := used || extra.id;
      made := made + 1;
    end if;
  end loop;

  return made;
end $$;

-- Deletes expired rooms (and, by cascade, everything attached to them).
create or replace function public.ftwin_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from ftwin_rooms where expires_at < now();
$$;

-- ── Public functions (called from the app) ───────────────────────────────────

-- Create a room. Returns the 4-letter code and your player id.
create or replace function public.ftwin_create_room(p_name text, p_token uuid, p_trip_title text default 'Ulaa')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _ft_clean_name(p_name); i int := 0;
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_name = '' then raise exception 'name_required'; end if;
  if p_token is null then raise exception 'token_required'; end if;
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

  insert into ftwin_rooms (code, trip_title)
    values (v_code, left(btrim(coalesce(nullif(p_trip_title, ''), 'Ulaa')), 60)) returning id into v_room;
  insert into ftwin_players (room_id, name) values (v_room, v_name) returning id into v_player;
  insert into ftwin_player_private (player_id, token) values (v_player, p_token);
  update ftwin_rooms set host_id = v_player where id = v_room;
  return jsonb_build_object('code', v_code, 'player_id', v_player);
end $$;

-- Look at a room before joining (no token needed).
create or replace function public.ftwin_peek(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.ftwin_rooms;
begin
  select * into r from ftwin_rooms where code = upper(btrim(p_code)) and expires_at > now();
  if not found then return jsonb_build_object('exists', false); end if;
  return jsonb_build_object('exists', true, 'locked', r.locked, 'phase', r.phase, 'trip_title', r.trip_title,
    'players', (select count(*) from ftwin_players where room_id = r.id));
end $$;

-- Join a room (or come back to your seat: same token = same player).
create or replace function public.ftwin_join(p_code text, p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.ftwin_rooms; v_name text := _ft_clean_name(p_name); v_player uuid; v_count int;
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
  if exists (select 1 from ftwin_players where room_id = r.id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;

  insert into ftwin_players (room_id, name) values (r.id, v_name) returning id into v_player;
  insert into ftwin_player_private (player_id, token) values (v_player, p_token);
  perform _ft_bump(r.id);
  return jsonb_build_object('code', r.code, 'player_id', v_player);
end $$;

-- Locks the room row for the rest of the transaction and returns it.
create or replace function public._ft_lock_room(p_room uuid)
returns public.ftwin_rooms
language plpgsql security definer set search_path = public as $$
declare r public.ftwin_rooms;
begin
  select * into r from ftwin_rooms where id = p_room for update;
  return r;
end $$;

-- Everything this phone is allowed to see. Other players' answers and pairings
-- are never included: only YOUR twin(s) for this round and YOUR history.
create or replace function public.ftwin_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.ftwin_players; r public.ftwin_rooms; mine text; host_seen timestamptz;
  v_players jsonb; v_edges jsonb; v_history jsonb; v_all jsonb; v_progress jsonb;
begin
  me := _ft_me(p_code, p_token);
  select * into r from ftwin_rooms where id = me.room_id;
  update ftwin_player_private set last_seen = now() where player_id = me.id;
  select answers into mine from ftwin_player_private where player_id = me.id;
  select last_seen into host_seen from ftwin_player_private where player_id = r.host_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'answered', p.answered,
           'away', pp.last_seen < now() - interval '45 seconds',
           'connections', (select count(*) from ftwin_edges e
                            where e.room_id = r.id and ((e.a = p.id and e.a_done) or (e.b = p.id and e.b_done)))
         ) order by p.joined_at), '[]'::jsonb)
    into v_players
    from ftwin_players p join ftwin_player_private pp on pp.player_id = p.id
   where p.room_id = r.id;

  -- My twin(s) this round.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'partner_id', case when e.a = me.id then e.b else e.a end,
           'partner_name', (select name from ftwin_players where id = case when e.a = me.id then e.b else e.a end),
           'score', e.score,
           'me_found', case when e.a = me.id then e.a_found else e.b_found end,
           'partner_found', case when e.a = me.id then e.b_found else e.a_found end,
           'me_done', case when e.a = me.id then e.a_done else e.b_done end,
           'partner_done', case when e.a = me.id then e.b_done else e.a_done end
         ) order by e.score desc), '[]'::jsonb)
    into v_edges
    from ftwin_edges e
   where e.room_id = r.id and e.round_no = r.round_no and (e.a = me.id or e.b = me.id);

  -- Everyone I have met so far (finished pairs only).
  select coalesce(jsonb_agg(jsonb_build_object(
           'round', e.round_no, 'score', e.score,
           'partner_name', (select name from ftwin_players where id = case when e.a = me.id then e.b else e.a end)
         ) order by e.round_no, e.score desc), '[]'::jsonb)
    into v_history
    from ftwin_edges e
   where e.room_id = r.id and (e.a = me.id or e.b = me.id) and e.a_done and e.b_done;

  select jsonb_build_object(
           'done',  count(*) filter (where e.a_done and e.b_done),
           'total', count(*))
    into v_progress
    from ftwin_edges e where e.room_id = r.id and e.round_no = r.round_no;

  -- At the very end everyone may see how the room paired up.
  if r.phase = 'final' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'round', e.round_no, 'score', e.score,
             'a_name', (select name from ftwin_players where id = e.a),
             'b_name', (select name from ftwin_players where id = e.b)
           ) order by e.score desc), '[]'::jsonb)
      into v_all
      from (select * from ftwin_edges where room_id = r.id and a_done and b_done order by score desc limit 8) e;
  else
    v_all := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'now', now(),
    'me', jsonb_build_object('id', me.id, 'answers', mine),
    'room', jsonb_build_object(
      'id', r.id, 'code', r.code, 'host_id', r.host_id, 'trip_title', r.trip_title,
      'phase', r.phase, 'locked', r.locked, 'round_no', r.round_no, 'rev', r.rev),
    'players', v_players,
    'host_away', host_seen is not null and host_seen < now() - interval '45 seconds',
    'edges', v_edges,
    'progress', v_progress,
    'history', v_history,
    'all_pairs', v_all);
end $$;

-- Save my 5 answers ('0' = left option, '1' = right option).
create or replace function public.ftwin_submit_answers(p_code text, p_token uuid, p_answers text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_answers is null or p_answers !~ '^[01]{5}$' then raise exception 'bad_answers'; end if;
  update ftwin_player_private set answers = p_answers where player_id = me.id;
  update ftwin_players set answered = true where id = me.id;
  perform _ft_bump(r.id);
end $$;

-- Change my answers again (lobby only).
create or replace function public.ftwin_retake(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  update ftwin_player_private set answers = null where player_id = me.id;
  update ftwin_players set answered = false where id = me.id;
  perform _ft_bump(r.id);
end $$;

-- Host: reveal the twins. Everyone must have answered, and 2+ players.
create or replace function public.ftwin_start(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; n int; made int;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  select count(*) into n from ftwin_players where room_id = r.id;
  if n < 2 then raise exception 'need_more_players'; end if;
  if exists (select 1 from ftwin_players where room_id = r.id and not answered) then
    raise exception 'waiting_for_answers';
  end if;
  made := _ft_pair_round(r.id, 1);
  if made = 0 then raise exception 'need_more_players'; end if;
  update ftwin_rooms set phase = 'hunt', round_no = 1, locked = true where id = r.id;
  perform _ft_bump(r.id);
end $$;

-- I found my twin (edge id comes from ftwin_state).
create or replace function public.ftwin_found(p_code text, p_token uuid, p_edge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; e public.ftwin_edges;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'hunt' then raise exception 'wrong_phase'; end if;
  select * into e from ftwin_edges where id = p_edge and room_id = r.id and round_no = r.round_no
     and (a = me.id or b = me.id);
  if not found then raise exception 'wrong_phase'; end if;
  if e.a = me.id then update ftwin_edges set a_found = true where id = e.id;
  else update ftwin_edges set b_found = true where id = e.id; end if;
  perform _ft_bump(r.id);
end $$;

-- We talked (only after both found each other). When every pair is done the
-- round ends.
create or replace function public.ftwin_done(p_code text, p_token uuid, p_edge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; e public.ftwin_edges; open_left int;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'hunt' then raise exception 'wrong_phase'; end if;
  select * into e from ftwin_edges where id = p_edge and room_id = r.id and round_no = r.round_no
     and (a = me.id or b = me.id);
  if not found or not (e.a_found and e.b_found) then raise exception 'wrong_phase'; end if;
  if e.a = me.id then update ftwin_edges set a_done = true where id = e.id;
  else update ftwin_edges set b_done = true where id = e.id; end if;

  select count(*) into open_left from ftwin_edges
   where room_id = r.id and round_no = r.round_no and not (a_done and b_done);
  if open_left = 0 then
    update ftwin_rooms set phase = 'roundEnd' where id = r.id;
  end if;
  perform _ft_bump(r.id);
end $$;

-- Anyone: unlock the next round (the first call wins; repeats are ignored).
-- Rounds stop after 4, or when nobody new is left to meet.
create or replace function public.ftwin_next_round(p_code text, p_token uuid, p_from_round int)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; made int := 0;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'roundEnd' or r.round_no <> p_from_round then return; end if;
  if r.round_no < 4 then made := _ft_pair_round(r.id, r.round_no + 1); end if;
  if made = 0 then
    update ftwin_rooms set phase = 'final' where id = r.id;
  else
    update ftwin_rooms set phase = 'hunt', round_no = r.round_no + 1 where id = r.id;
  end if;
  perform _ft_bump(r.id);
end $$;

-- Anyone: skip a stuck pair (e.g. someone left). Marks the pair done.
-- Host only, so a pair cannot be skipped by accident.
create or replace function public.ftwin_skip_pending(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  if r.phase <> 'hunt' then raise exception 'wrong_phase'; end if;
  update ftwin_edges set a_found = true, b_found = true, a_done = true, b_done = true
   where room_id = r.id and round_no = r.round_no and not (a_done and b_done);
  update ftwin_rooms set phase = 'roundEnd' where id = r.id;
  perform _ft_bump(r.id);
end $$;

-- Host: end the game now and show the wrap-up.
create or replace function public.ftwin_end_game(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  update ftwin_rooms set phase = 'final' where id = r.id;
  perform _ft_bump(r.id);
end $$;

-- Host: play again with the same room (fresh answers, fresh pairings).
create or replace function public.ftwin_to_lobby(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  delete from ftwin_edges where room_id = r.id;
  update ftwin_player_private set answers = null where player_id in (select id from ftwin_players where room_id = r.id);
  update ftwin_players set answered = false where room_id = r.id;
  update ftwin_rooms set phase = 'lobby', round_no = 0, locked = false where id = r.id;
  perform _ft_bump(r.id);
end $$;

-- Host: lock or unlock the room before the reveal.
create or replace function public.ftwin_set_locked(p_code text, p_token uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  update ftwin_rooms set locked = p_locked where id = r.id;
  perform _ft_bump(r.id);
end $$;

-- Host: remove a player (lobby only).
create or replace function public.ftwin_kick(p_code text, p_token uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_player = me.id then raise exception 'wrong_phase'; end if;
  delete from ftwin_players where id = p_player and room_id = r.id;
  perform _ft_bump(r.id);
end $$;

-- Leave the room (lobby only; mid-game your seat is kept so pairs do not break).
create or replace function public.ftwin_leave(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; next_host uuid;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'lobby' then return; end if;
  delete from ftwin_players where id = me.id;
  if r.host_id = me.id then
    select id into next_host from ftwin_players where room_id = r.id order by joined_at limit 1;
    if next_host is null then delete from ftwin_rooms where id = r.id; return; end if;
    update ftwin_rooms set host_id = next_host where id = r.id;
  end if;
  perform _ft_bump(r.id);
end $$;

-- Take over as host when the host's phone has been gone for a minute.
create or replace function public.ftwin_claim_host(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; seen timestamptz;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  select last_seen into seen from ftwin_player_private where player_id = r.host_id;
  if r.host_id = me.id then return; end if;
  if seen is not null and seen > now() - interval '60 seconds' then raise exception 'host_present'; end if;
  update ftwin_rooms set host_id = me.id where id = r.id;
  perform _ft_bump(r.id);
end $$;

-- ── Permissions: only the public functions are callable from the app ─────────
revoke all on function public._ft_clean_name(text), public._ft_me(text, uuid), public._ft_bump(uuid),
  public._ft_score(text, text, text), public._ft_pair_round(uuid, int), public._ft_lock_room(uuid)
  from public, anon, authenticated;

revoke all on function public.ftwin_cleanup() from public, anon, authenticated;

grant execute on function
  public.ftwin_create_room(text, uuid, text),
  public.ftwin_peek(text),
  public.ftwin_join(text, text, uuid),
  public.ftwin_state(text, uuid),
  public.ftwin_submit_answers(text, uuid, text),
  public.ftwin_retake(text, uuid),
  public.ftwin_start(text, uuid),
  public.ftwin_found(text, uuid, uuid),
  public.ftwin_done(text, uuid, uuid),
  public.ftwin_next_round(text, uuid, int),
  public.ftwin_skip_pending(text, uuid),
  public.ftwin_end_game(text, uuid),
  public.ftwin_to_lobby(text, uuid),
  public.ftwin_set_locked(text, uuid, boolean),
  public.ftwin_kick(text, uuid, uuid),
  public.ftwin_leave(text, uuid),
  public.ftwin_claim_host(text, uuid)
  to anon, authenticated;

-- Make the API see the new functions straight away.
notify pgrst, 'reload schema';
