-- CRM spec section 16: adds "Payment Arrangement Needed" as a valid
-- contact outcome — customer wants to book but needs time to arrange funds.
-- Stays Contacted with a follow-up reminder (same effect as needs_time/call_later).
--
-- Run in Supabase SQL Editor (migrations are not auto-applied).

alter table public.enquiries
  drop constraint if exists enquiries_last_contact_outcome_check;
alter table public.enquiries
  add constraint enquiries_last_contact_outcome_check
  check (last_contact_outcome is null or last_contact_outcome = any (array[
    'interested'::text, 'needs_time'::text, 'call_later'::text,
    'payment_arrangement'::text,
    'no_response'::text, 'not_interested'::text, 'wrong_number'::text
  ]));
