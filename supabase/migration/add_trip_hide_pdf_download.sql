-- ============================================================================
-- Adds `hide_pdf_download` to upcoming_trips so Admin → Upcoming Trips can
-- hide the "Download itinerary PDF" option from a trip's public Trip Detail
-- page (hero button, header icon, and booking-panel link — all three read
-- the same flag) without touching the trip's other content.
--
-- Defaults to false (shown), so every existing trip keeps behaving exactly
-- as before with no data backfill needed. Admin's own itinerary PDF
-- download (used from the Upcoming Trips table itself) is unaffected — it
-- doesn't check this flag.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists hide_pdf_download boolean not null default false;
