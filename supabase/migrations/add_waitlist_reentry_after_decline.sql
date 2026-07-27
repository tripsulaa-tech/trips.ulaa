-- ============================================================================
-- ULAA — Allow re-joining the waitlist after a declined signup
-- Run this once in Supabase → SQL Editor, AFTER add_duplicate_submission_constraints.sql.
--
-- Bug this closes: enquiries_trip_name_phone_email_active_unique (see
-- add_duplicate_submission_constraints.sql) deliberately excludes cancelled
-- rows so someone can re-book after cancelling. The equivalent waitlist
-- index, waitlist_trip_name_phone_email_unique, was NOT given the same
-- exclusion — it covers every status, including 'declined'. That means once
-- a waitlist entry for (trip, name, phone, email) is marked 'declined'
-- (whether the person opted out or an admin marked it), that same person can
-- never rejoin the waitlist for that same trip again — the insert just hits
-- the unique violation with no obvious reason from the public form's side.
--
-- Fix: drop the blanket unique index and replace it with a partial one that
-- excludes 'declined' rows, mirroring the enquiries pattern. 'converted' and
-- 'waiting'/'notified' rows are still protected against duplicate
-- resubmission — only a declined outcome is treated as "this row no longer
-- counts toward uniqueness".
-- ============================================================================

drop index if exists public.waitlist_trip_name_phone_email_unique;

create unique index waitlist_trip_name_phone_email_active_unique
  on public.waitlist (trip_id, lower(trim(full_name)), phone, lower(trim(email)))
  where (status <> 'declined');
