-- ============================================================================
-- ULAA — Fix: set_enquiry_trip_type() references a nonexistent
-- "departure_date" column on upcoming_trips / completed_trips.
--
-- Bug: add_balance_due_date_derivation.sql's trigger function selects
-- `departure_date` from upcoming_trips and completed_trips, but neither
-- table has that column:
--   - upcoming_trips has start_date / end_date
--   - completed_trips has trip_date
-- `departure_date` only exists on `enquiries` (as the snapshot column this
-- trigger writes TO). Because this is a BEFORE INSERT trigger on
-- `enquiries` and every public booking form submission sets trip_id, this
-- fires — and fails with 42703 "column departure_date does not exist" —
-- on every single enquiry insert.
--
-- Run this once in Supabase → SQL Editor. It replaces the function with
-- one that selects the correct source columns, aliased as departure_date.
-- ============================================================================

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
    select trip_type, start_date
      into found_trip_type, found_departure
      from upcoming_trips
     where id = new.trip_id
    union all
    select trip_type, trip_date
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
