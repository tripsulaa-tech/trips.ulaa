-- ============================================================================
-- Collapses the two independent lifecycle dimensions admins had to read
-- together (enquiries.status: new/contacted/closed, and
-- enquiries.booking_status: booking_confirmed/balance_pending/fully_paid/
-- cancelled/completed) into a single, ordered "Booking Journey" the admin
-- table can show as one badge + one "Advance" action instead of a free-form
-- status dropdown that let admins accidentally move a booking backwards.
--
-- New column: journey_stage, one of (in order):
--   new_enquiry     - just came in, not yet contacted
--   contacted       - admin has spoken to the traveller, no quote/payment yet
--   advance_pending - quote given (total_amount set) but nothing paid yet
--   advance_paid    - some money in, but less than the non-refundable
--                     booking_amount deposit
--   confirmed       - booking_amount deposit cleared; balance not yet due
--   balance_pending - balance owed and balance_due_date has passed
--   fully_paid      - amount_paid >= total_amount
--   checked_in      - admin marked the traveller checked in for the trip
--   completed       - trip wrapped up (existing markEnquiryCompleted call)
--   cancelled       - cancelled_at is set (overrides every other stage)
--
-- This mirrors the *existing* client-computed status/booking_status pattern
-- (see computeAutoStatus/computeBookingStatus in src/services/api.ts) rather
-- than introducing a new DB trigger: the app computes and writes
-- journey_stage on every mutating call, same as it already does for
-- status/booking_status. journey_stage supersedes booking_status for
-- display purposes; `status` and `booking_status` are both kept as-is
-- (nothing reads/writes them differently) so this migration is purely
-- additive and reversible.
--
-- Also adds checked_in_at (new concept — didn't exist before).
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run: every step guards against already having been applied.
-- ============================================================================

-- 1. Add the new columns (journey_stage nullable at first so the backfill
--    below can run before we lock it down).
alter table public.enquiries
  add column if not exists journey_stage text;
alter table public.enquiries
  add column if not exists checked_in_at timestamptz;

-- 2. Backfill journey_stage for existing rows from current columns, mirroring
--    computeJourneyStage() in src/services/api.ts.
update public.enquiries
   set journey_stage = case
     when cancelled_at is not null then 'cancelled'
     when booking_status = 'completed' then 'completed'
     when checked_in_at is not null then 'checked_in'
     when total_amount is not null and total_amount > 0 and amount_paid >= total_amount then 'fully_paid'
     when amount_paid > 0
          and balance_due_date is not null
          and balance_due_date < current_date
          and (total_amount is null or amount_paid < total_amount)
       then 'balance_pending'
     when booking_amount > 0 and amount_paid >= booking_amount then 'confirmed'
     when amount_paid > 0 then 'advance_paid'
     when status = 'contacted' and total_amount is not null then 'advance_pending'
     when status = 'contacted' then 'contacted'
     else 'new_enquiry'
   end
 where journey_stage is null;

-- 3. Lock the column down: not null, default 'new_enquiry' for new rows,
--    and a check constraint so it can never drift outside the known stages.
alter table public.enquiries
  alter column journey_stage set default 'new_enquiry',
  alter column journey_stage set not null;

alter table public.enquiries
  drop constraint if exists enquiries_journey_stage_check;
alter table public.enquiries
  add constraint enquiries_journey_stage_check
  check (journey_stage in (
    'new_enquiry', 'contacted', 'advance_pending', 'advance_paid',
    'confirmed', 'balance_pending', 'fully_paid', 'checked_in',
    'completed', 'cancelled'
  ));

create index if not exists enquiries_journey_stage_idx
  on public.enquiries using btree (journey_stage);
