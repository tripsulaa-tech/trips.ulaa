-- ============================================================================
-- Trip Finance snapshots — keeps a trip's money data after it has completed.
--
-- Why: Finances & Profit (cost lines, agency / organiser costs) and the
-- Pricing setup (prices, early-bird, special offer, packages & options) live
-- on upcoming_trips. Once a trip is over and its upcoming row is deleted
-- (deleteUpcomingTripCascade also soft-deletes the trip's enquiries), all of
-- it is gone — including the revenue, which is derived from those enquiries.
--
-- This table keeps a frozen copy per trip so the Admin > Trips > Trip Finance
-- tab can show every trip, upcoming and completed.
--
-- Why a separate table (and not columns on completed_trips): completed_trips
-- has a "Public read completed trips" policy, and RLS is row-level — any
-- column added there would be readable by anyone for published albums. This
-- table is admin-only (authenticated) with no public policy at all.
--
-- trip_id is intentionally NOT a foreign key (same reasoning as
-- enquiries.trip_id): the upcoming_trips row is deleted later, but the
-- snapshot must survive it.
--
-- Safe to re-run. Run once in Supabase -> SQL Editor.
-- ============================================================================

create table if not exists public.trip_finance_snapshots (
  trip_id        uuid primary key,
  title          text not null,
  destination    text,
  trip_date      date,
  total_seats    integer,
  trip_finance   jsonb,   -- copy of upcoming_trips.trip_finance
  trip_pricing   jsonb,   -- price, early-bird, strikeout, advance, special offer, trip_options
  trip_revenue   jsonb,   -- { bookedCount, totalRevenue, childFareCount, optionCounts }
  captured_at    timestamptz not null default now()
);

alter table public.trip_finance_snapshots enable row level security;

drop policy if exists "Admin all trip finance snapshots" on public.trip_finance_snapshots;
create policy "Admin all trip finance snapshots" on public.trip_finance_snapshots
  for all using (auth.role() = 'authenticated');

-- Revenue as the app computes it (useTripFinanceData / AdminReports): booked =
-- not cancelled and amount_paid > 0; revenue = sum of total_amount; option
-- counts = how many booked travelers picked each option (once per booking).
create or replace function public.trip_revenue_snapshot(p_trip_id uuid)
returns jsonb
language sql
stable
as $function$
  select jsonb_build_object(
    'bookedCount',    count(*),
    'totalRevenue',   coalesce(sum(e.total_amount), 0),
    'childFareCount', count(*) filter (where coalesce(e.has_child_addon, false)),
    'optionCounts',   coalesce((
      select jsonb_object_agg(o.opt, o.cnt)
      from (
        select opt, count(*) as cnt
        from (
          select distinct b.id as booking_id, unnest(b.selected_option_ids) as opt
          from public.enquiries b
          where b.trip_id = p_trip_id
            and b.deleted_at is null
            and b.cancelled_at is null
            and b.amount_paid > 0
        ) d
        group by opt
      ) o
    ), '{}'::jsonb)
  )
  from public.enquiries e
  where e.trip_id = p_trip_id
    and e.deleted_at is null
    and e.cancelled_at is null
    and e.amount_paid > 0;
$function$;

-- Copies the current finance + pricing + revenue of an upcoming trip into its
-- snapshot row. Called (a) when a trip starts (sync_started_trip_albums), (b)
-- from the Trip Finance tab while the upcoming row still exists, and (c)
-- right before an upcoming trip is deleted. No-op if the trip row is gone, so
-- an old snapshot is never overwritten with nothing.
create or replace function public.freeze_trip_finance(p_trip_id uuid)
returns void
language plpgsql
as $function$
begin
  insert into public.trip_finance_snapshots (
    trip_id, title, destination, trip_date, total_seats,
    trip_finance, trip_pricing, trip_revenue, captured_at
  )
  select
    ut.id, ut.title, ut.destination, ut.start_date, ut.total_seats,
    ut.trip_finance,
    jsonb_build_object(
      'price', ut.price,
      'early_bird_price', ut.early_bird_price,
      'early_bird_deadline', ut.early_bird_deadline,
      'strike_through_price', ut.strike_through_price,
      'advance_amount', ut.advance_amount,
      'special_offer_name', ut.special_offer_name,
      'special_offer_price', ut.special_offer_price,
      'special_offer_date', ut.special_offer_date,
      'special_offer_end_date', ut.special_offer_end_date,
      'trip_options', ut.trip_options
    ),
    public.trip_revenue_snapshot(ut.id),
    now()
  from public.upcoming_trips ut
  where ut.id = p_trip_id
  on conflict (trip_id) do update set
    title = excluded.title,
    destination = excluded.destination,
    trip_date = excluded.trip_date,
    total_seats = excluded.total_seats,
    trip_finance = excluded.trip_finance,
    trip_pricing = excluded.trip_pricing,
    trip_revenue = excluded.trip_revenue,
    captured_at = excluded.captured_at;
end;
$function$;

grant execute on function public.trip_revenue_snapshot(uuid) to authenticated;
grant execute on function public.freeze_trip_finance(uuid) to authenticated;

-- Carry finance over automatically when a trip starts. Same function as
-- before, with one extra step at the end.
create or replace function public.sync_started_trip_albums()
returns void
language plpgsql
as $function$
declare
  started record;
begin
  insert into public.completed_trips (
    id, title, destination, slug, trip_date, description,
    cover_image, gallery_images, is_published, trip_type,
    original_itinerary, original_highlight_cards, original_included_items, original_not_included,
    participants
  )
  select
    ut.id, ut.title, ut.destination, ut.slug, ut.start_date, ut.description,
    ut.cover_image, ut.gallery_images, false, ut.trip_type,
    ut.itinerary, ut.highlight_cards, ut.included_items, ut.not_included,
    ut.seats_booked
  from public.upcoming_trips ut
  where ut.start_date <= current_date
    and not exists (
      select 1 from public.completed_trips ct where ct.id = ut.id
    );

  update public.upcoming_trips
     set status = 'draft'
   where start_date <= current_date
     and status <> 'draft';

  -- NEW: freeze finance for every trip that has started and has no snapshot yet.
  for started in
    select ut.id from public.upcoming_trips ut
    where ut.start_date <= current_date
      and not exists (select 1 from public.trip_finance_snapshots s where s.trip_id = ut.id)
  loop
    perform public.freeze_trip_finance(started.id);
  end loop;
end;
$function$;

-- Backfill: every trip that still has an upcoming_trips row (including ones
-- that already started) gets a snapshot now. Trips whose upcoming row was
-- already deleted can't be recovered — they simply won't have finance data.
select public.freeze_trip_finance(id) from public.upcoming_trips;
