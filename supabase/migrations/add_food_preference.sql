-- ============================================================================
-- ULAA — Food preference on enquiries
-- Run this once in Supabase → SQL Editor.
--
-- Context: the public booking form now asks Veg/Non-veg (required there,
-- since we need it to plan meals). Nullable at the DB level so existing
-- rows and admin-logged enquiries (where it isn't always known up front)
-- aren't affected.
--
-- Group bookings: the form still collects one set of details per
-- submission (see add_group_bookings.sql) — food_preference is one of
-- those shared fields and is copied onto every seat row in the group,
-- same as full_name/phone/email already are.
-- ============================================================================

alter table public.enquiries
  add column food_preference text;

alter table public.enquiries
  add constraint enquiries_food_preference_check
    check (food_preference is null or food_preference in ('veg', 'non_veg'));
