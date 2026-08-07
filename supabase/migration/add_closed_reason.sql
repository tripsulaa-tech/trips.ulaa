-- ============================================================================
-- Adds a `closed_reason` column so closing an enquiry as "not interested"
-- captures *why*, not just that it happened. Before this, every dropped
-- lead collapsed into a single undifferentiated journey_stage:
-- 'not_interested' (see add_not_interested_journey_stage.sql) — fine for a
-- badge, useless for reporting ("35 closed before booking" tells you
-- nothing about where the funnel is actually leaking).
--
-- closed_reason is only ever meaningful alongside status = 'closed'.
-- updateEnquiryStatus() in src/services/api.ts writes it whenever status is
-- set to 'closed' (defaulting to null if the admin didn't pick one — e.g.
-- a bulk close) and clears it back to null on every other status change,
-- including reopening — so it never lingers on a re-opened or since-booked
-- enquiry.
--
-- Deliberately no plain 'not_interested' value in the allowed list: the
-- closing action itself is already labelled "Not Interested" everywhere in
-- the admin UI (journey_stage, badge, button), so a same-named reason would
-- just restate that without telling you anything new — 'other' covers the
-- generic/no-specific-reason case instead.
--
-- Deliberately nullable with no default: existing closed rows have no
-- reason on record and shouldn't be guessed at.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.enquiries
  add column if not exists closed_reason text;

alter table public.enquiries
  drop constraint if exists enquiries_closed_reason_check;
alter table public.enquiries
  add constraint enquiries_closed_reason_check
  check (closed_reason is null or closed_reason = any (array[
    'no_response'::text, 'price_too_high'::text, 'date_conflict'::text,
    'destination_changed'::text, 'booked_elsewhere'::text, 'will_join_later'::text,
    'personal_reason'::text, 'other'::text
  ]));

-- Only rows actually closed can have a reason attached — a data-integrity
-- guard so closed_reason can't get set (or left dangling) on a new/contacted
-- row through some other code path.
alter table public.enquiries
  drop constraint if exists enquiries_closed_reason_requires_closed_status;
alter table public.enquiries
  add constraint enquiries_closed_reason_requires_closed_status
  check (closed_reason is null or status = 'closed');

create index if not exists enquiries_closed_reason_idx
  on public.enquiries using btree (closed_reason)
  where closed_reason is not null;
