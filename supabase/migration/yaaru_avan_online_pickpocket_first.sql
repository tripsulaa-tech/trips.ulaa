-- =============================================================================
-- yaaru_avan_online_pickpocket_first.sql
-- =============================================================================
-- Online rooms, matching the one-phone game's "Pickpocket can speak first" option.
--   * New room setting pickpocket_can_start (default false = a Pickpocket never opens
--     the description round).
--   * When it is off and the shuffled speaking order would start with a Pickpocket, a
--     random non-Pickpocket takes the opening slot (the two swap places). If everyone
--     in the order is a Pickpocket, the order is left as shuffled.
--   * The host switches it in the lobby through yaaru_avan_set_pickpocket_first.
-- The swap lives in the existing BEFORE UPDATE trigger, so every place that writes a
-- speaking order (new stop, tie-break re-describe) gets the rule with no other change.
-- Safe to run more than once. Run it in the Supabase SQL editor, then deploy the app build.
-- =============================================================================

alter table public.yaaru_avan_rooms add column if not exists pickpocket_can_start boolean not null default false;

create or replace function public._ya_room_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare w text; nm text; ord uuid[]; pick uuid; first_idx int; pick_idx int; tmp uuid;
begin
  -- 1. Random speaking order whenever a new one is written.
  if new.describe_order is distinct from old.describe_order and cardinality(new.describe_order) > 1 then
    new.describe_order := (select array_agg(x order by random()) from unnest(new.describe_order) x);

    -- 1b. A Pickpocket never opens the round unless the host allowed it.
    if not new.pickpocket_can_start then
      ord := new.describe_order;
      if exists (select 1 from yaaru_avan_player_private where player_id = ord[1] and role = 'pickpocket') then
        select u.id into pick
          from unnest(ord) as u(id)
         where not exists (select 1 from yaaru_avan_player_private pv where pv.player_id = u.id and pv.role = 'pickpocket')
         order by random()
         limit 1;
        if pick is not null then
          first_idx := 1;
          pick_idx := array_position(ord, pick);
          tmp := ord[first_idx];
          ord[first_idx] := ord[pick_idx];
          ord[pick_idx] := tmp;
          new.describe_order := ord;
        end if;
      end if;
    end if;
  end if;

  -- 2. Word count for the typed guess.
  if new.phase = 'guess' then
    select tourist_word into w from yaaru_avan_room_private where room_id = new.id;
    new.guess_words := greatest(1, coalesce(cardinality(regexp_split_to_array(btrim(coalesce(w, '')), '\\s+')), 1));
  else
    new.guess_words := null;
  end if;

  -- 3. Reveal the Retriever once the power is used.
  if new.phase = 'retrieved' and old.phase is distinct from 'retrieved' then
    select p.name into nm
      from yaaru_avan_players p join yaaru_avan_player_private pv on pv.player_id = p.id
     where p.room_id = new.id and pv.retrieval_used and coalesce(pv.dip_as, pv.special) = 'retriever'
     limit 1;
    if nm is not null then
      new.last_result := coalesce(new.last_result, '{}'::jsonb) || jsonb_build_object('retriever', nm);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists yaaru_avan_room_before_update on public.yaaru_avan_rooms;
create trigger yaaru_avan_room_before_update
  before update on public.yaaru_avan_rooms
  for each row execute function public._ya_room_before_update();

revoke all on function public._ya_room_before_update() from public, anon, authenticated;

-- Host-only switch for the lobby.
create or replace function public.yaaru_avan_set_pickpocket_first(p_code text, p_token uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.host_id <> me.id then raise exception 'host_only'; end if;
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  update yaaru_avan_rooms set pickpocket_can_start = coalesce(p_on, false) where id = r.id;
end $$;

revoke all on function public.yaaru_avan_set_pickpocket_first(text, uuid, boolean) from public;
grant execute on function public.yaaru_avan_set_pickpocket_first(text, uuid, boolean) to anon, authenticated;
