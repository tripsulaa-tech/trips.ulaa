-- ============================================================================
-- Adds `hide_special_offer_promo` to upcoming_trips so Admin → Upcoming Trips
-- can stop the special-offer *promotion* for a trip — the homepage
-- SpecialOfferPopup and the TripCard's gradient border/badge — with one
-- click, without touching the underlying special_offer_price/date fields.
--
-- Purely a display flag: getActivePrice() still honours
-- special_offer_price/date/end_date for the actual charged price, so
-- flipping this on only silences the promo chrome, it doesn't change what
-- the trip costs or revert it to early-bird/regular pricing.
--
-- Defaults to false (promo shown as before), so every existing trip keeps
-- behaving exactly as before with no data backfill needed.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists hide_special_offer_promo boolean not null default false;
