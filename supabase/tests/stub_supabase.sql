-- Minimal stand-ins for what Supabase provides, so the game migrations can be
-- loaded into a plain local Postgres (NEVER into your real project).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
create table if not exists public.site_content (key text primary key, content jsonb);
create or replace function public.is_admin() returns boolean language sql as $$ select true $$;
