-- =============================================================================
-- fix_stowaway_logic_and_privacy.sql
-- =============================================================================
-- Run ONCE in the Supabase SQL editor, AFTER add_stowaway_online.sql,
-- add_stowaway_share_links.sql and (if you had run it) upgrade_stowaway_max_15.sql.
-- Safe to run again. Do NOT re-run add_stowaway_online.sql afterwards: it is the
-- first-time setup file and would put the old versions of these functions back.
--
-- WHAT IT FIXES
--   1. The Lost Soul could cheat. The screen says "One shot", but the database
--      accepted unlimited guesses and exposed an "exact match" flag, so a script
--      could try the whole word bank and read off the Explorers' secret word.
--      Now only ONE guess is accepted, and the guesser never receives the flag.
--   2. Wrong role counts. When the host's chosen split no longer fits the number
--      of players (someone left, or the numbers were set too high), the game
--      quietly deals a smaller valid split but the screens showed the old numbers
--      (even negative Explorers). The counts shown now match what is dealt.
--   3. Privacy. stowaway_rooms and stowaway_players were readable by anyone
--      holding the public anon key, exposing every live room code, trip title and
--      host id. Both tables are now private. Phones already get everything from
--      stowaway_state (it checks the player's secret token). Live updates now come
--      from a tiny public table, stowaway_signal, holding only (room uuid, change
--      counter); a room uuid is only ever given to players inside that room.
--   4. Expired rooms are cleaned up hourly if pg_cron is enabled (otherwise they
--      are still cleaned up whenever someone creates a room, as before).
-- =============================================================================

-- ── 1. One guess only ───────────────────────────────────────────────────────

create or replace function public.stowaway_submit_guess(p_code text, p_token uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; ew text; g text := left(btrim(coalesce(p_text, '')), 40);
begin
  me := _sw_me(p_code, p_token);
  r := _sw_lock_room(me.room_id);
  if r.phase <> 'guess' or r.out_player <> me.id then raise exception 'wrong_phase'; end if;
  if r.guess_text is not null then raise exception 'already_guessed'; end if;
  if g = '' then raise exception 'guess_required'; end if;
  select explorer_word into ew from stowaway_room_private where room_id = r.id;
  update stowaway_rooms set guess_text = g,
         guess_match = (lower(regexp_replace(g, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(ew, '[^a-zA-Z0-9]', '', 'g')))
   where id = r.id;
end $$;

-- ── 2. Role counts that match what is actually dealt ────────────────────────

-- The same shrinking rule stowaway_start_round uses, so display and deal agree.
create or replace function public._sw_fit_roles(n int, s int, l int, out fit_s int, out fit_l int)
language plpgsql immutable as $$
begin
  fit_s := greatest(1, coalesce(s, 1));
  fit_l := least(greatest(coalesce(l, 0), 0), case when n >= 10 then 2 else 1 end);
  while not _sw_roles_valid(n, fit_s, fit_l) and fit_l > 0 loop fit_l := fit_l - 1; end loop;
  while not _sw_roles_valid(n, fit_s, fit_l) and fit_s > 1 loop fit_s := fit_s - 1; end loop;
end $$;
revoke all on function public._sw_fit_roles(int, int, int) from public, anon, authenticated;

-- stowaway_state: counts use the fitted split (with fewer than 3 players the
-- host's raw numbers are kept, since no round can start yet), and the guesser
-- never receives guess_match.
create or replace function public.stowaway_state(p_code text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.stowaway_players; r public.stowaway_rooms; rp public.stowaway_room_private;
        mypriv public.stowaway_player_private; n int; show_counts boolean; players jsonb; host_away boolean;
        fs int; fl int; room_json jsonb;
begin
  me := _sw_me(p_code, p_token);
  update stowaway_player_private set last_seen = now() where player_id = me.id;
  select * into r from stowaway_rooms where id = me.room_id;
  select * into rp from stowaway_room_private where room_id = r.id;
  select * into mypriv from stowaway_player_private where player_id = me.id;
  select count(*) into n from stowaway_players where room_id = r.id;
  show_counts := (me.id = r.host_id) or not r.hide_counts;

  if n >= 3 then
    select f.fit_s, f.fit_l into fs, fl from public._sw_fit_roles(n, rp.stowaways, rp.lost) f;
  else
    fs := rp.stowaways; fl := rp.lost;
  end if;

  room_json := to_jsonb(r);
  if r.out_player is not distinct from me.id then
    room_json := room_json || jsonb_build_object('guess_match', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'seat', p.seat, 'seat_idx', p.seat_idx, 'alive', p.alive,
           'voted', p.voted, 'ready', p.ready, 'points', p.points, 'survived', p.survived,
           'correct_votes', p.correct_votes, 'wrong_votes', p.wrong_votes, 'lost_wins', p.lost_wins,
           'away', (pv.last_seen < now() - interval '45 seconds')
         ) order by p.joined_at), '[]'::jsonb)
    into players
    from stowaway_players p join stowaway_player_private pv on pv.player_id = p.id
   where p.room_id = r.id;

  select (pv.last_seen < now() - interval '60 seconds') into host_away
    from stowaway_player_private pv where pv.player_id = r.host_id;

  return jsonb_build_object(
    'now', now(),
    'me', jsonb_build_object('id', me.id, 'role', mypriv.role, 'word', mypriv.word),
    'room', room_json,
    'players', players,
    'host_away', coalesce(host_away, true),
    'counts', case when show_counts then
        jsonb_build_object('explorers', n - fs - fl, 'stowaways', fs, 'lost', fl)
      else null end
  );
end $$;

-- ── 3. Private tables + a minimal public "something changed" signal ─────────

create table if not exists public.stowaway_signal (
  room_id  uuid primary key references public.stowaway_rooms(id) on delete cascade,
  rev      bigint not null default 0
);

alter table public.stowaway_signal enable row level security;
drop policy if exists "Public read stowaway signal" on public.stowaway_signal;
create policy "Public read stowaway signal" on public.stowaway_signal for select using (true);
revoke all on public.stowaway_signal from anon, authenticated;
grant select on public.stowaway_signal to anon, authenticated;
alter table public.stowaway_signal replica identity full;

insert into public.stowaway_signal (room_id) select id from public.stowaway_rooms on conflict (room_id) do nothing;

-- Every new room gets a signal row.
create or replace function public._sw_signal_new_room()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into stowaway_signal (room_id) values (new.id) on conflict (room_id) do nothing;
  return new;
end $$;
revoke all on function public._sw_signal_new_room() from public, anon, authenticated;
drop trigger if exists stowaway_room_signal on public.stowaway_rooms;
create trigger stowaway_room_signal after insert on public.stowaway_rooms
  for each row execute function public._sw_signal_new_room();

-- Any change to a room or its players moves that room's counter. A game action
-- often touches many rows, so the counter moves once per transaction per room
-- (phones refetch after the commit and see the final state).
create or replace function public._sw_touch_signal()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid; flag text;
begin
  if TG_TABLE_NAME = 'stowaway_rooms' then
    rid := case when TG_OP = 'DELETE' then old.id else new.id end;
  else
    rid := case when TG_OP = 'DELETE' then old.room_id else new.room_id end;
  end if;
  flag := 'ulaa.sw_sig_' || replace(rid::text, '-', '');
  if coalesce(current_setting(flag, true), '') <> '1' then
    perform set_config(flag, '1', true);
    update stowaway_signal set rev = rev + 1 where room_id = rid;
  end if;
  return null;
end $$;
revoke all on function public._sw_touch_signal() from public, anon, authenticated;

drop trigger if exists stowaway_rooms_touch on public.stowaway_rooms;
create trigger stowaway_rooms_touch after update or delete on public.stowaway_rooms
  for each row execute function public._sw_touch_signal();
drop trigger if exists stowaway_players_touch on public.stowaway_players;
create trigger stowaway_players_touch after insert or update or delete on public.stowaway_players
  for each row execute function public._sw_touch_signal();

-- Realtime: listen to the signal only.
do $$
begin
  begin alter publication supabase_realtime add table public.stowaway_signal;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime drop table public.stowaway_rooms;   exception when undefined_object then null; end;
  begin alter publication supabase_realtime drop table public.stowaway_players; exception when undefined_object then null; end;
exception when undefined_object then null;
end $$;

-- Close the tables.
drop policy if exists "Public read stowaway rooms"   on public.stowaway_rooms;
drop policy if exists "Public read stowaway players" on public.stowaway_players;
revoke all on public.stowaway_rooms, public.stowaway_players from anon, authenticated;

-- ── 4. Hourly cleanup of expired rooms (only if pg_cron is available) ───────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('stowaway-cleanup', '23 * * * *', 'select public.stowaway_cleanup()');
  end if;
exception when others then null;
end $$;

grant execute on function public.stowaway_state(text, uuid), public.stowaway_submit_guess(text, uuid, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
