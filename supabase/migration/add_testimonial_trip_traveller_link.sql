-- Link a testimonial to the trip and booked traveller it came from.
-- Safe to re-run. Run in the Supabase SQL editor.

alter table public.testimonials
  add column if not exists trip_id uuid,
  add column if not exists enquiry_id uuid references public.enquiries (id) on delete set null;

create index if not exists testimonials_enquiry_id_idx on public.testimonials (enquiry_id);

-- Backfill the three existing testimonials (matched against your DB results).
-- Keerthana -> "Keerthana AR Homes", Bioluminescence Getaway, 21 Mar 2026
update public.testimonials t
   set enquiry_id = e.id, trip_id = e.trip_id
  from public.enquiries e
 where t.name = 'Keerthana'
   and e.id = 'd39cc04a-60a0-4f25-a7a7-e82f0d50acf4';

-- Varsha -> Bioluminescence Getaway, 21 Mar 2026 (second batch, the one she attended)
update public.testimonials t
   set enquiry_id = e.id, trip_id = e.trip_id
  from public.enquiries e
 where t.name = 'Varsha'
   and e.id = 'b1ffe090-b745-4a9f-9a68-513f3fa521bf';

-- Monali -> Bioluminescence Getaway, 14 Mar 2026
update public.testimonials t
   set enquiry_id = e.id, trip_id = e.trip_id
  from public.enquiries e
 where t.name = 'Monali'
   and e.phone = '9962510941'
   and e.deleted_at is null
   and e.cancelled_at is null
   and e.trip_id in (
     select id from public.completed_trips
      where title = 'Bioluminescence Getaway' and trip_date = date '2026-03-14'
   );

-- Check: all three should show an enquiry_id and trip_id.
select name, destination, enquiry_id, trip_id from public.testimonials order by sort_order;
