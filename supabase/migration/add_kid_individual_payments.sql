-- ============================================================================
-- Gives each kid row (add_kids_table.sql) its own genuinely independent
-- payment record — its own Total/Paid, its own ledger rows — instead of
-- every kid on a booking sharing one combined bucket on the parent enquiry
-- (enquiries.kids_amount/kids_amount_paid, add_kids_payment_tracking.sql).
-- A group of 4 (2 adults + 2 kids) now has 4 separate, individually
-- trackable payment records, not 2 adult ones plus a single lumped-together
-- kids figure.
--
--   kids.amount        - this one kid's own total price, same "list price,
--     admin-adjustable" idea as enquiries.total_amount, just scoped to a
--     single kid instead of the whole adult booking.
--
--   kids.amount_paid   - running total actually collected for this one
--     kid, kept in sync by sync_kid_amount_paid() below the same way
--     sync_enquiry_amount_paid() already keeps enquiries.amount_paid in
--     sync with the `payments` ledger.
--
--   payments.kid_id    - marks a ledger row as money moving against one
--     specific kid rather than the adult booking or the old combined kids
--     bucket. Nullable + on delete cascade: removing a kid record removes
--     its own payment history with it, same as an enquiry's own cascade.
--     for_kids is still set true on these rows for backward compatibility
--     with anything (e.g. Reports) still reading that flag — kid_id is
--     the new, precise discriminator going forward.
--
-- Deliberately layered on top of everything add_kids_payment_tracking.sql
-- already does, not replacing it — enquiries.kids_amount/kids_amount_paid
-- stay as a business-wide rollup (still handy for reporting "how much kids
-- fee has this booking collected in total"), they just stop being the
-- thing the admin UI edits directly; that's this migration's kids.amount/
-- amount_paid now.
--
-- Run this once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.kids
  add column if not exists amount numeric(10, 2) not null default 0;

alter table public.kids
  add column if not exists amount_paid numeric(10, 2) not null default 0;

alter table public.kids
  add constraint kids_amount_paid_check check (amount_paid >= 0);

alter table public.kids
  add constraint kids_amount_paid_bound_check check (amount_paid <= amount);

alter table public.payments
  add column if not exists kid_id uuid references public.kids(id) on delete cascade;

create index if not exists payments_kid_id_idx
  on public.payments using btree (kid_id)
  where kid_id is not null;

-- ----------------------------------------------------------------------------
-- Keeps kids.amount_paid in sync with the `payments` ledger, the same
-- pattern sync_enquiry_amount_paid() already uses for enquiries.amount_paid
-- — only rows with status = 'paid' count, and only rows scoped to this one
-- kid (payments.kid_id), not every kid on the booking.
-- ----------------------------------------------------------------------------
create or replace function public.sync_kid_amount_paid()
returns trigger
language plpgsql
as $function$
declare
  target_kid_id uuid;
  new_amount_paid numeric;
begin
  target_kid_id := coalesce(new.kid_id, old.kid_id);
  if target_kid_id is null then
    return null;
  end if;

  select coalesce(sum(amount) filter (where payment_type != 'refund' and status = 'paid'), 0)
    into new_amount_paid
    from public.payments
   where kid_id = target_kid_id;

  update public.kids
     set amount_paid = new_amount_paid
   where id = target_kid_id;

  return null;
end;
$function$;

drop trigger if exists payments_sync_kid_amount_paid on public.payments;
create trigger payments_sync_kid_amount_paid
  after insert or update or delete on public.payments
  for each row execute function public.sync_kid_amount_paid();

-- One-time backfill: seed each existing kid's own `amount` from an even
-- split of its parent booking's combined kids_amount (kids_amount /
-- kids_count) where that's set, so bookings that already had a kids fee
-- recorded before this migration don't start every kid at ₹0. Individual
-- amount_paid intentionally starts at 0 — there's no way to recover how
-- much of a past combined kids payment belonged to which specific kid, so
-- that has to be re-entered per kid going forward. Safe to re-run: only
-- fires for kids that are still at the column default (amount = 0).
update public.kids k
   set amount = round(e.kids_amount / e.kids_count, 2)
  from public.enquiries e
 where k.enquiry_id = e.id
   and k.amount = 0
   and e.kids_amount > 0
   and e.kids_count > 0;
