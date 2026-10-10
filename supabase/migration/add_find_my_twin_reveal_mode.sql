-- =============================================================================
-- add_find_my_twin_reveal_mode.sql
-- =============================================================================
-- Find My Twin: a room can be "reveal only". When the host taps Reveal, the game
-- pairs everyone by how well their answers match and shows each person their twin
-- and the match % straight away. Nobody has to go and find anyone, and there are
-- no extra rounds. Rooms without it keep the find-them-in-person game.
-- Run ONCE in the Supabase SQL editor, AFTER add_find_my_twin_roster.sql. Safe to re-run.
-- =============================================================================

alter table public.ftwin_rooms add column if not exists reveal_only boolean not null default false;

-- create_room gains p_reveal_only; drop the previous version first (see roster file).
drop function if exists public.ftwin_create_room(text, uuid, text, text[]);

create or replace function public.ftwin_create_room(p_name text, p_token uuid, p_trip_title text default 'Ulaa', p_roster text[] default null, p_reveal_only boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _ft_clean_name(p_name); i int := 0;
        v_roster text[];
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if v_name = '' then raise exception 'name_required'; end if;
  if p_token is null then raise exception 'token_required'; end if;
  -- The names the group may join as (cleaned, no repeats, in the order given). Empty = anyone, any name.
  select coalesce(array_agg(x order by ord), '{}') into v_roster from (
    select distinct on (lower(x)) x, ord
      from (select _ft_clean_name(n) as x, ord from unnest(coalesce(p_roster, '{}'::text[])) with ordinality as t(n, ord)) a
     where x <> ''
     order by lower(x), ord
  ) b;
  if cardinality(v_roster) > 24 then v_roster := v_roster[1:24]; end if;
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

  insert into ftwin_rooms (code, trip_title, roster, reveal_only)
    values (v_code, left(btrim(coalesce(nullif(p_trip_title, ''), 'Ulaa')), 60), v_roster, coalesce(p_reveal_only, false)) returning id into v_room;
  insert into ftwin_players (room_id, name) values (v_room, v_name) returning id into v_player;
  insert into ftwin_player_private (player_id, token) values (v_player, p_token);
  update ftwin_rooms set host_id = v_player where id = v_room;
  return jsonb_build_object('code', v_code, 'player_id', v_player);
end $$;

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
  if r.reveal_only then
    -- Reveal-only room: nobody needs to go and find anyone. The best matches are shown straight away.
    update ftwin_edges set a_found = true, b_found = true, a_done = true, b_done = true where room_id = r.id and round_no = 1;
    update ftwin_rooms set phase = 'final', round_no = 1, locked = true where id = r.id;
  else
    update ftwin_rooms set phase = 'hunt', round_no = 1, locked = true where id = r.id;
  end if;
  perform _ft_bump(r.id);
end $$;

grant execute on function
  public.ftwin_create_room(text, uuid, text, text[], boolean),
  public.ftwin_start(text, uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
