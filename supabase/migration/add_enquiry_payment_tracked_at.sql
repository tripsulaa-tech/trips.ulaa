-- ============================================================================
-- Fixes: marking a lead "Interested" (Log Call Outcome -> Interested -> Save)
-- immediately showed the enquiry as "Advance Pending" in the admin table,
-- even when the admin hadn't entered or saved anything on the payment page
-- yet — just opened it and clicked "Back to Enquiries".
--
-- Root cause: computeJourneyStage() (src/services/api/enquiries/shared.ts)
-- derived 'advance_pending' from `status === 'contacted' && total_amount`,
-- on the assumption that total_amount only gets set once an admin
-- deliberately quotes a price via Track Payment (see the original
-- recordContactOutcome() comment: "this call alone only gets it to
-- Contacted"). That assumption broke the moment add_enquiry_auto_pricing.sql
-- shipped: every trip-linked enquiry is now auto-quoted at the trip's list
-- price the instant it's submitted from the website, so total_amount is
-- already set on brand-new, never-contacted enquiries. Recording "Interested"
-- (which only ever sets status to 'contacted') was therefore enough on its
-- own to satisfy the old condition and jump straight to Advance Pending —
-- before the admin had touched the payment form at all.
--
-- Fix: track a real "admin actually engaged with payment" signal separately
-- from total_amount. payment_tracked_at is stamped the first time
-- recordPayment() runs for an enquiry (i.e. Track Payment is actually
-- saved — even for ₹0), and left untouched after that. computeJourneyStage()
-- now requires both total_amount AND payment_tracked_at before reporting
-- 'advance_pending'.
--
-- Backfill: any enquiry that's already past 'advance_pending' in practice
-- (something's actually been paid, or it's gone further in the journey) is
-- backfilled with a payment_tracked_at so this migration doesn't demote
-- existing bookings back down to 'contacted'. A row that's contacted with a
-- price but nothing paid — exactly the ambiguous case this migration is
-- about — is deliberately left null and will simply read as 'contacted'
-- until its Track Payment form is actually saved.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

alter table public.enquiries
  add column if not exists payment_tracked_at timestamptz;

update public.enquiries
   set payment_tracked_at = coalesce(payment_tracked_at, updated_at, created_at)
 where payment_tracked_at is null
   and (
     amount_paid > 0
     or booking_id is not null
     or journey_stage not in ('new_enquiry', 'contacted', 'advance_pending')
   );
