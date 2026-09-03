-- ============================================================================
-- Removes the "Kids" feature entirely.
--
-- Undoes everything added by: add_trip_kids_option.sql, add_kids_table.sql,
-- add_kids_payment_tracking.sql, add_kids_food_preference.sql,
-- add_kids_not_interested_status.sql, add_kid_not_interested_reason.sql,
-- add_kids_completed_no_show.sql, add_kid_individual_payments.sql,
-- add_kid_individual_auto_pricing.sql, add_kid_price_sync_on_trip_update.sql,
-- add_kid_contacted_status.sql, add_kid_activity_log_scope.sql, and
-- enable_realtime_kids.sql.
--
-- Run this once against the live database (Supabase → SQL Editor or
-- `supabase db execute`) AFTER deploying the app code that no longer
-- reads/writes any kids_* / kid_* / child_price / for_kids fields — the
-- columns/table are only safe to drop once nothing still queries them.
--
-- Irreversible: this permanently deletes the `kids` table and every row in
-- it, plus the kids_amount/kids_amount_paid/child_price/for_kids/kid_id
-- data on enquiries/payments/activity_log/waitlist/upcoming_trips. Take a
-- backup or export first if that history needs to be kept anywhere.
-- ============================================================================

-- 1. Drop kids from the realtime publication before dropping the table
--    (harmless no-op if it's already gone).
do $$
begin
  alter publication supabase_realtime drop table public.kids;
exception
  when undefined_object then null;
  when undefined_table then null;
end $$;

-- 2. Redefine set_enquiry_active_price() without the kids auto-pricing
--    branch, so it no longer references kids_count/kids_amount/child_price
--    before those columns are dropped in step 6/8.
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

-- 3. Redefine sync_enquiry_amount_paid() without the for_kids-scoped sums
--    and without writing kids_amount_paid.
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

-- 4. Drop the kids table itself. CASCADE takes its triggers
--    (kids_set_updated_at, on_kid_created_log_activity), its RLS policies,
--    its indexes, and the activity_log.kid_id foreign key constraint with
--    it. The activity_log.kid_id *column* survives this and is dropped
--    explicitly in step 6.
drop table if exists public.kids cascade;

-- 5. Drop the now-orphaned trigger functions that only ever served the
--    kids table.
drop function if exists public.set_kids_updated_at();
drop function if exists public.log_kid_created_activity();

-- 6. Drop kid-related columns.
alter table public.activity_log  drop column if exists kid_id;
alter table public.enquiries     drop column if exists kids_count;
alter table public.enquiries     drop column if exists kids_amount;
alter table public.enquiries     drop column if exists kids_amount_paid;
alter table public.payments      drop column if exists for_kids;
alter table public.upcoming_trips drop column if exists child_price;
alter table public.waitlist      drop column if exists kids_count;

-- ============================================================================
-- After running this, supabase/schema.sql already reflects the resulting
-- schema (it was updated alongside the app code that removed the Kids
-- feature), so no further hand-editing of schema.sql is needed.
-- ============================================================================
