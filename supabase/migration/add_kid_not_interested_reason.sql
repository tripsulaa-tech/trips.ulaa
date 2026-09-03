-- NOTE: the Kids feature this migration builds on was later removed — see
-- remove_kids_feature.sql. Kept here only as history of what was applied.

-- ============================================================================
-- Adds a `not_interested_reason` column to `kids`, mirroring
-- `enquiries.closed_reason` (see add_closed_reason.sql) exactly — same
-- allowed values, same "only meaningful alongside the matching status"
-- guard. Before this, marking a kid Not Interested (add_kids_not_interested_
-- status.sql) captured *that* it happened but not *why*, unlike the adult
-- side's reason picker.
--
-- not_interested_reason is only ever meaningful alongside
-- kids.status = 'not_interested'. updateKidStatus() in
-- src/services/api/enquiries/kids.ts writes it whenever status is set to
-- 'not_interested' (defaulting to null if the admin didn't pick one — e.g.
-- the plain Status dropdown in AdminKidDetailModal) and clears it back to
-- null on every other status change; bulkUpdateKidsStatus() always clears
-- it too — there's no reason picker on bulk actions, matching the adult
-- side's bulk-close behaviour.
--
-- Deliberately no plain 'not_interested' value in the allowed list, for the
-- same reason add_closed_reason.sql omits one: the status itself already
-- carries that label everywhere in the UI, so a same-named reason would
-- just restate it — 'other' covers the generic/no-specific-reason case.
--
-- Deliberately nullable with no default: existing not_interested kid rows
-- have no reason on record and shouldn't be guessed at.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.kids
  add column if not exists not_interested_reason text;

alter table public.kids
  drop constraint if exists kids_not_interested_reason_check;
alter table public.kids
  add constraint kids_not_interested_reason_check
  check (not_interested_reason is null or not_interested_reason = any (array[
    'no_response'::text, 'price_too_high'::text, 'date_conflict'::text,
    'destination_changed'::text, 'booked_elsewhere'::text,
    'personal_reason'::text, 'wrong_number'::text, 'other'::text
  ]));

-- Only a kid actually in 'not_interested' status can have a reason
-- attached — same data-integrity guard enquiries_closed_reason_requires_
-- closed_status gives the adult column.
alter table public.kids
  drop constraint if exists kids_not_interested_reason_requires_status;
alter table public.kids
  add constraint kids_not_interested_reason_requires_status
  check (not_interested_reason is null or status = 'not_interested');

create index if not exists kids_not_interested_reason_idx
  on public.kids using btree (not_interested_reason)
  where not_interested_reason is not null;
