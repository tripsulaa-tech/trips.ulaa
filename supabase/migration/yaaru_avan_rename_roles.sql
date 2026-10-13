-- =============================================================================
-- yaaru_avan_rename_roles.sql
-- =============================================================================
-- The second half of the internal rename (run after yaaru_avan_rename_internal_names.sql):
-- the stored role names now match what players see, Tourist and Pickpocket.
-- Run it ONCE in the Supabase SQL editor and deploy the matching app build in the same
-- sitting (the old app and the renamed database do not understand each other). Safe to
-- run again.
--
--   role value        explorer          -> tourist
--                     lost              -> pickpocket
--   outcomes          explorers         -> tourists
--                     lost-steal        -> pickpocket-steal
--   columns           explorer_word     -> tourist_word
--                     room_private.lost -> pickpockets
--                     lost_wins         -> pickpocket_wins
--   setting param     p_lost            -> p_pickpockets
--   result keys       counts.explorers  -> counts.tourists
--                     counts.lost       -> counts.pickpockets
--
-- Rooms in the middle of a game are converted and keep going. Every yaaru_avan_* / _ya_*
-- function is rewritten from its current definition.
-- =============================================================================

begin;

create or replace function pg_temp.ya_rn2(t text) returns text language plpgsql immutable as $$
begin
  if t is null then return null; end if;
  -- the two counts that are returned to the app under their own keys
  t := replace(t, '''lost'', fl', '''pickpockets'', fl');
  t := replace(t, '''explorers'', n - fs - fl', '''tourists'', n - fs - fl');
  -- quoted values: SQL 'strings' and JSON "strings"
  t := replace(t, '''lost-steal''', '''pickpocket-steal''');
  t := replace(t, '"lost-steal"', '"pickpocket-steal"');
  t := replace(t, '''explorers''', '''tourists''');   t := replace(t, '"explorers"', '"tourists"');
  t := replace(t, '''explorer''', '''tourist''');     t := replace(t, '"explorer"', '"tourist"');
  t := replace(t, '''lost''', '''pickpocket''');     t := replace(t, '"lost"', '"pickpocket"');
  -- names
  t := regexp_replace(t, '\yexplorer_word\y', 'tourist_word', 'g');
  t := regexp_replace(t, '\yp_lost\y', 'p_pickpockets', 'g');
  t := regexp_replace(t, '\ylost_wins\y', 'pickpocket_wins', 'g');
  t := regexp_replace(t, '(?<![A-Za-z0-9_''"-])lost(?![A-Za-z0-9_''"-])', 'pickpockets', 'g');
  t := regexp_replace(t, '\yExplorer\y', 'Tourist', 'g');
  return t;
end $$;

create or replace function pg_temp.ya_role(x text) returns text language sql immutable as $$
  select case x when 'explorer' then 'tourist' when 'lost' then 'pickpocket' else x end
$$;

-- 1. Constraint off while the stored values change.
alter table public.yaaru_avan_player_private drop constraint if exists yaaru_avan_player_private_role_check;

-- 2. Column renames (skipped when already done).
do $$
declare r record;
begin
  for r in select * from (values
      ('yaaru_avan_room_private', 'explorer_word', 'tourist_word'),
      ('yaaru_avan_room_private', 'lost',          'pickpockets'),
      ('yaaru_avan_players',      'lost_wins',     'pickpocket_wins')) v(tbl, old_name, new_name)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = r.tbl and column_name = r.old_name) then
      execute format('alter table public.%I rename column %I to %I', r.tbl, r.old_name, r.new_name);
    end if;
  end loop;
end $$;

-- 3. Stored rows.
update public.yaaru_avan_player_private set role = pg_temp.ya_role(role) where role in ('explorer', 'lost');

update public.yaaru_avan_rooms
   set last_result = pg_temp.ya_rn2(last_result::text)::jsonb,
       round_summary = pg_temp.ya_rn2(round_summary::text)::jsonb;

-- 4. Constraint back, with the new values.
alter table public.yaaru_avan_player_private add constraint yaaru_avan_player_private_role_check
  check (role = any (array['tourist', 'stranger', 'pickpocket']));

-- 5. Rewrite every function from its current definition. A function whose parameter names
--    change (set_settings) has to be dropped and re-created, so its permissions are restored.
do $$
declare
  r record; g record; def text; new_def text; ident text;
begin
  for r in
    select p.oid, p.proname, p.proacl,
           pg_get_functiondef(p.oid) as def,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and (p.proname like 'yaaru\_avan\_%' or p.proname like '\_ya\_%')
  loop
    def := r.def;
    new_def := pg_temp.ya_rn2(def);
    continue when new_def = def;
    if pg_temp.ya_rn2(r.args) <> r.args then
      ident := format('public.%I(%s)', r.proname, r.args);
      execute 'drop function ' || ident;
      execute new_def;
      ident := format('public.%I(%s)', r.proname, pg_temp.ya_rn2(r.args));
      if r.proacl is not null then
        execute 'revoke all on function ' || ident || ' from public, anon, authenticated';
        for g in select grantee from aclexplode(r.proacl) loop
          if g.grantee = 0 then execute 'grant execute on function ' || ident || ' to public';
          else execute format('grant execute on function %s to %I', ident, (select rolname from pg_roles where oid = g.grantee));
          end if;
        end loop;
      end if;
    else
      execute new_def;
    end if;
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
