-- =============================================================================
-- yaaru_avan_tie_redescribe.sql
-- =============================================================================
-- Online rooms: a tied vote with no Goddess of Justice now follows Undercover's FAQ
-- ("voted players give 1 more description each, and the remaining players re-vote").
--
--   * The tied players each describe once more (phase 'describe', in seat order).
--   * Then the other players vote again; only the tied players can be voted out, and the
--     tied players sit that vote out. (If nobody else can vote, the tied players vote too.)
--   * Tied again: the host decides between the tied players (phase 'tiebreak'), so a game
--     can never loop forever. A Goddess of Justice still decides every tie as before.
--
-- What changes: _ya_resolve_vote, yaaru_avan_cast_vote and yaaru_avan_state are replaced,
-- and a small helper _ya_tied_out is added. No tables change.
-- Run ONCE in the Supabase SQL editor, after raise_yaaru_avan_max_players_to_20.sql. Safe to
-- run again. Deploy the matching app build (it shows the tie-break describe round).
-- =============================================================================

-- True for a tied player during the re-vote after a tie (they sit it out, so the other
-- players decide). If nobody else can vote, the tied players vote too.
create or replace function public._ya_tied_out(p_room uuid, p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    r.phase = 'vote'
    and coalesce((r.last_result->>'redo')::boolean, false)
    and r.bounce is not null
    and p_player = any(r.bounce)
    and exists (select 1 from yaaru_avan_players p join yaaru_avan_player_private pp on pp.player_id = p.id
                 where p.room_id = r.id and not (p.id = any(r.bounce))
                   and (p.alive or (pp.out_order is not null and coalesce(pp.dip_as, pp.special) = 'backseatRider'))),
    false)
  from yaaru_avan_rooms r where r.id = p_room;
$$;
revoke all on function public._ya_tied_out(uuid, uuid) from public, anon, authenticated;

