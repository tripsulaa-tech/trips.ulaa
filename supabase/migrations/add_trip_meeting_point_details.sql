-- ============================================================================
-- ULAA — Structured meeting-point logistics for upcoming trips
-- Run this once in Supabase → SQL Editor.
--
-- Context: meeting_point was previously a single free-text field (e.g.
-- "Chennai International Airport — 7:00 AM on Day 1"), with no separate
-- place to note the terminal or any other logistics. This adds three
-- optional text columns — meeting_time, meeting_terminal, meeting_details —
-- shown alongside meeting_point in Admin → Trips → Meeting Point, on the
-- public trip page, and on the itinerary PDF's Meeting Point slide.
--
-- All three are optional and independent of meeting_point, which keeps its
-- existing meaning unchanged. A trip that leaves any of them blank shows a
-- plain "to be communicated"-style placeholder instead — see
-- src/utils/tripItineraryPdf.ts (renderMeetingPoint) and the Meeting Point
-- section of src/pages/TripDetailPage.tsx.
-- ============================================================================

alter table public.upcoming_trips
  add column meeting_time text,
  add column meeting_terminal text,
  add column meeting_details text;
