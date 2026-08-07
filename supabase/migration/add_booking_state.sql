-- =============================================================================
-- add_booking_state.sql
-- =============================================================================
-- WHY THIS MIGRATION EXISTS
--
-- Audit finding: cancelling a booking used to collapse BOTH journey_stage
-- and booking_status straight to 'cancelled' (see the old on_enquiry_cancelled
-- trigger and the old branch `if (e.cancelled_at) return 'cancelled'` in
-- computeJourneyStage(), src/services/api.ts). That overwrites history —
-- an admin looking at a cancelled booking could no longer tell whether it
-- had reached Advance Paid, Confirmed, or Fully Paid before it was
-- cancelled, and the CRM spec is explicit that "Cancellation changes only
-- Booking State" and "Booking Journey should always preserve the highest
-- legitimate stage reached" (e.g. "Fully Paid + Cancelled -> Journey
-- remains Fully Paid, State becomes Cancelled").
--
-- Everything else in the existing implementation already keeps these
-- concerns separate correctly (payments are an append-only ledger, refunds
-- are their own flow, is_no_show is independent of cancellation, seatStatus/
-- isCancelled() in adminEnquiriesShared.tsx already derive off cancelled_at
-- directly rather than off journey_stage). This migration only fixes the
-- one real gap: it adds an explicit `booking_state` column and stops the
-- cancellation trigger from stomping `booking_status`/`journey_stage`.
--
-- `cancelled_at` remains the source-of-truth timestamp (unchanged, nothing
-- about it is removed) — `booking_state` is a small denormalized label
-- derived from it, kept in sync by the trigger below, so the UI/reports
-- can filter on a plain enum instead of "is this timestamp set".
-- =============================================================================

alter table public.enquiries
  add column if not exists booking_state text not null default 'active';

alter table public.enquiries
  add constraint enquiries_booking_state_check
    check (booking_state = any (array['active'::text, 'cancelled'::text]));

create index if not exists enquiries_booking_state_idx on public.enquiries using btree (booking_state);

-- Backfill booking_state for rows already cancelled.
update public.enquiries
   set booking_state = 'cancelled'
 where cancelled_at is not null
   and booking_state = 'active';

-- Best-effort backfill of journey_stage for already-cancelled rows, so
-- existing bookings show the stage they'd actually reached instead of the
-- old blanket 'cancelled' value. This mirrors computeJourneyStage() in
-- src/services/api.ts minus the cancellation short-circuit.
--
-- NOTE: booking_status was already overwritten to 'cancelled' by the old
-- trigger for every row cancelled before this migration runs, so the
-- 'completed' branch can never match here — a booking that was Completed
-- and then cancelled before this migration can't have that fact recovered,
-- since it was already lost at write time. Going forward this can't happen
-- again: booking_status is no longer touched on cancellation (see the
-- trigger below), and the app layer now refuses to cancel a Completed
-- booking at all (see cancelEnquiry() in src/services/api.ts).
update public.enquiries
   set journey_stage = case
     when checked_in_at is not null then 'checked_in'
     when total_amount is not null and total_amount > 0 and amount_paid >= total_amount then 'fully_paid'
     when booking_amount > 0 and amount_paid >= booking_amount then 'confirmed'
     when amount_paid > 0 then 'advance_paid'
     when status = 'closed' then 'not_interested'
     when status = 'contacted' and total_amount is not null then 'advance_pending'
     when status = 'contacted' then 'contacted'
     else 'new_enquiry'
   end
 where cancelled_at is not null
   and journey_stage = 'cancelled';

-- Replaces the old on_enquiry_cancelled trigger function. Same refund-
-- suggestion behaviour as before; the only change is the first branch now
-- sets booking_state instead of overwriting booking_status, so
-- booking_status (and journey_stage, refreshed separately client-side)
-- keep whatever legitimate value they already held.
create or replace function public.on_enquiry_cancelled()
returns trigger
language plpgsql
as $function$
begin
  if new.cancelled_at is not null and old.cancelled_at is null then
    new.booking_state := 'cancelled';
  elsif new.cancelled_at is null and old.cancelled_at is not null then
    -- Reactivation (uncancelEnquiry) — mirror the same transition back.
    new.booking_state := 'active';
  end if;

  if (new.cancelled_at is not null and old.cancelled_at is null)
     or (new.is_no_show is distinct from old.is_no_show) then
    if new.is_no_show then
      new.suggested_refund_amount := 0;
    else
      new.suggested_refund_amount := public.suggest_refund_amount(new.id, coalesce(new.cancelled_at, now())::date);
    end if;
  end if;

  return new;
end;
$function$;

-- auto_cancel_unpaid_bookings() used to force booking_status = 'cancelled'
-- directly (bypassing the trigger, since it's a plain UPDATE). Point it at
-- booking_state instead, same reasoning as above, and keep the existing
-- guard that refuses to touch a booking that's already fully_paid,
-- cancelled, or completed.
create or replace function public.auto_cancel_unpaid_bookings()
returns void
language plpgsql
as $function$
begin
  update public.enquiries
     set booking_state = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now())
   where balance_due_date is not null
     and balance_due_date < current_date
     and booking_status not in ('fully_paid', 'cancelled', 'completed')
     and booking_state = 'active';
end;
$function$;
