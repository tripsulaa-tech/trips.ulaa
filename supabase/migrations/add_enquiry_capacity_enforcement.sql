-- ============================================================================
-- ULAA — Enforce trip capacity at enquiry submission time (not just payment)
-- Run this once in Supabase → SQL Editor.
--
-- Bug this closes: enforce_trip_capacity() (see schema.sql) only rejects an
-- insert/update once amount_paid > 0 — i.e. it protects PAID seats, but a
-- plain enquiry (amount_paid = 0, the normal public-form submission) was
-- never checked against capacity at the DB level at all. The public site's
-- "does this fit, or should it go to the waitlist" decision lived entirely
-- in the browser (BookingForm's remainingSeats prop, computed once when the
-- trip page loaded). If seats filled up while that page was still open —
-- e.g. two groups' worth of seats got booked and paid, taking a trip to 0
-- remaining — a third visitor's already-open form still thought seats were
-- free and submitted a normal enquiry instead of joining the waitlist.
--
-- Fix: a BEFORE INSERT trigger on enquiries that locks the trip row and
-- checks the request (1 seat for solo, group_size for a group) against the
-- trip's real, current seats_booked/total_seats — the same numbers the
-- public site's own "seats left" figure is built from. If it doesn't fit,
-- the insert is rejected with a plain 'SEATS_UNAVAILABLE' marker message
-- (same convention as the existing AGE_NOT_ELIGIBLE marker) instead of a
-- dedicated SQLSTATE, and the app (src/services/api.ts) surfaces that as a
-- distinct error so the UI can automatically fall back to a waitlist
-- signup — see BookingForm.tsx.
--
-- A group booking inserts one row per seat in a single multi-row INSERT
-- statement (see submitGroupEnquiry in api.ts); only group_seq = 1 (or null,
-- for a solo booking) is checked against the full group_size, so the
-- remaining seats in the same group aren't each wrongly checked against a
-- single seat — and so the DB rejects (and Postgres rolls back) the whole
-- group in one shot rather than partially seating it.
--
-- bypass_capacity_check gives Admin a narrow, explicit escape hatch (e.g. a
-- deliberately-approved extra seat) without affecting the public form, which
-- never sets it and so always defaults to false.
-- ============================================================================

alter table public.enquiries
  add column bypass_capacity_check boolean not null default false;

create or replace function public.enforce_enquiry_capacity_or_waitlist()
returns trigger
language plpgsql
as $function$
declare
  v_seats_booked int;
  v_total_seats int;
  v_real_remaining int;
  v_requested_seats int;
begin
  -- Only gates brand-new, not-yet-cancelled enquiry rows, and only the
  -- first row of a group submission (see note above). Admin's explicit
  -- override skips this entirely.
  if new.trip_id is null
     or new.cancelled_at is not null
     or coalesce(new.bypass_capacity_check, false)
     or (new.group_seq is not null and new.group_seq > 1) then
    return new;
  end if;

  -- Lock the trip row for the rest of this transaction so two concurrent
  -- submissions for the same trip are serialized instead of both reading
  -- the same "seats left" and both slipping through.
  select seats_booked, total_seats
    into v_seats_booked, v_total_seats
    from public.upcoming_trips
   where id = new.trip_id
     for update;

  -- Trip not found (e.g. an enquiry snapshotted against a since-archived
  -- completed_trips id) or no capacity configured on this trip — nothing to
  -- enforce.
  if v_total_seats is null then
    return new;
  end if;

  v_real_remaining := greatest(v_total_seats - coalesce(v_seats_booked, 0), 0);
  v_requested_seats := coalesce(new.group_size, 1);

  if v_requested_seats > v_real_remaining then
    raise exception 'SEATS_UNAVAILABLE: only % seat(s) actually left for this trip (requested %).',
      v_real_remaining, v_requested_seats;
  end if;

  return new;
end;
$function$;

-- Runs alongside the existing on_enquiries_capacity_check (enforce_trip_capacity,
-- which only fires on the amount_paid 0→>0 transition) — the two don't
-- overlap in practice since no insert path sets amount_paid > 0 directly,
-- but naming this later alphabetically keeps trigger order predictable if
-- that ever changes.
create trigger on_enquiries_capacity_check_at_submit
  before insert on public.enquiries
  for each row execute function public.enforce_enquiry_capacity_or_waitlist();
