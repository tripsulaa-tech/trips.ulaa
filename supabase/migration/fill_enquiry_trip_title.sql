-- ============================================================================
-- Keep enquiries.trip_title filled in whenever a trip is linked.
--
-- Background: trip_title is a snapshot copied onto the enquiry. The admin
-- Edit form only knows UPCOMING trips, so editing an enquiry whose trip had
-- since been completed wrote trip_title = null (trip_id stayed set), and the
-- Travellers page then showed "No specific trip". The app is fixed, but this
-- trigger makes it impossible for ANY code path to leave a trip-linked
-- enquiry without a name: if trip_id is set and trip_title is blank, it is
-- looked up from upcoming_trips / completed_trips automatically.
--
-- Safe to run more than once.
-- ============================================================================

create or replace function public.fill_enquiry_trip_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.trip_id is not null and coalesce(btrim(new.trip_title), '') = '' then
    select t.title
      into new.trip_title
      from (
        select id, title from public.upcoming_trips
        union all
        select id, title from public.completed_trips
      ) t
     where t.id = new.trip_id
     limit 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists enquiry_fill_trip_title on public.enquiries;
create trigger enquiry_fill_trip_title
  before insert or update on public.enquiries
  for each row execute function public.fill_enquiry_trip_title();

-- One-off backfill for any rows already missing a name (returns 0 rows if
-- you've already fixed them by hand).
update public.enquiries e
   set trip_title = t.title
  from (
    select id, title from public.upcoming_trips
    union all
    select id, title from public.completed_trips
  ) t
 where t.id = e.trip_id
   and e.trip_id is not null
   and coalesce(btrim(e.trip_title), '') = '';

-- Check: expect 0
select count(*) as still_blank
from public.enquiries
where trip_id is not null and coalesce(btrim(trip_title), '') = '';
