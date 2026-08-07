-- ============================================================================
-- Adds `offer_expiry` to `waitlist` (CRM spec section 9's "Seat Offered"
-- fields: Position, Offer Sent At, Offer Expiry, Status).
--
-- `notified_at` already covers "Offer Sent At" (see add_group_bookings.sql-
-- era schema); "Position" is deliberately NOT stored — it's just this
-- entry's rank by created_at among 'waiting' rows on the same trip, which
-- is cheap to compute in a query/selector and would only drift out of sync
-- with reality if stored (every convert/decline/expire on any earlier
-- entry would need to re-shuffle every later one's stored position).
--
-- offer_expiry is set by updateWaitlistStatus() in src/services/api.ts the
-- moment an offer goes out (status -> 'notified'), using
-- WAITLIST_OFFER_WINDOW_HOURS (48h) from the same file, and cleared if the
-- entry moves to any other status. It's advisory only: nothing in the
-- database auto-expires a row on its own (there's no cron job in this
-- project), the admin UI just surfaces "Offer expires in Xh" / "Offer
-- expired" so a human can act (convert, decline, or Mark Expired).
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.waitlist
  add column if not exists offer_expiry timestamptz;
