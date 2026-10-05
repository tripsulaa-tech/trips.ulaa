-- Turns the Trip Organiser's four fixed expense inputs into generic expense
-- lines inside the trip_finance JSONB blob (see add_trip_finance.sql). No DDL
-- change and no data migration needed: organiser_expenses is just a new
-- optional key inside the existing blob, so trips without it keep working
-- (readers treat missing as an empty list). Old values still stored in
-- organiser_travel_cost / organiser_agency_payment / organiser_misc_expense /
-- organiser_own_entry_ticket are folded into expense lines automatically when
-- the trip is read (foldLegacyCosts in src/utils/tripFinance.ts), so totals are
-- unchanged and re-saving a trip migrates it. Safe to run repeatedly.
--
-- New key:
--   organiser_expenses  array of { id, name, amount }
--     amount is the actual ₹ spent — never multiplied by traveler count.
alter table public.upcoming_trips
  add column if not exists trip_finance jsonb;

comment on column public.upcoming_trips.trip_finance is
  'Internal admin-only cost/profit record for this trip (agency payment, Child Fare add-on rates, generic cost_items lines, organiser_expenses lines). Never shown on the public site.';
