-- ============================================================================
-- Adds `cancellation_reason` and `cancellation_notes` columns so cancelling a
-- booking captures *why*, not just that it happened — CRM spec section 10
-- ("Cancellation ... Popup: Cancellation Reason, Third Party Charges, No
-- Show, Notes"). Before this, the Cancel Booking popup only captured
-- third_party_charges and the is_no_show flag; there was no record of
-- whether a cancellation was medical, a visa issue, price-driven, etc. —
-- fine for freeing the seat, useless for reporting on why bookings fall
-- through.
--
-- cancellation_reason is only ever meaningful alongside cancelled_at being
-- set. cancelEnquiry() in src/services/api.ts writes it (and
-- cancellation_notes) whenever a booking is cancelled, and uncancelEnquiry()
-- clears both back to null on reactivation — same pattern as closed_reason
-- on reopening (see add_closed_reason.sql).
--
-- Deliberately no 'no_show' value in the allowed list: attendance is its own
-- independent axis (is_no_show / CRM spec section 4), already captured by
-- the existing no-show checkbox in the same popup — a same-meaning reason
-- value here would just duplicate it instead of adding information.
--
-- Deliberately nullable with no default: existing cancelled rows have no
-- reason on record and shouldn't be guessed at.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.enquiries
  add column if not exists cancellation_reason text;

alter table public.enquiries
  add column if not exists cancellation_notes text;

alter table public.enquiries
  drop constraint if exists enquiries_cancellation_reason_check;
alter table public.enquiries
  add constraint enquiries_cancellation_reason_check
  check (cancellation_reason is null or cancellation_reason = any (array[
    'medical'::text, 'personal'::text, 'emergency'::text,
    'visa'::text, 'price'::text, 'other'::text
  ]));

-- Only a cancelled booking can carry a reason/notes — a data-integrity
-- guard so these can't get set (or left dangling) on an active booking
-- through some other code path, mirroring
-- enquiries_closed_reason_requires_closed_status.
alter table public.enquiries
  drop constraint if exists enquiries_cancellation_reason_requires_cancelled;
alter table public.enquiries
  add constraint enquiries_cancellation_reason_requires_cancelled
  check (cancellation_reason is null or cancelled_at is not null);

alter table public.enquiries
  drop constraint if exists enquiries_cancellation_notes_requires_cancelled;
alter table public.enquiries
  add constraint enquiries_cancellation_notes_requires_cancelled
  check (cancellation_notes is null or cancelled_at is not null);

create index if not exists enquiries_cancellation_reason_idx
  on public.enquiries using btree (cancellation_reason)
  where cancellation_reason is not null;
