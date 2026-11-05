-- Ulaa is now age-free: no minimum or maximum age on any trip.
--
-- Removes the database side of the old age restriction:
--   * the enquiries / waitlist insert triggers that rejected a booking with
--     an 'AGE_NOT_ELIGIBLE' error when the age fell outside a trip's range
--   * the enforce_trip_age_eligibility() function behind them
--   * the min_age / max_age check constraints on upcoming_trips
--   * any min_age / max_age values still stored on trips (set to null)
--
-- The min_age / max_age columns themselves are left in place on purpose, so
-- the site keeps working whichever order you deploy the code and run this
-- script in. Nothing reads them any more; drop them later if you like:
--   alter table public.upcoming_trips drop column if exists min_age, drop column if exists max_age;
--
-- Safe to run more than once.

drop trigger if exists enquiries_enforce_age_eligibility on public.enquiries;
drop trigger if exists waitlist_enforce_age_eligibility on public.waitlist;

drop function if exists public.enforce_trip_age_eligibility();

alter table public.upcoming_trips drop constraint if exists upcoming_trips_age_range_check;
alter table public.upcoming_trips drop constraint if exists upcoming_trips_min_age_check;
alter table public.upcoming_trips drop constraint if exists upcoming_trips_max_age_check;

update public.upcoming_trips
set min_age = null, max_age = null
where min_age is not null or max_age is not null;
