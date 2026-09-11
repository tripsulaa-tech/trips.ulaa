-- ============================================================================
-- Adds a one-day "special offer" (festival/occasion flash sale) concept to
-- upcoming_trips, distinct from the existing early_bird mechanism:
--   - early_bird_* is a long-running "book before this deadline" discount
--   - special_offer_* is a NAMED, single-calendar-day discount tied to an
--     occasion (e.g. "Diwali Dhamaka", "Independence Day Special")
--
-- special_offer_date is a single date (not a range) — the offer is live
-- only while today's local date equals special_offer_date, then it
-- disappears automatically. See getActivePrice in utils/utils-index.ts for
-- the precedence logic (special offer wins over early-bird and regular
-- price when active).
--
-- All columns nullable and unset by default, so every existing trip keeps
-- its current pricing behaviour with no backfill needed.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists special_offer_name text,
  add column if not exists special_offer_price numeric,
  add column if not exists special_offer_date date;
