-- ============================================================================
-- Adds the two kid-side gaps flagged against the adult booking's own
-- lifecycle (add_booking_state.sql / markEnquiryCompleted / setEnquiryNoShow
-- in src/services/api/enquiries/status.ts):
--
--   1. A post-trip 'completed' value for kids.status (add_kids_table.sql),
--      the kid-scoped equivalent of enquiries.booking_status reaching
--      'completed' — currently a kid can only ever get as far as
--      'checked_in' with nowhere further to go.
--
--   2. kids.is_no_show — the kid-scoped equivalent of enquiries.is_no_show,
--      an independent attendance flag alongside status rather than a status
--      value itself (same "Attendance is its own axis, not folded into
--      Booking Journey" reasoning as the adult side — see
--      src/types/types-index.ts's note by Enquiry.is_no_show).
--
-- Deliberately NOT mirroring markEnquiryCompleted/setEnquiryNoShow's
-- eligibility gating (Fully Paid checks, trip-departed-date checks,
-- refund-suggestion side effects) — kids.status has never had that kind of
-- gating to begin with (see add_kids_not_interested_status.sql: "an admin
-- can already freely move a kid between pending/confirmed/checked_in/
-- cancelled with no checks"), and kids carry no seat/refund consequences of
-- their own for a no-show to affect. Both stay plain, ungated labels, same
-- as every other kids.status transition and add_kids_not_interested_status's
-- 'not_interested' value.
--
-- Run this once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.kids
  drop constraint if exists kids_status_check;

alter table public.kids
  add constraint kids_status_check
  check (status = any (array['pending'::text, 'confirmed'::text, 'checked_in'::text, 'completed'::text, 'cancelled'::text, 'not_interested'::text]));

alter table public.kids
  add column if not exists is_no_show boolean not null default false;
