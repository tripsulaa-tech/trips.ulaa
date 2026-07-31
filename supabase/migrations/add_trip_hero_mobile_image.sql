-- ============================================================================
-- ULAA — Add hero_mobile_image column to upcoming_trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: Admin → Add/Edit Trip → Media previously only had a single
-- cover_image (+ cover_image_crop focal point/zoom, see
-- add_trip_cover_image_crop.sql) reused across the Trip Card, Desktop
-- Hero, and Mobile Hero. This adds a separate, independently-uploaded
-- image just for the Mobile Hero banner on the trip detail page — the
-- same pattern already used for the About page's hero (see
-- site_content.about → hero.mobile_image in src/constants/about.ts).
--
-- Nullable with no default: existing trips have no separate mobile hero
-- image, and the app already treats a missing/empty value as "fall back
-- to the cropped cover_image on mobile" — see TripDetailPage.tsx — so
-- this needs no backfill or migration of existing rows.
-- ============================================================================

alter table upcoming_trips
  add column if not exists hero_mobile_image text;

comment on column upcoming_trips.hero_mobile_image is
  'Optional separately-uploaded image for the trip detail page''s mobile hero banner (Admin → Add/Edit Trip → Media). Null/empty falls back to the cropped cover_image on mobile.';
