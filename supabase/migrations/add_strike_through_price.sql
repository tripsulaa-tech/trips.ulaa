-- ============================================================================
-- ULAA — Independent "strikeout" price for upcoming trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: previously, the only strikeout price a trip could ever show was
-- the regular price itself, and only automatically, only while the
-- early-bird price was active (see getActivePrice/getStrikeThroughPrice in
-- src/utils/index.ts). There was no way to show a "was ₹X" price alongside
-- the regular price outside of an early-bird window, and no way to show a
-- strikeout price other than the regular price during early-bird.
--
-- strike_through_price is a separate, optional marketing price (an MRP /
-- "compare at" price) that the admin sets once and that then shows crossed
-- out next to whichever price is currently active — regular or
-- early-bird — instead of the old behavior of only ever crossing out the
-- regular price, and only during early-bird. If left blank, trips keep
-- exactly the old behavior (see the frontend helper for the fallback
-- logic).
-- ============================================================================

alter table public.upcoming_trips
  add column strike_through_price numeric(10, 2);

alter table public.upcoming_trips
  add constraint upcoming_trips_strike_through_price_check
    check (strike_through_price is null or strike_through_price >= 0);
