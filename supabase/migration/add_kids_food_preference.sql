-- NOTE: the Kids feature this migration builds on was later removed — see
-- remove_kids_feature.sql. Kept here only as history of what was applied.

-- ============================================================================
-- Adds a veg/non-veg food preference to each kid's own record, same shape
-- as enquiries.food_preference (see schema.sql) but scoped per kid instead
-- of one value for the whole booking — a group of kids on one enquiry can
-- split veg/non-veg just like the adults can.
--
--   kids.food_preference - optional, admin-entered only, same "never
--     collected on the public booking form" rule age already follows (see
--     add_kids_table.sql) — the form only ever collects a kids headcount
--     and optional names, nothing per-kid beyond that. Null means not
--     asked/unknown yet, same convention as enquiries.food_preference.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.kids
  add column if not exists food_preference text;

alter table public.kids
  drop constraint if exists kids_food_preference_check;
alter table public.kids
  add constraint kids_food_preference_check
  check (food_preference is null or food_preference = any (array['veg'::text, 'non_veg'::text]));
