-- =============================================================================
-- yaaru_avan_reuse_words.sql
-- =============================================================================
-- Online Yaaru Avan?: words can come back in later rounds, with the sides shuffled
-- again, so players cannot guess their role from words they remember.
--
--   * Before: a word pair was never dealt twice in one room.
--   * Now: from round 2 on, about 1 round in 4 re-deals a pair already played in this
--     room (it can be the very next round). Which word the Tourists get and which the
--     Stranger gets is random every time, so last round's Stranger word may now be the
--     Tourists' word, and the other way round.
--   * Not used for "Play again" (round 1 of a new game), and never when the host taps
--     "Pick a new word" or removes a player mid-round: the word just skipped will not
--     come straight back.
--
-- Replaces yaaru_avan_start_round (copy of the version from
-- yaaru_avan_online_auto_guess_and_trip_pair.sql plus the reuse step) and
-- yaaru_avan_repick_word. To change how often words come back, edit the 0.25 below.
-- Run once in the Supabase SQL editor, after the other yaaru_avan migrations (and after
-- yaaru_avan_host_remove_mid_game.sql). Safe to run again. No data changes.
-- =============================================================================

create or replace function public.yaaru_avan_start_round(
  p_code text, p_token uuid, p_dare text default null, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; rp public.yaaru_avan_room_private;
        n int; s int; l int; pair public.yaaru_avan_word_pairs; reuse public.yaaru_avan_word_pairs; trip public.yaaru_avan_word_pairs; flip boolean; ew text; sw text;
        roles text[]; i int := 0; pid uuid; seat_no text; seats text[] := '{}';
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase not in ('lobby','roundEnd','final') then raise exception 'wrong_phase'; end if;
  select * into rp from yaaru_avan_room_private where room_id = r.id;
  select count(*) into n from yaaru_avan_players where room_id = r.id;
  if n < 3 then raise exception 'need_more_players'; end if;
  -- Shrink to a valid split if players changed since the host picked roles.
  s := rp.strangers; l := rp.pickpockets;
  l := least(l, case when n >= 10 then 2 else 1 end);
  while not _ya_roles_valid(n, s, l) and l > 0 loop l := l - 1; end loop;
  while not _ya_roles_valid(n, s, l) and s > 1 loop s := s - 1; end loop;
  if not _ya_roles_valid(n, s, l) then raise exception 'bad_roles'; end if;

  if p_reset then
    update yaaru_avan_players set points = 0, survived = 0, correct_votes = 0, wrong_votes = 0, pickpocket_wins = 0
     where room_id = r.id;
    update yaaru_avan_rooms set round_no = 0 where id = r.id;
    update yaaru_avan_room_private set used_pairs = '{}', last_category = null where room_id = r.id;
    select * into rp from yaaru_avan_room_private where room_id = r.id;
  end if;

  -- Word pair: not used yet, and not the same category twice in a row.
  select * into pair from yaaru_avan_word_pairs
   where level = r.level and not (id = any(rp.used_pairs)) and category is distinct from rp.last_category
   order by random() limit 1;
  if not found then
    select * into pair from yaaru_avan_word_pairs
     where level = r.level and not (id = any(rp.used_pairs)) order by random() limit 1;
  end if;
  if not found then
    update yaaru_avan_room_private set used_pairs = '{}' where room_id = r.id;
    select * into pair from yaaru_avan_word_pairs where level = r.level
     and category is distinct from rp.last_category order by random() limit 1;
    if not found then select * into pair from yaaru_avan_word_pairs where level = r.level order by random() limit 1; end if;
  end if;
  -- Word reuse: about 1 round in 4 (from round 2 on), a pair already played in this room
  -- comes back. The sides are shuffled again below, so the word that was the Stranger's can
  -- now be the Tourists', and the other way round. It can even be the very next round, so
  -- nobody can work out their role from the words they remember.
  -- Not used for "Play again" (p_reset), nor when the host asked for a new word or removed a
  -- player (those callers switch it off with yaaru.no_reuse), so a skipped word never returns.
  if not p_reset and r.round_no >= 1 and cardinality(rp.used_pairs) > 0
     and coalesce(current_setting('yaaru.no_reuse', true), '') <> '1' and random() < 0.25 then
    select * into reuse from yaaru_avan_word_pairs
     where level = r.level and id = any(rp.used_pairs) order by random() limit 1;
    if found then pair := reuse; end if;
  end if;

  -- Trip-aware (as in pass-and-play): when the trip's name matches a place in the word bank
  -- (a Coorg trip, say), that place's pair is dealt once, before the random ones.
  select * into trip from yaaru_avan_word_pairs wp
   where wp.category = 'places' and not (wp.id = any(rp.used_pairs))
     and (lower(r.trip_title) ~ ('\m' || regexp_replace(lower(wp.a), '[^a-z0-9 ]', '', 'g') || '\M')
       or lower(r.trip_title) ~ ('\m' || regexp_replace(lower(wp.b), '[^a-z0-9 ]', '', 'g') || '\M'))
   limit 1;
  if found then pair := trip; end if;

  if pair.id is null then raise exception 'no_words'; end if;

  flip := random() < 0.5;
  ew := case when flip then pair.a else pair.b end;
  sw := case when flip then pair.b else pair.a end;

  roles := array_cat(array_cat(array_fill('tourist'::text, array[n - s - l]),
                               array_fill('stranger'::text, array[s])),
                     case when l > 0 then array_fill('pickpocket'::text, array[l]) else '{}'::text[] end);

  -- Shuffle players: seat order and roles are independent random shuffles.
  for pid in select id from yaaru_avan_players where room_id = r.id order by random() loop
    i := i + 1;
    loop
      seat_no := (1 + floor(random() * 28))::int || substr('ABCDEF', 1 + floor(random() * 6)::int, 1);
      exit when not (seat_no = any(seats));
    end loop;
    seats := array_append(seats, seat_no);
    update yaaru_avan_players set seat_idx = i - 1, seat = seat_no, alive = true, voted = false, ready = false where id = pid;
  end loop;

  i := 0;
  for pid in select id from yaaru_avan_players where room_id = r.id order by random() loop
    i := i + 1;
    update yaaru_avan_player_private
       set role = roles[i], word = case roles[i] when 'tourist' then ew when 'stranger' then sw else null end
     where player_id = pid;
  end loop;

  -- Clear last round's special-role state, then deal new specials if the room asked for them.
  update yaaru_avan_player_private
     set special = null, dip_as = null, partner = null, boomerang_used = false, revenge_done = false,
         ghost_hit = false, revenge_hit = false, out_stop = null, out_order = null, last_out_order = null, retrieval_used = false
   where player_id in (select id from yaaru_avan_players where room_id = r.id);

  if r.specials then perform _ya_deal_specials(r.id, n, s, r.special_ids); end if;

  delete from yaaru_avan_votes where room_id = r.id;
  update yaaru_avan_room_private
     set used_pairs = case when pair.id = any(used_pairs) then used_pairs else array_append(used_pairs, pair.id) end, last_category = pair.category,
         tourist_word = ew, stranger_word = sw, category = pair.category
   where room_id = r.id;
  update yaaru_avan_rooms
     set phase = 'deal', round_no = round_no + 1, stop_no = 1, start_idx = floor(random() * n)::int,
         out_player = null, offboard_at = null, bounce = null, retrieve_deadline = null,
         guess_queue = '{}', guess_after = null,
         guess_text = null, guess_match = null, outcome = null, last_result = null, round_summary = null,
         dare = case when r.dares then left(p_dare, 140) else null end
   where id = r.id;
end $$;

grant execute on function public.yaaru_avan_start_round(text, uuid, text, boolean) to anon, authenticated;

create or replace function public.yaaru_avan_repick_word(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'deal' then raise exception 'wrong_phase'; end if;

  update public.yaaru_avan_rooms
     set phase = 'roundEnd', round_no = greatest(round_no - 1, 0)
   where id = r.id;

  -- The host asked for a NEW word, so the one just skipped must not come back.
  perform set_config('yaaru.no_reuse', '1', true);
  perform public.yaaru_avan_start_round(p_code, p_token, r.dare, false);
end $$;

grant execute on function public.yaaru_avan_repick_word(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
