-- Yaaru Fake? online rooms: play by Undercover's rules.
-- Run once in the Supabase SQL editor AFTER add_stowaway_special_roles.sql.
-- Re-running it is safe. Deploy it BEFORE the new app build (the build calls
-- stowaway_describe_done and may save 0 Pickpockets).
--
-- What changes (mirrors src/components/ui/stowawayEngine.ts; change one, change both):
--   1. Description round. Every stop starts with everyone describing their word in turn
--      (one word or a short phrase), then the group discusses and votes. Stop 1 starts at a
--      random seat; later stops start at the seat after the player who just left. A Driver
--      starts instead. A Sleepyhead sits out Stop 1. The host can skip to the vote.
--   2. Win: Travellers win when every Pickpocket and Stranger is out. The sneaky side wins
--      when only ONE Traveller is left (it used to be when they equalled the Travellers).
--   3. Points: Travellers 2 each, a winning Pickpocket 10, a winning Stranger 6, whether the
--      Stranger lasted to the end or guessed the Travellers' word.
--   4. A game needs at least one Pickpocket OR one Stranger, so a Stranger-only game is allowed.

alter table public.stowaway_rooms
  add column if not exists describe_order uuid[] not null default '{}',
  add column if not exists describe_pos   int    not null default 0;

alter table public.stowaway_rooms drop constraint if exists stowaway_rooms_phase_check;
alter table public.stowaway_rooms add constraint stowaway_rooms_phase_check
  check (phase in ('lobby','deal','describe','vote','offboard','guess','payback','roundEnd','final'));

-- ── 4. Role counts ──────────────────────────────────────────────────────────
create or replace function public._sw_roles_valid(n int, s int, l int)
returns boolean language sql immutable as $$
  select n between 3 and 15 and s >= 0 and l >= 0 and (s + l) >= 1
     and l <= (case when n >= 10 then 2 else 1 end)
     and (n - s - l) > (s + l);
$$;

create or replace function public._sw_fit_roles(n int, s int, l int, out fit_s int, out fit_l int)
language plpgsql immutable as $$
begin
  fit_s := greatest(0, coalesce(s, 1));
  fit_l := least(greatest(coalesce(l, 0), 0), case when n >= 10 then 2 else 1 end);
  if fit_s + fit_l < 1 then fit_s := 1; end if;
  while not _sw_roles_valid(n, fit_s, fit_l) and fit_l > 0 loop
    fit_l := fit_l - 1;
    if fit_s + fit_l < 1 then fit_s := 1; end if;
  end loop;
  while not _sw_roles_valid(n, fit_s, fit_l) and fit_s > 1 loop fit_s := fit_s - 1; end loop;
end $$;

create or replace function public.stowaway_set_settings(
  p_code text, p_token uuid, p_stowaways int, p_lost int, p_level text,
  p_hide_counts boolean, p_dares boolean, p_specials boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; s int; l int;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'bad_level'; end if;
  s := greatest(0, least(coalesce(p_stowaways, 1), 12));
  l := greatest(0, least(coalesce(p_lost, 0), 2));
  if s + l = 0 then s := 1; end if;   -- at least one Pickpocket or one Stranger
  update stowaway_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         dares = coalesce(p_dares, false), specials = coalesce(p_specials, false) where id = r.id;
  update stowaway_room_private set stowaways = s, lost = l where room_id = r.id;
end $$;

-- ── 2. Who has won ──────────────────────────────────────────────────────────
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
  if ex <= 1 then return 'stowaways'; end if;
  return null;
end $$;

-- ── 1. Every stop starts with the description round ─────────────────────────
create or replace function public._sw_begin_stop(p_room uuid, p_stop int, p_from int)
returns void language plpgsql security definer set search_path = public as $$
declare n int; start_at int; drv int; ord uuid[];
begin
  select count(*) into n from stowaway_players where room_id = p_room;
  n := greatest(n, 1);
  select p.seat_idx into drv
    from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
   where p.room_id = p_room and p.alive and coalesce(pp.dip_as, pp.special) = 'driver' limit 1;
  start_at := coalesce(drv, ((coalesce(p_from, 0) % n) + n) % n);
  select coalesce(array_agg(p.id order by ((p.seat_idx - start_at + n) % n)), '{}'::uuid[]) into ord
    from stowaway_players p join stowaway_player_private pp on pp.player_id = p.id
   where p.room_id = p_room and p.alive
     and (p_stop <> 1 or coalesce(pp.dip_as, pp.special) is distinct from 'sleepyhead');

  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = case when cardinality(ord) > 0 then 'describe' else 'vote' end,
         stop_no = p_stop, describe_order = ord, describe_pos = 0,
         out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, last_result = null
   where id = p_room;
end $$;

-- The host starts the first description round (from the deal), or skips ahead to the vote.
create or replace function public.stowaway_begin_vote(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase = 'deal' then
    perform _sw_begin_stop(r.id, 1, r.start_idx);
  elsif r.phase = 'describe' then
    update stowaway_rooms set phase = 'vote', describe_order = '{}', describe_pos = 0 where id = r.id;
  else
    raise exception 'wrong_phase';
  end if;
end $$;

-- The speaker (or the host) says they are done; the next player is up. p_pos is the
-- position the caller saw, so a double tap or two phones cannot skip someone.
create or replace function public.stowaway_describe_done(p_code text, p_token uuid, p_pos int default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'describe' then return; end if;
  if p_pos is not null and p_pos <> r.describe_pos then return; end if;
  if me.id <> r.describe_order[r.describe_pos + 1] and r.host_id <> me.id then raise exception 'not_your_turn'; end if;
  if r.describe_pos + 1 >= cardinality(r.describe_order) then
    update stowaway_rooms set phase = 'vote', describe_order = '{}', describe_pos = 0 where id = r.id;
  else
    update stowaway_rooms set describe_pos = r.describe_pos + 1 where id = r.id;
  end if;
end $$;

-- ── 3. Points ───────────────────────────────────────────────────────────────
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

grant execute on function
  public.stowaway_set_settings(text, uuid, int, int, text, boolean, boolean, boolean),
  public.stowaway_begin_vote(text, uuid),
  public.stowaway_describe_done(text, uuid, int)
  to anon, authenticated;