create or replace function public._ya_resolve_vote(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare top_n int; tied uuid[]; votes jsonb; tie_names jsonb; goddess uuid;
        redo boolean; host uuid; ord uuid[];
begin
  select max(c) into top_n from (select count(*) c from yaaru_avan_votes where room_id = p_room group by target) t;
  if top_n is null then return; end if;
  select array_agg(target) into tied from
    (select target from yaaru_avan_votes where room_id = p_room group by target having count(*) = top_n) t;

  select coalesce(jsonb_agg(jsonb_build_object('from', v.name, 'to', t.name)), '[]'::jsonb) into votes
    from yaaru_avan_votes sv join yaaru_avan_players v on v.id = sv.voter join yaaru_avan_players t on t.id = sv.target
   where sv.room_id = p_room;

  if cardinality(tied) > 1 then
    select jsonb_agg(p.name order by p.name) into tie_names from yaaru_avan_players p where p.id = any(tied);

    -- The Goddess of Justice decides, even if she has already been eliminated.
    select p.id into goddess from yaaru_avan_players p join yaaru_avan_player_private pp on pp.player_id = p.id
     where p.room_id = p_room and coalesce(pp.dip_as, pp.special) = 'tripLeader' limit 1;
    if goddess is not null then
      update yaaru_avan_rooms
         set phase = 'tiebreak',
             last_result = jsonb_build_object('tie', true, 'tiebreak', true, 'leader', goddess,
                                              'tied', to_jsonb(tied), 'names', tie_names, 'votes', votes)
       where id = p_room;
      return;
    end if;

    select coalesce((last_result->>'redo')::boolean, false), host_id into redo, host
      from yaaru_avan_rooms where id = p_room;

    -- Tied again after the tied players described once more: the host decides, so the
    -- game cannot loop forever.
    if redo then
      update yaaru_avan_rooms
         set phase = 'tiebreak',
             last_result = jsonb_build_object('tie', true, 'tiebreak', true, 'host_pick', true, 'leader', host,
                                              'tied', to_jsonb(tied), 'names', tie_names, 'votes', votes)
       where id = p_room;
      return;
    end if;

    -- No Goddess (Undercover's FAQ): the tied players each describe once more, then the
    -- other players vote again, and only the tied players can be voted out.
    select array_agg(id order by seat_idx) into ord from yaaru_avan_players where id = any(tied);
    delete from yaaru_avan_votes where room_id = p_room;
    update yaaru_avan_players set voted = false where room_id = p_room;
    update yaaru_avan_rooms
       set phase = 'describe', describe_order = ord, describe_pos = 0, bounce = tied,
           last_result = jsonb_build_object('tie', true, 'redo', true, 'names', tie_names, 'votes', votes)
     where id = p_room;
    return;
  end if;

  perform _ya_apply_vote(p_room, tied[1], votes);
end $$;

create or replace function public.yaaru_avan_cast_vote(p_code text, p_token uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; voters_n int; vote_n int; ghost boolean;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase <> 'vote' then raise exception 'wrong_phase'; end if;
  select (pp.out_order is not null and coalesce(pp.dip_as, pp.special) = 'backseatRider') into ghost
    from yaaru_avan_player_private pp where pp.player_id = me.id;
  if not me.alive and not coalesce(ghost, false) then raise exception 'offboard_cannot_vote'; end if;
  if _ya_tied_out(r.id, me.id) then raise exception 'tied_cannot_vote'; end if;
  if p_target = me.id then raise exception 'cannot_vote_self'; end if;
  if not exists (select 1 from yaaru_avan_players where id = p_target and room_id = r.id and alive) then
    raise exception 'bad_target';
  end if;
  if r.bounce is not null and not (p_target = any(r.bounce)) then raise exception 'bad_target'; end if;
  insert into yaaru_avan_votes (room_id, voter, target) values (r.id, me.id, p_target)
    on conflict (room_id, voter) do update set target = excluded.target;
  update yaaru_avan_players set voted = true where id = me.id;
  select count(*) into voters_n
    from yaaru_avan_players p join yaaru_avan_player_private pp on pp.player_id = p.id
   where p.room_id = r.id
     and (p.alive or (pp.out_order is not null and coalesce(pp.dip_as, pp.special) = 'backseatRider'))
     and not _ya_tied_out(r.id, p.id);
  select count(*) into vote_n from yaaru_avan_votes where room_id = r.id;
  if vote_n >= voters_n then perform _ya_resolve_vote(r.id); end if;
end $$;

create or replace function public.yaaru_avan_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; rp public.yaaru_avan_room_private;
        mypriv public.yaaru_avan_player_private; n int; show_counts boolean; players jsonb; host_away boolean;
        fs int; fl int; room_json jsonb; partner_name text; i_vote boolean;
begin
  me := _ya_me(p_code, p_token);
  update yaaru_avan_player_private set last_seen = now() where player_id = me.id;
  select * into r from yaaru_avan_rooms where id = me.room_id;
  select * into rp from yaaru_avan_room_private where room_id = r.id;
  select * into mypriv from yaaru_avan_player_private where player_id = me.id;
  select count(*) into n from yaaru_avan_players where room_id = r.id;
  show_counts := (me.id = r.host_id) or not r.hide_counts;

  if n >= 3 then
    select f.fit_s, f.fit_l into fs, fl from public._ya_fit_roles(n, rp.stowaways, rp.lost) f;
  else
    fs := rp.stowaways; fl := rp.lost;
  end if;

  room_json := to_jsonb(r);
  if r.out_player is not distinct from me.id then
    room_json := room_json || jsonb_build_object('guess_match', null);
  end if;

  select name into partner_name from yaaru_avan_players where id = mypriv.partner;
  i_vote := (me.alive or (mypriv.out_order is not null and coalesce(mypriv.dip_as, mypriv.special) = 'backseatRider'))
            and not _ya_tied_out(r.id, me.id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'seat', p.seat, 'seat_idx', p.seat_idx, 'alive', p.alive,
           'voted', p.voted, 'ready', p.ready, 'points', p.points, 'survived', p.survived,
           'correct_votes', p.correct_votes, 'wrong_votes', p.wrong_votes, 'lost_wins', p.lost_wins,
           'away', (pv.last_seen < now() - interval '45 seconds'),
           'voter', ((p.alive or (pv.out_order is not null and coalesce(pv.dip_as, pv.special) = 'backseatRider'))
                     and not _ya_tied_out(r.id, p.id)),
           -- The Goddess of Justice is announced to everyone once the words are dealt.
           -- Every other role stays secret.
           'public_special', case when r.specials
                                   and r.phase in ('deal','describe','vote','tiebreak','offboard','guess','payback')
                                   and coalesce(pv.dip_as, pv.special) = 'tripLeader'
                                  then 'tripLeader' else null end
         ) order by p.joined_at), '[]'::jsonb)
    into players
    from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
   where p.room_id = r.id;

  select (pv.last_seen < now() - interval '60 seconds') into host_away
    from yaaru_avan_player_private pv where pv.player_id = r.host_id;

  return jsonb_build_object(
    'now', now(),
    'me', jsonb_build_object('id', me.id, 'role', mypriv.role, 'word', mypriv.word,
                             'special', coalesce(mypriv.dip_as, mypriv.special),
                             'dip', (mypriv.dip_as is not null),
                             'partner', partner_name,
                             'can_vote', i_vote),
    'room', room_json,
    'players', players,
    'host_away', coalesce(host_away, true),
    'counts', case when show_counts then
        jsonb_build_object('explorers', n - fs - fl, 'stowaways', fs, 'lost', fl)
      else null end
  );
end $$;

notify pgrst, 'reload schema';
