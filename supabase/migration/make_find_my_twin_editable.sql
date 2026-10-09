-- =============================================================================
-- make_find_my_twin_editable.sql
-- =============================================================================
-- Lets the admin (Admin -> Games -> Find My Twin) add and remove questions and
-- choose how many rounds the game has. Run AFTER add_find_my_twin.sql and
-- update_find_my_twin_10_questions.sql. Safe to run again.
--
-- The admin page saves its settings in site_content under the key
-- 'game:twin-prompts':
--   { "prompts":   ["round 1 starter", "round 2 starter", ...],        -- 1 to 12 rounds
--     "questions": [{ "left": {...}, "right": {...}, "weight": 14 }, ...] }  -- 3 to 20
-- The functions below read that same row, so the app and the database always
-- agree. With no saved row the old behaviour applies: 10 questions and 4 rounds.
--
-- Nobody is kicked out: answers already saved (10 characters) stay valid, and a
-- pair is scored on the questions both players answered.
-- =============================================================================

-- ── Settings readers (not callable from the API) ─────────────────────────────

create or replace function public._ft_cfg()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select content from site_content where key = 'game:twin-prompts'), '{}'::jsonb);
$$;

-- How many questions players answer (3..20, default 10).
create or replace function public._ft_q_count()
returns int language sql stable security definer set search_path = public as $$
  select case
    when jsonb_typeof(public._ft_cfg() -> 'questions') = 'array'
     and jsonb_array_length(public._ft_cfg() -> 'questions') between 3 and 20
    then jsonb_array_length(public._ft_cfg() -> 'questions')
    else 10 end;
$$;

-- How many rounds the game has (1..12, default 4): one per conversation starter.
create or replace function public._ft_max_rounds()
returns int language sql stable security definer set search_path = public as $$
  select case
    when jsonb_typeof(public._ft_cfg() -> 'prompts') = 'array'
     and jsonb_array_length(public._ft_cfg() -> 'prompts') between 1 and 12
    then jsonb_array_length(public._ft_cfg() -> 'prompts')
    else 4 end;
$$;

-- ── Answers: any length from 3 to 20 ('0' = left option, '1' = right) ───────

alter table public.ftwin_player_private drop constraint if exists ftwin_player_private_answers_check;
alter table public.ftwin_player_private
  add constraint ftwin_player_private_answers_check check (answers ~ '^[01]{3,20}$');

-- ── Score: weights come from the saved questions ─────────────────────────────
-- Secret compatibility score (50..99). Each question counts by its weight (1..20)
-- relative to the others. Questions without a saved weight use the old defaults.

create or replace function public._ft_score(a text, b text, seed text)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  defaults constant int[] := array[14, 8, 10, 10, 8, 12, 10, 12, 8, 8];
  cfg jsonb := public._ft_cfg() -> 'questions';
  n int := least(length(a), length(b));
  w int;
  raw text;
  sim int := 0;
  total int := 0;
  wobble int;
begin
  for i in 1..n loop
    raw := case when jsonb_typeof(cfg) = 'array' then cfg -> (i - 1) ->> 'weight' else null end;
    if raw ~ '^[0-9]{1,2}$' and raw::int between 1 and 20 then
      w := raw::int;
    elsif jsonb_typeof(cfg) is distinct from 'array' and i <= 10 then
      w := defaults[i];
    else
      w := 10;
    end if;
    total := total + w;
    if substr(a, i, 1) = substr(b, i, 1) then sim := sim + w; end if;
  end loop;
  wobble := abs(hashtext(seed)) % 5;               -- 0..4
  if total = 0 then return 50 + wobble; end if;
  return least(99, 50 + (sim * 45) / total + wobble);
end $$;

-- ── Save my answers: must match the current number of questions ──────────────

create or replace function public.ftwin_submit_answers(p_code text, p_token uuid, p_answers text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  if p_answers is null or p_answers !~ '^[01]+$' or length(p_answers) <> public._ft_q_count() then
    raise exception 'bad_answers';
  end if;
  update ftwin_player_private set answers = p_answers where player_id = me.id;
  update ftwin_players set answered = true where id = me.id;
  perform _ft_bump(r.id);
end $$;

-- ── Next round: stops after the configured number of rounds ──────────────────

create or replace function public.ftwin_next_round(p_code text, p_token uuid, p_from_round int)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; made int := 0;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.phase <> 'roundEnd' or r.round_no <> p_from_round then return; end if;
  if r.round_no < public._ft_max_rounds() then made := _ft_pair_round(r.id, r.round_no + 1); end if;
  if made = 0 then
    update ftwin_rooms set phase = 'final' where id = r.id;
  else
    update ftwin_rooms set phase = 'hunt', round_no = r.round_no + 1 where id = r.id;
  end if;
  perform _ft_bump(r.id);
end $$;

-- ── Permissions: the settings readers stay internal ──────────────────────────
revoke all on function public._ft_cfg(), public._ft_q_count(), public._ft_max_rounds()
  from public, anon, authenticated;
revoke all on function public._ft_score(text, text, text) from public, anon, authenticated;

grant execute on function
  public.ftwin_submit_answers(text, uuid, text),
  public.ftwin_next_round(text, uuid, int)
  to anon, authenticated;

notify pgrst, 'reload schema';
