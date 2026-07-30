-- ============================================================================
-- ULAA — Add confidence_description column to upcoming_trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: the "Travel with Confidence" section (trip.confidence_items) is
-- getting an intro paragraph below its heading, shown on the public trip
-- page (src/pages/TripDetailPage.tsx) and editable via Admin → Trips →
-- Add/Edit Trip → Overview & Itinerary (src/admin/AdminTrips.tsx), the same
-- way accommodation_description works for the "Stay. Relax. Repeat."
-- section. upcoming_trips has no matching column yet, so this adds it.
-- ============================================================================

alter table upcoming_trips
  add column if not exists confidence_description text;

comment on column upcoming_trips.confidence_description is
  'Intro paragraph shown below the "Travel with Confidence" heading, above the confidence_items list.';
