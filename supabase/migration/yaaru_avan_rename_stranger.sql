-- =============================================================================
-- yaaru_avan_rename_stranger.sql
-- =============================================================================
-- Finishes the Stowaway -> Stranger rename in the database. Run it ONCE in the
-- Supabase SQL editor, after yaaru_avan_rename_roles.sql, then deploy the matching
-- app build in the same sitting. Safe to run again: every step skips what is done.
--
-- Why it exists: yaaru_avan_rename_roles.sql already limits roles to
-- tourist / stranger / pickpocket, but the game functions still wrote 'stowaway',
-- so dealing a round failed, and the app already sends p_strangers.
--
--   role value        stowaway            -> stranger
--   outcome           stowaways           -> strangers
--   columns           room_private.stowaways      -> strangers
--                     room_private.stowaway_word  -> stranger_word
--   setting param     p_stowaways         -> p_strangers
--   result keys       counts.stowaways    -> counts.strangers
--                     summary stowaway_word -> stranger_word
--   temp table        _sw_gain            -> _ya_gain
--
-- Every yaaru_avan_* / _ya_* function that still has an old word is rewritten from
-- its CURRENT live definition, so later edits to them are kept. Rooms in progress
-- keep going. Permissions on rewritten functions are kept.
-- =============================================================================

begin;

create or replace function pg_temp.ya_rn3(t text) returns text language plpgsql immutable as $$
begin
  if t is null then return null; end if;
  t := regexp_replace(t, '\mp_stowaways\M',    'p_strangers',   'g');
  t := regexp_replace(t, '\mstowaway_word\M',  'stranger_word', 'g');
  t := regexp_replace(t, '\mstowaways\M',      'strangers',     'g');
  t := regexp_replace(t, '\mstowaway\M',       'stranger',      'g');
  t := regexp_replace(t, '\m_sw_gain\M',       '_ya_gain',      'g');
  t := regexp_replace(t, '\mStowaways\M',      'Strangers',     'g');
  t := regexp_replace(t, '\mStowaway\M',       'Stranger',      'g');
  return t;
end $$;

-- 1. Column renames (skipped when already done).
do $$
declare r record;
begin
  for r in select * from (values
      ('yaaru_avan_room_private', 'stowaways',     'strangers'),
      ('yaaru_avan_room_private', 'stowaway_word', 'stranger_word')) v(tbl, old_name, new_name)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = r.tbl and column_name = r.old_name) then
      execute format('alter table public.%I rename column %I to %I', r.tbl, r.old_name, r.new_name);
    end if;
  end loop;
end $$;

-- 2. Stored rows: role values, outcomes and the saved result / summary JSON.
update public.yaaru_avan_player_private set role = 'stranger' where role = 'stowaway';

update public.yaaru_avan_rooms set outcome = 'strangers' where outcome = 'stowaways';

update public.yaaru_avan_rooms
   set last_result   = pg_temp.ya_rn3(last_result::text)::jsonb,
       round_summary = pg_temp.ya_rn3(round_summary::text)::jsonb
 where last_result::text ~* 'stowaway' or round_summary::text ~* 'stowaway';

-- 3. Functions: rewrite each one that still has an old word from its live definition.
do $$
declare
  f record;
  def text;
  grants text;
begin
  for f in
    select p.oid, p.proname, p.oid::regprocedure as sig, p.prosrc,
           pg_get_function_identity_arguments(p.oid) as ident
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'yaaru\_avan\_%' or p.proname like '\_ya\_%')
       and (pg_get_functiondef(p.oid) ~ '(?i)stowaway|_sw_gain')
  loop
    def := pg_temp.ya_rn3(pg_get_functiondef(f.oid));

    -- A renamed parameter cannot be changed with create or replace: drop first and
    -- put the same permissions back afterwards.
    if pg_get_function_identity_arguments(f.oid) ~ '(?i)stowaway' then
      select string_agg(format('grant execute on function public.%I(%s) to %s', f.proname,
                               pg_temp.ya_rn3(f.ident),
                               case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end), '; ')
        into grants
        from pg_proc p2, aclexplode(coalesce(p2.proacl, acldefault('f', p2.proowner))) a
        left join pg_roles r on r.oid = a.grantee
       where p2.oid = f.oid and a.privilege_type = 'EXECUTE';
      execute format('drop function %s', f.sig);
      execute def;
      if grants is not null then execute grants; end if;
    else
      execute def;
    end if;
  end loop;
end $$;

commit;
