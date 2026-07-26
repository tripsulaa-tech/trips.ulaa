-- ============================================================================
-- ULAA — Group-aware waitlist
-- Run this once in Supabase → SQL Editor, AFTER add_waitlist.sql and
-- add_waitlist_reserved_counts.sql.
--
-- Problem: the waitlist table (and the "how many seats does this waiting
-- person need" math) never knew about group bookings. A person who joined
-- the waitlist because their group of 3 didn't fit was stored exactly like
-- a solo waitlister, so:
--   - get_waitlist_reserved_counts() counted them as reserving 1 seat, not 3
--     (public "seats left" could undercount how many seats are actually
--     spoken for).
--   - The admin Waitlist page's "seat open, ready to convert" flag lit up
--     the moment ANY seat was free, even if that group still needed more —
--     e.g. 1 seat opening looked "ready" for someone who needs 3.
--
-- Fix: give each waitlist row a group_size (null/1 = solo, same convention
-- as enquiries.group_size), and make the reserved-seats RPC sum group_size
-- instead of just counting rows. "Ready to convert" then only lights up
-- once seats_available >= that row's group_size — 1 seat free is enough
-- for a solo waitlister, but a group of 3 stays waiting until 3 are free.
-- ============================================================================

alter table public.waitlist
  add column group_size integer;

alter table public.waitlist
  add constraint waitlist_group_size_check
    check (group_size is null or group_size >= 2);

comment on column public.waitlist.group_size is
  'How many seats this waitlist signup needs. Null/1 = solo. Set when someone joins the waitlist because their group did not fit in the remaining seats.';

-- Recompute reserved seats as a sum of group_size (treating null as 1),
-- not a row count, so a group waiter correctly reserves all the seats
-- their group needs, not just one.
create or replace function public.get_waitlist_reserved_counts()
returns table (trip_id uuid, reserved_count bigint)
language sql
security definer
set search_path = public
stable
as $function$
  select trip_id, sum(coalesce(group_size, 1))::bigint as reserved_count
  from public.waitlist
  where status in ('waiting', 'notified')
  group by trip_id;
$function$;
