-- ─────────────────────────────────────────────────────────────────────────────
-- update_yaaru_avan_online_roles_to_ulaa.sql
--
-- Yaaru Fake? ONLINE rooms: bring the special roles in line with the one-phone game
-- (src/components/ui/stowawaySpecials.ts). Change one, change both.
--
-- Run once in the Supabase SQL editor, AFTER every other stowaway migration
-- (the last one before this is add_yaaru_avan_special_picker.sql). Safe to run again.
-- Deploy it BEFORE the new app build: the build calls stowaway_tiebreak.
--
-- Roles after this migration (Ulaa name -> rule):
--   clown          Joy Fool          +4 if you are the first player voted out
--   rivals         Duelists (pair)   secret duel: first one voted out -2, the other +2     (5+ players)
--   returnTicket   Boomerang         first time they get the majority they stay aboard;
--                                    the votes bounce back onto the players who cast them
--   tripLeader     Goddess of Justice  decides a tied vote, even if already eliminated; secret
--   backseatRider  Ghost             keeps voting after being voted out (no guess, no points)
--   payback        Revenger          takes one more player out with them, no points       (5+ players)
--   luckyDip       Falafel Vendor    random ability (clown, returnTicket, tripLeader,
--                                    backseatRider, payback)                              (4+ players)
--   lovers (pair)  Lovers            if one is voted out, the other goes too              (5+ players)
--   Removed: sleepyhead, driver, buddies.
--   Up to one special ROLE per 3 players, one per player; a pair counts as one role.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Data: drop the removed roles from rooms that still hold them ────────────
update public.stowaway_player_private
   set special = null, dip_as = null, partner = null
 where special in ('sleepyhead','driver','buddies') or dip_as in ('sleepyhead','driver');

update public.stowaway_rooms
   set special_ids = array(select x from unnest(special_ids) x
                            where x in ('clown','rivals','returnTicket','tripLeader',
                                        'backseatRider','payback','luckyDip','lovers'))
 where special_ids is not null;

alter table public.stowaway_player_private drop constraint if exists stowaway_player_private_special_check;
alter table public.stowaway_player_private add constraint stowaway_player_private_special_check
  check ((special is null or special in ('clown','rivals','returnTicket','tripLeader',
                                         'backseatRider','payback','luckyDip','lovers'))
     and (dip_as is null or dip_as in ('clown','returnTicket','tripLeader','backseatRider','payback')));

-- A tied vote can now wait for the Goddess of Justice; a Boomerang bounce narrows the vote.
alter table public.stowaway_rooms drop constraint if exists stowaway_rooms_phase_check;
alter table public.stowaway_rooms add constraint stowaway_rooms_phase_check
  check (phase in ('lobby','deal','describe','vote','tiebreak','offboard','guess','payback','roundEnd','final'));

alter table public.stowaway_rooms add column if not exists bounce uuid[];

