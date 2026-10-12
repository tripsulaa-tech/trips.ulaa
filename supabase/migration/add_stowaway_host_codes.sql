-- ─────────────────────────────────────────────────────────────────────────────
-- add_stowaway_host_codes.sql
--
-- Who may CREATE a Stowaway room ("Yaaru Fake?"):
--   * an admin (signed in), or
--   * anyone holding a valid HOST CODE for a trip.
-- Everyone else can only JOIN a room with its 4-letter code (unchanged).
--
-- A host code is made by an admin in Admin -> Games for one trip. It stops
-- working at the end of the day AFTER the trip's end_date (India time), can be
-- revoked or replaced, and allows at most 5 open rooms at a time. A room made
-- with a code takes the trip's title and also expires when the code does, so
-- nothing can be played on that trip's code afterwards.
--
-- Run once in the Supabase SQL editor (after add_stowaway_online.sql and
-- add_admin_allowlist_and_hardening.sql). Safe to run again. If you already ran
-- an earlier "admins only" version of stowaway_create_room, this replaces it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Host codes (private: only the functions below touch it) ──
create table if not exists public.stowaway_host_codes (
  code        text primary key,
  trip_id     uuid not null,
  trip_title  text not null default 'Ulaa',
  expires_at  timestamptz not null,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists stowaway_host_codes_trip_idx on public.stowaway_host_codes (trip_id);
alter table public.stowaway_host_codes enable row level security;
revoke all on public.stowaway_host_codes from anon, authenticated;

-- Which host code made a room (private, so the code never reaches the browser).
alter table public.stowaway_room_private add column if not exists host_code text;

-- ── Admin: make / read / revoke a trip's host code ──

-- Makes a new code for the trip (any earlier code for it stops working).
create or replace function public.stowaway_make_host_code(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record; v_code text; v_exp timestamptz; i int := 0;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select title, end_date into t from upcoming_trips where id = p_trip_id;
  if not found then raise exception 'trip_not_found'; end if;
  -- end of the day after the trip ends, India time
  v_exp := ((t.end_date + 2)::timestamp at time zone 'Asia/Kolkata');
  if v_exp <= now() then raise exception 'trip_finished'; end if;

  delete from stowaway_host_codes where expires_at < now() - interval '30 days';
  update stowaway_host_codes set revoked = true where trip_id = p_trip_id and not revoked;

  loop
    v_code := '';
    for k in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into stowaway_host_codes (code, trip_id, trip_title, expires_at)
        values (v_code, p_trip_id, left(btrim(coalesce(nullif(t.title, ''), 'Ulaa')), 60), v_exp);
      exit;
    exception when unique_violation then
      i := i + 1;
      if i > 25 then raise exception 'try_again'; end if;
    end;
  end loop;
  return jsonb_build_object('code', v_code, 'expires_at', v_exp, 'trip_title', t.title);
end $$;

-- The trip's current code, or null (none made, revoked or expired).
create or replace function public.stowaway_get_host_code(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h stowaway_host_codes;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into h from stowaway_host_codes
   where trip_id = p_trip_id and not revoked and expires_at > now()
   order by created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('code', h.code, 'expires_at', h.expires_at, 'trip_title', h.trip_title,
    'open_rooms', (select count(*) from stowaway_room_private rp join stowaway_rooms r on r.id = rp.room_id
                    where rp.host_code = h.code and r.expires_at > now()));
end $$;

create or replace function public.stowaway_revoke_host_code(p_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update stowaway_host_codes set revoked = true where trip_id = p_trip_id and not revoked;
end $$;

-- ── Create a room: admin, or a valid host code ──
drop function if exists public.stowaway_create_room(text, uuid, text);

create or replace function public.stowaway_create_room(
  p_name text, p_token uuid, p_trip_title text default 'Ulaa', p_host_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid; v_player uuid; v_name text := _sw_clean_name(p_name); i int := 0;
        alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        v_hc text := upper(regexp_replace(coalesce(p_host_code, ''), '[^A-Za-z0-9]', '', 'g'));
        h stowaway_host_codes; v_title text; v_expires timestamptz := now() + interval '6 hours';
begin
  v_title := left(btrim(coalesce(nullif(p_trip_title, ''), 'Ulaa')), 60);

  if v_hc <> '' then
    select * into h from stowaway_host_codes where code = v_hc and not revoked and expires_at > now();
    if not found then raise exception 'bad_host_code'; end if;
    if (select count(*) from stowaway_room_private rp join stowaway_rooms r on r.id = rp.room_id
         where rp.host_code = h.code and r.expires_at > now()) >= 5 then
      raise exception 'host_code_busy';
    end if;
    v_title := h.trip_title;
    v_expires := least(v_expires, h.expires_at);
  elsif not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  if v_name = '' then raise exception 'name_required'; end if;
  if p_token is null then raise exception 'token_required'; end if;
  perform stowaway_cleanup();
  if (select count(*) from stowaway_rooms) >= 500 then raise exception 'too_many_rooms'; end if;

  loop
    v_code := '';
    for k in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from stowaway_rooms where code = v_code);
    i := i + 1;
    if i > 30 then raise exception 'try_again'; end if;
  end loop;

  insert into stowaway_rooms (code, trip_title, expires_at)
    values (v_code, v_title, v_expires) returning id into v_room;
  insert into stowaway_players (room_id, name) values (v_room, v_name) returning id into v_player;
  insert into stowaway_player_private (player_id, token) values (v_player, p_token);
  insert into stowaway_room_private (room_id, stowaways, lost, host_code)
    values (v_room, 1, 0, nullif(v_hc, ''));
  update stowaway_rooms set host_id = v_player where id = v_room;
  return jsonb_build_object('code', v_code, 'player_id', v_player);
end $$;

-- ── Who may call what ──
revoke all on function public.stowaway_create_room(text, uuid, text, text) from public;
grant execute on function public.stowaway_create_room(text, uuid, text, text) to anon, authenticated;

revoke all on function
  public.stowaway_make_host_code(uuid), public.stowaway_get_host_code(uuid), public.stowaway_revoke_host_code(uuid)
  from public, anon;
grant execute on function
  public.stowaway_make_host_code(uuid), public.stowaway_get_host_code(uuid), public.stowaway_revoke_host_code(uuid)
  to authenticated;
