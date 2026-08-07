-- ============================================================================
-- Adds structured "Contact Outcome" tracking for the New -> Contacted call
-- an admin logs after actually speaking to a lead — see the "Record Contact
-- Outcome" popup in AdminEnquiries.tsx/AdminEnquiryDetail.tsx and
-- recordContactOutcome() in src/services/api.ts.
--
-- Deliberately reuses the existing status/closed_reason/follow_up_at
-- columns for the actual state transitions (see add_closed_reason.sql,
-- add_enquiry_follow_up.sql) rather than introducing a parallel state
-- machine — this migration only adds what those don't already cover:
--   1. What outcome was actually recorded on the call (for reporting —
--      "how many calls end in Needs Time vs No Response" isn't answerable
--      from status alone, since several outcomes all map to status =
--      'contacted').
--   2. A time-of-day alongside the existing follow_up_at date.
--   3. A 'wrong_number' closed reason — the one outcome that closes a lead
--      for a reason distinct from anything already in
--      enquiries_closed_reason_check.
--
-- Run this once in Supabase -> SQL Editor (or `supabase db execute`). Safe
-- to re-run.
-- ============================================================================

-- ---- last_contact_outcome ---------------------------------------------
-- The outcome picked in the popup. Nullable/unset for rows never taken
-- through it (older contacted/closed leads, or ones closed via the
-- standalone Not Interested action without going through this flow).
alter table public.enquiries
  add column if not exists last_contact_outcome text;

alter table public.enquiries
  drop constraint if exists enquiries_last_contact_outcome_check;
alter table public.enquiries
  add constraint enquiries_last_contact_outcome_check
  check (last_contact_outcome is null or last_contact_outcome = any (array[
    'interested'::text, 'needs_time'::text, 'call_later'::text,
    'no_response'::text, 'not_interested'::text, 'wrong_number'::text
  ]));

-- ---- last_contact_notes / last_contact_at -------------------------------
-- Free-text notes from the call, and when it was recorded. Both simply
-- overwritten by the next recorded outcome — this is "what happened on the
-- most recent call", not a full call log (see the Activity Timeline
-- section of the CRM spec for that; out of scope here).
alter table public.enquiries
  add column if not exists last_contact_notes text;

alter table public.enquiries
  add column if not exists last_contact_at timestamptz;

-- ---- follow_up_time -------------------------------------------------------
-- Companion to the existing follow_up_at date — 'HH:MM', 24-hour, no
-- timezone (matches how it's entered/displayed, same as every other
-- date-only/time-only field in this app). Bound by the same
-- only-while-Contacted rule as follow_up_at itself, and only meaningful
-- when a date is actually set alongside it.
alter table public.enquiries
  add column if not exists follow_up_time text;

alter table public.enquiries
  drop constraint if exists enquiries_follow_up_time_format_check;
alter table public.enquiries
  add constraint enquiries_follow_up_time_format_check
  check (follow_up_time is null or follow_up_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.enquiries
  drop constraint if exists enquiries_follow_up_time_requires_date;
alter table public.enquiries
  add constraint enquiries_follow_up_time_requires_date
  check (follow_up_time is null or follow_up_at is not null);

alter table public.enquiries
  drop constraint if exists enquiries_follow_up_time_requires_contacted_status;
alter table public.enquiries
  add constraint enquiries_follow_up_time_requires_contacted_status
  check (follow_up_time is null or status = 'contacted');

-- ---- wrong_number closed reason -------------------------------------------
-- Widen the existing closed_reason list (see add_closed_reason.sql) rather
-- than adding a separate column — it's still "why this lead was closed",
-- same as every other value already there.
alter table public.enquiries
  drop constraint if exists enquiries_closed_reason_check;
alter table public.enquiries
  add constraint enquiries_closed_reason_check
  check (closed_reason is null or closed_reason = any (array[
    'no_response'::text, 'price_too_high'::text, 'date_conflict'::text,
    'destination_changed'::text, 'booked_elsewhere'::text,
    'personal_reason'::text, 'wrong_number'::text, 'other'::text
  ]));
