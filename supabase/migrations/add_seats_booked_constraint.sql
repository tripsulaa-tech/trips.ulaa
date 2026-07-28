-- Migration: Non-negative constraint on upcoming_trips.seats_booked
-- -------------------------------------------------------------------
-- Prevents recompute_trip_seats() from accidentally storing a negative
-- value if a cancellation or refund triggers the trigger in an unexpected
-- order. The recompute always computes count(*) so this should never fire
-- in practice, but the constraint acts as a final safety net.

alter table public.upcoming_trips
  add constraint upcoming_trips_seats_booked_nonneg
  check (seats_booked >= 0);
