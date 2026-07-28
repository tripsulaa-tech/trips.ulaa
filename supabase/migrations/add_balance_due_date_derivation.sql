-- Migration: Auto-derive balance_due_date in set_enquiry_trip_type trigger
-- -------------------------------------------------------------------------
-- Previously the trigger only set trip_type (and departure_date via the
-- trip snapshot). Now it also computes balance_due_date so that
-- computeBookingStatus() on the frontend can correctly distinguish between
-- "booking_confirmed" (balance already settled or due date still in future)
-- and "balance_pending" (due date has passed but full balance not yet paid).
--
-- Rules (matching the cancellation policy tiers in cancellationPolicy.ts):
--   domestic     → balance due 30 days before departure
--   international → balance due 45 days before departure
--   other/null    → no balance_due_date set

create or replace function public.set_enquiry_trip_type()
returns trigger
language plpgsql
as $function$
declare
  found_trip_type    text;
  found_departure    date;
begin
  if new.trip_id is not null and new.trip_type is null then
    -- Prefer upcoming trips; fall back to completed trips (for manual
    -- admin inserts against a trip that finished mid-form).
    select trip_type, departure_date
      into found_trip_type, found_departure
      from upcoming_trips
     where id = new.trip_id
    union all
    select trip_type, departure_date
      from completed_trips
     where id = new.trip_id
    limit 1;

    new.trip_type := found_trip_type;

    -- Snapshot departure_date if the caller didn't supply one.
    if new.departure_date is null then
      new.departure_date := found_departure;
    end if;

    -- Compute balance_due_date from the snapshotted departure + trip type.
    -- Only set if not already explicitly provided by the caller and if we
    -- have enough data to compute it.
    if new.balance_due_date is null and new.departure_date is not null then
      if found_trip_type = 'domestic' then
        new.balance_due_date := (new.departure_date - interval '30 days')::date;
      elsif found_trip_type = 'international' then
        new.balance_due_date := (new.departure_date - interval '45 days')::date;
      end if;
    end if;
  end if;

  return new;
end;
$function$;
