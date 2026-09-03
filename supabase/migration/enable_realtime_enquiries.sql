-- ============================================================================
-- Enable Realtime on enquiries
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`). It's
-- what makes enquiry rows push live to the admin panel — a brand-new
-- website/manual enquiry appears in an already-open Enquiries list the
-- instant it's submitted, and every status/payment mutation (Mark
-- Contacted, Track Payment, cancellations, etc.) patches that row in
-- place — without anyone needing to manually refresh the page. Same
-- pattern as enable_realtime_kids.sql. The frontend subscription added in
-- src/admin/enquiries/useEnquiryData.ts does nothing until this has run.
--
-- Note: the admin's bell/notifications badge already updates live today
-- (the `notifications` table has its own Realtime subscription in
-- NotificationsPanel.tsx) — this migration is what additionally makes the
-- Enquiries table itself reflect new/changed leads live, not just the
-- notification count.
--
-- RLS note: enquiries' "Admin read enquiries" policy only allows
-- `auth.role() = 'authenticated'`, same as everywhere else in the admin
-- panel — an anonymous visitor was never able to read this table and
-- Realtime enforces that same policy per change, so this doesn't expose
-- anything the REST API didn't already gate.
--
-- Safe to re-run: the ADD TABLE call is wrapped so it no-ops instead of
-- erroring if the table is already in the publication.
-- ============================================================================

-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry the full old row
-- (not just the primary key) — needed for the client to filter/patch by id
-- without a second round trip.
alter table public.enquiries replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.enquiries;
exception
  when duplicate_object then null;
end $$;
