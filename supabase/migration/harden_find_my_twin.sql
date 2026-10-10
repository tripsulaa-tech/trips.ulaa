-- =============================================================================
-- harden_find_my_twin.sql
-- =============================================================================
-- Run ONCE in the Supabase SQL editor, AFTER add_find_my_twin_reveal_mode.sql.
-- Safe to run again.
--
-- WHAT IT FIXES
--   1. Privacy. ftwin_rooms and ftwin_players were readable by anyone holding the
--      public anon key, which exposed every live room code, trip title, host id
--      and the trip group's roster names. Both tables are now private. Phones
--      already get everything they need from ftwin_state (a function that checks
--      the player's secret token).
--      Live updates now come from a tiny public table, ftwin_signal, that holds
--      only (room uuid, change counter). A room uuid is only ever handed to
--      players inside that room, so nobody can discover other rooms with it.
--   2. "Skip unfinished pairs" no longer wipes every pair. By default it only
--      skips pairs that include a player who has been away for 45+ seconds. If
--      nobody looks away, the host is asked to confirm and it can be forced.
--   3. Expired rooms are cleaned up hourly when pg_cron is enabled (otherwise
--      they are still cleaned up whenever someone creates a room, as before).
-- =============================================================================

-- ── 1. Private tables + a minimal public "something changed" signal ─────────

create table if not exists public.ftwin_signal (
  room_id  uuid primary key references public.ftwin_rooms(id) on delete cascade,
  rev      int not null default 0
);

alter table public.ftwin_signal enable row level security;
drop policy if exists "Public read ftwin signal" on public.ftwin_signal;
create policy "Public read ftwin signal" on public.ftwin_signal for select using (true);
revoke all on public.ftwin_signal from anon, authenticated;
grant select on public.ftwin_signal to anon, authenticated;
alter table public.ftwin_signal replica identity full;

-- Rooms that already exist get a signal row.
insert into public.ftwin_signal (room_id, rev)
  select id, rev from public.ftwin_rooms
  on conflict (room_id) do nothing;

-- Every new room gets one automatically.
create or replace function public._ft_signal_new_room()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into ftwin_signal (room_id, rev) values (new.id, new.rev) on conflict (room_id) do nothing;
  return new;
end $$;
revoke all on function public._ft_signal_new_room() from public, anon, authenticated;

drop trigger if exists ftwin_room_signal on public.ftwin_rooms;
create trigger ftwin_room_signal after insert on public.ftwin_rooms
  for each row execute function public._ft_signal_new_room();

-- Every action already calls _ft_bump; it now also moves the public signal.
create or replace function public._ft_bump(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update ftwin_rooms set rev = rev + 1 where id = p_room returning rev into v;
  if v is not null then
    insert into ftwin_signal (room_id, rev) values (p_room, v)
      on conflict (room_id) do update set rev = excluded.rev;
  end if;
end $$;
revoke all on function public._ft_bump(uuid) from public, anon, authenticated;

-- Realtime: listen to the signal only.
do $$
begin
  begin alter publication supabase_realtime add table public.ftwin_signal;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime drop table public.ftwin_rooms;   exception when undefined_object then null; end;
  begin alter publication supabase_realtime drop table public.ftwin_players; exception when undefined_object then null; end;
exception when undefined_object then null;
end $$;

-- Close the tables.
drop policy if exists "Public read ftwin rooms"   on public.ftwin_rooms;
drop policy if exists "Public read ftwin players" on public.ftwin_players;
revoke all on public.ftwin_rooms, public.ftwin_players from anon, authenticated;

-- ── 2. Skip only the pairs that are actually stuck ──────────────────────────

drop function if exists public.ftwin_skip_pending(text, uuid);

-- Host only. p_force = false: skip unfinished pairs that include an away player
-- (no heartbeat for 45 seconds). If there are none, raises 'nobody_away' so the
-- app can ask the host to confirm. p_force = true: skip every unfinished pair.
create or replace function public.ftwin_skip_pending(p_code text, p_token uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare me public.ftwin_players; r public.ftwin_rooms; n int; open_left int;
begin
  me := _ft_me(p_code, p_token);
  r := _ft_lock_room(me.room_id);
  if r.host_id is distinct from me.id then raise exception 'host_only'; end if;
  if r.phase <> 'hunt' then raise exception 'wrong_phase'; end if;

  if coalesce(p_force, false) then
    update ftwin_edges
       set a_found = true, b_found = true, a_done = true, b_done = true
     where room_id = r.id and round_no = r.round_no and not (a_done and b_done);
  else
    update ftwin_edges e
       set a_found = true, b_found = true, a_done = true, b_done = true
     where e.room_id = r.id and e.round_no = r.round_no and not (e.a_done and e.b_done)
       and exists (
         select 1 from ftwin_player_private pp
          where pp.player_id in (e.a, e.b) and pp.last_seen < now() - interval '45 seconds');
    get diagnostics n = row_count;
    if n = 0 then raise exception 'nobody_away'; end if;
  end if;

  select count(*) into open_left from ftwin_edges
   where room_id = r.id and round_no = r.round_no and not (a_done and b_done);
  if open_left = 0 then
    update ftwin_rooms set phase = 'roundEnd' where id = r.id;
  end if;
  perform _ft_bump(r.id);
end $$;

grant execute on function public.ftwin_skip_pending(text, uuid, boolean) to anon, authenticated;

-- ── 3. Hourly cleanup of expired rooms (only if pg_cron is available) ───────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ftwin-cleanup', '17 * * * *', 'select public.ftwin_cleanup()');
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
