-- Apply LAST, after all existing Yaaru Avan migrations. Finish active rounds first.
-- Fix: only the Pickpocket who guessed gets steal points / win awards.
-- Fix: resolve the Revenger before deciding the round winner (matching one-phone play).
-- Transactional and safe to rerun. Preserves existing data, APIs and permissions.
begin;

create or replace function public._ya_finish(p_room uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.yaaru_avan_room_private; summary jsonb; guesser uuid;
begin
  select out_player into guesser from yaaru_avan_rooms where id = p_room;
  select * into rp from yaaru_avan_room_private where room_id = p_room;

  create temp table _ya_gain on commit drop as
  select p.id,
         case
           when p_outcome = 'tourists'  and pp.role = 'tourist'                  then 2
           when p_outcome = 'strangers'  and p.alive and pp.role = 'stranger'      then 10
           when p_outcome = 'strangers'  and p.alive and pp.role = 'pickpocket'          then 6
           when p_outcome = 'pickpocket-steal' and p.id = guesser and pp.role = 'pickpocket'          then 6
           else 0 end as base,
         case coalesce(pp.dip_as, pp.special)
           -- Joy Fool: +4 if they were the first player voted out.
           when 'joyFool'  then case when pp.out_order = 1 then 4 else 0 end
           -- Duelists: the first one voted out loses 2, the other wins 2.
           when 'duelists' then case
                                when pp.partner is null then 0
                                when coalesce(pp.out_order, 2147483647) < coalesce(rv.out_order, 2147483647) then -2
                                when coalesce(rv.out_order, 2147483647) < coalesce(pp.out_order, 2147483647) then 2
                                else 0 end
           else 0 end as bonus,
         pp.role as role,
         coalesce(pp.dip_as, pp.special) as special,
         (pp.dip_as is not null) as dip
    from yaaru_avan_players p
    join yaaru_avan_player_private pp on pp.player_id = p.id
    left join yaaru_avan_player_private rv on rv.player_id = pp.partner
   where p.room_id = p_room;

  update yaaru_avan_players p
     set points   = p.points + g.base + g.bonus,
         survived = p.survived + (case when p_outcome = 'strangers'  and p.alive and g.role = 'stranger' then 1 else 0 end),
         pickpocket_wins = p.pickpocket_wins + (case when p_outcome = 'pickpocket-steal' and p.id = guesser and g.role = 'pickpocket' then 1 else 0 end)
    from _ya_gain g where g.id = p.id;

  select jsonb_build_object(
           'outcome', p_outcome,
           'tourist_word', rp.tourist_word,
           'stranger_word', rp.stranger_word,
           'category', rp.category,
           'players', coalesce(jsonb_agg(jsonb_build_object(
                'id', g.id, 'role', g.role, 'gained', g.base + g.bonus, 'bonus', g.bonus,
                'special', g.special, 'dip', g.dip)), '[]'::jsonb))
    into summary from _ya_gain g;
  drop table _ya_gain;

  update yaaru_avan_rooms set phase = 'roundEnd', outcome = p_outcome, round_summary = summary
   where id = p_room;
end $$;

create or replace function public._ya_after_out(p_room uuid, p_out uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.yaaru_avan_rooms; pp public.yaaru_avan_player_private; w text; out_seat int;
begin
  select * into r from yaaru_avan_rooms where id = p_room;
  select * into pp from yaaru_avan_player_private where player_id = p_out;
  if pp.role = 'tourist' and r.last_result->>'revenge_by' is null
     and not coalesce((r.last_result->>'retrieval_resolved')::boolean, false)
     and (r.last_result->>'out') = p_out::text
     and exists (select 1 from yaaru_avan_players where id = p_out and not alive)
     and (select count(*) from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
           where p.room_id = p_room and pv.role = 'stranger') >= 2
     and exists (select 1 from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
           where p.room_id = p_room and p.alive and pv.role = 'tourist'
             and coalesce(pv.dip_as, pv.special) = 'retriever' and not pv.retrieval_used) then
    update yaaru_avan_rooms set phase = 'retrieve', out_player = p_out,
      retrieve_deadline = now() + interval '30 seconds', guess_queue = '{}', guess_after = null where id = p_room;
    return;
  end if;
  if coalesce(pp.dip_as, pp.special) = 'revenger' and not pp.revenge_done
     and exists (select 1 from yaaru_avan_players where id = p_out and not alive)
     and exists (select 1 from yaaru_avan_players where room_id = p_room and alive) then
    update yaaru_avan_rooms set phase = 'revenger', out_player = p_out where id = p_room;
    return;
  end if;
  w := _ya_winner(p_room);
  if w is not null then perform _ya_finish(p_room, w); return; end if;
  select seat_idx into out_seat from yaaru_avan_players where id = p_out;
  perform _ya_begin_stop(p_room, r.stop_no + 1, out_seat + 1);
end $$;

revoke all on function public._ya_finish(uuid,text), public._ya_after_out(uuid,uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
