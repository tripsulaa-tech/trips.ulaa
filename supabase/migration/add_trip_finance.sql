-- Internal (admin-only) cost/profit tracking for a trip. Kept as a single
-- JSONB blob rather than a pile of individual columns, matching the
-- existing trip_founder/end_banner/cancellation_policy pattern on this
-- table. Never surfaced on the public site — read/written only from
-- Admin > Upcoming Trips > Add/Edit Trip > Finances & Profit tab, and the
-- read-only summary on the Trip Details view modal.
--
-- Shape (see TripFinance in src/types/types-index.ts):
--   ad_spend                    numeric | null  -- total promotion/ad spend
--   entry_ticket_cost_per_person numeric | null -- per-traveler entry ticket cost
--   kit_cost_per_person         numeric | null  -- per-traveler welcome-kit cost
--   agency_name                 text
--   agency_amount_type          'fixed' | 'per_traveler'
--   agency_amount               numeric | null
--   organiser_name              text
--   organiser_travel_cost       numeric | null
--   organiser_agency_payment    numeric | null
--   organiser_misc_expense      numeric | null
--   notes                       text
--
-- Safe to run repeatedly (IF NOT EXISTS guard). No backfill needed — existing
-- trips simply have trip_finance = null until an admin fills it in, and every
-- reader treats null the same as "no data entered yet".
alter table public.upcoming_trips
  add column if not exists trip_finance jsonb;

comment on column public.upcoming_trips.trip_finance is
  'Internal admin-only cost/profit record for this trip (ad spend, per-traveler entry-ticket/kit cost, agency payment, trip organiser expenses). Never shown on the public site.';
