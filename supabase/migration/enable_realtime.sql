-- ============================================================================
-- Enable Realtime on completed_trips + upcoming_trips
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`). It's
-- what makes the live-updating like counts (AlbumPage) and live
-- publish/draft + coming-soon status (CompletedTripsPage, UpcomingTripsPage,
-- TripDetailPage) actually receive events client-side — the frontend
-- subscriptions in src/services/realtime.ts do nothing until this has run.
--
-- Safe to re-run: the ADD TABLE calls are wrapped so they no-op instead of
-- erroring if the table is already in the publication.
-- ============================================================================

-- REPLICA IDENTITY FULL so UPDATE/DELETE change payloads carry the full old
-- row (not just primary key columns) — needed for DELETE events to pass the
-- "Public read ... using (is_published = true)" RLS check (which is
-- evaluated against the OLD row for deletes), and generally so the client
-- can diff old vs. new when deciding whether to react to a change.
alter table public.completed_trips replica identity full;
alter table public.upcoming_trips replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.completed_trips;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.upcoming_trips;
exception
  when duplicate_object then null;
end $$;
