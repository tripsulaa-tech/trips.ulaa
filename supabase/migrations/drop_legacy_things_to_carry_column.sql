-- ============================================================================
-- ULAA — Drop legacy upcoming_trips.things_to_carry column
-- Run this once in Supabase → SQL Editor.
--
-- Context:
-- things_to_carry (flat text[]) was superseded by things_to_carry_items
-- (icon + description, jsonb) back in add_things_to_carry_icons_and_
-- section_descriptions.sql. The Add/Edit Trip form has had no field for it
-- since, and the admin save handler was only write-syncing it "in case
-- something else still reads it directly" — nothing in the app or any DB
-- function/trigger ever reads it back. Safe to drop.
-- ============================================================================

alter table public.upcoming_trips
  drop column if exists things_to_carry;
