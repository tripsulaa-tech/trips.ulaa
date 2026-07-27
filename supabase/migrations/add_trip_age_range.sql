-- ============================================================================
-- ULAA — Age eligibility range for upcoming trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: previously there was no way for the admin to restrict who can
-- book a trip by age — the public Book Your Seat / Join Waitlist forms
-- enforced one hardcoded 18-65 rule for every trip (see validateAge in
-- src/utils/formValidation.ts). This adds a per-trip, optional age range
-- that the admin sets in Admin → Trips, which the public forms then
-- validate against instead of the hardcoded rule.
--
-- Both columns are optional (nullable). A trip with neither set keeps
-- today's behavior exactly (frontend falls back to the 18-65 default —
-- see validateAge). A trip can also set just one side (e.g. only a
-- minimum, for an "18+" trip) — the other side is left unrestricted.
-- ============================================================================

alter table public.upcoming_trips
  add column min_age integer,
  add column max_age integer;

alter table public.upcoming_trips
  add constraint upcoming_trips_min_age_check
    check (min_age is null or min_age >= 0);

alter table public.upcoming_trips
  add constraint upcoming_trips_max_age_check
    check (max_age is null or max_age >= 0);

alter table public.upcoming_trips
  add constraint upcoming_trips_age_range_check
    check (min_age is null or max_age is null or min_age <= max_age);
