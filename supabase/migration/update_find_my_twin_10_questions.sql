-- Find My Twin: grow the question set from 5 to 10 travel questions.
-- Run AFTER add_find_my_twin.sql. Question ORDER must match QUESTIONS in
-- src/components/ui/findMyTwinEngine.ts.
--
-- Anyone mid-game when this runs has to answer again (their old 5-answer
-- string no longer fits), so existing answers are cleared first.

update public.ftwin_player_private set answers = null;
update public.ftwin_players set answered = false;

alter table public.ftwin_player_private drop constraint if exists ftwin_player_private_answers_check;
alter table public.ftwin_player_private
  add constraint ftwin_player_private_answers_check check (answers ~ '^[01]{10}$');

-- Secret compatibility score (50..99). Weights follow the question order:
-- place, drink, clock, spend, capture, stay, move, pace, scene, vibe.
create or replace function public._ft_score(a text, b text, seed text)
returns int language plpgsql immutable as $$
declare
  w constant int[] := array[14, 8, 10, 10, 8, 12, 10, 12, 8, 8];  -- sums to 100
  sim int := 0;
  wobble int;
begin
  for i in 1..10 loop
    if substr(a, i, 1) = substr(b, i, 1) then sim := sim + w[i]; end if;
  end loop;
  wobble := abs(hashtext(seed)) % 5;               -- 0..4
  return least(99, 50 + (sim * 45) / 100 + wobble);
end $$;

-- Save my 10 answers ('0' = left option, '1' = right option).
create or replace function public.ftwin_submit_answers(p_code text, p_token uuid, p_answers text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_answers is null or p_answers !~ '^[01]{10}$' then raise exception 'bad_answers'; end if;
  update ftwin_player_private set answers = p_answers where player_id = me.id;
  update ftwin_players set answered = true where id = me.id;
  perform _ft_bump(r.id);
end $$;
