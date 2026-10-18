-- =============================================================================
-- yaaru_avan_no_pickpocket_joyfool_revenger.sql
-- =============================================================================
-- Online rooms: replaces the earlier yaaru_avan_no_pickpocket_boomerang_revenger.sql rule
-- (run that one first, it creates the trigger): Joy Fool and Revenger blocked, Boomerang allowed.
--
--   * The Joy Fool and the Revenger are never given to a Pickpocket. The Boomerang CAN go to a Pickpocket.
--   * A Falafel Vendor who is a Pickpocket cannot draw the Joy Fool or Revenger
--     (they draw another ability instead; if none is left, the Vendor is dropped,
--     exactly like the one-phone game).
--
-- HOW IT WORKS
--   It does not touch yaaru_avan_start_round (so nothing already live is rewritten).
--   A trigger fires when a room moves to the 'deal' phase, which is the last step of
--   start_round, and fixes up the specials that were just dealt.
--
-- HOW TO RUN
--   Run this whole file ONCE in the Supabase SQL editor. No app deploy is needed for
--   this part. Safe to run again. It runs in one transaction: if anything fails,
--   nothing is changed.
--
-- EXPECTS (created by the earlier rename migrations)
--   tables   yaaru_avan_rooms, yaaru_avan_players, yaaru_avan_player_private
--   columns  rooms: id, phase, specials, special_ids
--            players: id, room_id
--            player_private: player_id, role, special, dip_as
--   values   role 'pickpocket'; specials 'boomerang', 'revenger', 'joyFool',
--            'goddess', 'ghost', 'falafelVendor' (the dip_as column holds a vendor's ability)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.yaaru_avan_rooms') is null
     or to_regclass('public.yaaru_avan_players') is null
     or to_regclass('public.yaaru_avan_player_private') is null then
    raise exception 'yaaru_avan_rooms / yaaru_avan_players / yaaru_avan_player_private not found. Run the rename migrations first.';
  end if;
end $$;

create or replace function public._ya_no_pickpocket_specials()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  restricted text[] := array['joyFool','revenger'];      -- never on a Pickpocket
  pk      record;
  target  uuid;
  enabled text[];
  dealt   text[];
  pool    text[];
begin
  if not coalesce(new.specials, false) then return new; end if;

  -- 1. A Joy Fool / Revenger that landed on a Pickpocket moves to a Tourist or
  --    Stranger who has no special yet. (Nobody free: it is dropped.)
  for pk in
    select pv.player_id, pv.special
      from yaaru_avan_player_private pv
      join yaaru_avan_players p on p.id = pv.player_id
     where p.room_id = new.id and pv.role = 'pickpocket' and pv.special = any (restricted)
  loop
    select pv.player_id into target
      from yaaru_avan_player_private pv
      join yaaru_avan_players p on p.id = pv.player_id
     where p.room_id = new.id and pv.role <> 'pickpocket' and pv.special is null
     order by random() limit 1;

    update yaaru_avan_player_private set special = null where player_id = pk.player_id;
    if target is not null then
      update yaaru_avan_player_private set special = pk.special where player_id = target;
    end if;
  end loop;

  -- 2. A Falafel Vendor who is a Pickpocket and drew the Joy Fool / Revenger draws
  --    again from the abilities that are allowed, enabled and not already in play.
  enabled := coalesce(new.special_ids, array['joyFool','boomerang','goddess','ghost','revenger']);

  select coalesce(array_agg(x), '{}') into dealt
    from (select pv.special as x
            from yaaru_avan_player_private pv join yaaru_avan_players p on p.id = pv.player_id
           where p.room_id = new.id and pv.special is not null
          union all
          select pv.dip_as
            from yaaru_avan_player_private pv join yaaru_avan_players p on p.id = pv.player_id
           where p.room_id = new.id and pv.dip_as is not null) t;

  for pk in
    select pv.player_id
      from yaaru_avan_player_private pv
      join yaaru_avan_players p on p.id = pv.player_id
     where p.room_id = new.id and pv.role = 'pickpocket' and pv.dip_as = any (restricted)
  loop
    pool := array(select x from unnest(array['boomerang','goddess','ghost']) x
                   where x = any (enabled) and not (x = any (dealt))
                   order by random());
    if cardinality(pool) = 0 then
      update yaaru_avan_player_private set special = null, dip_as = null where player_id = pk.player_id;
    else
      update yaaru_avan_player_private set dip_as = pool[1] where player_id = pk.player_id;
      dealt := array_append(dealt, pool[1]);
    end if;
  end loop;

  return new;
end $$;

revoke all on function public._ya_no_pickpocket_specials() from public;

drop trigger if exists ya_no_pickpocket_specials on public.yaaru_avan_rooms;
create trigger ya_no_pickpocket_specials
  after update of phase on public.yaaru_avan_rooms
  for each row
  when (new.phase = 'deal' and old.phase is distinct from 'deal')
  execute function public._ya_no_pickpocket_specials();

commit;

-- CHECK (optional): after starting a round with specials on, this returns 0 rows.
-- select p.room_id, pv.role, coalesce(pv.dip_as, pv.special) as special
--   from yaaru_avan_player_private pv join yaaru_avan_players p on p.id = pv.player_id
--  where pv.role = 'pickpocket' and coalesce(pv.dip_as, pv.special) in ('joyFool','revenger');
