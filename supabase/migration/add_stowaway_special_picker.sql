-- ─────────────────────────────────────────────────────────────────────────────
-- add_stowaway_special_picker.sql
--
-- Yaaru Fake? online: the host can choose WHICH special roles are in play
-- (a checklist behind the "Special roles" row in the lobby) instead of one
-- all-or-nothing switch.
--
--   * stowaway_rooms.special_ids: the ticked specials. null = all of them
--     (so existing rooms and the old behaviour are unchanged).
--   * stowaway_set_settings takes a new last argument p_special_ids.
--   * stowaway_start_round deals only from the ticked specials. Lucky Dip only
--     turns into a ticked ability.
--
-- Run once in the Supabase SQL editor, AFTER add_stowaway_special_roles.sql and
-- adopt_undercover_rules_for_stowaway.sql. Safe to run again.
-- Deploy it BEFORE the new app build: the new build sends p_special_ids.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.stowaway_rooms add column if not exists special_ids text[];

-- ── Settings: one new argument ──────────────────────────────────────────────
drop function if exists public.stowaway_set_settings(text, uuid, int, int, text, boolean, boolean, boolean);

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
            where x in ('clown','rivals','sleepyhead','returnTicket','tripLeader',
                        'backseatRider','driver','buddies','payback','luckyDip')) end;
  update stowaway_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         dares = coalesce(p_dares, false),
         specials = coalesce(p_specials, false) and (ids is null or cardinality(ids) > 0),
         special_ids = ids
   where id = r.id;
  update stowaway_room_private set stowaways = s, lost = l where room_id = r.id;
end $$;

-- ── Dealing: only from the ticked specials ──────────────────────────────────
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
  -- Only the specials the host ticked (null = all of them).
  if r.special_ids is not null then
    enabled := array(select x from unnest(enabled) x where x = any(r.special_ids));
  end if;
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
         out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, outcome = null, last_result = null, round_summary = null,
         dare = case when r.dares then left(p_dare, 140) else null end
   where id = r.id;
end $$;

-- ── Who may call what ───────────────────────────────────────────────────────
grant execute on function
  public.stowaway_set_settings(text, uuid, int, int, text, boolean, boolean, boolean, text[]),
  public.stowaway_start_round(text, uuid, text, boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';
