-- ============================================================================
-- Migration: Booking lifecycle, payments ledger, refund calculation
-- Run this directly against the live DB (SQL Editor or psql).
--
-- ASSUMPTIONS TO CONFIRM WITH BUSINESS OWNER BEFORE TRUSTING refund figures:
--   - "excluding the booking amount" (T&C clause 3) is read as: refund %
--     tiers apply to (amount_paid - booking_amount), never to booking_amount.
--   - "subject to third-party cancellation charges" is read as: subtract a
--     manually-entered third_party_charges value from the computed refund.
--   - International >45 days: T&C only says "booking amount is
--     non-refundable" (doesn't explicitly restate 100% of the rest is
--     refunded) — interpreted here as full refund of (amount_paid -
--     booking_amount) since no deduction is mentioned for that tier.
--   - These are SUGGESTIONS surfaced to the admin, never auto-applied to
--     refund_amount. Confirm the interpretation before wiring the suggested
--     value into any automated payout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New columns on enquiries
-- ----------------------------------------------------------------------------

alter table public.enquiries
  add column if not exists trip_type text,
  add column if not exists departure_date date,
  add column if not exists booking_amount numeric not null default 0,
  add column if not exists third_party_charges numeric,
  add column if not exists is_no_show bool not null default false,
  add column if not exists suggested_refund_amount numeric;

-- trip_type constrained to known values
alter table public.enquiries
  add constraint enquiries_trip_type_check
  check (trip_type is null or trip_type in ('domestic', 'international'));

-- status ('new' / 'contacted' / 'closed') already exists and tracks LEAD
-- follow-up stage — left untouched. Booking/payment lifecycle is tracked
-- separately below since a 'closed' lead can mean either "went nowhere" or
-- "converted to a fully-paid booking" — those are two different dimensions.
alter table public.enquiries
  add column if not exists booking_status text;

alter table public.enquiries
  drop constraint if exists enquiries_booking_status_check;
alter table public.enquiries
  add constraint enquiries_booking_status_check
  check (booking_status is null or booking_status in (
    'booking_confirmed',
    'balance_pending',
    'fully_paid',
    'cancelled',
    'completed'
  ));

-- balance_due_date: 7 days before departure (domestic) / 30 days (international)
alter table public.enquiries
  add column if not exists balance_due_date date generated always as (
    case
      when trip_type = 'domestic' then departure_date - 7
      when trip_type = 'international' then departure_date - 30
      else null
    end
  ) stored;

comment on column public.enquiries.booking_amount is
  'Non-refundable deposit required to confirm the booking (T&C clause 1).';
comment on column public.enquiries.third_party_charges is
  'Manually entered at cancellation time — actual airline/hotel/vendor penalty, not derivable from stored data.';
comment on column public.enquiries.suggested_refund_amount is
  'Auto-computed suggestion only (see suggest_refund_amount()). Admin sets the authoritative refund_amount independently.';
comment on column public.enquiries.balance_due_date is
  'Auto-derived from departure_date + trip_type per T&C clause 2. Not editable directly.';

-- ----------------------------------------------------------------------------
-- 2. Payments ledger
-- ----------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  amount numeric not null,
  payment_type text not null check (payment_type in (
    'booking_amount', 'balance', 'installment', 'refund'
  )),
  payment_method text,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payments_enquiry_id_idx on public.payments using btree (enquiry_id);
create index if not exists payments_paid_at_idx on public.payments using btree (paid_at desc);

alter table public.payments enable row level security;

create policy "Admin all payments" on public.payments
  for all using (auth.role() = 'authenticated');

comment on table public.payments is
  'Ledger of individual payments/refunds against an enquiry. enquiries.amount_paid is a cached rollup kept in sync via trigger — this table is the source of truth.';

-- ----------------------------------------------------------------------------
-- 3. Trigger: keep enquiries.amount_paid in sync with the payments ledger
-- ----------------------------------------------------------------------------

create or replace function public.sync_enquiry_amount_paid()
returns trigger
language plpgsql
as $function$
DECLARE
  target_enquiry_id uuid;
  new_total numeric;
