-- ============================================================================
-- ULAA — Waitlist detail fields (age, city, emergency contact, food pref)
-- Run this once in Supabase → SQL Editor, AFTER add_waitlist_group_size.sql.
--
-- Context: "Book Your Seat" and "Join Waitlist" used to be two different
-- forms with two different field sets — the waitlist only ever asked for
-- name/phone/email/message. Now that a single form can route either to
-- enquiries or to the waitlist depending on whether the requested seats
-- actually fit, the waitlist needs to be able to store the same details
-- the booking form already collects, so nothing is lost when a submission
-- lands here instead of in enquiries.
-- ============================================================================

alter table public.waitlist
  add column age               integer,
  add column city               text,
  add column emergency_contact  text,
  add column food_preference    text;

alter table public.waitlist
  add constraint waitlist_food_preference_check
    check (food_preference is null or food_preference in ('veg', 'non_veg'));
