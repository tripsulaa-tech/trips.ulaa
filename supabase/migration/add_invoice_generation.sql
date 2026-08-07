-- ============================================================================
-- Per-payment invoices (advance / balance / installment / extra charge /
-- refund), each with its own sequential invoice number and a paid/pending
-- status.
--
-- Builds on top of the existing `payments` ledger (add_booking_id_invoice.sql
-- and the base schema's booking_id/amount_paid machinery) rather than
-- replacing it:
--   - Every row in `payments` IS an invoice now — it gets an invoice_number
--     the moment it's inserted, whether it represents money already
--     collected (status = 'paid', the default — unchanged behavior for all
--     existing call sites like recordPayment/recordRefund) or money that's
--     merely been invoiced and is still awaited (status = 'pending', new).
--   - enquiries.amount_paid / refund_amount only ever sum 'paid' rows, so
--     raising a pending invoice (e.g. "Balance due next month") never
--     inflates what the booking shows as actually collected. Flipping a row
--     from pending -> paid (see markInvoicePaid in services/api.ts) is a
--     plain UPDATE, which re-fires the existing sync trigger and folds the
--     amount into amount_paid at that point.
--   - `extra_charge` is a new payment_type for things like a hotel upgrade
--     raised after the original booking was made. Unlike every other type,
--     generating one also bumps enquiries.total_amount (handled in
--     services/api.ts's addExtraCharge, not here, so the total updates
--     atomically with the same call that inserts the ledger row) — the
--     charge is added to what's owed whether or not it's been paid yet.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- payments.status — 'paid' (default, matches every historical row and every
-- existing insert path) vs 'pending' (an invoice has been raised but the
-- money hasn't come in yet).
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists status text not null default 'paid';

alter table public.payments
  drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
    check (status = any (array['paid'::text, 'pending'::text]));

-- ----------------------------------------------------------------------------
-- payments.invoice_number — human-readable per-transaction reference, e.g.
-- 'INV-2026-00101'. Distinct from enquiries.booking_id (one per booking);
-- this is one per payment/invoice line. Assigned automatically below.
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists invoice_number text;

create unique index if not exists payments_invoice_number_unique
  on public.payments (invoice_number)
  where (invoice_number is not null);

-- Widen payment_type to cover the invoice "Type" values the admin can pick
-- when generating an invoice. Existing values (booking_amount / balance /
-- installment / refund) are kept as-is for backward compatibility with
-- historical rows and any code path still using them; full_payment/advance/
-- extra_charge are additive.
alter table public.payments
  drop constraint if exists payments_payment_type_check;
alter table public.payments
  add constraint payments_payment_type_check
    check (payment_type = any (array[
      'booking_amount'::text, 'balance'::text, 'installment'::text, 'refund'::text,
      'full_payment'::text, 'advance'::text, 'extra_charge'::text
    ]));

-- ----------------------------------------------------------------------------
-- Invoice number sequence — same pattern as next_booking_id() /
-- booking_id_sequences in add_booking_id_invoice.sql: one counter row per
-- calendar year, bumped atomically so concurrent invoice generation never
-- hands out the same number.
-- ----------------------------------------------------------------------------
create table if not exists public.invoice_number_sequences (
  year      integer not null,
  last_seq  integer not null default 0,
  constraint invoice_number_sequences_pkey primary key (year)
);

create or replace function public.next_invoice_number() returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yr integer := extract(year from now())::integer;
  seq integer;
begin
  insert into public.invoice_number_sequences (year, last_seq)
  values (yr, 1)
  on conflict (year) do update set last_seq = public.invoice_number_sequences.last_seq + 1
  returning last_seq into seq;

  return 'INV-' || yr || '-' || lpad(seq::text, 5, '0');
end;
$$;

-- BEFORE INSERT trigger: every payments row gets an invoice_number the
-- moment it's created — paid or pending, booking payment or refund. Never
-- overwrites one that's already set (keeps this safe to re-run/backfill).
create or replace function public.assign_invoice_number() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_number is null then
    new.invoice_number := public.next_invoice_number();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_assign_invoice_number on public.payments;
create trigger trg_payments_assign_invoice_number
  before insert on public.payments
  for each row execute function public.assign_invoice_number();

-- Backfill invoice numbers for any pre-existing payment rows so every
-- historical transaction is also viewable as an invoice.
do $$
declare
  r record;
begin
  for r in select id from public.payments where invoice_number is null order by created_at asc loop
    update public.payments set invoice_number = public.next_invoice_number() where id = r.id;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- sync_enquiry_amount_paid(): only 'paid' rows count towards
-- enquiries.amount_paid/refund_amount now. A 'pending' invoice (a balance
-- invoice raised ahead of collection, an installment plan drawn up in
-- advance, an extra charge not yet paid) is visible on the booking but
-- doesn't count as money in hand until it's marked paid.
-- ----------------------------------------------------------------------------
create or replace function public.sync_enquiry_amount_paid()
returns trigger
language plpgsql
as $function$
declare
  target_enquiry_id uuid;
  new_amount_paid numeric;
  new_refund_amount numeric;
begin
  target_enquiry_id := coalesce(new.enquiry_id, old.enquiry_id);

  select coalesce(sum(amount) filter (where payment_type != 'refund' and status = 'paid'), 0),
         coalesce(sum(amount) filter (where payment_type = 'refund' and status = 'paid'), 0)
    into new_amount_paid, new_refund_amount
    from public.payments
   where enquiry_id = target_enquiry_id;

  update public.enquiries
     set amount_paid = new_amount_paid,
         refund_amount = new_refund_amount
   where id = target_enquiry_id;

  return null;
end;
$function$;
