-- Stop the public (anon) role from reading upcoming_trips.trip_finance.
--
-- Problem: "Public read upcoming trips" is a row-level policy, so for any
-- published trip the anon role could also read every column, including
-- trip_finance (ad spend, agency payments, organiser expenses, per-traveller
-- costs) — documented as admin-only but never actually restricted. Realtime
-- (upcoming_trips is in the supabase_realtime publication) would also have
-- carried the full row to anonymous subscribers.
--
-- Fix: column-level SELECT for anon (everything except trip_finance) and a
-- column list on the realtime publication. The `authenticated` role (admin
-- login) is unchanged and still reads every column.
--
-- ORDER OF DEPLOYMENT — important:
--   1. Run STEP 1 only (the preflight). It must finish without an error.
--   2. Deploy the frontend change in src/services/api/trips.ts (public trip
--      queries now name their columns instead of select('*'), which anon can
--      no longer do after this runs).
--   3. Run STEP 2 and STEP 3.
--
-- AFTER every future `alter table upcoming_trips add column ...`:
--   * add the column to PUBLIC_UPCOMING_TRIP_COLUMNS in trips.ts if the public
--     site needs it, and
--   * re-run STEP 2 and STEP 3 of this file (they are idempotent and pick up
--     the new column automatically). Until then the public pages get a
--     "permission denied" for it — never a silent leak.
--
-- Also: Supabase -> Authentication -> Sign In / Providers -> turn OFF
-- "Allow new users to sign up". Anyone who could sign up would be
-- `authenticated` and could still read trip_finance.

-- STEP 1: preflight — every column the public site selects must exist.
do $$
declare
  required text[] := array[
    'id','title','destination','slug','start_date','end_date','duration','description',
    'itinerary','not_included','meeting_point','faqs','total_seats','seats_booked','price',
    'cover_image','gallery_images','created_at','updated_at','early_bird_price',
    'early_bird_deadline','early_bird_seats','meeting_point_map_url','terms_and_conditions',
    'trip_type','cancellation_policy','strike_through_price','advance_amount',
    'card_feature_tags','min_age','max_age','meeting_time','meeting_terminal',
    'meeting_details','highlight_cards','accommodation_description','accommodation_photos',
    'included_items','included_groups','not_included_items','gallery_items','fashion_photos',
    'trip_founder','trip_leader_id','confidence_items','confidence_description',
    'meeting_address','end_banner','things_to_carry_items','fashion_description',
    'gallery_description','cover_image_crop','status','hide_pdf_download','banner_has_text',
    'hide_special_offer_promo','sort_order','special_offer_date','special_offer_end_date',
    'special_offer_name','special_offer_price','trip_options','hero_mobile_image'
  ];
  missing text[];
begin
  select array_agg(c) into missing
  from unnest(required) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'upcoming_trips' and column_name = c
  );
  if missing is not null then
    raise exception 'upcoming_trips has no column(s) %: remove them from PUBLIC_UPCOMING_TRIP_COLUMNS in trips.ts and from this list before continuing', missing;
  end if;
end $$;

-- STEP 2: column-level read for anon (all current columns except trip_finance).
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
end $$;

-- STEP 3: keep trip_finance out of the realtime stream (needs Postgres 15+).
-- If this can't be applied you get a WARNING and the table stays in the
-- publication unchanged — in that case remove upcoming_trips from the
-- supabase_realtime publication, or ask Supabase to upgrade the database.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'upcoming_trips'
    and column_name <> 'trip_finance';

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'upcoming_trips'
  ) then
    execute 'alter publication supabase_realtime drop table public.upcoming_trips';
    execute format('alter publication supabase_realtime add table public.upcoming_trips (%s)', cols);
  end if;
exception when others then
  raise warning 'Could not set a realtime column list for upcoming_trips (%). trip_finance may still be sent to realtime subscribers.', sqlerrm;
end $$;

-- Verify (as anon this must now fail with "permission denied"):
--   GET /rest/v1/upcoming_trips?select=slug,trip_finance
