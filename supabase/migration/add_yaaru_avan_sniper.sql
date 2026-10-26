-- =============================================================================
-- add_yaaru_avan_sniper.sql
-- =============================================================================
-- Online rooms: adds The Sniper 🎯, matching the one-phone game.
--
--   * Once per round, during a normal vote, the Sniper can take a solo shot at one player.
--     No majority is needed.
--   * Target is a Stranger or Pickpocket: they go offboard at once (a Pickpocket still gets
--     their last guess, because the normal offboard -> guess flow follows).
--   * Target is a Tourist: the shot backfires and the Sniper goes offboard instead.
--   * Dealt only with 4+ players. Never a Pickpocket (also not as a Falafel Vendor's ability).
--   * The shot counts as a right / wrong vote for the Sniper. It is not a vote, so the
--     Retriever cannot undo it.
--   * Not allowed during a tie re-vote or a Boomerang bounce (same as the one-phone game).
--
-- WHAT CHANGES
--   column     yaaru_avan_player_private.sniper_used
--   check      yaaru_avan_player_private_special_check now allows 'sniper'
--   functions  _ya_deal_specials     (replaced: knows the Sniper, resets sniper_used each deal)
--              yaaru_avan_set_settings (replaced: accepts 'sniper' in the ticked list)
--              yaaru_avan_state      (wrapped: the old one becomes _ya_state_base, the new one
--                                     adds me.can_snipe and me.sniper_used)
--              yaaru_avan_snipe      (new)
--   Nothing else is rewritten. yaaru_avan_start_round is not touched.
--
-- HOW TO RUN
--   Run this whole file ONCE in the Supabase SQL editor, then deploy the matching app build.
--   Finish any active rounds first. Safe to run again. One transaction: if anything fails,
--   nothing is changed.
--
-- EXPECTS (created by the earlier Yaaru Avan migrations, including add_yaaru_avan_retriever.sql)
--   tables     yaaru_avan_rooms, yaaru_avan_players, yaaru_avan_player_private
--   functions  _ya_me, _ya_lock_room, _ya_out_now, _ya_take_out, _ya_after_out, yaaru_avan_state
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.yaaru_avan_rooms') is null
     or to_regclass('public.yaaru_avan_players') is null
     or to_regclass('public.yaaru_avan_player_private') is null then
    raise exception 'yaaru_avan_rooms / yaaru_avan_players / yaaru_avan_player_private not found. Run the earlier Yaaru Avan migrations first.';
  end if;
  if to_regprocedure('public._ya_out_now(uuid,uuid,jsonb,boolean,uuid)') is null
     or to_regprocedure('public._ya_me(text,uuid)') is null
     or to_regprocedure('public._ya_lock_room(uuid)') is null
     or to_regprocedure('public.yaaru_avan_state(text,uuid)') is null
     or to_regprocedure('public._ya_deal_specials(uuid,int,int,text[])') is null then
    raise exception 'A Yaaru Avan helper function is missing. Run add_yaaru_avan_retriever.sql (and the migrations before it) first.';
  end if;
end $$;

-- 1. Column + allowed values ---------------------------------------------------
alter table public.yaaru_avan_player_private
  add column if not exists sniper_used boolean not null default false;

alter table public.yaaru_avan_player_private drop constraint if exists yaaru_avan_player_private_special_check;
alter table public.yaaru_avan_player_private add constraint yaaru_avan_player_private_special_check
  check ((special is null or special in ('joyFool','duelists','boomerang','goddess','ghost','revenger','falafelVendor','lovers','retriever','sniper'))
     and (dip_as is null or dip_as in ('joyFool','boomerang','goddess','ghost','revenger','retriever','sniper')));

-- 2. Dealing: same as before, plus the Sniper (4+ players, never a Pickpocket) ----------
create or replace function public._ya_deal_specials(p_room uuid, p_n int, p_strangers int, p_enabled text[])
returns void language plpgsql security definer set search_path = public as $$
declare enabled text[]; chosen text[]; dealt text[]; sp text; a uuid; b uuid; core text; ability text;
begin
  -- A new deal: everyone's Sniper shot is fresh again.
  update yaaru_avan_player_private set sniper_used = false
   where player_id in (select id from yaaru_avan_players where room_id = p_room);

  enabled := array(select x from unnest(array['joyFool','duelists','boomerang','goddess','ghost','revenger','falafelVendor','lovers','retriever','sniper']) x
    where (p_enabled is null or x = any(p_enabled))
      and p_n >= case x when 'falafelVendor' then 4 when 'revenger' then 5 when 'duelists' then 5 when 'lovers' then 5 when 'sniper' then 4 else 0 end
      and (x <> 'retriever' or p_strangers >= 2));
  chosen := array(select x from unnest(enabled) x order by random() limit (p_n / 3));
  dealt := chosen;
  for sp in select x from unnest(chosen) x order by
    case when x = 'retriever' then 0 when x in ('joyFool','revenger','sniper') then 1 else 2 end
  loop
    select pp.player_id into a from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
      where p.room_id = p_room and pp.special is null
        and (sp <> 'retriever' or pp.role = 'tourist')
        and (sp not in ('joyFool','revenger','sniper') or pp.role <> 'pickpocket')
      order by random() limit 1;
    if a is null then continue; end if;
    if sp in ('duelists','lovers') then
      select pp.player_id into b from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
        where p.room_id = p_room and pp.special is null and pp.player_id <> a order by random() limit 1;
      if b is null then continue; end if;
      update yaaru_avan_player_private set special = sp, partner = b where player_id = a;
      update yaaru_avan_player_private set special = sp, partner = a where player_id = b;
    else
      update yaaru_avan_player_private set special = sp where player_id = a;
    end if;
  end loop;
  select pp.player_id, pp.role into a, core from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
    where p.room_id = p_room and pp.special = 'falafelVendor';
  if a is not null then
    select x into ability from unnest(enabled) x
      where x not in ('duelists','lovers','falafelVendor') and not (x = any(dealt))
        and (x <> 'retriever' or core = 'tourist')
        and (x not in ('joyFool','revenger','sniper') or core <> 'pickpocket') order by random() limit 1;
    update yaaru_avan_player_private set dip_as = ability,
      special = case when ability is null then null else 'falafelVendor' end where player_id = a;
  end if;
end $$;

-- 3. Settings: the host's ticked list may now include 'sniper' ------------------------
create or replace function public.yaaru_avan_set_settings(
  p_code text, p_token uuid, p_strangers int, p_pickpockets int, p_level text,
  p_hide_counts boolean, p_dares boolean, p_specials boolean default false,
  p_special_ids text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; s int; l int; ids text[];
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_level not in ('easy','medium','hard') then raise exception 'bad_level'; end if;
  s := greatest(0, least(coalesce(p_strangers, 1), 12));
  l := greatest(0, least(coalesce(p_pickpockets, 0), 2));
  if s + l = 0 then s := 1; end if;   -- at least one Pickpocket or one Stranger
  ids := case when p_special_ids is null then null else array(
           select distinct x from unnest(p_special_ids) x
            where x in ('joyFool','duelists','boomerang','goddess',
                        'ghost','revenger','falafelVendor','lovers','retriever','sniper')) end;
  update yaaru_avan_rooms set level = p_level, hide_counts = coalesce(p_hide_counts, false),
         dares = coalesce(p_dares, false),
         specials = coalesce(p_specials, false) and (ids is null or cardinality(ids) > 0),
         special_ids = ids
   where id = r.id;
  update yaaru_avan_room_private set strangers = s, pickpockets = l where room_id = r.id;
end $$;

-- 4. State: keep the current function as _ya_state_base and wrap it ------------------------
--    (so nothing in it has to be copied here). Re-running this file will not wrap twice.
do $$
declare src text;
begin
  select p.prosrc into src from pg_proc p where p.oid = 'public.yaaru_avan_state(text,uuid)'::regprocedure;
  if position('_ya_state_base' in src) = 0 then
    drop function if exists public._ya_state_base(text, uuid);
    alter function public.yaaru_avan_state(text, uuid) rename to _ya_state_base;
  end if;
end $$;

create or replace function public.yaaru_avan_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb; me public.yaaru_avan_players; r public.yaaru_avan_rooms; pv public.yaaru_avan_player_private;
begin
  s := public._ya_state_base(p_code, p_token);
  me := _ya_me(p_code, p_token);
  select * into r from yaaru_avan_rooms where id = me.room_id;
  select * into pv from yaaru_avan_player_private where player_id = me.id;
  return jsonb_set(s, '{me}', (s->'me') || jsonb_build_object(
    'sniper_used', coalesce(pv.sniper_used, false),
    -- Only the Sniper's own phone ever gets true: a normal vote (not a tie re-vote or a Boomerang
    -- bounce), still aboard, shot not yet spent this round.
    'can_snipe', (r.phase = 'vote' and r.bounce is null and me.alive
                  and coalesce(pv.dip_as, pv.special) = 'sniper' and not coalesce(pv.sniper_used, false))));
end $$;

-- 5. The shot ------------------------------------------------------------------------------
create or replace function public.yaaru_avan_snipe(p_code text, p_token uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; mp public.yaaru_avan_player_private;
        tp public.yaaru_avan_player_private; hit boolean; victim uuid;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase <> 'vote' or r.bounce is not null then raise exception 'wrong_phase'; end if;
  select * into mp from yaaru_avan_player_private where player_id = me.id;
  if not exists (select 1 from yaaru_avan_players where id = me.id and alive)
     or coalesce(mp.dip_as, mp.special) is distinct from 'sniper' then raise exception 'not_sniper'; end if;
  if mp.sniper_used then raise exception 'sniper_spent'; end if;
  if p_target is null or p_target = me.id
     or not exists (select 1 from yaaru_avan_players where id = p_target and room_id = r.id and alive) then
    raise exception 'bad_target';
  end if;

  select * into tp from yaaru_avan_player_private where player_id = p_target;
  hit := tp.role <> 'tourist';                 -- Stranger or Pickpocket
  victim := case when hit then p_target else me.id end;

  update yaaru_avan_player_private set sniper_used = true where player_id = me.id;
  -- Counts like a right / wrong vote for the Sniper.
  update yaaru_avan_players
     set correct_votes = correct_votes + (case when hit then 1 else 0 end),
         wrong_votes   = wrong_votes   + (case when hit then 0 else 1 end)
   where id = me.id;

  -- Goes offboard exactly like a vote result (Lovers leave together, the Pickpocket's last guess
  -- and the Revenger follow), with no vote awards.
  perform _ya_out_now(r.id, victim, '[]'::jsonb, false);

  -- Say what happened. retrieval_resolved stops the Retriever from undoing it: a shot is not a vote.
  update yaaru_avan_rooms
     set last_result = last_result || jsonb_build_object(
           'sniper', me.id, 'sniper_target', p_target, 'sniper_hit', hit, 'retrieval_resolved', true)
   where id = r.id;
end $$;

-- 6. Permissions -------------------------------------------------------------------------------
revoke all on function public._ya_deal_specials(uuid,int,int,text[]) from public, anon, authenticated;
revoke all on function public._ya_state_base(text,uuid) from public, anon, authenticated;
revoke all on function public.yaaru_avan_snipe(text,uuid,uuid), public.yaaru_avan_state(text,uuid) from public;
grant execute on function public.yaaru_avan_set_settings(text,uuid,int,int,text,boolean,boolean,boolean,text[]),
  public.yaaru_avan_state(text,uuid),
  public.yaaru_avan_snipe(text,uuid,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- CHECK (optional): after a round with specials on and 4+ players, a Sniper is never a Pickpocket.
-- This returns 0 rows:
-- select p.room_id, pv.role, coalesce(pv.dip_as, pv.special) as special
--   from yaaru_avan_player_private pv join yaaru_avan_players p on p.id = pv.player_id
--  where pv.role = 'pickpocket' and coalesce(pv.dip_as, pv.special) = 'sniper';
