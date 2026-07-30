-- ============================================================================
-- ULAA — Icons for Things to Carry + section intro paragraphs for
-- Fashion Aesthetics / Places You'll Definitely Post
-- Run this once in Supabase → SQL Editor.
--
-- Context:
-- 1. Things to Carry (trip.things_to_carry) has always been a flat text[]
--    list with no per-item icon, so the public trip page
--    (src/pages/TripDetailPage.tsx) had to guess an icon per item by
--    matching keywords (see THINGS_TO_CARRY_ICON_RULES). Admin → Trips →
--    Add/Edit Trip → Inclusions & Prep now lets the admin pick an icon per
--    item directly (same icon+description shape as included_items /
--    not_included_items), so this adds a matching jsonb column,
--    things_to_carry_items, that coexists with the legacy things_to_carry
--    column the same way included_items coexists with included.
-- 2. Fashion Aesthetics (fashion_photos) and Places You'll Definitely Post
--    (gallery_items) previously had no section-level intro paragraph — only
--    per-photo captions on the gallery side. This adds fashion_description
--    and gallery_description text columns, the same way
--    add_trip_confidence_description.sql added confidence_description for
--    the "Travel with Confidence" section.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists things_to_carry_items jsonb default '[]'::jsonb,
  add column if not exists fashion_description    text,
  add column if not exists gallery_description     text;

comment on column public.upcoming_trips.things_to_carry_items is
  'Rich (icon + description) variant of things_to_carry. Preferred by the admin UI and public trip page when present; falls back to the legacy things_to_carry text[] otherwise.';
comment on column public.upcoming_trips.fashion_description is
  'Intro paragraph shown below the "Fashion Aesthetics" heading, above the fashion_photos grid.';
comment on column public.upcoming_trips.gallery_description is
  'Intro paragraph shown below the "Places You''ll Definitely Post" heading, above the gallery carousel.';
