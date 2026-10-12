-- ─────────────────────────────────────────────────────────────────────────────
-- yaaru_avan_pickpocket_always_guesses.sql
--
-- Yaaru Avan? ONLINE rooms: like Undercover, Mr. White (the Pickpocket) ALWAYS gets a last
-- guess at the Tourists' word when she is eliminated. Before this, a Pickpocket who left
-- as a Lover's partner (the other Lover was voted out) never got her guess.
--
-- The one-phone game does the same (src/components/ui/YaaruAvanGame.tsx, afterReveal).
-- Change one, change both.
--
-- Run ONCE in the Supabase SQL editor, AFTER rename_stowaway_to_yaaru_avan.sql (it uses the
-- yaaru_avan_* / _ya_* names). Safe to run again. Deploy it together with the matching app build.
--
-- What changes:
--   * yaaru_avan_rooms gets two columns: guess_queue (Pickpockets still waiting to guess) and
--     guess_after (the player whose elimination started the guesses; the Revenger check and the
--     next stop follow that player).
--   * yaaru_avan_after_reveal: the voted-out Pickpocket guesses first; a Pickpocket Lover who
--     left with them guesses next (two Lovers can both be Pickpockets with 10+ players).
--   * yaaru_avan_judge_guess: a wrong guess hands over to the next Pickpocket in the queue;
--     only when the queue is empty does the game go on (win check, Revenger, next stop).
--   * A correct guess still steals the round straight away.
-- Nothing else is touched: yaaru_avan_submit_guess already works for whoever is out_player.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.yaaru_avan_rooms add column if not exists guess_queue uuid[] not null default '{}';
alter table public.yaaru_avan_rooms add column if not exists guess_after uuid;

-- ── After the reveal: every eliminated Pickpocket guesses, voted-out player first ──
create or replace function public.yaaru_avan_after_reveal(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms;
        lover uuid; q uuid[] := '{}';
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase <> 'offboard' or r.offboard_at is null then return; end if;
  if now() < r.offboard_at + interval '4 seconds' then return; end if;

  -- The voted-out (or Revenger-picked) player guesses first, if she is the Pickpocket.
  if exists (select 1 from yaaru_avan_player_private where player_id = r.out_player and role = 'lost') then
    q := array_append(q, r.out_player);
  end if;
  -- A Lover who left with them: if she is a Pickpocket too, she gets her guess as well.
  lover := nullif(r.last_result->>'lover', '')::uuid;
  if lover is not null
     and exists (select 1 from yaaru_avan_player_private where player_id = lover and role = 'lost') then
    q := array_append(q, lover);
  end if;

  if cardinality(q) = 0 then
    perform _ya_after_out(r.id, r.out_player);
    return;
  end if;

  update yaaru_avan_rooms
     set phase = 'guess', guess_text = null, guess_match = null,
         guess_after = r.out_player,
         out_player = q[1],
         guess_queue = case when cardinality(q) > 1 then q[2:cardinality(q)] else '{}'::uuid[] end
   where id = r.id;
end $$;

-- ── Judging the guess: next Pickpocket in the queue, or the game goes on ──
create or replace function public.yaaru_avan_judge_guess(p_code text, p_token uuid, p_correct boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.yaaru_avan_players; r public.yaaru_avan_rooms; out_role text;
begin
  me := _ya_me(p_code, p_token);
  r := _ya_lock_room(me.room_id);
  if r.phase <> 'guess' then return; end if;
  if r.out_player = me.id then raise exception 'cannot_judge_own_guess'; end if;
  if r.guess_text is null then raise exception 'no_guess_yet'; end if;
  select role into out_role from yaaru_avan_player_private where player_id = r.out_player;
  if out_role = 'lost' and p_correct then
    update yaaru_avan_players set alive = true where id = r.out_player; -- she stole the round
    perform _ya_finish(r.id, 'lost-steal');
    return;
  end if;

  -- Wrong guess. Another Pickpocket left with her (two Lovers): it is her turn now.
  if cardinality(coalesce(r.guess_queue, '{}'::uuid[])) > 0 then
    update yaaru_avan_rooms
       set out_player = r.guess_queue[1],
           guess_queue = case when cardinality(r.guess_queue) > 1
                              then r.guess_queue[2:cardinality(r.guess_queue)] else '{}'::uuid[] end,
           guess_text = null, guess_match = null
     where id = r.id;
    return;
  end if;

  -- Nobody left to guess: win check, Revenger, next stop (for the player who started it).
  perform _ya_after_out(r.id, coalesce(r.guess_after, r.out_player));
end $$;

grant execute on function
  public.yaaru_avan_after_reveal(text, uuid),
  public.yaaru_avan_judge_guess(text, uuid, boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';
