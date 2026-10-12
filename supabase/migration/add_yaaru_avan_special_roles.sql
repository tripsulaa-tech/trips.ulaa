-- Yaaru Fake? special roles for ONLINE rooms (the one-phone game already has them).
-- Run once in the Supabase SQL editor, AFTER every other stowaway migration
-- (add_yaaru_avan_online, add_yaaru_avan_share_links, upgrade_yaaru_avan_max_15,
-- fix_yaaru_avan_logic_and_privacy, remove_yaaru_avan_clue_round,
-- drop_yaaru_avan_clue_and_challenge_leftovers, rename_yaaru_avan_begin_clues_to_begin_vote).
-- Re-running it is safe. Deploy this BEFORE the new app build: the new build
-- calls stowaway_set_settings with an extra argument and stowaway_payback.
--
-- The rules mirror src/components/ui/stowawaySpecials.ts. Change one, change both.
--   Up to one special per 3 players, one per player, any core role.
--   clown        voted out in the first 2 stops: +4
--   rivals       (pair) rival voted out before you: +2
--   sleepyhead   never voted out: +1
--   returnTicket first vote against you is cancelled, the group votes again
--   tripLeader   breaks a tied vote (their own vote decides, if it is one of the tied)
--   backseatRider when voted out, one guess at the other side's word: +3; keeps voting
--   driver       chooses who speaks first (shown to everyone, no points)
--   buddies      (pair) both still aboard at the end: +2 each
--   payback      when voted out, takes one more player out: +2 if from the other side
--   luckyDip     becomes one of clown, sleepyhead, returnTicket, tripLeader,
--                backseatRider, driver (not one already dealt this round)

alter table public.stowaway_rooms add column if not exists specials boolean not null default false;

alter table public.stowaway_player_private
  add column if not exists special       text,
  add column if not exists dip_as        text,
  add column if not exists partner       uuid references public.stowaway_players(id) on delete set null,
  add column if not exists ticket_used   boolean not null default false,
  add column if not exists payback_done  boolean not null default false,
  add column if not exists rider_hit     boolean not null default false,
  add column if not exists payback_hit   boolean not null default false,
  add column if not exists out_stop      int,
  add column if not exists out_order     int;

alter table public.stowaway_player_private drop constraint if exists stowaway_player_private_special_check;
alter table public.stowaway_player_private add constraint stowaway_player_private_special_check
  check ((special is null or special in ('clown','rivals','sleepyhead','returnTicket','tripLeader',
                                         'backseatRider','driver','buddies','payback','luckyDip'))
     and (dip_as is null or dip_as in ('clown','sleepyhead','returnTicket','tripLeader','backseatRider','driver')));

alter table public.stowaway_rooms drop constraint if exists stowaway_rooms_phase_check;
alter table public.stowaway_rooms add constraint stowaway_rooms_phase_check
  check (phase in ('lobby','deal','vote','offboard','guess','payback','roundEnd','final'));

