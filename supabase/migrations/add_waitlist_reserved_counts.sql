-- ============================================================================
-- ULAA — Waitlist-reserved seat counts (public-safe)
-- Run this once in Supabase → SQL Editor.
--
-- Problem: when a seat frees up (e.g. a cancellation) and someone is already
-- waiting for that trip, the public site was showing the freed seat as
-- bookable by anyone — so a brand-new visitor could snipe a seat out from
-- under a person who'd been waiting longer and should get first refusal.
--
-- Fix: expose a tiny, PII-free RPC that returns how many seats are "reserved"
-- per trip by people still active on the waitlist (status = waiting or
-- notified — they haven't converted or declined yet). The frontend then
-- shows: real_seats_left - reserved_by_waitlist as the public seat count.
--
-- The `waitlist` table itself stays locked down to admins only (see
-- add_waitlist.sql); this function is SECURITY DEFINER so it can read the
-- table to compute counts, but it only ever returns a trip_id + a number —
-- no names, emails, or phone numbers ever leave the table via this path.
-- ============================================================================

create or replace function public.get_waitlist_reserved_counts()
returns table (trip_id uuid, reserved_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select trip_id, count(*)::bigint as reserved_count
  from public.waitlist
  where status in ('waiting', 'notified')
  group by trip_id;
$$;

-- Public (anon) needs this to compute the honest "seats left" number on the
-- home page / trips list / trip detail page.
grant execute on function public.get_waitlist_reserved_counts() to anon, authenticated;
