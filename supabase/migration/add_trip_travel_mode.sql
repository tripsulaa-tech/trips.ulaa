-- Travel mode for the countdown card's route animation (domestic trips).
--   null    -> default (Bus / Van for domestic trips, plane otherwise)
--   'train' -> train
--   'bus'   -> Bus / Van
-- RUN THIS BEFORE deploying the code that selects `travel_mode`, otherwise the
-- public trip pages fail with "column does not exist / permission denied".

alter table public.upcoming_trips add column if not exists travel_mode text;

alter table public.upcoming_trips drop constraint if exists upcoming_trips_travel_mode_check;
alter table public.upcoming_trips
  add constraint upcoming_trips_travel_mode_check
  check (travel_mode is null or travel_mode = any (array['train'::text, 'bus'::text]));

-- Same as STEP 2 / STEP 3 of restrict_trip_finance_public_read.sql: give the
-- public (anon) role read access to the new column, still excluding trip_finance.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'upcoming_trips'
    and column_name <> 'trip_finance';

  revoke select on table public.upcoming_trips from anon;
  execute format('grant select (%s) on table public.upcoming_trips to anon', cols);

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'upcoming_trips'
  ) then
    execute 'alter publication supabase_realtime drop table public.upcoming_trips';
    execute format('alter publication supabase_realtime add table public.upcoming_trips (%s)', cols);
  end if;
exception when others then
  raise warning 'Could not finish the travel_mode grant / realtime column list (%).', sqlerrm;
end $$;
