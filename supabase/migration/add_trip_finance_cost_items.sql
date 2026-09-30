-- Adds generic extra cost lines to the trip_finance JSONB blob
-- (see add_trip_finance.sql). No DDL change needed: cost_items is just a
-- new optional key inside the existing blob, so trips without it keep
-- working (readers treat missing as an empty list). This only refreshes the
-- column comment. Safe to run repeatedly.
--
-- New key:
--   cost_items  array of { id, name, basis, rate, quantity }
--     basis 'fixed'         -> amount = rate                  (Transport, Stay, Parking, Toll)
--     basis 'per_traveler'  -> amount = rate x booked count   (Food)
--     basis 'per_selected'  -> amount = rate x quantity       (Water Activities, Jatayu)
--   quantity is only used for 'per_selected' (headcount who opted in).
alter table public.upcoming_trips
  add column if not exists trip_finance jsonb;

comment on column public.upcoming_trips.trip_finance is
  'Internal admin-only cost/profit record for this trip (ad spend, per-traveler entry-ticket/kit cost, agency payment, Child Fare add-on rates, generic cost_items lines, trip organiser expenses). Never shown on the public site.';