-- ── Settings: only the new role ids are accepted ────────────────────────────
create or replace function public.stowaway_set_settings(
  p_code text, p_token uuid, p_stowaways int, p_lost int, p_level text,
  p_hide_counts boolean, p_dares boolean, p_specials boolean default false,
  p_special_ids text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; s int; l int; ids text[];
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'bad_level'; end if;
  s := greatest(0, least(coalesce(p_stowaways, 1), 12));
  l := greatest(0, least(coalesce(p_lost, 0), 2));
  if s + l = 0 then s := 1; end if;   -- at least one Pickpocket or one Stranger
  ids := case when p_special_ids is null then null else array(
           select distinct x from unnest(p_special_ids) x
            where x in ('clown','rivals','returnTicket','tripLeader',
                        'backseatRider','payback','luckyDip','lovers')) end;
  update stowaway_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         dares = coalesce(p_dares, false),
         specials = coalesce(p_specials, false) and (ids is null or cardinality(ids) > 0),
         special_ids = ids
   where id = r.id;
  update stowaway_room_private set stowaways = s, lost = l where room_id = r.id;
end $$;

-- ── Dealing ─────────────────────────────────────────────────────────────────
create or replace function public.stowaway_start_round(
  p_code text, p_token uuid, p_dare text default null, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; rp public.stowaway_room_private;
        n int; s int; l int; pair public.stowaway_word_pairs; flip boolean; ew text; sw text;
        roles text[]; i int := 0; pid uuid; seat_no text; seats text[] := '{}';
        enabled text[] := array['clown','rivals','returnTicket','tripLeader',
                                'backseatRider','payback','luckyDip','lovers'];
        slots int; chosen text[] := '{}'; sp text; ids uuid[]; idx int := 1; a uuid; b uuid;
        pool text[];
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase not in ('lobby','roundEnd','final') then raise exception 'wrong_phase'; end if;
  -- Only the specials the host ticked (null = all of them).
  if r.special_ids is not null then
    enabled := array(select x from unnest(enabled) x where x = any(r.special_ids));
  end if;
  select * into rp from stowaway_room_private where room_id = r.id;
  select count(*) into n from stowaway_players where room_id = r.id;
  if n < 3 then raise exception 'need_more_players'; end if;
  -- Some roles need a bigger group.
  enabled := array(select x from unnest(enabled) x
                    where n >= case x when 'luckyDip' then 4 when 'payback' then 5
                                      when 'rivals' then 5 when 'lovers' then 5 else 0 end);

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
    slots := n / 3;                       -- one special role per 3 players; a pair is one role
    for sp in select x from unnest(enabled) x order by random() loop
      exit when slots = 0;
      chosen := array_append(chosen, sp);
      slots := slots - 1;
    end loop;

    select array_agg(id order by random()) into ids from stowaway_players where room_id = r.id;
    foreach sp in array chosen loop
      if sp in ('rivals','lovers') then
        a := ids[idx]; b := ids[idx + 1]; idx := idx + 2;
        update stowaway_player_private set special = sp, partner = b where player_id = a;
        update stowaway_player_private set special = sp, partner = a where player_id = b;
      else
        update stowaway_player_private set special = sp where player_id = ids[idx];
        idx := idx + 1;
      end if;
    end loop;

    if 'luckyDip' = any(chosen) then
      pool := array(select x from unnest(array['clown','returnTicket','tripLeader','backseatRider','payback']) x
                     where not (x = any(chosen)) and x = any(enabled) order by random());
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
         out_player = null, offboard_at = null, bounce = null,
         guess_text = null, guess_match = null, outcome = null, last_result = null, round_summary = null,
         dare = case when r.dares then left(p_dare, 140) else null end
   where id = r.id;
end $$;

-- ── A new stop: no Driver, no Sleepyhead ────────────────────────────────────
create or replace function public._sw_begin_stop(p_room uuid, p_stop int, p_from int)
returns void language plpgsql security definer set search_path = public as $$
declare n int; start_at int; ord uuid[];
begin
  select count(*) into n from stowaway_players where room_id = p_room;
  n := greatest(n, 1);
  start_at := ((coalesce(p_from, 0) % n) + n) % n;
  select coalesce(array_agg(p.id order by ((p.seat_idx - start_at + n) % n)), '{}'::uuid[]) into ord
    from stowaway_players p
   where p.room_id = p_room and p.alive;

  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = case when cardinality(ord) > 0 then 'describe' else 'vote' end,
         stop_no = p_stop, describe_order = ord, describe_pos = 0, bounce = null,
         out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, last_result = null
   where id = p_room;
end $$;

-- ── Taking a player offboard. Lovers go together. Returns the lover who left too. ──
create or replace function public._sw_take_out(p_room uuid, p_player uuid, p_stop int)
returns uuid language plpgsql security definer set search_path = public as $$
declare n_out int; sp text; partner_id uuid;
begin
  select count(*) into n_out from stowaway_player_private pp join stowaway_players p on p.id = pp.player_id
   where p.room_id = p_room and pp.out_order is not null;
  update stowaway_player_private set out_stop = p_stop, out_order = n_out + 1 where player_id = p_player;
  update stowaway_players set alive = false where id = p_player;
  select coalesce(dip_as, special), partner into sp, partner_id
    from stowaway_player_private where player_id = p_player;
  if sp = 'lovers' and partner_id is not null
     and exists (select 1 from stowaway_players where id = partner_id and alive) then
    update stowaway_player_private set out_stop = p_stop, out_order = n_out + 2 where player_id = partner_id;
    update stowaway_players set alive = false where id = partner_id;
    return partner_id;
  end if;
  return null;
end $$;

-- ── Someone is voted out (the group's pick, the Goddess's pick or a Boomerang bounce) ──
create or replace function public._sw_out_now(
  p_room uuid, p_out uuid, p_votes jsonb, p_award boolean, p_bounce_from uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare out_role text; out_sp text; out_dip boolean; stop int; lover uuid;
begin
  select role, coalesce(dip_as, special), dip_as is not null into out_role, out_sp, out_dip
    from stowaway_player_private where player_id = p_out;

  -- Vote awards: pointing at a sneaky player was right, at an Explorer wrong.
  if p_award then
    update stowaway_players p
       set correct_votes = p.correct_votes + (case when out_role <> 'explorer' then 1 else 0 end),
           wrong_votes   = p.wrong_votes   + (case when out_role =  'explorer' then 1 else 0 end)
     where p.id in (select voter from stowaway_votes where room_id = p_room and target = p_out and voter <> p_out);
  end if;

  select stop_no into stop from stowaway_rooms where id = p_room;
  lover := _sw_take_out(p_room, p_out, stop);

  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = 'offboard', out_player = p_out, offboard_at = now(), bounce = null,
         last_result = jsonb_build_object('tie', false, 'out', p_out, 'role', out_role,
                                          'special', out_sp, 'dip', coalesce(out_dip, false),
                                          'lover', lover, 'bounce_from', p_bounce_from,
                                          'votes', p_votes)
   where id = p_room;
end $$;

-- ── The vote has a single top pick: Boomerang bounce, or out they go ───────
create or replace function public._sw_apply_vote(p_room uuid, p_out uuid, p_votes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare out_sp text; out_name text; bounced uuid[]; bounce_names jsonb;
begin
  select coalesce(dip_as, special) into out_sp from stowaway_player_private where player_id = p_out;
  select name into out_name from stowaway_players where id = p_out;

  -- Boomerang: the first time they get the majority they are not eliminated.
  -- The votes bounce back onto the players who cast them.
  if out_sp = 'returnTicket' and not (select ticket_used from stowaway_player_private where player_id = p_out) then
    update stowaway_player_private set ticket_used = true where player_id = p_out;
    bounced := array(select sv.voter from stowaway_votes sv join stowaway_players p on p.id = sv.voter
                      where sv.room_id = p_room and sv.target = p_out and p.alive and sv.voter <> p_out);

    if cardinality(bounced) = 1 then
      -- Only one voter: the whole bounce lands on them.
      delete from stowaway_votes where room_id = p_room;
      perform _sw_out_now(p_room, bounced[1], p_votes, false, p_out);
      return;
    end if;

    delete from stowaway_votes where room_id = p_room;
    update stowaway_players set voted = false where room_id = p_room;
    select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb) into bounce_names
      from stowaway_players p where p.id = any(bounced);
    update stowaway_rooms
       set bounce = case when cardinality(bounced) > 1 then bounced else null end,
           last_result = jsonb_build_object('tie', false, 'saved', p_out, 'name', out_name,
                                            'bounce_names', bounce_names, 'votes', p_votes)
     where id = p_room;
    return;
  end if;

  perform _sw_out_now(p_room, p_out, p_votes, true);
end $$;

-- ── Resolving a vote: a tie goes to the Goddess of Justice, if there is one ──
create or replace function public._sw_resolve_vote(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare top_n int; tied uuid[]; votes jsonb; tie_names jsonb; goddess uuid;
begin
  select max(c) into top_n from (select count(*) c from stowaway_votes where room_id = p_room group by target) t;
  if top_n is null then return; end if;
  select array_agg(target) into tied from
    (select target from stowaway_votes where room_id = p_room group by target having count(*) = top_n) t;

  select coalesce(jsonb_agg(jsonb_build_object('from', v.name, 'to', t.name)), '[]'::jsonb) into votes
    from stowaway_votes sv join stowaway_players v on v.id = sv.voter join stowaway_players t on t.id = sv.target
   where sv.room_id = p_room;

  if cardinality(tied) > 1 then
    select jsonb_agg(p.name order by p.name) into tie_names from stowaway_players p where p.id = any(tied);

    -- The Goddess of Justice decides, even if she has already been eliminated.
    select p.id into goddess from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
     where p.room_id = p_room and coalesce(pp.dip_as, pp.special) = 'tripLeader' limit 1;
    if goddess is not null then
      update stowaway_rooms
         set phase = 'tiebreak',
             last_result = jsonb_build_object('tie', true, 'tiebreak', true, 'leader', goddess,
                                              'tied', to_jsonb(tied), 'names', tie_names, 'votes', votes)
       where id = p_room;
      return;
    end if;

    delete from stowaway_votes where room_id = p_room;
    update stowaway_players set voted = false where room_id = p_room;
    update stowaway_rooms set last_result = jsonb_build_object('tie', true, 'names', tie_names, 'votes', votes)
     where id = p_room;
    return;
  end if;

  perform _sw_apply_vote(p_room, tied[1], votes);
end $$;

-- The Goddess of Justice picks who goes from the tied players. If she is away for
-- 45 seconds, the host can pick for her.
create or replace function public.stowaway_tiebreak(p_code text, p_token uuid, p_pick uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; goddess uuid; goddess_away boolean;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'tiebreak' then raise exception 'wrong_phase'; end if;
  goddess := (r.last_result->>'leader')::uuid;
  select (pv.last_seen < now() - interval '45 seconds') into goddess_away
    from stowaway_player_private pv where pv.player_id = goddess;
  if me.id <> goddess and not (r.host_id = me.id and coalesce(goddess_away, false)) then
    raise exception 'wrong_phase';
  end if;
  if not exists (select 1 from jsonb_array_elements_text(r.last_result->'tied') t where t = p_pick::text) then
    raise exception 'bad_target';
  end if;
  perform _sw_apply_vote(r.id, p_pick, r.last_result->'votes');
end $$;

-- ── Voting: a Ghost who is out still votes; after a bounce only the bounced are up ──
create or replace function public.stowaway_cast_vote(p_code text, p_token uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; voters_n int; vote_n int; ghost boolean;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'vote' then raise exception 'wrong_phase'; end if;
  select (pp.out_order is not null and coalesce(pp.dip_as, pp.special) = 'backseatRider') into ghost
    from stowaway_player_private pp where pp.player_id = me.id;
  if not me.alive and not coalesce(ghost, false) then raise exception 'offboard_cannot_vote'; end if;
  if p_target = me.id then raise exception 'cannot_vote_self'; end if;
  if not exists (select 1 from stowaway_players where id = p_target and room_id = r.id and alive) then
    raise exception 'bad_target';
  end if;
  if r.bounce is not null and not (p_target = any(r.bounce)) then raise exception 'bad_target'; end if;
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

-- ── After the reveal: only the Stranger guesses now (the Ghost has no guess) ──
create or replace function public.stowaway_after_reveal(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; out_role text;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'offboard' or r.offboard_at is null then return; end if;
  if now() < r.offboard_at + interval '4 seconds' then return; end if;
  select role into out_role from stowaway_player_private where player_id = r.out_player;
  if out_role = 'lost' then
    update stowaway_rooms set phase = 'guess', guess_text = null, guess_match = null where id = r.id;
    return;
  end if;
  perform _sw_after_out(r.id, r.out_player);
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
  if out_role = 'lost' and p_correct then
    update stowaway_players set alive = true where id = r.out_player; -- she stole the round
    perform _sw_finish(r.id, 'lost-steal');
    return;
  end if;
  perform _sw_after_out(r.id, r.out_player);
end $$;

-- ── Revenger (Payback): the player who just left takes one more with them ───
create or replace function public.stowaway_payback(p_code text, p_token uuid, p_victim uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; payer_away boolean;
        v_role text; v_sp text; v_dip boolean; lover uuid;
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
  select role, coalesce(dip_as, special), dip_as is not null into v_role, v_sp, v_dip
    from stowaway_player_private where player_id = p_victim;

  update stowaway_player_private set payback_done = true where player_id = r.out_player;
  lover := _sw_take_out(r.id, p_victim, r.stop_no);
  update stowaway_rooms
     set phase = 'offboard', out_player = p_victim, offboard_at = now(), guess_text = null, guess_match = null,
         last_result = jsonb_build_object('tie', false, 'out', p_victim, 'role', v_role,
                                          'special', v_sp, 'dip', coalesce(v_dip, false),
                                          'lover', lover, 'payback_by', r.out_player, 'votes', '[]'::jsonb)
   where id = r.id;
end $$;

-- ── Scoring: team points plus the role bonuses ──────────────────────────────
create or replace function public._sw_finish(p_room uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.stowaway_room_private; summary jsonb;
begin
  select * into rp from stowaway_room_private where room_id = p_room;

  create temp table _sw_gain on commit drop as
  select p.id,
         case
           when p_outcome = 'explorers'  and pp.role = 'explorer'                  then 2
           when p_outcome = 'stowaways'  and p.alive and pp.role = 'stowaway'      then 10
           when p_outcome = 'stowaways'  and p.alive and pp.role = 'lost'          then 6
           when p_outcome = 'lost-steal' and p.alive and pp.role = 'lost'          then 6
           else 0 end as base,
         case coalesce(pp.dip_as, pp.special)
           -- Joy Fool: +4 if they were the first player voted out.
           when 'clown'  then case when pp.out_order = 1 then 4 else 0 end
           -- Duelists: the first one voted out loses 2, the other wins 2.
           when 'rivals' then case
                                when pp.partner is null then 0
                                when coalesce(pp.out_order, 2147483647) < coalesce(rv.out_order, 2147483647) then -2
                                when coalesce(rv.out_order, 2147483647) < coalesce(pp.out_order, 2147483647) then 2
                                else 0 end
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

-- ── What each phone is told: every role is secret now ───────────────────────
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
           'public_special', null
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

-- ── Who may call what ───────────────────────────────────────────────────────
revoke all on function
  public._sw_take_out(uuid, uuid, int),
  public._sw_out_now(uuid, uuid, jsonb, boolean, uuid),
  public._sw_apply_vote(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function
  public.stowaway_set_settings(text, uuid, int, int, text, boolean, boolean, boolean, text[]),
  public.stowaway_start_round(text, uuid, text, boolean),
  public.stowaway_cast_vote(text, uuid, uuid),
  public.stowaway_after_reveal(text, uuid),
  public.stowaway_judge_guess(text, uuid, boolean),
  public.stowaway_payback(text, uuid, uuid),
  public.stowaway_tiebreak(text, uuid, uuid),
  public.stowaway_state(text, uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
