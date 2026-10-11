-- Stowaway: drop the leftovers of the clue round and the challenge cards.
--
-- Removed from stowaway_rooms: challenges, turn_order, turn_pos, timer_started_at,
-- challenge_id. Nothing reads them any more: challenge cards are gone from the game,
-- and the clue round (the only user of the speaking order and the speaking timer) was
-- removed in remove_stowaway_clue_round.sql. Also removed: 'clues' from the phase check.
-- Safe to re-run. Rooms only live a few hours, so no real data is lost.
--
-- Function changes:
--   * stowaway_set_settings loses p_challenges, and stowaway_start_round loses
--     p_challenge (both are new signatures).
--   * stowaway_timer, stowaway_next_speaker and stowaway_skip_to_vote are dropped:
--     they only ever worked during the clue phase.
--   * _sw_begin_stop, _sw_finish, _sw_resolve_vote, stowaway_start_round and
--     stowaway_to_lobby no longer write the dropped columns.
--   stowaway_begin_clues keeps its name (the client calls it to go from the deal to
--   the vote), as do stowaway_after_reveal and stowaway_judge_guess.
--
-- Deploy this together with the matching client build: a browser tab that still sends
-- p_challenges / p_challenge will get an error until it reloads.

-- Any room still sitting in the old clue phase moves on to the vote.
update public.stowaway_rooms set phase = 'vote' where phase = 'clues';

-- ── Functions that were clue-phase only ─────────────────────────────────────
drop function if exists public.stowaway_timer(text, uuid, boolean);
drop function if exists public.stowaway_next_speaker(text, uuid, int);
drop function if exists public.stowaway_skip_to_vote(text, uuid);

-- ── Settings: no more p_challenges ──────────────────────────────────────────
drop function if exists public.stowaway_set_settings(text, uuid, int, int, text, boolean, boolean, boolean);

create or replace function public.stowaway_set_settings(
  p_code text, p_token uuid, p_stowaways int, p_lost int, p_level text,
  p_hide_counts boolean, p_dares boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'bad_level'; end if;
  update stowaway_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         dares = coalesce(p_dares, false) where id = r.id;
  update stowaway_room_private set stowaways = greatest(1, least(coalesce(p_stowaways, 1), 12)),
         lost = greatest(0, least(coalesce(p_lost, 0), 2)) where room_id = r.id;
end $$;

-- ── A stop goes straight to the vote (as in remove_stowaway_clue_round.sql) ──
create or replace function public._sw_begin_stop(p_room uuid, p_stop int, p_from int)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = 'vote', stop_no = p_stop,
         out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, last_result = null
   where id = p_room;
end $$;

-- ── Round end and vote result: no more timer column to clear ────────────────
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

  update stowaway_rooms set phase = 'roundEnd', outcome = p_outcome, round_summary = summary
   where id = p_room;
end $$;

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
     set phase = 'offboard', out_player = out_id, offboard_at = now(),
         last_result = jsonb_build_object('tie', false, 'out', out_id, 'role', out_role, 'votes', votes)
   where id = p_room;
end $$;

-- ── Dealing a round: no more p_challenge ───────────────────────────────────
drop function if exists public.stowaway_start_round(text, uuid, text, text, boolean);

create or replace function public.stowaway_start_round(
  p_code text, p_token uuid, p_dare text default null, p_reset boolean default false)
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
         out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, outcome = null, last_result = null, round_summary = null,
         dare = case when r.dares then left(p_dare, 140) else null end
   where id = r.id;
end $$;

-- ── Back to the lobby ───────────────────────────────────────────────────────
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
         outcome = null, out_player = null where id = r.id;
end $$;

-- ── The columns themselves, and 'clues' leaves the phase check ──────────────
alter table public.stowaway_rooms
  drop column if exists challenges,
  drop column if exists turn_order,
  drop column if exists turn_pos,
  drop column if exists timer_started_at,
  drop column if exists challenge_id;

alter table public.stowaway_rooms drop constraint if exists stowaway_rooms_phase_check;
alter table public.stowaway_rooms add constraint stowaway_rooms_phase_check
  check (phase in ('lobby','deal','vote','offboard','guess','roundEnd','final'));

-- ── The new signatures need their own grants ────────────────────────────────
grant execute on function
  public.stowaway_set_settings(text,uuid,int,int,text,boolean,boolean),
  public.stowaway_start_round(text,uuid,text,boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';
