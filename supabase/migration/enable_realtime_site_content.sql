-- ============================================================================
-- Enable Realtime on site_content
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`). It's
-- what makes admin edits to site_content (About page copy, the Statistics
-- labels added in AdminAbout.tsx, Why ULAA, Founder, Testimonials section,
-- Bottom Nav, etc.) push live to anyone already on the matching public page
-- — the frontend subscriptions added in src/pages/AboutPage.tsx and
-- src/pages/CompletedTripsPage.tsx do nothing until this has run.
--
-- Safe to re-run: the ADD TABLE call is wrapped so it no-ops instead of
-- erroring if the table is already in the publication.
-- ============================================================================

-- REPLICA IDENTITY FULL so UPDATE payloads carry the full new row (site_content
-- rows are keyed by `key`, not an id column, so the client needs the whole
-- row — including `key` — to know which content this change is for).
alter table public.site_content replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.site_content;
exception
  when duplicate_object then null;
end $$;
