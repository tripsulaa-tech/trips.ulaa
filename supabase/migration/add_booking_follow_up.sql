-- ============================================================================
-- Adds a Booking Follow-up reminder — CRM spec section 8B. Deliberately a
-- separate system from the existing Lead Follow-up (follow_up_at/time, see
-- add_enquiry_follow_up.sql): Lead Follow-up only ever applies before a
-- booking exists ("checking with family, call back Aug 15"); Booking
-- Follow-up only ever applies after one has started ("balance payment due",
-- "send passport reminder"). The two must never overlap on the same row —
-- enforced below the same way add_enquiry_follow_up.sql enforces its own
-- window, with a check constraint rather than trusting the UI alone.
--
-- Unlike Lead Follow-up (a bare date), Booking Follow-up also carries a
-- `booking_follow_up_type` (what the reminder is actually about) and free
-- text notes, since "balance payment reminder" and "passport reminder" need
-- different admin action once due — a bare date doesn't say which.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.enquiries
  add column if not exists booking_follow_up_at date;

alter table public.enquiries
  add column if not exists booking_follow_up_time text;

alter table public.enquiries
  add column if not exists booking_follow_up_type text;

alter table public.enquiries
  add column if not exists booking_follow_up_notes text;

alter table public.enquiries
  drop constraint if exists enquiries_booking_follow_up_type_check;
alter table public.enquiries
  add constraint enquiries_booking_follow_up_type_check
  check (booking_follow_up_type is null or booking_follow_up_type = any (array[
    'balance_payment'::text, 'document'::text, 'passport'::text,
    'medical_declaration'::text, 'final_itinerary'::text, 'other'::text
  ]));

-- A time only ever means something alongside a date — same pattern as
-- enquiries_follow_up_time_requires_date in add_contact_outcome.sql.
alter table public.enquiries
  drop constraint if exists enquiries_booking_follow_up_time_requires_date;
alter table public.enquiries
  add constraint enquiries_booking_follow_up_time_requires_date
  check (booking_follow_up_time is null or booking_follow_up_at is not null);

-- A type only ever means something alongside a date, same reasoning.
alter table public.enquiries
  drop constraint if exists enquiries_booking_follow_up_type_requires_date;
alter table public.enquiries
  add constraint enquiries_booking_follow_up_type_requires_date
  check (booking_follow_up_type is null or booking_follow_up_at is not null);

-- Booking Follow-up is only meaningful once a booking has started (past
-- Advance Pending, spec section 8B) and hasn't ended yet (cancelled/
-- completed/not_interested/pre-booking). Mirrors canSetBookingFollowUp() in
-- src/admin/enquiryShared.tsx and the clearing logic added to
-- refreshJourneyStage() in src/services/api.ts, which nulls all four
-- columns the moment a row leaves this window — same belt-and-suspenders
-- pattern as the Lead Follow-up constraint.
alter table public.enquiries
  drop constraint if exists enquiries_booking_follow_up_requires_active_booking;
alter table public.enquiries
  add constraint enquiries_booking_follow_up_requires_active_booking
  check (
    booking_follow_up_at is null
    or (
      booking_state = 'active'
      and journey_stage = any (array[
        'advance_pending'::text, 'advance_paid'::text, 'confirmed'::text,
        'balance_pending'::text, 'fully_paid'::text, 'checked_in'::text
      ])
    )
  );

-- Only rows with a reminder actually set need to be found quickly (for a
-- future "booking follow-ups due" filter) — a partial index, same pattern
-- as enquiries_follow_up_at_idx.
create index if not exists enquiries_booking_follow_up_at_idx
  on public.enquiries using btree (booking_follow_up_at)
  where booking_follow_up_at is not null;
