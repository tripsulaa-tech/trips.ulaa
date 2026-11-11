-- =============================================================================
-- yaaru_avan_host_remove_mid_game.sql
-- =============================================================================
-- Online Yaaru Avan?: the host can remove a player in the MIDDLE of a round
-- (after the boarding passes are dealt) and carry on in the SAME room.
--
-- Before: removing someone was only possible in the lobby, so when a player had to
-- leave after the words were dealt, the group had to open a new room.
--
-- Now, host only, in any in-round phase (deal, describe, vote, tiebreak, offboard,
-- guess, revenger, retrieve, retrieved):
--   * the player is removed and their points are parked (same as a lobby removal), so
--     they get them back if they join again later with the same name;
--   * the round is dealt again from scratch for everyone left: new word pair, roles,
--     seats and specials, everyone's "ready" cleared. The round number and everyone's
--     points stay exactly as they were (points are only awarded when a round ends);
--   * if fewer than 3 players would be left, the room goes back to the lobby instead.
--
-- A player who only taps "Leave game" keeps their seat; their phone can rejoin the same
-- seat with the room code. If they are not coming back, the host uses this to remove them.
--
-- Adds ONE function, yaaru_avan_remove_and_redeal(code, token, player). Nothing existing
-- is rewritten. Run once in the Supabase SQL editor, AFTER the other yaaru_avan
-- migrations (it needs yaaru_avan_keep_points_when_removed.sql). Safe to run again.
-- =============================================================================

create or replace function public.yaaru_avan_remove_and_redeal(p_code text, p_token uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; n int;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase in ('lobby', 'roundEnd', 'final') then raise exception 'wrong_phase'; end if;
  if p_player = me.id then raise exception 'cannot_kick_self'; end if;
  if not exists (select 1 from yaaru_avan_players where id = p_player and room_id = r.id) then
    raise exception 'bad_target';
  end if;

  -- Park their points (a no-op before the first finished round), then remove them.
  perform _ya_bench_player(p_player);
  delete from yaaru_avan_players where id = p_player and room_id = r.id;

  select count(*) into n from yaaru_avan_players where room_id = r.id;

  if n < 3 then
    -- Too few to play: back to the lobby, scores kept, the aborted round does not count.
    update yaaru_avan_players set alive = true, voted = false, ready = false where room_id = r.id;
    update yaaru_avan_player_private set role = null, word = null
     where player_id in (select id from yaaru_avan_players where room_id = r.id);
    delete from yaaru_avan_votes where room_id = r.id;
    update yaaru_avan_rooms
       set phase = 'lobby', locked = false, round_no = greatest(round_no - 1, 0),
           last_result = null, round_summary = null, outcome = null, out_player = null
     where id = r.id;
  else
    -- Deal again, the same trick yaaru_avan_repick_word uses: step back to 'roundEnd' one
    -- round lower, then let start_round deal it (it adds one to the round number again).
    update yaaru_avan_rooms
       set phase = 'roundEnd', round_no = greatest(round_no - 1, 0)
     where id = r.id;
    -- Deal a fresh word, not a reused one (needs yaaru_avan_reuse_words.sql; harmless without it).
    perform set_config('yaaru.no_reuse', '1', true);
    perform public.yaaru_avan_start_round(p_code, p_token, r.dare, false);
  end if;
end $$;

grant execute on function public.yaaru_avan_remove_and_redeal(text, uuid, uuid) to anon, authenticated;

-- Make the API see the new function straight away.
notify pgrst, 'reload schema';
