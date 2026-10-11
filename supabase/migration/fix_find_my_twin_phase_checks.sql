-- =============================================================================
-- fix_find_my_twin_phase_checks.sql
-- =============================================================================
-- Run ONCE in the Supabase SQL editor, AFTER harden_find_my_twin.sql.
-- Safe to run again. Do NOT re-run add_find_my_twin.sql afterwards (it is the
-- first-time setup file and would put old versions of functions back).
--
-- WHAT IT FIXES (host-only actions that did not check the game phase)
--   * "End game" from the lobby showed an empty final screen.
--   * "Play again" from the lobby silently wiped everybody's answers.
-- Both are now refused in the lobby. Ending or resetting a game in the middle of
-- a hunt, and "Play again" from the final screen, work exactly as before.
-- =============================================================================

create or replace function public.ftwin_end_game(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  if r.phase = 'lobby' then raise exception 'wrong_phase'; end if;
  update ftwin_rooms set phase = 'final' where id = r.id;
  perform _ft_bump(r.id);
end $$;

create or replace function public.ftwin_to_lobby(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  if r.phase = 'lobby' then raise exception 'wrong_phase'; end if;
  delete from ftwin_edges where room_id = r.id;
  update ftwin_player_private set answers = null where player_id in (select id from ftwin_players where room_id = r.id);
  update ftwin_players set answered = false where room_id = r.id;
  update ftwin_rooms set phase = 'lobby', round_no = 0, locked = false where id = r.id;
  perform _ft_bump(r.id);
end $$;

grant execute on function public.ftwin_end_game(text, uuid), public.ftwin_to_lobby(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
