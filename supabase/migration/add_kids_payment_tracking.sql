-- NOTE: the Kids feature this migration builds on was later removed — see
-- remove_kids_feature.sql. Kept here only as history of what was applied.

-- ============================================================================
-- Tracks the kids fee (enquiries.kids_amount, from add_trip_kids_option.sql)
-- as its own independent Paid/Pending line, separate from the adult
-- booking's amount_paid — instead of being computed-but-never-collected.
--
--   payments.for_kids - marks a ledger row as money moving against the
--     kids fee rather than the adult booking. Defaults to false so every
--     existing/historical payment (which predates this concept) keeps
--     counting towards the adult total exactly as it always has.
--
--   enquiries.kids_amount_paid - running total of `paid` kids-fee ledger
--     rows for this booking, kept in sync by the same trigger that already
--     maintains amount_paid/refund_amount (sync_enquiry_amount_paid,
--     originally from add_invoice_generation.sql). Only ever meaningful on
--     the group's group_seq = 1 row, same convention as kids_count/
--     kids_amount themselves.
--
-- Run this once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.payments
  add column if not exists for_kids boolean not null default false;

alter table public.enquiries
  add column if not exists kids_amount_paid numeric(10, 2) not null default 0;

alter table public.enquiries
  add constraint enquiries_kids_amount_paid_check check (kids_amount_paid >= 0);

alter table public.enquiries
  add constraint enquiries_kids_amount_paid_bound_check check (kids_amount_paid <= kids_amount);

-- ----------------------------------------------------------------------------
-- Extends sync_enquiry_amount_paid() (add_invoice_generation.sql) to split
-- the running totals by for_kids, so a kids-fee payment no longer inflates
-- the adult amount_paid it used to fall into by default, and vice versa.
-- Refunds keep working the same way, just scoped per bucket: a for_kids
-- refund only reduces what shows as kids money in hand.
-- ----------------------------------------------------------------------------
create or replace function public.sync_enquiry_amount_paid()
returns trigger
language plpgsql
as $function$
declare
  target_enquiry_id uuid;
  new_amount_paid numeric;
  new_refund_amount numeric;
  new_kids_amount_paid numeric;
begin
  target_enquiry_id := coalesce(new.enquiry_id, old.enquiry_id);

  select coalesce(sum(amount) filter (where payment_type != 'refund' and status = 'paid' and not for_kids), 0),
         coalesce(sum(amount) filter (where payment_type = 'refund' and status = 'paid' and not for_kids), 0),
         coalesce(sum(amount) filter (where payment_type != 'refund' and status = 'paid' and for_kids), 0)
    into new_amount_paid, new_refund_amount, new_kids_amount_paid
    from public.payments
   where enquiry_id = target_enquiry_id;

  update public.enquiries
     set amount_paid = new_amount_paid,
         refund_amount = new_refund_amount,
         kids_amount_paid = new_kids_amount_paid
   where id = target_enquiry_id;

  return null;
end;
$function$;

-- One-time backfill: nothing to backfill — for_kids defaults to false, so
-- every historical payment keeps counting the way it always did, and
-- kids_amount_paid starts at 0 for every existing row (no booking before
-- this migration had a way to record a kids-fee payment).
