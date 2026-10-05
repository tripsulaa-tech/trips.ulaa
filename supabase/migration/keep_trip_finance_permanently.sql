-- ============================================================================
-- Keep a trip's Finances & Profit, Pricing and availability FOREVER once the
-- trip has started — whoever or whatever deletes the upcoming trip.
--
-- Why: the saved copy (trip_finance_snapshots) used to be taken only when
-- an admin page happened to run, and the app swallowed any failure while
-- doing it. A trip deleted before that ran lost its finance for good.
--
-- What this adds:
--   1. seats_booked on the saved copy (availability = total_seats + seats_booked).
--   2. A BEFORE DELETE trigger on upcoming_trips that always saves the copy
--      first. It runs for every delete (app, SQL editor, anything). If saving
--      fails, the delete fails, so nothing is lost silently.
--   3. freeze_trip_finance() can no longer overwrite good data with nothing:
--      - an existing revenue with bookings is kept when the new one has none
--        (enquiries are soft-deleted just before the trip row goes);
--      - saved finance is kept if the trip row has none.
--   4. Trips that never started, have no finance entered and have no paid
--      booking are NOT saved (cancelled drafts don't clutter Trip Finance).
--
-- Safe to re-run. Run once in Supabase -> SQL Editor.
-- ============================================================================

alter table public.trip_finance_snapshots
  add column if not exists seats_booked integer;

create or replace function public.freeze_trip_finance(p_trip_id uuid)
returns void
language plpgsql
as $function$
begin
  insert into public.trip_finance_snapshots (
    trip_id, title, destination, trip_date, total_seats, seats_booked,
    trip_finance, trip_pricing, trip_revenue, captured_at
  )
  select
    ut.id, ut.title, ut.destination, ut.start_date, ut.total_seats, ut.seats_booked,
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
    and (
      ut.start_date <= current_date
      or ut.trip_finance is not null
      or exists (
        select 1 from public.enquiries b
        where b.trip_id = ut.id
          and b.deleted_at is null and b.cancelled_at is null and b.amount_paid > 0
      )
    )
  on conflict (trip_id) do update set
    title        = excluded.title,
    destination  = excluded.destination,
    trip_date    = excluded.trip_date,
    total_seats  = coalesce(excluded.total_seats, public.trip_finance_snapshots.total_seats),
    seats_booked = coalesce(excluded.seats_booked, public.trip_finance_snapshots.seats_booked),
    trip_finance = coalesce(excluded.trip_finance, public.trip_finance_snapshots.trip_finance),
    trip_pricing = excluded.trip_pricing,
    trip_revenue = case
      when coalesce((excluded.trip_revenue->>'bookedCount')::int, 0) = 0
       and coalesce((public.trip_finance_snapshots.trip_revenue->>'bookedCount')::int, 0) > 0
        then public.trip_finance_snapshots.trip_revenue
      else excluded.trip_revenue
    end,
    captured_at  = excluded.captured_at;
end;
$function$;

create or replace function public.keep_trip_finance_before_delete()
returns trigger
language plpgsql
as $function$
begin
  perform public.freeze_trip_finance(old.id);
  return old;
end;
$function$;

drop trigger if exists keep_trip_finance_before_delete on public.upcoming_trips;
create trigger keep_trip_finance_before_delete
  before delete on public.upcoming_trips
  for each row execute function public.keep_trip_finance_before_delete();

-- Check: the trigger is in place.
select tgname from pg_trigger
where tgrelid = 'public.upcoming_trips'::regclass and tgname = 'keep_trip_finance_before_delete';
