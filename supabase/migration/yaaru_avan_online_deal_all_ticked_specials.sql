-- =============================================================================
-- yaaru_avan_online_deal_all_ticked_specials.sql
-- =============================================================================
-- Online rooms, matching the one-phone game: every special role the host ticks is dealt.
--
--   BEFORE  Up to one special per 3 players was dealt, picked at random from the ticked list,
--           so with 6 players and 3 roles ticked only 2 of them appeared.
--   NOW     Every ticked role is dealt, each to a different player, as long as there is room:
--             * at most half the players can hold a special (6 players -> 3, 9 -> 4);
--             * Duelists and Lovers take two players each;
--             * if more are ticked than fit, a random set that fits is dealt;
--             * roles that cannot apply are still skipped (a group below the role's minimum size,
--               Retriever without 2 Strangers);
--             * Joy Fool, Revenger and Sniper never go to a Pickpocket; Retriever only to a Tourist;
--             * the Falafel Vendor secretly carries one of the other ticked single-player roles.
--               That role goes to the Vendor instead of a separate player. With no such role
--               ticked, the Vendor is dropped.
--
-- Only one function is replaced: _ya_deal_specials. Nothing else changes, and no data is touched.
-- Run AFTER add_yaaru_avan_sniper.sql. Safe to run more than once. Finish active rounds first,
-- then deploy the app build.
-- =============================================================================

begin;

do $$
begin
  if to_regprocedure('public._ya_deal_specials(uuid,int,int,text[])') is null then
    raise exception '_ya_deal_specials is missing. Run add_yaaru_avan_sniper.sql (and the migrations before it) first.';
  end if;
end $$;

create or replace function public._ya_deal_specials(p_room uuid, p_n int, p_strangers int, p_enabled text[])
returns void language plpgsql security definer set search_path = public as $$
declare enabled text[]; chosen text[]; places int; used int; cost int;
        sp text; c text; a uuid; b uuid; vendor_on boolean;
begin
  -- A new deal: everyone's Sniper shot is fresh again.
  update yaaru_avan_player_private set sniper_used = false
   where player_id in (select id from yaaru_avan_players where room_id = p_room);

  enabled := array(select x from unnest(array['joyFool','duelists','boomerang','goddess','ghost','revenger','falafelVendor','lovers','retriever','sniper']) x
    where (p_enabled is null or x = any(p_enabled))
      and p_n >= case x when 'falafelVendor' then 4 when 'revenger' then 5 when 'duelists' then 5 when 'lovers' then 5 when 'sniper' then 4 else 0 end
      and (x <> 'retriever' or p_strangers >= 2));

  places := p_n / 2;                       -- at most half the players can hold a special
  vendor_on := 'falafelVendor' = any(enabled);

  -- Keep the ticked roles (random order) while they fit in the group.
  chosen := '{}';
  used := 0;
  for sp in select x from unnest(enabled) x where x <> 'falafelVendor' order by random() loop
    cost := case when sp in ('duelists','lovers') then 2 else 1 end;
    if used + cost <= places then
      chosen := chosen || sp;
      used := used + cost;
    end if;
  end loop;

  -- The Falafel Vendor carries one of the chosen single-player roles: that role is theirs.
  if vendor_on then
    for c in select x from unnest(chosen) x where x not in ('duelists','lovers') order by random() loop
      a := null;
      select pp.player_id into a from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
        where p.room_id = p_room and pp.special is null
          and (c <> 'retriever' or pp.role = 'tourist')
          and (c not in ('joyFool','revenger','sniper') or pp.role <> 'pickpocket')
        order by random() limit 1;
      if a is not null then
        update yaaru_avan_player_private set special = 'falafelVendor', dip_as = c where player_id = a;
        chosen := array_remove(chosen, c);
        exit;
      end if;
    end loop;
  end if;

  -- Roles that need a particular kind of player go first, so they always get a pick.
  for sp in select x from unnest(chosen) x order by
    case when x = 'retriever' then 0 when x in ('joyFool','revenger','sniper') then 1 else 2 end
  loop
    a := null;
    select pp.player_id into a from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
      where p.room_id = p_room and pp.special is null
        and (sp <> 'retriever' or pp.role = 'tourist')
        and (sp not in ('joyFool','revenger','sniper') or pp.role <> 'pickpocket')
      order by random() limit 1;
    if a is null then continue; end if;
    if sp in ('duelists','lovers') then
      b := null;
      select pp.player_id into b from yaaru_avan_player_private pp join yaaru_avan_players p on p.id = pp.player_id
        where p.room_id = p_room and pp.special is null and pp.player_id <> a order by random() limit 1;
      if b is null then continue; end if;
      update yaaru_avan_player_private set special = sp, partner = b where player_id = a;
      update yaaru_avan_player_private set special = sp, partner = a where player_id = b;
    else
      update yaaru_avan_player_private set special = sp where player_id = a;
    end if;
  end loop;
end $$;

commit;
