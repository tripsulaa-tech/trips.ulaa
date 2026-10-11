-- Stowaway: remove the clue round.
-- A stop now goes straight from dealing the words (or from the last
-- offboarding) to the vote; players talk it out aloud before voting.
--
-- Safe to re-run. Only _sw_begin_stop changes: it used to open the 'clues'
-- phase with a speaking order; it now opens 'vote' directly. The RPCs
-- stowaway_begin_clues / stowaway_after_reveal / stowaway_judge_guess keep
-- their names and signatures, so the client and grants are unaffected.

create or replace function public._sw_begin_stop(p_room uuid, p_stop int, p_from int)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from stowaway_votes where room_id = p_room;
  update stowaway_players set voted = false where room_id = p_room;
  update stowaway_rooms
     set phase = 'vote', stop_no = p_stop, turn_order = '{}', turn_pos = 0,
         timer_started_at = null, out_player = null, offboard_at = null,
         guess_text = null, guess_match = null, last_result = null
   where id = p_room;
end $$;

-- Any room that was mid-clue-round when this runs moves on to the vote.
update stowaway_rooms
   set phase = 'vote', timer_started_at = null, turn_order = '{}', turn_pos = 0
 where phase = 'clues';
