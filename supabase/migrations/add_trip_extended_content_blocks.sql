-- ============================================================================
-- ULAA — Extended content-block columns for upcoming_trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: Admin → Trips → Add/Edit Trip already collects a full set of
-- "extended" content blocks — Highlight Cards, Accommodation, Included/Not
-- Included (icon variant), Gallery Items (photo+caption), Fashion Photos,
-- Trip Founder, Confidence Items, Meeting Address, and End Banner — via
-- src/admin/AdminTrips.tsx and reads/writes them through the TripForm /
-- UpcomingTrip types (see src/types/types-index.ts).
--
-- However upcoming_trips never had matching columns for any of these, so
-- createUpcomingTrip()/updateUpcomingTrip() (supabase.from('upcoming_trips')
-- .insert/.update) would fail with a "column does not exist" error as soon
-- as a trip touched the Overview & Itinerary, Accommodation, Founder, or End
-- Banner tabs — every field in this migration was being collected in the UI
-- but had no home in the database. This adds the missing columns so the
-- whole form round-trips through the DB correctly.
--
-- jsonb is used for structured list/object fields (arrays of {icon,
-- heading, description} etc.) to mirror how `itinerary`, `faqs`, and
-- `cancellation_policy` are already stored on this table. Plain text[] is
-- used for the two flat photo-URL arrays, matching `gallery_images`.
--
-- trip_founder and end_banner default to NULL, not '{}'::jsonb. The admin
-- form (src/admin/AdminTrips.tsx openEdit) reads these as
-- `trip.trip_founder || emptyFounder` / `trip.end_banner || emptyEndBanner`
-- — a truthy-but-empty '{}' would short-circuit that fallback and load a
-- trip_founder/end_banner object missing its .photo/.name/.description (or
-- .image/.heading/etc) keys, whereas NULL correctly falls through to the
-- full-shape empty default the form expects.
-- ============================================================================

alter table public.upcoming_trips
  add column highlight_cards        jsonb default '[]'::jsonb,
  add column accommodation_description text,
  add column accommodation_photos   text[] default '{}'::text[],
  add column included_items         jsonb default '[]'::jsonb,
  add column not_included_items     jsonb default '[]'::jsonb,
  add column gallery_items          jsonb default '[]'::jsonb,
  add column fashion_photos         text[] default '{}'::text[],
  add column trip_founder           jsonb,
  add column confidence_items       jsonb default '[]'::jsonb,
  add column meeting_address        text,
  add column end_banner             jsonb;