-- ── Settings: one new switch ────────────────────────────────────────────────
drop function if exists public.stowaway_set_settings(text, uuid, int, int, text, boolean, boolean);
create or replace function public.stowaway_set_settings(
  p_code text, p_token uuid, p_stowaways int, p_lost int, p_level text,
  p_hide_counts boolean, p_dares boolean, p_specials boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'bad_level'; end if;
  update stowaway_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         dares = coalesce(p_dares, false), specials = coalesce(p_specials, false) where id = r.id;
  update stowaway_room_private set stowaways = greatest(1, least(coalesce(p_stowaways, 1), 12)),
         lost = greatest(0, least(coalesce(p_lost, 0), 2)) where room_id = r.id;
end $$;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- The ability that actually applies to a player (a Lucky Dip's drawn ability).
create or replace function public._sw_active(p_player uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(dip_as, special) from stowaway_player_private where player_id = p_player
$$;

-- After someone leaves the plane (and any guess is done): a win, a Payback, or the next stop.
create or replace function public._sw_after_out(p_room uuid, p_out uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.stowaway_rooms; pp public.stowaway_player_private; w text; out_seat int;
begin
  select * into r from stowaway_rooms where id = p_room;
  w := _sw_winner(p_room);
  if w is not null then perform _sw_finish(p_room, w); return; end if;
  select * into pp from stowaway_player_private where player_id = p_out;
  if coalesce(pp.dip_as, pp.special) = 'payback' and not pp.payback_done
     and exists (select 1 from stowaway_players where room_id = p_room and alive) then
    update stowaway_rooms set phase = 'payback' where id = p_room;
    return;
  end if;
  select seat_idx into out_seat from stowaway_players where id = p_out;
  perform _sw_begin_stop(p_room, r.stop_no + 1, out_seat + 1);
end $$;

revoke all on function public._sw_active(uuid), public._sw_after_out(uuid, uuid) from public, anon, authenticated;

-- ── Dealing: roles as before, then specials ─────────────────────────────────
create or replace function public.stowaway_start_round(
  p_code text, p_token uuid, p_dare text default null, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; rp public.stowaway_room_private;
        n int; s int; l int; pair public.stowaway_word_pairs; flip boolean; ew text; sw text;
        roles text[]; i int := 0; pid uuid; seat_no text; seats text[] := '{}';
        enabled text[] := array['clown','rivals','sleepyhead','returnTicket','tripLeader',
                                'backseatRider','driver','buddies','payback','luckyDip'];
        slots int; chosen text[] := '{}'; sp text; cost int; ids uuid[]; idx int := 1; a uuid; b uuid;
        pool text[];
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

  -- Clear last round's special-role state, then deal new specials if the room asked for them.
  update stowaway_player_private
     set special = null, dip_as = null, partner = null, ticket_used = false, payback_done = false,
         rider_hit = false, payback_hit = false, out_stop = null, out_order = null
   where player_id in (select id from stowaway_players where room_id = r.id);

  if r.specials then
    slots := n / 3;                       -- one special per 3 players
    for sp in select x from unnest(enabled) x order by random() loop
      exit when slots = 0;
      cost := case when sp in ('rivals','buddies') then 2 else 1 end;
      continue when cost > slots;
      chosen := array_append(chosen, sp);
      slots := slots - cost;
    end loop;

    select array_agg(id order by random()) into ids from stowaway_players where room_id = r.id;
    foreach sp in array chosen loop
      if sp in ('rivals','buddies') then
        a := ids[idx]; b := ids[idx + 1]; idx := idx + 2;
        update stowaway_player_private set special = sp, partner = b where player_id = a;
        update stowaway_player_private set special = sp, partner = a where player_id = b;
      else
        update stowaway_player_private set special = sp where player_id = ids[idx];
        idx := idx + 1;
      end if;
    end loop;

    if 'luckyDip' = any(chosen) then
      pool := array(select x from unnest(array['clown','sleepyhead','returnTicket','tripLeader','backseatRider','driver']) x
                     where not (x = any(chosen)) order by random());
      select pv.player_id into a from stowaway_player_private pv join stowaway_players p on p.id = pv.player_id
       where p.room_id = r.id and pv.special = 'luckyDip';
      if cardinality(pool) = 0 then
        update stowaway_player_private set special = null where player_id = a;   -- nothing left to draw
      else
        update stowaway_player_private set dip_as = pool[1] where player_id = a;
      end if;
    end if;
  end if;

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

-- ── Voting: a Backseat Rider who is out still votes ─────────────────────────
create or replace function public.stowaway_cast_vote(p_code text, p_token uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; voters_n int; vote_n int; rider boolean;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'vote' then raise exception 'wrong_phase'; end if;
  select (pp.out_order is not null and coalesce(pp.dip_as, pp.special) = 'backseatRider') into rider
    from stowaway_player_private pp where pp.player_id = me.id;
  if not me.alive and not coalesce(rider, false) then raise exception 'offboard_cannot_vote'; end if;
  if p_target = me.id then raise exception 'cannot_vote_self'; end if;
  if not exists (select 1 from stowaway_players where id = p_target and room_id = r.id and alive) then
    raise exception 'bad_target';
  end if;
  insert into stowaway_votes (room_id, voter, target) values (r.id, me.id, p_target)
    on conflict (room_id, voter) do update set target = excluded.target;
  update stowaway_players set voted = true where id = me.id;
  select count(*) into voters_n
    from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
   where p.room_id = r.id
     and (p.alive or (pp.out_order is not null and coalesce(pp.dip_as, pp.special) = 'backseatRider'));
  select count(*) into vote_n from stowaway_votes where room_id = r.id;
  if vote_n >= voters_n then perform _sw_resolve_vote(r.id); end if;
end $$;

-- ── Resolving a vote: Trip Leader breaks ties, Return Ticket cancels a vote ──
create or replace function public._sw_resolve_vote(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare top_n int; tied uuid[]; out_id uuid; out_role text; votes jsonb; tie_names jsonb;
        tl uuid; tl_pick uuid; stop int; n_out int; out_name text; out_sp text; out_dip boolean;
begin
  select max(c) into top_n from (select count(*) c from stowaway_votes where room_id = p_room group by target) t;
  if top_n is null then return; end if;
  select array_agg(target) into tied from
    (select target from stowaway_votes where room_id = p_room group by target having count(*) = top_n) t;

  select coalesce(jsonb_agg(jsonb_build_object('from', v.name, 'to', t.name)), '[]'::jsonb) into votes
    from stowaway_votes sv join stowaway_players v on v.id = sv.voter join stowaway_players t on t.id = sv.target
   where sv.room_id = p_room;

  -- Trip Leader: in a tie, their own vote decides, if it is one of the tied players.
  if cardinality(tied) > 1 then
    select p.id into tl from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
     where p.room_id = p_room and p.alive and coalesce(pp.dip_as, pp.special) = 'tripLeader' limit 1;
    if tl is not null then
      select target into tl_pick from stowaway_votes where room_id = p_room and voter = tl;
      if tl_pick = any(tied) then tied := array[tl_pick]; end if;
    end if;
  end if;

  if cardinality(tied) > 1 then
    select jsonb_agg(p.name order by p.name) into tie_names from stowaway_players p where p.id = any(tied);
    delete from stowaway_votes where room_id = p_room;
    update stowaway_players set voted = false where room_id = p_room;
    update stowaway_rooms set last_result = jsonb_build_object('tie', true, 'names', tie_names, 'votes', votes)
     where id = p_room;
    return;
  end if;

  out_id := tied[1];
  select role, coalesce(dip_as, special), dip_as is not null into out_role, out_sp, out_dip
    from stowaway_player_private where player_id = out_id;
  select name into out_name from stowaway_players where id = out_id;

  -- Return Ticket: the first vote against them is cancelled and the group votes again.
  if out_sp = 'returnTicket' and not (select ticket_used from stowaway_player_private where player_id = out_id) then
    update stowaway_player_private set ticket_used = true where player_id = out_id;
    delete from stowaway_votes where room_id = p_room;
    update stowaway_players set voted = false where room_id = p_room;
    update stowaway_rooms
       set last_result = jsonb_build_object('tie', false, 'saved', out_id, 'name', out_name, 'votes', votes)
     where id = p_room;
    return;
  end if;

  -- Vote awards: pointing at a sneaky player was right, at an Explorer wrong.
  update stowaway_players p
     set correct_votes = p.correct_votes + (case when out_role <> 'explorer' then 1 else 0 end),
         wrong_votes   = p.wrong_votes   + (case when out_role =  'explorer' then 1 else 0 end)
   where p.id in (select voter from stowaway_votes where room_id = p_room and target = out_id and voter <> out_id);

  select stop_no into stop from stowaway_rooms where id = p_room;
  select count(*) into n_out from stowaway_player_private pp join stowaway_players p on p.id = pp.player_id
   where p.room_id = p_room and pp.out_order is not null;
  update stowaway_player_private set out_stop = stop, out_order = n_out + 1 where player_id = out_id;

  update stowaway_players set alive = false where id = out_id;
  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = 'offboard', out_player = out_id, offboard_at = now(),
         last_result = jsonb_build_object('tie', false, 'out', out_id, 'role', out_role,
                                          'special', out_sp, 'dip', coalesce(out_dip, false), 'votes', votes)
   where id = p_room;
end $$;

-- ── After the reveal: Stranger or Backseat Rider guess, else on to the next step ──
create or replace function public.stowaway_after_reveal(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; out_role text; out_sp text;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'offboard' or r.offboard_at is null then return; end if;
  if now() < r.offboard_at + interval '4 seconds' then return; end if;
  select role, coalesce(dip_as, special) into out_role, out_sp from stowaway_player_private where player_id = r.out_player;
  if out_role = 'lost' or out_sp = 'backseatRider' then
    update stowaway_rooms set phase = 'guess', guess_text = null, guess_match = null where id = r.id;
    return;
  end if;
  perform _sw_after_out(r.id, r.out_player);
end $$;

-- The guess is checked against the right word: the Travellers' word, or for a
-- Backseat Rider who was a Traveller, the Pickpockets' word.
create or replace function public.stowaway_submit_guess(p_code text, p_token uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; target_word text; my_role text;
        g text := left(btrim(coalesce(p_text, '')), 40);
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'guess' or r.out_player <> me.id then raise exception 'wrong_phase'; end if;
  if r.guess_text is not null then raise exception 'already_guessed'; end if;
  if g = '' then raise exception 'guess_required'; end if;
  select role into my_role from stowaway_player_private where player_id = me.id;
  select case when my_role = 'explorer' then stowaway_word else explorer_word end into target_word
    from stowaway_room_private where room_id = r.id;
  update stowaway_rooms set guess_text = g,
         guess_match = (lower(regexp_replace(g, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(target_word, '[^a-zA-Z0-9]', '', 'g')))
   where id = r.id;
end $$;

create or replace function public.stowaway_judge_guess(p_code text, p_token uuid, p_correct boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; out_role text;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'guess' then return; end if;
  if r.out_player = me.id then raise exception 'cannot_judge_own_guess'; end if;
  if r.guess_text is null then raise exception 'no_guess_yet'; end if;
  select role into out_role from stowaway_player_private where player_id = r.out_player;
  if out_role = 'lost' then
    if p_correct then
      update stowaway_players set alive = true where id = r.out_player; -- she stole the round
      perform _sw_finish(r.id, 'lost-steal');
      return;
    end if;
  else
    -- Backseat Rider: a right guess scores, either way the round goes on.
    update stowaway_player_private set rider_hit = p_correct where player_id = r.out_player;
  end if;
  perform _sw_after_out(r.id, r.out_player);
end $$;

-- ── Payback: the player who just left picks one more to go with them ────────
create or replace function public.stowaway_payback(p_code text, p_token uuid, p_victim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; payer_away boolean;
        payer_role text; v_role text; v_sp text; v_dip boolean; n_out int;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'payback' then raise exception 'wrong_phase'; end if;
  select (pv.last_seen < now() - interval '45 seconds') into payer_away
    from stowaway_player_private pv where pv.player_id = r.out_player;
  if me.id <> r.out_player and not (r.host_id = me.id and coalesce(payer_away, false)) then
    raise exception 'wrong_phase';
  end if;
  if not exists (select 1 from stowaway_players where id = p_victim and room_id = r.id and alive) then
    raise exception 'bad_target';
  end if;
  select role into payer_role from stowaway_player_private where player_id = r.out_player;
  select role, coalesce(dip_as, special), dip_as is not null into v_role, v_sp, v_dip
    from stowaway_player_private where player_id = p_victim;
  select count(*) into n_out from stowaway_player_private pp join stowaway_players p on p.id = pp.player_id
   where p.room_id = r.id and pp.out_order is not null;

  update stowaway_player_private
     set payback_done = true, payback_hit = ((v_role = 'explorer') <> (payer_role = 'explorer'))
   where player_id = r.out_player;
  update stowaway_player_private set out_stop = r.stop_no, out_order = n_out + 1 where player_id = p_victim;
  update stowaway_players set alive = false where id = p_victim;
  update stowaway_rooms
     set phase = 'offboard', out_player = p_victim, offboard_at = now(), guess_text = null, guess_match = null,
         last_result = jsonb_build_object('tie', false, 'out', p_victim, 'role', v_role,
                                          'special', v_sp, 'dip', coalesce(v_dip, false),
                                          'payback_by', r.out_player, 'votes', '[]'::jsonb)
   where id = r.id;
end $$;

-- ── Scoring: team points plus special-role bonuses ──────────────────────────
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
           else 0 end as base,
         case coalesce(pp.dip_as, pp.special)
           when 'clown'         then case when pp.out_stop is not null and pp.out_stop <= 2 then 4 else 0 end
           when 'rivals'        then case when rv.out_order is not null and rv.out_order < coalesce(pp.out_order, 2147483647) then 2 else 0 end
           when 'sleepyhead'    then case when pp.out_order is null then 1 else 0 end
           when 'backseatRider' then case when pp.rider_hit then 3 else 0 end
           when 'payback'       then case when pp.payback_hit then 2 else 0 end
           when 'buddies'       then case when pp.out_order is null and rv.out_order is null and pp.partner is not null then 2 else 0 end
           else 0 end as bonus,
         pp.role as role,
         coalesce(pp.dip_as, pp.special) as special,
         (pp.dip_as is not null) as dip
    from stowaway_players p
    join stowaway_player_private pp on pp.player_id = p.id
    left join stowaway_player_private rv on rv.player_id = pp.partner
   where p.room_id = p_room;

  update stowaway_players p
     set points   = p.points + g.base + g.bonus,
         survived = p.survived + (case when p_outcome = 'stowaways'  and p.alive and g.role = 'stowaway' then 1 else 0 end),
         lost_wins = p.lost_wins + (case when p_outcome = 'lost-steal' and p.alive and g.role = 'lost' then 1 else 0 end)
    from _sw_gain g where g.id = p.id;

  select jsonb_build_object(
           'outcome', p_outcome,
           'explorer_word', rp.explorer_word,
           'stowaway_word', rp.stowaway_word,
           'category', rp.category,
           'players', coalesce(jsonb_agg(jsonb_build_object(
                'id', g.id, 'role', g.role, 'gained', g.base + g.bonus, 'bonus', g.bonus,
                'special', g.special, 'dip', g.dip)), '[]'::jsonb))
    into summary from _sw_gain g;
  drop table _sw_gain;

  update stowaway_rooms set phase = 'roundEnd', outcome = p_outcome, round_summary = summary
   where id = p_room;
end $$;

-- ── What each phone is told ─────────────────────────────────────────────────
-- me.special is the ability that applies (a Lucky Dip's drawn one), me.dip says it came
-- from a Lucky Dip, me.partner is the name of a Rival or Buddy. Everyone sees which
-- alive players are the Trip Leader or Driver (the group needs that), and which players
-- may vote (alive, or a Backseat Rider who is out).
create or replace function public.stowaway_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; rp public.stowaway_room_private;
        mypriv public.stowaway_player_private; n int; show_counts boolean; players jsonb; host_away boolean;
        fs int; fl int; room_json jsonb; partner_name text; i_vote boolean;
begin
  me := _sw_me(p_code, p_token);
  update stowaway_player_private set last_seen = now() where player_id = me.id;
  select * into r from stowaway_rooms where id = me.room_id;
  select * into rp from stowaway_room_private where room_id = r.id;
  select * into mypriv from stowaway_player_private where player_id = me.id;
  select count(*) into n from stowaway_players where room_id = r.id;
  show_counts := (me.id = r.host_id) or not r.hide_counts;

  if n >= 3 then
    select f.fit_s, f.fit_l into fs, fl from public._sw_fit_roles(n, rp.stowaways, rp.lost) f;
  else
    fs := rp.stowaways; fl := rp.lost;
  end if;

  room_json := to_jsonb(r);
  if r.out_player is not distinct from me.id then
    room_json := room_json || jsonb_build_object('guess_match', null);
  end if;

  select name into partner_name from stowaway_players where id = mypriv.partner;
  i_vote := me.alive or (mypriv.out_order is not null and coalesce(mypriv.dip_as, mypriv.special) = 'backseatRider');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'seat', p.seat, 'seat_idx', p.seat_idx, 'alive', p.alive,
           'voted', p.voted, 'ready', p.ready, 'points', p.points, 'survived', p.survived,
           'correct_votes', p.correct_votes, 'wrong_votes', p.wrong_votes, 'lost_wins', p.lost_wins,
           'away', (pv.last_seen < now() - interval '45 seconds'),
           'voter', (p.alive or (pv.out_order is not null and coalesce(pv.dip_as, pv.special) = 'backseatRider')),
           'public_special', case when p.alive and r.phase not in ('lobby','deal')
                                   and coalesce(pv.dip_as, pv.special) in ('tripLeader','driver')
                                  then coalesce(pv.dip_as, pv.special) else null end
         ) order by p.joined_at), '[]'::jsonb)
    into players
    from stowaway_players p join stowaway_player_private pv on pv.player_id = p.id
   where p.room_id = r.id;

  select (pv.last_seen < now() - interval '60 seconds') into host_away
    from stowaway_player_private pv where pv.player_id = r.host_id;

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

-- ── Back to the lobby: forget the specials ──────────────────────────────────
create or replace function public.stowaway_to_lobby(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase not in ('roundEnd','final') then raise exception 'wrong_phase'; end if;
  update stowaway_players set alive = true, voted = false, ready = false where room_id = r.id;
  update stowaway_player_private
     set role = null, word = null, special = null, dip_as = null, partner = null, ticket_used = false,
         payback_done = false, rider_hit = false, payback_hit = false, out_stop = null, out_order = null
   where player_id in (select id from stowaway_players where room_id = r.id);
  update stowaway_rooms set phase = 'lobby', locked = false, last_result = null, round_summary = null,
         outcome = null, out_player = null where id = r.id;
end $$;

-- ── Who may call what ───────────────────────────────────────────────────────
grant execute on function
  public.stowaway_set_settings(text, uuid, int, int, text, boolean, boolean, boolean),
  public.stowaway_payback(text, uuid, uuid)
  to anon, authenticated;
