-- Yaaru Avan? -- rename the database objects from stowaway_* / _sw_* to yaaru_avan_* / _ya_*.
--
-- WHAT THIS CHANGES
--   * the 9 stowaway_* tables                 -> yaaru_avan_*
--   * the stowaway_* functions (RPCs)         -> yaaru_avan_*
--   * the _sw_* helper functions              -> _ya_*
--   * triggers, indexes, constraints and the RLS policy on the signal table
--   * every function body is rewritten to call the new names
--
-- WHAT THIS DOES NOT CHANGE (on purpose)
--   * Data: rows, grants, RLS, realtime publication and ownership all stay (renames keep them).
--   * Role values stored in rows ('explorer' / 'stowaway' / 'lost') and the JSON keys the app reads
--     (stowaways, lost, stowaway_word, explorers ...). They are internal ids, never shown to players.
--   * The game-content key 'stowaway' (admin word pairs / dares) and the /play/stowaway/:code links.
--
-- HOW TO RUN
--   1. Run this whole file ONCE in the Supabase SQL editor.
--   2. Deploy the matching app build right away: the old app calls the old names, which stop existing.
--   Re-running is harmless: once nothing is called stowaway_* / _sw_* it does nothing.
--   It runs in one transaction: if anything fails, nothing is changed.

begin;

do $$
declare
  r      record;
  m      record;
  def    text;
  nm     text;
begin
  -- Old name -> new name, for every table and function that has to move.
  create temp table _ya_map (old_name text primary key, new_name text not null, kind text not null) on commit drop;

  insert into _ya_map
  select tablename, 'yaaru_avan_' || substr(tablename, length('stowaway_') + 1), 'table'
    from pg_tables
   where schemaname = 'public' and tablename like 'stowaway\_%';

  insert into _ya_map
  select distinct p.proname,
         case when p.proname like 'stowaway\_%' then 'yaaru_avan_' || substr(p.proname, length('stowaway_') + 1)
              else '_ya_' || substr(p.proname, length('_sw_') + 1) end,
         'function'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'stowaway\_%' or p.proname like '\_sw\_%');

  -- Never overwrite something that already exists under the new name.
  for m in select * from _ya_map loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = m.new_name)
       or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = m.new_name) then
      raise exception 'Cannot rename %: % already exists', m.old_name, m.new_name;
    end if;
  end loop;

  -- 1. Tables.
  for m in select * from _ya_map where kind = 'table' loop
    execute format('alter table public.%I rename to %I', m.old_name, m.new_name);
  end loop;

  -- 2. Functions (renaming keeps grants, owner, security-definer and search_path).
  for r in
    select p.oid::regprocedure as sig, p.proname, mp.new_name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      join _ya_map mp on mp.old_name = p.proname and mp.kind = 'function'
     where n.nspname = 'public'
  loop
    execute format('alter function %s rename to %I', r.sig, r.new_name);
  end loop;

  -- 3. Rewrite every renamed function's body so it calls the new names.
  --    Whole identifiers only (\m ... \M), so columns such as stowaway_word are left alone.
  for r in
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'yaaru\_avan\_%' or p.proname like '\_ya\_%')
  loop
    def := pg_get_functiondef(r.oid);
    for m in select * from _ya_map order by length(old_name) desc loop
      def := regexp_replace(def, '\m' || m.old_name || '\M', m.new_name, 'g');
    end loop;
    execute def;   -- CREATE OR REPLACE keeps the existing grants
  end loop;

  -- 4. Triggers, indexes, constraints (foreign keys, checks), and the RLS policy.
  for r in
    select t.tgname, c.relname
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where not t.tgisinternal and n.nspname = 'public' and t.tgname like 'stowaway\_%'
  loop
    execute format('alter trigger %I on public.%I rename to %I', r.tgname, r.relname,
                   'yaaru_avan_' || substr(r.tgname, length('stowaway_') + 1));
  end loop;

  for r in
    select indexname from pg_indexes where schemaname = 'public' and indexname like 'stowaway\_%'
  loop
    execute format('alter index public.%I rename to %I', r.indexname,
                   'yaaru_avan_' || substr(r.indexname, length('stowaway_') + 1));
  end loop;

  for r in
    select con.conname, c.relname
      from pg_constraint con join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and con.conname like 'stowaway\_%'
  loop
    execute format('alter table public.%I rename constraint %I to %I', r.relname, r.conname,
                   'yaaru_avan_' || substr(r.conname, length('stowaway_') + 1));
  end loop;

  for r in
    select pol.polname, c.relname
      from pg_policy pol join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and pol.polname like '%stowaway%'
  loop
    execute format('alter policy %I on public.%I rename to %I', r.polname, r.relname,
                   replace(r.polname, 'stowaway', 'yaaru avan'));
  end loop;

  -- 5. Anything outside this game still pointing at the old names (cron jobs, other functions)?
  --    Tell the person running this so they can fix it by hand.
  for r in
    select 'function ' || p.proname as what
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname not like 'yaaru\_avan\_%' and p.proname not like '\_ya\_%'
       and p.prosrc ~ '\m(stowaway_|_sw_)[a-z_]+'
  loop
    raise notice 'CHECK BY HAND: % still mentions an old stowaway_/_sw_ name', r.what;
  end loop;
  if to_regclass('cron.job') is not null then
    for r in execute 'select jobname, command from cron.job where command ~ ''(stowaway_|_sw_)''' loop
      raise notice 'CHECK BY HAND: cron job % still calls an old name: %', r.jobname, r.command;
    end loop;
  end if;
end $$;

commit;
