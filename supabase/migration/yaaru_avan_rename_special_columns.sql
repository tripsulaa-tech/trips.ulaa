-- =============================================================================
-- yaaru_avan_rename_special_columns.sql
-- =============================================================================
-- Last rename step: the three per-player flags that still carried old special-role
-- names. Run it ONCE in the Supabase SQL editor, after yaaru_avan_rename_specials.sql.
-- No app change is needed (the app never reads these columns). Safe to run again.
--
--   yaaru_avan_player_private.payback_done -> revenge_done
--                             .payback_hit  -> revenge_hit
--                             .rider_hit    -> ghost_hit
--
-- The functions that use them are rewritten from their CURRENT live definitions,
-- so later edits to them are kept. Rooms in progress keep going.
-- =============================================================================

begin;

create or replace function pg_temp.ya_rn5(t text) returns text language plpgsql immutable as $$
begin
  if t is null then return null; end if;
  t := regexp_replace(t, '\mpayback_done\M', 'revenge_done', 'g');
  t := regexp_replace(t, '\mpayback_hit\M',  'revenge_hit',  'g');
  t := regexp_replace(t, '\mrider_hit\M',    'ghost_hit',    'g');
  return t;
end $$;

-- 1. Column renames (skipped when already done).
do $$
declare r record;
begin
  for r in select * from (values
      ('payback_done', 'revenge_done'),
      ('payback_hit',  'revenge_hit'),
      ('rider_hit',    'ghost_hit')) v(old_name, new_name)
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public'
                and table_name = 'yaaru_avan_player_private' and column_name = r.old_name) then
      execute format('alter table public.yaaru_avan_player_private rename column %I to %I', r.old_name, r.new_name);
    end if;
  end loop;
end $$;

-- 2. Functions: rewrite each one that still uses an old column name.
do $$
declare f record;
begin
  for f in
    select p.oid, pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (p.proname like 'yaaru\_avan\_%' or p.proname like '\_ya\_%')
       and pg_get_functiondef(p.oid) ~ '\m(payback_done|payback_hit|rider_hit)\M'
  loop
    execute pg_temp.ya_rn5(f.src);   -- same name and arguments: create or replace keeps permissions
  end loop;
end $$;

commit;
