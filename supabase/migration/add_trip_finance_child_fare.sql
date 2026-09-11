-- Extends the trip_finance JSONB blob (see add_trip_finance.sql) with a
-- dedicated Child Fare rate — used when a "Child Fare" Add-on (the Baby
-- chip in PaymentFormFields) is added against a booking — plus the trip
-- organiser's own personal entry ticket.
--
-- No column/DDL change needed: trip_finance is already a jsonb blob, and
-- these are just new optional keys inside it (see TripFinance in
-- src/types/types-index.ts). This migration only refreshes the column
-- comment so the shape documented in the database matches the app. Safe
-- to run repeatedly. Existing trips keep working unchanged — every reader
-- treats a missing key the same as null/0, same as any other optional
-- trip_finance field.
--
-- New keys added to the trip_finance shape:
--   child_fare_amount            numeric | null  -- what the traveler is charged for a Child Fare add-on
--   child_fare_vendor_amount     numeric | null  -- what ULAA pays the on-ground agency per child
--   child_fare_entry_ticket_cost numeric | null  -- per-child entry ticket cost (can differ from the adult rate)
--   child_fare_kit_cost          numeric | null  -- per-child welcome-kit cost (can differ from the adult rate; not always 0)
--   organiser_own_entry_ticket   numeric | null  -- the trip organiser's own personal entry ticket
--
-- Single flat rate per trip for the four child_fare_* fields — the same
-- rate applies to every Child Fare add-on on a given trip, never a
-- per-child override (see PaymentFormFields's Child Fare chip, which
-- hard-locks the add-on amount to child_fare_amount once it's set here).
alter table public.upcoming_trips
  add column if not exists trip_finance jsonb;

comment on column public.upcoming_trips.trip_finance is
  'Internal admin-only cost/profit record for this trip (ad spend, per-traveler entry-ticket/kit cost, agency payment, Child Fare add-on rates, trip organiser expenses including their own entry ticket). Never shown on the public site.';
