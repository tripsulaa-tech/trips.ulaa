-- ============================================================================
-- Booking ID generation (feeds the admin "Download Invoice" feature)
--
-- A booking only "counts" once money has actually been paid (this mirrors
-- the existing isBooked()/seatStatus() logic in AdminEnquiries.tsx, which
-- treats amount_paid > 0 as the seat being booked). So booking_id is issued
-- lazily, the first time an enquiry's amount_paid goes above 0 — not at
-- enquiry-submission time, and not re-issued/cleared on cancellation (the
-- ID stays as a permanent historical reference on that row).
--
-- Format: ULAA-<year>-<6-digit sequence>, e.g. ULAA-2026-000123. The
-- sequence resets to 1 at the start of each calendar year, keyed off the
-- year the booking was actually confirmed (not the trip's departure year).
-- ============================================================================

-- Per-year running counter. One row per year; incremented atomically via
-- the INSERT ... ON CONFLICT DO UPDATE below, so concurrent payments never
-- hand out the same sequence number.
create table if not exists public.booking_id_sequences (
  year integer not null,
  last_seq integer not null default 0,
  constraint booking_id_sequences_pkey primary key (year)
);

create or replace function public.next_booking_id() returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yr integer := extract(year from now())::integer;
  seq integer;
begin
  insert into public.booking_id_sequences (year, last_seq)
  values (yr, 1)
  on conflict (year) do update set last_seq = public.booking_id_sequences.last_seq + 1
  returning last_seq into seq;

  return 'ULAA-' || yr || '-' || lpad(seq::text, 6, '0');
end;
$$;

alter table public.enquiries
  add column if not exists booking_id text;

create unique index if not exists enquiries_booking_id_unique
  on public.enquiries (booking_id)
  where (booking_id is not null);

-- Fires on both INSERT (e.g. a manual enquiry created already paid via
-- createManualEnquiry) and UPDATE (e.g. recordPayment's first-payment
-- insert into `payments`, which triggers a recompute of amount_paid on this
-- row) — either way, the first time amount_paid > 0 is seen with no
-- booking_id yet, one gets assigned. Never overwrites an existing
-- booking_id, and cancelling a booking afterwards does not clear it.
create or replace function public.assign_booking_id() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_paid > 0 and new.booking_id is null then
    new.booking_id := public.next_booking_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enquiries_assign_booking_id on public.enquiries;
create trigger trg_enquiries_assign_booking_id
  before insert or update on public.enquiries
  for each row execute function public.assign_booking_id();

-- Backfill: give existing already-booked (amount_paid > 0) rows a
-- booking_id too, ordered by when they actually got paid (created_at is
-- the closest proxy available) so earlier real bookings get lower numbers.
do $$
declare
  r record;
begin
  for r in
    select id from public.enquiries
    where amount_paid > 0 and booking_id is null
    order by created_at asc
  loop
    update public.enquiries set booking_id = public.next_booking_id() where id = r.id;
  end loop;
end;
$$;
