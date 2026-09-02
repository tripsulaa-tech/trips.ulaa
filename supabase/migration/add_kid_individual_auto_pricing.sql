-- ============================================================================
-- Auto-quotes each kid's own individual fee (kids.amount, from
-- add_kid_individual_payments.sql) from the trip's child_price the moment
-- the kid row is created — the same "auto-fill at insert, never trusted
-- from the client" pattern set_enquiry_active_price() already applies to
-- enquiries.total_amount and enquiries.kids_amount (see
-- add_enquiry_auto_pricing.sql / add_trip_kids_option.sql).
--
-- Before this migration, kids.amount only ever got a real value in two
-- ways: the one-time backfill in add_kid_individual_payments.sql (an even
-- split of a booking's already-set kids_amount, for kids that predated
-- that migration), or an admin manually opening that kid's Payment modal
-- (useKidPayment.ts fetches child_price live and shows it there, but
-- doesn't write it to the row until Save). Every kid created in between —
-- i.e. any kid added since — sits at the column default of 0 ("No fee set
-- yet" in the Kids card) until an admin happens to open that modal, even
-- though the trip's child_price was known and correct at the moment the
-- kid record was created.
--
-- kids has no trip_id of its own (see add_kids_table.sql) — it's reached
-- through kids.enquiry_id -> enquiries.trip_id -> upcoming_trips.child_price.
--
-- Only fires while amount is still at its default (0) — the only value
-- createKidsForEnquiry() ever inserts (src/services/api/enquiries/kids.ts)
-- — so it can't clobber an admin's later, deliberate edit; this is a
-- BEFORE INSERT trigger only, same as set_enquiry_active_price(), and never
-- runs on UPDATE.
--
-- Run this once in Supabase -> SQL Editor. Safe to re-run.
-- ============================================================================

create or replace function public.set_kid_active_price()
returns trigger
language plpgsql
as $function$
declare
  found_child_price numeric(10, 2);
begin
  if coalesce(new.amount, 0) = 0 then
    select t.child_price into found_child_price
      from public.enquiries e
      join public.upcoming_trips t on t.id = e.trip_id
     where e.id = new.enquiry_id;

    if found_child_price is not null then
      new.amount := found_child_price;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists kids_price_from_trip on public.kids;
create trigger kids_price_from_trip
  before insert on public.kids
  for each row execute function public.set_kid_active_price();

-- One-time backfill: any existing kid still sitting at the column default
-- (0) whose trip actually has a child_price set gets priced now, same
-- "only touch rows still at the default" rule as add_enquiry_auto_pricing.sql's
-- own backfill.
update public.kids k
   set amount = t.child_price
  from public.enquiries e
  join public.upcoming_trips t on t.id = e.trip_id
 where k.enquiry_id = e.id
   and k.amount = 0
   and t.child_price is not null;
