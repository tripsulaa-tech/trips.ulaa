-- ============================================================================
-- Adds the `trip_leaders` table — a directory of multiple trip leaders (as
-- opposed to `founder`, which is a single shared record under the
-- `site_content` table). Each row carries the same shape of details as the
-- founder (photo, name, designation, bio, social links) plus the usual
-- publish/ordering fields used by other admin-managed lists (see
-- `testimonials`, which this mirrors). Intended to later be assignable to
-- individual trips (e.g. a `trip_leader_id` on `upcoming_trips`), added in a
-- follow-up migration once that wiring lands.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

create table if not exists public.trip_leaders (
  id            uuid not null default uuid_generate_v4(),
  name          text not null,
  photo         text,
  designation   text,
  description   text not null default '',
  social_links  jsonb not null default '[]'::jsonb,
  is_published  boolean default true,
  sort_order    integer default 0,
  created_at    timestamptz default now(),
  constraint trip_leaders_pkey primary key (id)
);

alter table public.trip_leaders enable row level security;

create policy "Admin all trip leaders" on public.trip_leaders
  for all using (auth.role() = 'authenticated');
create policy "Public read trip leaders" on public.trip_leaders
  for select using (is_published = true);
