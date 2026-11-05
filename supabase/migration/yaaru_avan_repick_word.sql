-- Yaaru Avan (online): let the host pick a new word while the boarding passes
-- are still being handed out.
--
-- Run once in the Supabase SQL editor. Nothing existing is rewritten: this only
-- adds one function, yaaru_avan_repick_word(code, token).
--
-- What it does
--   * Host only, and only during the 'deal' phase (boarding passes).
--   * Deals the round again from scratch: a fresh word pair, roles and seats are
--     shuffled again, and everyone's "ready" is cleared. It reuses
--     yaaru_avan_start_round, so the word rules are identical (same level, not a
--     pair already used in this room, not the same category twice in a row).
--   * The round number and everyone's points stay exactly as they were. The
--     skipped pair counts as used, so it will not come back in this room.
--
-- How: put the room back to 'roundEnd' with the round number one lower, then let
-- start_round deal it (it moves to 'deal' and adds one to the round number).
-- All of this happens inside one transaction, so players never see the half step.

create or replace function public.yaaru_avan_repick_word(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'deal' then raise exception 'wrong_phase'; end if;

  update public.yaaru_avan_rooms
     set phase = 'roundEnd', round_no = greatest(round_no - 1, 0)
   where id = r.id;

  -- Same dare (if the room plays with dares) and no score reset.
  perform public.yaaru_avan_start_round(p_code, p_token, r.dare, false);
end $$;

grant execute on function public.yaaru_avan_repick_word(text, uuid) to anon, authenticated;
