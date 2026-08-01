-- ============================================================================
-- ULAA — Advance/reservation amount for upcoming trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: the public Trip Details page used to show a plain "Seats
-- available" badge in the booking panel. That's being replaced with a
-- "Reserve today with only ₹X — Remaining ₹Y payable before the trip"
-- panel, where ₹X is this new advance_amount and ₹Y is derived on the
-- frontend as (active price − advance_amount).
--
-- advance_amount is optional — admins set it once per trip in
-- Admin → Trips → Add/Edit Trip → Pricing & Availability. If left blank,
-- the public page falls back to the old seats-availability badge (see
-- TripDetailPage.tsx).
-- ============================================================================

alter table public.upcoming_trips
  add column advance_amount numeric(10, 2);

alter table public.upcoming_trips
  add constraint upcoming_trips_advance_amount_check
    check (advance_amount is null or advance_amount >= 0);
