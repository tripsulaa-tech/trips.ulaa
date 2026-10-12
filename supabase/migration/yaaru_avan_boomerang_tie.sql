-- =============================================================================
-- yaaru_avan_boomerang_tie.sql
-- =============================================================================
-- Online rooms: the Boomerang bounce now follows the official wording literally.
-- The votes against the Boomerang move onto the players who cast them, so each of those
-- voters has one vote against them: the voters are TIED. The normal tie rules then decide:
--
--   * Goddess of Justice in the room: she picks which voter goes offboard.
--   * No Goddess: the tied voters each describe once more, then the other players vote
--     again (only the tied voters can be voted out). Tied again: the host picks.
--
-- One voter: unchanged, that player takes every vote and goes straight off.
--
-- What changes: _ya_apply_vote and _ya_resolve_vote are replaced, and a helper _ya_tie_up
-- (the shared tie rules) is added. It also drops the old 8-argument yaaru_avan_set_settings,
-- which can linger next to the 9-argument one and makes a call without the last argument
-- ambiguous (the app always sends all nine, so nothing in the app depends on it). No tables change.
-- Run ONCE in the Supabase SQL editor, after yaaru_avan_tie_redescribe.sql. Safe to run again.
-- Deploy the matching app build (it shows the Boomerang tie banner).
-- =============================================================================

-- Remove the old 8-argument overload if it is still there (see the note at the top).
drop function if exists public.yaaru_avan_set_settings(text, uuid, int, int, text, boolean, boolean, boolean);

-- The shared tie rules. p_saved is set when the tie comes from a Boomerang bounce: that
-- player's id, so the screens can say "the votes bounced back onto ...".
create or replace function public._ya_tie_up(
  p_room uuid, p_tied uuid[], p_votes jsonb, p_saved uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare tie_names jsonb; goddess uuid; redo boolean; host uuid; ord uuid[]; extra jsonb := '{}'::jsonb;
begin
  select jsonb_agg(p.name order by p.name) into tie_names from yaaru_avan_players p where p.id = any(p_tied);
  if p_saved is not null then
    extra := jsonb_build_object('saved', p_saved,
               'name', (select name from yaaru_avan_players where id = p_saved),
               'bounce_names', tie_names);
  end if;

  -- The Goddess of Justice decides, even if she has already been eliminated.
  select p.id into goddess from yaaru_avan_players p join yaaru_avan_player_private pp on pp.player_id = p.id
   where p.room_id = p_room and coalesce(pp.dip_as, pp.special) = 'tripLeader' limit 1;
  if goddess is not null then
    update yaaru_avan_rooms
       set phase = 'tiebreak', bounce = null,
           last_result = jsonb_build_object('tie', true, 'tiebreak', true, 'leader', goddess,
                                            'tied', to_jsonb(p_tied), 'names', tie_names, 'votes', p_votes) || extra
     where id = p_room;
    return;
  end if;

  select coalesce((last_result->>'redo')::boolean, false), host_id into redo, host
    from yaaru_avan_rooms where id = p_room;

  -- Tied again after the tied players described once more: the host decides, so the game
  -- cannot loop forever. A fresh Boomerang tie always gets its own describe round first.
  if redo and p_saved is null then
    update yaaru_avan_rooms
       set phase = 'tiebreak',
           last_result = jsonb_build_object('tie', true, 'tiebreak', true, 'host_pick', true, 'leader', host,
                                            'tied', to_jsonb(p_tied), 'names', tie_names, 'votes', p_votes)
     where id = p_room;
    return;
  end if;

  -- No Goddess: the tied players each describe once more, then the other players vote
  -- again, and only the tied players can be voted out.
  select array_agg(id order by seat_idx) into ord from yaaru_avan_players where id = any(p_tied);
  delete from yaaru_avan_votes where room_id = p_room;
  update yaaru_avan_players set voted = false where room_id = p_room;
  update yaaru_avan_rooms
     set phase = 'describe', describe_order = ord, describe_pos = 0, bounce = p_tied,
         last_result = jsonb_build_object('tie', true, 'redo', true, 'names', tie_names, 'votes', p_votes) || extra
   where id = p_room;
end $$;
revoke all on function public._ya_tie_up(uuid, uuid[], jsonb, uuid) from public, anon, authenticated;

create or replace function public._ya_resolve_vote(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare top_n int; tied uuid[]; votes jsonb;
begin
  select max(c) into top_n from (select count(*) c from yaaru_avan_votes where room_id = p_room group by target) t;
  if top_n is null then return; end if;
  select array_agg(target) into tied from
    (select target from yaaru_avan_votes where room_id = p_room group by target having count(*) = top_n) t;

  select coalesce(jsonb_agg(jsonb_build_object('from', v.name, 'to', t.name)), '[]'::jsonb) into votes
    from yaaru_avan_votes sv join yaaru_avan_players v on v.id = sv.voter join yaaru_avan_players t on t.id = sv.target
   where sv.room_id = p_room;

  if cardinality(tied) > 1 then
    perform _ya_tie_up(p_room, tied, votes);
    return;
  end if;

  perform _ya_apply_vote(p_room, tied[1], votes);
end $$;

-- The vote has a single top pick: Boomerang bounce, or out they go.
create or replace function public._ya_apply_vote(p_room uuid, p_out uuid, p_votes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare out_sp text; out_name text; bounced uuid[];
begin
  select coalesce(dip_as, special) into out_sp from yaaru_avan_player_private where player_id = p_out;
  select name into out_name from yaaru_avan_players where id = p_out;

  -- Boomerang: the first time they get the majority they are not eliminated. The votes
  -- move onto the players who cast them, so those voters are tied.
  if out_sp = 'returnTicket' and not (select ticket_used from yaaru_avan_player_private where player_id = p_out) then
    update yaaru_avan_player_private set ticket_used = true where player_id = p_out;
    bounced := array(select sv.voter from yaaru_avan_votes sv join yaaru_avan_players p on p.id = sv.voter
                      where sv.room_id = p_room and sv.target = p_out and p.alive and sv.voter <> p_out);

    if cardinality(bounced) = 1 then
      -- Only one voter: the whole bounce lands on them.
      delete from yaaru_avan_votes where room_id = p_room;
      perform _ya_out_now(p_room, bounced[1], p_votes, false, p_out);
      return;
    end if;

    delete from yaaru_avan_votes where room_id = p_room;
    update yaaru_avan_players set voted = false where room_id = p_room;

    if cardinality(bounced) > 1 then
      -- Several voters: one vote against each, so they are tied. The tie rules take over.
      perform _ya_tie_up(p_room, bounced, p_votes, p_out);
      return;
    end if;

    -- Nobody still aboard voted for them (only a Ghost): everyone votes again.
    update yaaru_avan_rooms
       set bounce = null,
           last_result = jsonb_build_object('tie', false, 'saved', p_out, 'name', out_name,
                                            'bounce_names', '[]'::jsonb, 'votes', p_votes)
     where id = p_room;
    return;
  end if;

  perform _ya_out_now(p_room, p_out, p_votes, true);
end $$;

notify pgrst, 'reload schema';
