-- ─────────────────────────────────────────────────────────────────────────────
-- restrict_stowaway_hosting_to_admins.sql
--
-- Only admins can CREATE a Stowaway room. Everyone else can only JOIN one with
-- its code (stowaway_join / stowaway_peek stay open to anon).
--
-- Before this, stowaway_create_room was callable by anyone with the public API
-- key, so hiding the "Host" button in the app was not a real block.
--
-- Run once in the Supabase SQL editor (after add_stowaway_online.sql and
-- add_admin_allowlist_and_hardening.sql). Safe to run again.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stowaway_create_room(p_name text, p_token uuid, p_trip_title text default 'Ulaa')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _sw_clean_name(p_name); i int := 0;
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
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

-- Signed-in users only (is_admin() then narrows it to the admins allowlist).
revoke all on function public.stowaway_create_room(text, uuid, text) from public, anon;
grant execute on function public.stowaway_create_room(text, uuid, text) to authenticated;
