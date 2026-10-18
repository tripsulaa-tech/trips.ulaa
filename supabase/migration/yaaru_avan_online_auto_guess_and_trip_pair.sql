-- =============================================================================
-- yaaru_avan_online_auto_guess_and_trip_pair.sql
-- =============================================================================
-- Online rooms, matching pass-and-play:
--   1. The Pickpocket's typed guess is checked automatically. Capitals, spaces and accents
--      do not matter, and a word that is one letter off (4+ letters) still counts. A correct
--      guess steals the round straight away. A guess that does not match is still shown to
--      the group, who tap Wrong or Correct (so a fair synonym can still be allowed).
--   2. Trip-aware word pair: when the trip name matches a place in the word bank (a Coorg
--      trip, say), that place's pair is dealt once before the random ones.
-- Run AFTER yaaru_avan_online_random_order_typed_guess_retriever_reveal.sql. Safe to re-run.
-- =============================================================================

create extension if not exists fuzzystrmatch with schema extensions;

create or replace function public._ya_guess_close(p_guess text, p_answer text)
returns boolean language plpgsql immutable set search_path = public, extensions as $$
declare g text[]; a text[]; i int; gw text; aw text;
begin
  g := regexp_split_to_array(btrim(lower(coalesce(p_guess, ''))), '\s+');
  a := regexp_split_to_array(btrim(lower(coalesce(p_answer, ''))), '\s+');
  if cardinality(g) <> cardinality(a) then return false; end if;
  for i in 1 .. cardinality(a) loop
    gw := regexp_replace(translate(g[i], 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]', '', 'g');
    aw := regexp_replace(translate(a[i], 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]', '', 'g');
    if gw = '' then return false; end if;
    if gw <> aw and not (length(aw) >= 4 and levenshtein(gw, aw) <= 1) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.yaaru_avan_submit_guess(p_code text, p_token uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; tw text; ok boolean;
        g text := left(btrim(coalesce(p_text, '')), 40);
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase <> 'guess' or r.out_player <> me.id then raise exception 'wrong_phase'; end if;
  if r.guess_text is not null then raise exception 'already_guessed'; end if;
  if g = '' then raise exception 'guess_required'; end if;
  select tourist_word into tw from yaaru_avan_room_private where room_id = r.id;
  ok := _ya_guess_close(g, tw);
  update yaaru_avan_rooms set guess_text = g, guess_match = ok where id = r.id;
  if ok then
    -- Right answer: she stole the round, no need to wait for the group.
    update yaaru_avan_players set alive = true where id = r.out_player;
    perform _ya_finish(r.id, 'pickpocket-steal');
  end if;
end $$;

grant execute on function public.yaaru_avan_submit_guess(text, uuid, text) to anon, authenticated;
revoke all on function public._ya_guess_close(text, text) from public, anon, authenticated;

-- ── Start round, with the trip-aware pair ──
create or replace function public.yaaru_avan_start_round(
  p_code text, p_token uuid, p_dare text default null, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; rp public.yaaru_avan_room_private;
        n int; s int; l int; pair public.yaaru_avan_word_pairs; trip public.yaaru_avan_word_pairs; flip boolean; ew text; sw text;
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
     set used_pairs = array_append(used_pairs, pair.id), last_category = pair.category,
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

notify pgrst, 'reload schema';