BEGIN
  target_enquiry_id := coalesce(NEW.enquiry_id, OLD.enquiry_id);

  select coalesce(sum(
           case when payment_type = 'refund' then -amount else amount end
         ), 0)
    into new_total
    from public.payments
   where enquiry_id = target_enquiry_id;

  update public.enquiries
     set amount_paid = new_total
   where id = target_enquiry_id;

  return null; -- AFTER trigger, return value ignored
END;
$function$;

drop trigger if exists sync_amount_paid_on_payments_change on public.payments;
create trigger sync_amount_paid_on_payments_change
  after insert or update or delete on public.payments
  for each row execute function public.sync_enquiry_amount_paid();

-- ----------------------------------------------------------------------------
-- 4. Refund suggestion function
--    NOTE: encodes the ASSUMPTIONS stated at the top of this file. Treat the
--    return value as a suggestion for the admin UI, not an authoritative
--    payout amount.
-- ----------------------------------------------------------------------------

create or replace function public.suggest_refund_amount(
  p_enquiry_id uuid,
  p_as_of_date date default current_date
)
returns numeric
language plpgsql
as $function$
DECLARE
  e record;
  days_before int;
  refundable_base numeric; -- amount_paid excluding the booking amount
  suggested numeric;
BEGIN
  select trip_type, departure_date, amount_paid, booking_amount, third_party_charges
    into e
    from public.enquiries
   where id = p_enquiry_id;

  if e.departure_date is null or e.trip_type is null then
    return null; -- can't compute without a snapshotted departure date + trip type
  end if;

  days_before := e.departure_date - p_as_of_date;
  refundable_base := greatest(e.amount_paid - e.booking_amount, 0);

  if e.trip_type = 'domestic' then
    if days_before > 15 then
      suggested := 0;
    elsif days_before between 8 and 15 then
      suggested := refundable_base * 0.5 - coalesce(e.third_party_charges, 0);
    else -- 7 days or fewer, including day-of
      suggested := 0;
    end if;

  elsif e.trip_type = 'international' then
    if days_before > 45 then
      suggested := refundable_base; -- only booking_amount is forfeited
    elsif days_before between 31 and 45 then
      suggested := refundable_base - coalesce(e.third_party_charges, 0);
    else -- 30 days or fewer
      suggested := 0;
    end if;

  else
    return null;
  end if;

  return greatest(suggested, 0);
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Trigger: auto-populate suggested_refund_amount + status when a
--    cancellation is recorded (cancelled_at transitions from null -> not null)
-- ----------------------------------------------------------------------------

create or replace function public.on_enquiry_cancelled()
returns trigger
language plpgsql
as $function$
BEGIN
  if NEW.cancelled_at is not null and OLD.cancelled_at is null then
    NEW.suggested_refund_amount := public.suggest_refund_amount(NEW.id, NEW.cancelled_at::date);
    NEW.booking_status := 'cancelled';
  end if;
  return NEW;
END;
$function$;

drop trigger if exists enquiry_cancelled_trigger on public.enquiries;
create trigger enquiry_cancelled_trigger
  before update on public.enquiries
  for each row execute function public.on_enquiry_cancelled();

-- ----------------------------------------------------------------------------
-- 6. Auto-cancellation for missed balance deadline (T&C clause 2)
--    This function is written but NOT scheduled — pg_cron scheduling is
--    commented out below. Confirm you actually want automatic cancellation
--    (vs. just flagging overdue bookings for admin review) before enabling.
-- ----------------------------------------------------------------------------

create or replace function public.auto_cancel_unpaid_bookings()
returns void
language plpgsql
as $function$
BEGIN
  update public.enquiries
     set booking_status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now())
   where balance_due_date is not null
     and balance_due_date < current_date
     and booking_status not in ('fully_paid', 'cancelled', 'completed');
END;
$function$;

-- To enable (requires pg_cron extension, enabled separately in dashboard):
-- select cron.schedule('auto-cancel-unpaid-bookings', '0 3 * * *',
--   $$select public.auto_cancel_unpaid_bookings();$$);
