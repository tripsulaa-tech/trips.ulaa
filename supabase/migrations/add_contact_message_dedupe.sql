-- ============================================================================
-- ULAA — Dedupe general Contact Us submissions (trip_id is null)
-- Run this once in Supabase → SQL Editor, AFTER add_duplicate_submission_constraints.sql.
--
-- Context: enquiries_trip_name_phone_email_active_unique (see
-- add_duplicate_submission_constraints.sql) is keyed on (trip_id, name,
-- phone, email) — but Postgres treats NULL as distinct from NULL in a
-- unique index, so it never actually catches duplicates for the general
-- "Contact Us" form (ContactPage.tsx), which always inserts trip_id = null.
-- An accidental double-click there previously created two identical rows
-- with no error at all.
--
-- Fix: a second partial unique index scoped to trip_id is null, keyed on
-- (name, email, message) rather than (name, phone, email) — phone is
-- optional on this form, and keying on the message text instead means a
-- genuinely new message from the same person is never blocked, only a
-- literal resubmission of the exact same message.
-- ============================================================================

create unique index enquiries_contact_message_active_unique
  on public.enquiries (lower(trim(full_name)), lower(trim(email)), lower(trim(message)))
  where (trip_id is null and cancelled_at is null);
