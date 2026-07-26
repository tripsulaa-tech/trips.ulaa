-- ============================================================================
-- ULAA — Group bookings on enquiries
-- Run this once in Supabase → SQL Editor.
--
-- Context: the public booking form only ever created one enquiry row per
-- submission. This adds a "Group" option (alongside the existing solo
-- booking) that submits N rows in one go — one per seat — all sharing the
-- same name/phone/email/etc, so the existing per-trip capacity counting,
-- payment tracking, and admin tooling all keep working per-seat without any
-- other changes.
--
-- Three new columns:
--   group_id   — same uuid on every row created together in one group
--                submission; null for ordinary solo bookings.
--   group_size — how many seats the group booking was for in total (same
--                value repeated on every row in the group); null for solo.
--   group_seq  — this row's 1-based position within the group (1, 2, 3...);
--                defaults to 1, which is also what solo bookings get.
--
-- The existing duplicate-submission unique index (trip_id, name, phone,
-- email) — see add_duplicate_submission_constraints.sql — would otherwise
-- block a group of identical entries outright, since every row in a group
-- booking has the same name/phone/email/trip by design. group_seq is added
-- to that key so each seat in the group is distinguishable, while solo
-- bookings (always group_seq = 1) keep exactly the duplicate protection
-- they had before.
-- ============================================================================

alter table public.enquiries
  add column group_id   uuid,
  add column group_size integer,
  add column group_seq  integer not null default 1;

alter table public.enquiries
  add constraint enquiries_group_size_check
    check (group_size is null or group_size >= 2),
  add constraint enquiries_group_seq_check
    check (group_seq >= 1);

create index enquiries_group_id_idx on public.enquiries using btree (group_id);

-- Replace the old duplicate-submission unique index with one that also
-- keys on group_seq, so a group of N identical-details rows can coexist.
drop index if exists public.enquiries_trip_name_phone_email_active_unique;

create unique index enquiries_trip_name_phone_email_active_unique
  on public.enquiries (trip_id, lower(trim(full_name)), phone, lower(trim(email)), group_seq)
  where (cancelled_at is null);
