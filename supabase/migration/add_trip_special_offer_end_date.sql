-- ============================================================================
-- Extends the special-offer flash sale (see add_trip_special_offer.sql) from
-- a single calendar day into an optional date RANGE, so occasions that
-- deserve more than one day (e.g. a long-weekend sale) can stay live for
-- however many days the admin sets — 3 days, a week, etc.
--
-- special_offer_date is now treated as the offer's START date.
-- special_offer_end_date is the (optional) END date, inclusive.
--
-- Backward compatible: existing trips that only ever set special_offer_date
-- keep working exactly as before — special_offer_end_date is null, and
-- getActivePrice in src/utils/utils-index.ts falls back to treating the
-- offer as a single day (start date only) whenever the end date is unset.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists special_offer_end_date date;

-- Optional sanity check: when both dates are set, the offer must run
-- forward in time (end on/after start).
alter table public.upcoming_trips
  drop constraint if exists upcoming_trips_special_offer_date_range_check;

alter table public.upcoming_trips
  add constraint upcoming_trips_special_offer_date_range_check
  check (
    special_offer_end_date is null
    or special_offer_date is null
    or special_offer_end_date >= special_offer_date
  );
