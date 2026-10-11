-- Stowaway: drop the `challenges` and `turn_order` columns of stowaway_rooms.
--
-- Both are leftovers: challenge cards are gone from the game, and the clue round
-- (the only user of the speaking order) was removed in remove_stowaway_clue_round.sql.
-- Safe to re-run. Rooms only live a few hours, so nothing of value is lost.
--
-- What changes besides the two columns:
--   * stowaway_set_settings loses its p_challenges argument (new signature).
--   * stowaway_timer, stowaway_next_speaker and stowaway_skip_to_vote are dropped:
--     they only ever worked during the clue phase, and the first two read turn_order.
--   * _sw_begin_stop, stowaway_start_round and stowaway_to_lobby no longer write
--     the dropped columns.
--
-- Deploy this together with the matching client build: an old browser tab that
-- still sends p_challenges to stowaway_set_settings will get an error until it reloads.
--
-- Left alone on purpose (still written, never read): turn_pos, timer_started_at,
-- challenge_id, the stowaway_start_round p_challenge argument, and 'clues' in the
-- phase check.

-- Any room still sitting in the old clue phase moves on to the vote.
update public.stowaway_rooms
   set phase = 'vote', timer_started_at = null, turn_pos = 0
 where phase = 'clues';

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
     set phase = 'vote', stop_no = p_stop, turn_pos = 0,
         timer_started_at = null, out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, last_result = null
   where id = p_room;
end $$;

-- ── Dealing a round and going back to the lobby ─────────────────────────────
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
         turn_pos = 0, timer_started_at = null, out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, outcome = null, last_result = null, round_summary = null,
         challenge_id = left(p_challenge, 40),
         dare = case when r.dares then left(p_dare, 140) else null end
   where id = r.id;
end $$;

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
         outcome = null, out_player = null, timer_started_at = null where id = r.id;
end $$;

-- ── The columns themselves ──────────────────────────────────────────────────
alter table public.stowaway_rooms
  drop column if exists challenges,
  drop column if exists turn_order;

-- ── The new set_settings signature needs its own grant ──────────────────────
grant execute on function public.stowaway_set_settings(text,uuid,int,int,text,boolean,boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';
