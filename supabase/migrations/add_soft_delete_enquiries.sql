-- Migration: Soft-delete support for enquiries
-- -----------------------------------------------
-- Instead of hard-deleting rows (which would cascade-delete payment history),
-- we now stamp a deleted_at timestamp. The row becomes invisible to all normal
-- queries while keeping payment, waitlist conversion and audit data intact for
-- recovery or reporting.

-- 1. Add the deleted_at column (nullable – NULL means "not deleted")
alter table public.enquiries
  add column if not exists deleted_at timestamptz;

-- 2. Update the seat-recompute function to exclude soft-deleted rows so that
--    deleting an enquiry that held a seat correctly frees the seat.
create or replace function public.recompute_trip_seats(p_trip_id uuid)
returns void
language plpgsql
as $function$
begin
  update public.upcoming_trips t
     set seats_booked = (
       select count(*)
         from public.enquiries e
        where e.trip_id = p_trip_id
          and e.cancelled_at is null
          and e.deleted_at  is null   -- exclude soft-deleted rows
          and e.amount_paid > 0
     )
   where t.id = p_trip_id;
end;
$function$;

-- 3. Drop the old unique index and recreate it to also exclude deleted rows,
--    preventing a "deleted" enquiry from blocking re-submission with the same
--    contact details.
drop index if exists enquiries_trip_name_phone_email_active_unique;

create unique index enquiries_trip_name_phone_email_active_unique
  on public.enquiries (trip_id, lower(trim(full_name)), phone, lower(trim(email)), group_seq)
  where (cancelled_at is null and deleted_at is null);
