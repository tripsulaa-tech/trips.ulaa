-- NOTE: the Kids feature this migration builds on was later removed — see
-- remove_kids_feature.sql. Kept here only as history of what was applied.

-- ============================================================================
-- Adds a "Kids" concept to bookings: parents can bring children along on a
-- trip without the kid needing (or counting against) a seat.
--
--   upcoming_trips.child_price - optional fixed per-kid price set by the
--     admin per trip (Admin -> Trips -> Pricing & Availability). Null means
--     "not set" — BookingForm then shows kids as free/no-charge.
--
--   enquiries.kids_count - how many kids are travelling with this booking.
--     Deliberately does NOT count towards seats/capacity (enforce_trip_
--     capacity / enforce_enquiry_capacity_or_waitlist both key off seats,
--     never kids_count) and has no age collected — just a headcount. For a
--     group booking (one row per seat), this is only ever set on the
--     group_seq = 1 row so summing it across rows doesn't multiply by
--     group size.
--
--   enquiries.kids_amount - the child_price x kids_count charge for this
--     booking, auto-computed once by set_enquiry_active_price() below (the
--     same trigger that auto-quotes total_amount from the trip's active
--     price) rather than trusted from the client, so it can't be tampered
--     with from the public booking form. Only ever auto-filled when still
--     at its default (0) and only on the lead row of a group, same
--     group_seq = 1 rule as kids_count.
--
--   waitlist.kids_count - same headcount, purely informational (the
--     waitlist doesn't hold pricing/payment data at all).
--
-- Run this once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists child_price numeric(10, 2);

alter table public.upcoming_trips
  add constraint upcoming_trips_child_price_check
    check (child_price is null or child_price >= 0);

alter table public.enquiries
  add column if not exists kids_count integer not null default 0;

alter table public.enquiries
  add column if not exists kids_amount numeric(10, 2) not null default 0;

alter table public.enquiries
  add constraint enquiries_kids_count_check check (kids_count >= 0);

alter table public.enquiries
  add constraint enquiries_kids_amount_check check (kids_amount >= 0);

alter table public.waitlist
  add column if not exists kids_count integer not null default 0;

alter table public.waitlist
  add constraint waitlist_kids_count_check check (kids_count >= 0);

-- Extends the existing auto-pricing trigger (see add_enquiry_auto_pricing.sql)
-- to also price kids_amount from the trip's child_price, the same
-- "fill only if not already supplied" rule total_amount already follows.
-- Only fires on the lead row of a booking (group_seq = 1, same convention
-- as enforce_enquiry_capacity_or_waitlist()) so a group's kids charge is
-- never duplicated across every seat row.
create or replace function public.set_enquiry_active_price()
returns trigger
language plpgsql
as $function$
declare
  found_price               numeric(10, 2);
  found_early_bird_price    numeric(10, 2);
  found_early_bird_deadline date;
  found_child_price         numeric(10, 2);
begin
  if new.trip_id is not null and new.total_amount is null then
    select price, early_bird_price, early_bird_deadline
      into found_price, found_early_bird_price, found_early_bird_deadline
      from upcoming_trips where id = new.trip_id;

    if found_early_bird_price is not null and found_early_bird_deadline is not null
       and found_early_bird_deadline >= current_date then
      new.total_amount := found_early_bird_price;
      new.package_type := 'early_bird';
    elsif found_price is not null then
      new.total_amount := found_price;
      new.package_type := 'normal';
    end if;
  end if;

  if new.trip_id is not null
     and coalesce(new.group_seq, 1) = 1
     and coalesce(new.kids_count, 0) > 0
     and coalesce(new.kids_amount, 0) = 0 then
    select child_price into found_child_price
      from upcoming_trips where id = new.trip_id;

    if found_child_price is not null then
      new.kids_amount := found_child_price * new.kids_count;
    end if;
  end if;

  return new;
end;
$function$;

-- One-time backfill: nothing to backfill for kids_count/kids_amount, since
-- both default to 0 and no booking before this migration had kids data to
-- recover — every existing row is already correct as-is.
