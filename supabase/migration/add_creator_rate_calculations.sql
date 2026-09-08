-- ============================================================================
-- Adds the `creator_rate_calculations` table — persists every run of the
-- Creator Rate Calculator (Admin → Rate Calculator) instead of it being a
-- throwaway what-if. Stores both the raw inputs (follower count, the 10
-- reel view counts, niche) and every derived output (average views, view/
-- follower ratio, niche CPV benchmark, quality multiplier, base rate, min/
-- max reel rate, and the 5-row Final Commercials table) so a past
-- calculation is fully reproducible/auditable without re-deriving it, and
-- so the admin can look a creator's rate history up again later (e.g. by
-- name or handle) instead of recalculating from scratch each time they
-- negotiate a new deal with the same creator.
--
-- Mirrors trip_leaders.sql's shape for a straightforward admin-managed
-- table: uuid pk, created_at, RLS restricted to authenticated admins only
-- (no public policy — this is an internal negotiation tool, never
-- customer-facing).
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

create table if not exists public.creator_rate_calculations (
  id                     uuid not null default uuid_generate_v4(),

  -- Optional identifying info for the creator this calculation was run
  -- for — nullable since the tool is still useful for a quick anonymous
  -- what-if before a creator is identified/confirmed.
  creator_name           text,
  instagram_handle       text,
  phone                  text,

  -- Raw inputs, exactly as entered (Rate Calculator!B5:B16 in the
  -- original spreadsheet).
  follower_count         integer not null,
  reel_views             integer[] not null,
  niche                  text not null,

  -- Derived outputs (Rate Calculator!H5:H11), stored alongside the inputs
  -- rather than recomputed on read — if NICHE_CPV_BENCHMARKS or the
  -- quality-multiplier tiers are ever tuned later, past calculations stay
  -- exactly as they were quoted to the creator at the time.
  avg_views              numeric not null,
  view_follower_ratio    numeric not null,
  niche_cpv              numeric not null,
  quality_multiplier     numeric not null,
  base_rate              numeric not null,
  min_reel_rate          numeric not null,
  max_reel_rate          numeric not null,

  -- Final Commercials table (Rate Calculator!A22:D26) as
  -- [{ asset, min, max, pricing_logic }, ...], same shape the admin UI
  -- renders — avoids five separate min/max columns for five fixed asset
  -- rows that never vary in identity, only in value.
  final_commercials      jsonb not null default '[]'::jsonb,

  notes                  text,
  created_at             timestamptz default now(),

  constraint creator_rate_calculations_pkey primary key (id)
);

create index if not exists creator_rate_calculations_created_at_idx
  on public.creator_rate_calculations (created_at desc);

-- Case-insensitive lookup by creator name/handle when following up on a
-- past calculation for a returning creator.
create index if not exists creator_rate_calculations_creator_name_idx
  on public.creator_rate_calculations (lower(creator_name));
create index if not exists creator_rate_calculations_instagram_handle_idx
  on public.creator_rate_calculations (lower(instagram_handle));

alter table public.creator_rate_calculations enable row level security;

create policy "Admin all creator rate calculations" on public.creator_rate_calculations
  for all using (auth.role() = 'authenticated');
