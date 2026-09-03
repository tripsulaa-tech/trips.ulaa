-- NOTE: the Kids feature (and this table) was later removed — see
-- remove_kids_feature.sql. Kept here only as history of what was applied.
-- ============================================================================
-- Enable Realtime on kids
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`). It's
-- what makes kid rows push live to the admin panel the instant they
-- change — including kids_price_sync_on_trip_update
-- (add_kid_price_sync_on_trip_update.sql) bulk-updating every unpaid
-- kid's fee the moment an admin edits a trip's Child Fee — without
-- anyone needing to refresh the Enquiries list or an enquiry's own Kids
-- card to see it. The frontend subscriptions added in
-- src/admin/enquiries/AdminEnquiries.tsx and
-- src/admin/enquiries/useKidsForEnquiry.ts do nothing until this has run.
--
-- RLS note: kids' own "Admin read kids" policy (add_kids_table.sql) only
-- allows `auth.role() = 'authenticated'`, same as everywhere else in the
-- admin panel — an anonymous visitor was never able to read this table
-- and Realtime enforces that same policy per change, so this doesn't
-- expose anything the REST API didn't already gate.
--
-- Safe to re-run: the ADD TABLE call is wrapped so it no-ops instead of
-- erroring if the table is already in the publication.
-- ============================================================================

-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry the full old row
-- (not just the primary key) — needed for the client to know which
-- enquiry_id a change belongs to without a second round trip.
alter table public.kids replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.kids;
exception
  when duplicate_object then null;
end $$;
