-- ============================================================================
-- ULAA — Add cover_image_crop column to upcoming_trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: Admin → Add/Edit Trip → Media now has a Cover Image Editor
-- (src/components/ui/CoverImageCropEditor.tsx) that lets the admin drag to
-- reposition and zoom the cover image, with live previews of the Trip
-- Card, Desktop Hero, and Mobile Hero layouts. Rather than generating and
-- storing a separate cropped image per layout, only a single focal point
-- + zoom is saved as JSON — { x, y, zoom }, see CoverImageCrop in
-- src/types/types-index.ts — and every layout applies it on top of its
-- own object-fit: cover container at render time (see getCoverImageStyle
-- in src/utils/utils-index.ts). upcoming_trips has no matching column
-- yet, so this adds it.
--
-- Nullable with no default: existing trips have no saved crop, and the
-- app already treats a missing/null value as "use the plain centered
-- object-cover default" — so this needs no backfill or migration of
-- existing rows.
-- ============================================================================

alter table upcoming_trips
  add column if not exists cover_image_crop jsonb;

comment on column upcoming_trips.cover_image_crop is
  'Saved cover image position/zoom from the Cover Image Editor: {"x": number 0-100, "y": number 0-100, "zoom": number >=1}. Null means no crop saved — falls back to plain centered object-cover.';
