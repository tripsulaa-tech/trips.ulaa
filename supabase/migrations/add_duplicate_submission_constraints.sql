-- ============================================================================
-- ULAA — Duplicate-submission prevention (name + phone + email combo)
-- Run this once in Supabase → SQL Editor.
--
-- Context: enquiries currently has no duplicate protection at all, and
-- waitlist's existing unique(trip_id, email) is actually too strict for
-- real usage — looking at live data, the same phone/email is legitimately
-- reused across several different travelers (a family/group booking
-- multiple seats through one shared contact). A plain "unique per
-- email/phone" rule would block that.
--
-- Fix: key uniqueness off (trip_id, full_name, phone, email) together.
-- That still stops a literal accidental double-submit (same person,
-- same details, same trip) while leaving group bookings under one shared
-- contact untouched, since the names differ.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- enquiries: new constraint (didn't have one before)
-- Partial (excludes cancelled rows) so someone whose booking was cancelled
-- can re-enquire/re-book for the same trip without being blocked by their
-- own old cancelled record.
-- ----------------------------------------------------------------------------
create unique index enquiries_trip_name_phone_email_active_unique
  on public.enquiries (trip_id, lower(trim(full_name)), phone, lower(trim(email)))
  where (cancelled_at is null);

-- ----------------------------------------------------------------------------
-- waitlist: loosen the existing (trip_id, email) constraint to the same
-- 3-field combo, for the same reason.
-- ----------------------------------------------------------------------------
alter table public.waitlist drop constraint waitlist_trip_email_unique;

create unique index waitlist_trip_name_phone_email_unique
  on public.waitlist (trip_id, lower(trim(full_name)), phone, lower(trim(email)));
