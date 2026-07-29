-- ============================================================================
-- ULAA — Fix: completed trips show "0 participants"
--
-- Bug: sync_started_trip_albums() (the function that auto-creates a
-- completed_trips album when an upcoming trip's start_date passes) never
-- set `participants` on the new row, so it always defaulted to 0 — even
-- though the trip had real booked seats (upcoming_trips.seats_booked).
--
-- Fix, in two parts:
--   1. Replace the function so future auto-completions carry
--      upcoming_trips.seats_booked over as completed_trips.participants.
--   2. Backfill trips that already completed with participants = 0, using
--      a count of that trip's real booked seats from `enquiries` (same
--      definition recompute_trip_seats() uses for upcoming trips: not
--      cancelled, not soft-deleted, amount_paid > 0). enquiries.trip_id
--      keeps pointing at the same id after the upcoming → completed move,
--      so this still finds the right rows.
--
-- Run this once in Supabase → SQL Editor.
-- ============================================================================

create or replace function public.sync_started_trip_albums()
returns void
language plpgsql
as $function$
begin
  insert into public.completed_trips (
    id, title, destination, slug, trip_date, description,
    cover_image, gallery_images, is_published, trip_type,
    original_itinerary, original_highlights, original_included, original_not_included,
    participants
  )
  select
    ut.id, ut.title, ut.destination, ut.slug, ut.start_date, ut.description,
    ut.cover_image, ut.gallery_images, false, ut.trip_type,
    ut.itinerary, ut.highlights, ut.included, ut.not_included,
    ut.seats_booked
  from public.upcoming_trips ut
  where ut.start_date <= current_date
    and not exists (
      select 1 from public.completed_trips ct where ct.id = ut.id
    );

  update public.upcoming_trips
     set is_published = false
   where start_date <= current_date
     and is_published = true;
end;
$function$;

-- Backfill: only touches rows still sitting at 0, so it won't overwrite any
-- participants count an admin has since edited by hand in Admin → Albums.
update public.completed_trips ct
   set participants = (
     select count(*) from public.enquiries e
      where e.trip_id = ct.id
        and e.cancelled_at is null
        and e.deleted_at  is null
        and e.amount_paid > 0
   )
 where coalesce(ct.participants, 0) = 0;
