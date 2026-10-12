-- ─────────────────────────────────────────────────────────────────────────────
-- add_stowaway_trip_window.sql
--
-- Stowaway online ("Yaaru Fake?") only works on trip days:
--   * A room can be created only while a trip is running, i.e. today (India
--     time) is between a trip's start_date and end_date, inclusive.
--     (A signed-in admin can always create one, e.g. to test.)
--   * That room stops working at the end of that trip's last day, so nobody
--     can keep playing after the trip. Joining an expired room already fails.
-- Outside trip days nobody can host, so the public page can't be used to
-- create rooms at other times.
--
-- Run once in the Supabase SQL editor (after add_stowaway_online.sql and
-- add_admin_allowlist_and_hardening.sql). Safe to run again. It also removes
-- the earlier "host code" / "admins only" experiments if they were run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Clean-up of the earlier experiments (no-ops if they were never run).
drop function if exists public.stowaway_make_host_code(uuid);
drop function if exists public.stowaway_get_host_code(uuid);
drop function if exists public.stowaway_revoke_host_code(uuid);
drop function if exists public.stowaway_create_room(text, uuid, text, text);
drop table if exists public.stowaway_host_codes;
alter table public.stowaway_room_private drop column if exists host_code;

create or replace function public.stowaway_create_room(p_name text, p_token uuid, p_trip_title text default 'Ulaa')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _sw_clean_name(p_name); i int := 0;
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        v_today date := (now() at time zone 'Asia/Kolkata')::date;
        v_last date; v_expires timestamptz := now() + interval '6 hours';
begin
  -- The latest end_date among trips running today.
  select max(end_date) into v_last from upcoming_trips where start_date <= v_today and end_date >= v_today;
  if v_last is null and not public.is_admin() then raise exception 'game_closed'; end if;
  if v_last is not null then
    -- Stops working at the end of that trip day (midnight India time).
    v_expires := least(v_expires, ((v_last + 1)::timestamp at time zone 'Asia/Kolkata'));
  end if;

  if v_name = '' then raise exception 'name_required'; end if;
  if p_token is null then raise exception 'token_required'; end if;
  perform stowaway_cleanup();
  if (select count(*) from stowaway_rooms) >= 500 then raise exception 'too_many_rooms'; end if;

  loop
    v_code := '';
    for k in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from stowaway_rooms where code = v_code);
    i := i + 1;
    if i > 30 then raise exception 'try_again'; end if;
  end loop;

  insert into stowaway_rooms (code, trip_title, expires_at)
    values (v_code, left(btrim(coalesce(nullif(p_trip_title, ''), 'Ulaa')), 60), v_expires) returning id into v_room;
  insert into stowaway_players (room_id, name) values (v_room, v_name) returning id into v_player;
  insert into stowaway_player_private (player_id, token) values (v_player, p_token);
  insert into stowaway_room_private (room_id, stowaways, lost) values (v_room, 1, 0);
  update stowaway_rooms set host_id = v_player where id = v_room;
  return jsonb_build_object('code', v_code, 'player_id', v_player);
end $$;

revoke all on function public.stowaway_create_room(text, uuid, text) from public;
grant execute on function public.stowaway_create_room(text, uuid, text) to anon, authenticated;
