-- Fix: "cannot update table "upcoming_trips" — Column list used by the
-- publication does not cover the replica identity" (Postgres 42P10).
--
-- Cause: enable_realtime.sql set `upcoming_trips replica identity full`
-- (every column is the row's identity). restrict_trip_finance_public_read.sql
-- later put a COLUMN LIST on the realtime publication that leaves out
-- trip_finance. A published column list must cover the replica identity, so
-- Postgres now rejects EVERY UPDATE on upcoming_trips.
--
-- Why saving a traveller / editing an enquiry fails: the on_enquiries_seat_sync
-- trigger updates upcoming_trips.seats_booked whenever an enquiry row is
-- updated, so any enquiry edit trips over this error — not just food.
--
-- Fix: go back to the default replica identity (the primary key `id`, which
-- the publication's column list already includes). Realtime keeps working
-- and trip_finance still stays out of the stream. Only the "old row" payload
-- on UPDATE shrinks to the primary key — the app reads the new row.
--
-- HOW TO RUN: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.

alter table public.upcoming_trips replica identity default;

-- Verify: relreplident should be 'd' (default).
select relname, relreplident
from pg_class
where oid = 'public.upcoming_trips'::regclass;
