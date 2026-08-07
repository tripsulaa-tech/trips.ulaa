-- ============================================================================
-- Adds a `follow_up_at` reminder date for leads that are still warm but not
-- ready to act on — e.g. "checking with family, call back Aug 15". This is
-- deliberately NOT a closed_reason: closing a lead means it's dead, and
-- someone mid-conversation isn't. It's a reminder layered on top of the
-- Contacted stage instead, so the lead stays visible in its normal place
-- (not buried in the Closed tab) with a chip the admin can act on later.
--
-- follow_up_at is only meaningful while status = 'contacted' — the same
-- window closed_reason uses status = 'closed' for (see add_closed_reason.sql)
-- — enforced below with the same pattern: a check constraint at the row
-- level, so it can't be set (or left dangling) on a new/booked/closed row
-- through some other code path. src/services/api.ts's refreshJourneyStage()
-- clears it back to null the moment a lead moves past Contacted (payment
-- recorded, closed as Not Interested, reopened, cancelled, etc.), so it
-- never lingers as a stale reminder on a row this constraint would
-- otherwise reject the next write to.
--
-- Superseded from the closed-reason list: `will_join_later` used to be the
-- closest fit for this case and doesn't belong there any more now that
-- there's a real home for it — dropped from the allowed closed_reason
-- values below. Existing rows using it are reset to null (unspecified)
-- rather than guessed at, same as any other pre-migration gap in that
-- column.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.enquiries
  add column if not exists follow_up_at date;

alter table public.enquiries
  drop constraint if exists enquiries_follow_up_requires_contacted_status;
alter table public.enquiries
  add constraint enquiries_follow_up_requires_contacted_status
  check (follow_up_at is null or status = 'contacted');

-- Only rows with a reminder actually set need to be found quickly (for the
-- "follow-ups due today" filter/sort in AdminEnquiries.tsx) — a partial
-- index keeps it small and skips every row that never had one.
create index if not exists enquiries_follow_up_at_idx
  on public.enquiries using btree (follow_up_at)
  where follow_up_at is not null;

-- ---- Retire will_join_later from closed_reason -----------------------
-- It described exactly this "still warm, checking with people" case, which
-- now has its own field above instead of being misfiled as a terminal
-- closed reason.
update public.enquiries
  set closed_reason = null
  where closed_reason = 'will_join_later';

alter table public.enquiries
  drop constraint if exists enquiries_closed_reason_check;
alter table public.enquiries
  add constraint enquiries_closed_reason_check
  check (closed_reason is null or closed_reason = any (array[
    'no_response'::text, 'price_too_high'::text, 'date_conflict'::text,
    'destination_changed'::text, 'booked_elsewhere'::text,
    'personal_reason'::text, 'other'::text
  ]));
