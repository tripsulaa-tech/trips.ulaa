-- =============================================================================
-- yaaru_avan_online_random_order_typed_guess_retriever_reveal.sql
-- =============================================================================
-- Online rooms, matching pass-and-play:
--   1. The speaking order is shuffled fresh at every stop (and for the tie-break re-describe).
--   2. While a Pickpocket guesses, the room carries guess_words = how many words the
--      Tourists' word has, so the app can show one box per word.
--   3. When the Retriever uses the power, last_result.retriever names them (the power is spent).
-- One BEFORE UPDATE trigger does all three, so no existing function has to be rewritten.
-- Safe to run more than once. Run it in the Supabase SQL editor, then deploy the app build.
-- =============================================================================

alter table public.yaaru_avan_rooms add column if not exists guess_words int;

create or replace function public._ya_room_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare w text; nm text;
begin
  -- 1. Random speaking order whenever a new one is written.
  if new.describe_order is distinct from old.describe_order and cardinality(new.describe_order) > 1 then
    new.describe_order := (select array_agg(x order by random()) from unnest(new.describe_order) x);
  end if;

  -- 2. Word count for the typed guess.
  if new.phase = 'guess' then
    select tourist_word into w from yaaru_avan_room_private where room_id = new.id;
    new.guess_words := greatest(1, coalesce(cardinality(regexp_split_to_array(btrim(coalesce(w, '')), '\s+')), 1));
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
