-- ============================================================================
-- Keeps kids.amount (add_kid_individual_payments.sql) in sync with the
-- trip's own child_price after the trip's already been edited — not just
-- at kid-creation time, which is all add_kid_individual_auto_pricing.sql's
-- BEFORE INSERT trigger covers.
--
-- Before this migration, editing Child Fee on an Upcoming Trip only ever
-- affected kids going forward (new bookings). Every kid already sitting on
-- that trip kept whatever amount it was priced at when its row was
-- created (or 0, if the trip had no child_price yet) until an admin
-- happened to open that kid's own Payment modal and hit Save — even
-- though the modal's suggested Total was already live-pulled from the
-- trip's current child_price (see useKidPayment.openKidPayment in
-- src/admin/enquiries/useKidPayment.ts), the underlying row itself never
-- moved on its own.
--
-- Only touches kids that haven't collected anything yet
-- (kids.amount_paid = 0) — once a payment's been recorded against a kid,
-- its total is treated as locked in, same "don't clobber a deliberate
-- edit" rule set_kid_active_price() already follows for its own narrower
-- (amount = 0) case. This is also what keeps this trigger safe against
-- kids_amount_paid_bound_check (amount_paid <= amount): amount_paid is
-- guaranteed 0 here, so any new amount — including a lower one, or a
-- clear back to 0 if child_price is unset — still satisfies it.
--
-- kids has no trip_id of its own (see add_kids_table.sql) — it's reached
-- the same way set_kid_active_price() reaches it: kids.enquiry_id ->
-- enquiries.trip_id -> upcoming_trips.child_price.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

create or replace function public.sync_kids_price_on_trip_update()
returns trigger
language plpgsql
as $function$
begin
  -- Nothing to cascade if child_price didn't actually change on this
  -- update (e.g. the admin edited an unrelated field on the trip).
  if new.child_price is not distinct from old.child_price then
    return new;
  end if;

  update public.kids k
     set amount = coalesce(new.child_price, 0)
    from public.enquiries e
   where k.enquiry_id = e.id
     and e.trip_id = new.id
     and k.amount_paid = 0;

  return new;
end;
$function$;

drop trigger if exists kids_price_sync_on_trip_update on public.upcoming_trips;
create trigger kids_price_sync_on_trip_update
  after update on public.upcoming_trips
  for each row execute function public.sync_kids_price_on_trip_update();
