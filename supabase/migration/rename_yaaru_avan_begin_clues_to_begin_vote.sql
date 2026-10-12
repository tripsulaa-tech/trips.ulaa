-- Stowaway: rename stowaway_begin_clues to stowaway_begin_vote.
--
-- The clue round is gone; this is the host's "everyone has seen their boarding
-- pass" button, and it takes the room from the deal straight to the vote.
-- Behaviour is unchanged, only the name.
-- Safe to re-run.
--
-- Deploy this together with the matching client build: a browser tab still on the
-- old build calls stowaway_begin_clues and will get an error until it reloads.

create or replace function public.stowaway_begin_vote(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms;
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'deal' then raise exception 'wrong_phase'; end if;
  perform _sw_begin_stop(r.id, 1, r.start_idx);
end $$;

grant execute on function public.stowaway_begin_vote(text, uuid) to anon, authenticated;

drop function if exists public.stowaway_begin_clues(text, uuid);

notify pgrst, 'reload schema';
