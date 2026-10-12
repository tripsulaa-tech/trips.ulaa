-- ─────────────────────────────────────────────────────────────────────────────
-- add_yaaru_avan_online_switch.sql
--
-- One on/off switch (Admin -> Games -> Yaaru Fake?) for Stowaway online.
--   * OFF (the default): only a signed-in admin can create a room. Players can
--     still not create anything, and turning it off ends any open rooms.
--   * ON: anyone with the link can create or join a room.
-- Joining a room with its 4-letter code is unchanged.
--
-- Run once in the Supabase SQL editor (after add_yaaru_avan_online.sql and
-- add_admin_allowlist_and_hardening.sql). Safe to run again. It also removes
-- the earlier "host code" / "trip window" experiments if they were run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Clean-up of earlier experiments (no-ops if never run).
drop function if exists public.stowaway_make_host_code(uuid);
drop function if exists public.stowaway_get_host_code(uuid);
drop function if exists public.stowaway_revoke_host_code(uuid);
drop function if exists public.stowaway_create_room(text, uuid, text, text);
drop table if exists public.stowaway_host_codes;
alter table public.stowaway_room_private drop column if exists host_code;

-- The switch: a single row, private (only the functions below touch it).
create table if not exists public.stowaway_settings (
  id           boolean primary key default true check (id),
  online_open  boolean not null default false
);
insert into public.stowaway_settings (id, online_open) values (true, false) on conflict (id) do nothing;
alter table public.stowaway_settings enable row level security;
revoke all on public.stowaway_settings from anon, authenticated;

-- Is online play open? (public: the app can show a message)
create or replace function public.stowaway_online_open()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select online_open from stowaway_settings where id), false);
$$;

-- Admin: open or close it. Closing also ends every open room.
create or replace function public.stowaway_set_online_open(p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  insert into stowaway_settings (id, online_open) values (true, coalesce(p_open, false))
    on conflict (id) do update set online_open = excluded.online_open;
  if not coalesce(p_open, false) then
    update stowaway_rooms set expires_at = now() where expires_at > now();
    perform stowaway_cleanup();
  end if;
end $$;

-- Create a room: admin always, everyone else only while the switch is ON.
create or replace function public.stowaway_create_room(p_name text, p_token uuid, p_trip_title text default 'Ulaa')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _sw_clean_name(p_name); i int := 0;
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.stowaway_online_open() and not public.is_admin() then raise exception 'game_closed'; end if;
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

  insert into stowaway_rooms (code, trip_title)
    values (v_code, left(btrim(coalesce(nullif(p_trip_title, ''), 'Ulaa')), 60)) returning id into v_room;
  insert into stowaway_players (room_id, name) values (v_room, v_name) returning id into v_player;
  insert into stowaway_player_private (player_id, token) values (v_player, p_token);
  insert into stowaway_room_private (room_id, stowaways, lost) values (v_room, 1, 0);
  update stowaway_rooms set host_id = v_player where id = v_room;
  return jsonb_build_object('code', v_code, 'player_id', v_player);
end $$;

revoke all on function public.stowaway_create_room(text, uuid, text) from public;
grant execute on function public.stowaway_create_room(text, uuid, text) to anon, authenticated;
revoke all on function public.stowaway_online_open() from public;
grant execute on function public.stowaway_online_open() to anon, authenticated;
revoke all on function public.stowaway_set_online_open(boolean) from public, anon;
grant execute on function public.stowaway_set_online_open(boolean) to authenticated;
