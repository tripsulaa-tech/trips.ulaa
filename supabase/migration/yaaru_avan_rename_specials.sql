-- =============================================================================
-- yaaru_avan_rename_specials.sql
-- =============================================================================
-- Gives the special roles their current names in the database. Run it ONCE in the
-- Supabase SQL editor, after yaaru_avan_rename_stranger.sql, then deploy the matching
-- app build in the same sitting (the old app and the renamed database do not
-- understand each other). Safe to run again: every step skips what is done.
--
--   special ids       clown          -> joyFool        (Joy Fool)
--                     rivals         -> duelists       (The Duelists)
--                     returnTicket   -> boomerang      (The Boomerang)
--                     tripLeader     -> goddess        (Goddess of Justice)
--                     backseatRider  -> ghost          (The Ghost)
--                     payback        -> revenger       (The Revenger; also the phase name)
--                     luckyDip       -> falafelVendor  (Falafel Vendor)
--                     lovers         unchanged
--   function          yaaru_avan_payback        -> yaaru_avan_revenge
--   column            player_private.ticket_used -> boomerang_used
--   stored key        payback_by                -> revenge_by
--
-- Rooms in the middle of a game are converted and keep going: the stored special ids,
-- the phase, the saved results and the lists of enabled specials. Every yaaru_avan_* /
-- _ya_* function that still has an old name is rewritten from its CURRENT live
-- definition, so later edits to them are kept. Permissions are kept; the renamed
-- function gets the same permissions as the old one.
-- =============================================================================

begin;

create or replace function pg_temp.ya_sp(x text) returns text language sql immutable as $$
  select case x
    when 'clown' then 'joyFool'         when 'rivals' then 'duelists'
    when 'returnTicket' then 'boomerang' when 'tripLeader' then 'goddess'
    when 'backseatRider' then 'ghost'   when 'payback' then 'revenger'
    when 'luckyDip' then 'falafelVendor' else x end
$$;

-- Text rewrite for function definitions, constraint definitions and saved JSON.
-- Special ids are only changed when they stand alone inside quotes.
create or replace function pg_temp.ya_rn4(t text) returns text language plpgsql immutable as $$
declare o text;
begin
  if t is null then return null; end if;
  foreach o in array array['clown','rivals','returnTicket','tripLeader','backseatRider','payback','luckyDip']
  loop
    t := replace(t, '''' || o || '''', '''' || pg_temp.ya_sp(o) || '''');
    t := replace(t, '"'  || o || '"',  '"'  || pg_temp.ya_sp(o) || '"');
  end loop;
  t := replace(t, '''payback_by''', '''revenge_by''');
  t := replace(t, '"payback_by"',   '"revenge_by"');
  t := regexp_replace(t, '\mticket_used\M', 'boomerang_used', 'g');
  t := regexp_replace(t, '\myaaru_avan_payback\M', 'yaaru_avan_revenge', 'g');
  return t;
end $$;

-- 1. Constraints off while the stored values change (their new text is kept aside).
create temp table _ya_cons (tbl text, name text, def text) on commit drop;
insert into _ya_cons
select c.conrelid::regclass::text, c.conname, pg_temp.ya_rn4(pg_get_constraintdef(c.oid))
  from pg_constraint c
 where c.conname in ('yaaru_avan_player_private_special_check', 'yaaru_avan_rooms_phase_check')
   and pg_get_constraintdef(c.oid) <> pg_temp.ya_rn4(pg_get_constraintdef(c.oid));

do $$
declare r record;
begin
  for r in select * from _ya_cons loop
    execute format('alter table %s drop constraint %I', r.tbl, r.name);
  end loop;
end $$;

-- 2. Column rename (skipped when already done).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'yaaru_avan_player_private' and column_name = 'ticket_used') then
    alter table public.yaaru_avan_player_private rename column ticket_used to boomerang_used;
  end if;
end $$;

-- 3. Stored rows.
update public.yaaru_avan_player_private
   set special = pg_temp.ya_sp(special), dip_as = pg_temp.ya_sp(dip_as)
 where special in ('clown','rivals','returnTicket','tripLeader','backseatRider','payback','luckyDip')
    or dip_as  in ('clown','rivals','returnTicket','tripLeader','backseatRider','payback','luckyDip');

update public.yaaru_avan_rooms set phase = 'revenger' where phase = 'payback';

update public.yaaru_avan_rooms
   set special_ids = array(select pg_temp.ya_sp(x) from unnest(special_ids) with ordinality t(x, i) order by i)
 where special_ids is not null
   and special_ids && array['clown','rivals','returnTicket','tripLeader','backseatRider','payback','luckyDip'];

update public.yaaru_avan_rooms
   set last_result   = pg_temp.ya_rn4(last_result::text)::jsonb,
       round_summary = pg_temp.ya_rn4(round_summary::text)::jsonb
 where last_result::text   ~ '"(clown|rivals|returnTicket|tripLeader|backseatRider|payback|luckyDip|payback_by)"'
    or round_summary::text ~ '"(clown|rivals|returnTicket|tripLeader|backseatRider|payback|luckyDip|payback_by)"';

-- 4. Constraints back, with the new values.
do $$
declare r record;
begin
  for r in select * from _ya_cons loop
    execute format('alter table %s add constraint %I %s', r.tbl, r.name, r.def);
  end loop;
end $$;

-- 5. Functions: rewrite each one that still has an old name from its live definition.
do $$
declare
  f record;
  def text;
  grants text;
  new_sig text;
begin
  for f in
    select p.oid, p.proname, p.oid::regprocedure as sig, pg_get_function_identity_arguments(p.oid) as ident,
           pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (p.proname like 'yaaru\_avan\_%' or p.proname like '\_ya\_%')
       and (pg_get_functiondef(p.oid) ~ '''(clown|rivals|returnTicket|tripLeader|backseatRider|payback|luckyDip|payback_by)'''
            or pg_get_functiondef(p.oid) ~ '\mticket_used\M'
            or p.proname = 'yaaru_avan_payback')
  loop
    def := pg_temp.ya_rn4(f.src);
    if f.proname = 'yaaru_avan_payback' then
      -- A renamed function is a new function: create it, give it the old permissions, drop the old one.
      select string_agg(format('grant execute on function public.yaaru_avan_revenge(%s) to %s', f.ident,
                               case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end), '; ')
        into grants
        from pg_proc p2, aclexplode(coalesce(p2.proacl, acldefault('f', p2.proowner))) a
        left join pg_roles r on r.oid = a.grantee
       where p2.oid = f.oid and a.privilege_type = 'EXECUTE';
      execute def;
      if grants is not null then execute grants; end if;
      execute format('drop function %s', f.sig);
    else
      execute def;
    end if;
  end loop;
end $$;

commit;
