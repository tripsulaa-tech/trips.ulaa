-- ============================================================================
-- Auto-quotes a brand-new, trip-linked enquiry at the trip's currently
-- active price (early-bird if that price/deadline are set and today is
-- still on or before the deadline, normal otherwise), the moment it's
-- submitted — instead of leaving total_amount NULL / package_type 'normal'
-- (the column default) until an admin manually opens Track Payment.
--
-- The public booking form (submitEnquiry/submitGroupEnquiry in
-- src/services/api.ts) never sends total_amount or package_type at all —
-- BookingFormData in src/types/types-index.ts has no such fields — so
-- every website enquiry hit this gap, and a trip in an active early-bird
-- window was quoted nothing rather than the early-bird price. That's what
-- showed up as "Not set" in the admin Payment column for enquiries that
-- had, in fact, just come in.
--
-- new.total_amount is only ever set here when nobody already supplied one,
-- so admin's manual-entry / Track Payment / bulk-edit flows (which set
-- total_amount explicitly) are completely unaffected. Mirrors
-- getActivePrice() in src/utils/utils-index.ts exactly.
--
-- Ships with a one-time backfill for enquiries already sitting unpriced:
-- any live (not cancelled), trip-linked row with total_amount still NULL
-- is priced at that trip's price today. Deliberately does NOT touch rows
-- for a trip that's since been deleted (trip_id no longer resolves) or a
-- trip with no price configured at all — those still need a manual look.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run — every part of it is idempotent (create or replace /
-- drop-then-create trigger / an UPDATE that only ever targets rows still
-- matching its own WHERE clause).
-- ============================================================================

create or replace function public.set_enquiry_active_price()
returns trigger
language plpgsql
as $function$
declare
  found_price               numeric(10, 2);
  found_early_bird_price    numeric(10, 2);
  found_early_bird_deadline date;
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
  return new;
end;
$function$;

drop trigger if exists enquiry_price_from_trip on public.enquiries;
create trigger enquiry_price_from_trip
  before insert on public.enquiries
  for each row execute function public.set_enquiry_active_price();

-- One-time backfill for enquiries submitted before this trigger existed.
update public.enquiries e
   set total_amount = case
         when t.early_bird_price is not null and t.early_bird_deadline is not null
              and t.early_bird_deadline >= current_date then t.early_bird_price
         else t.price
       end,
       package_type = case
         when t.early_bird_price is not null and t.early_bird_deadline is not null
              and t.early_bird_deadline >= current_date then 'early_bird'
         else 'normal'
       end
  from public.upcoming_trips t
 where e.trip_id = t.id
   and e.total_amount is null
   and e.cancelled_at is null
   and coalesce(t.price, t.early_bird_price) is not null;
