-- =============================================================================
-- add_public_insert_privilege_guard.sql
-- =============================================================================
-- WHY THIS MIGRATION EXISTS
--
-- Security audit finding: "Public insert enquiries"/"Public insert waitlist"
-- use `with check (true)`, which only validates the row-level condition —
-- it does NOT restrict which columns an insert may set. There are no
-- column-level GRANTs limiting the anon/authenticated roles either, so a
-- request made directly against PostgREST (bypassing the app's own
-- BookingForm/WaitlistForm entirely) could set columns that were only ever
-- meant to be written by trusted server-side logic or by an admin:
--
--   enquiries.bypass_capacity_check — documented as "admin-only escape
--     hatch... always false on the public form, which never sets it", but
--     nothing stopped a raw request from setting it true, which skips
--     enforce_enquiry_capacity_or_waitlist() entirely.
--   enquiries.amount_paid / is_paid — upcoming_trips.seats_booked is
--     derived (via recompute_trip_seats()) from `amount_paid > 0`, and
--     enquiries_amount_paid_check only constrains amount_paid when
--     total_amount is set (which the public form never sets). A raw insert
--     with amount_paid > 0 registers as a real, seat-occupying "paid"
--     booking with no actual payment behind it.
--   enquiries.status / booking_status / journey_stage / source — all meant
--     to be system-computed or admin-set, not public input.
--   waitlist.status / notified_at / offer_expiry / converted_enquiry_id —
--     on_waitlist_status_change (enforce_waitlist_conversion) only fires
--     BEFORE UPDATE, so it never runs on INSERT. A raw insert could set
--     status = 'converted' (or 'notified' with a fabricated offer_expiry)
--     with none of that trigger's real checks applied.
--
-- FIX
--
-- A BEFORE INSERT trigger on each table forces every trusted-only column
-- back to its safe default whenever the inserting role is not an
-- authenticated admin (auth.role() <> 'authenticated'). Admin-authored
-- inserts (createManualEnquiry, etc.) are completely unaffected — this
-- only clamps values on unauthenticated (public) inserts. It is additive:
-- it changes no existing column, constraint, or trigger. Trigger name is
-- prefixed "aaa_" so it runs before every other BEFORE INSERT trigger
-- already on these tables (Postgres fires same-timing triggers in name
-- order), guaranteeing the clamp happens before enforce_trip_capacity(),
-- enforce_enquiry_capacity_or_waitlist(), and enforce_trip_age_eligibility()
-- ever see the row.
-- =============================================================================

create or replace function public.aaa_sanitize_public_enquiry_insert()
returns trigger
language plpgsql
as $function$
begin
  if auth.role() <> 'authenticated' then
    new.amount_paid             := 0;
    new.is_paid                 := false;
    new.bypass_capacity_check   := false;
    new.status                  := 'new';
    new.booking_status          := null;
    new.journey_stage           := 'new_enquiry';
    new.third_party_charges     := null;
    new.checked_in_at           := null;
    new.cancelled_at            := null;
    new.is_no_show              := false;
    new.refund_amount           := 0;
    new.suggested_refund_amount := null;
    new.deleted_at              := null;
    new.booking_state           := 'active';
    new.booking_id              := null;
    -- source is left as whatever the public form legitimately sends, but
    -- clamped to the one value a real public submission can ever have.
    if new.source is distinct from 'website' then
      new.source := 'website';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists aaa_sanitize_public_enquiry_insert on public.enquiries;
create trigger aaa_sanitize_public_enquiry_insert
  before insert on public.enquiries
  for each row execute function public.aaa_sanitize_public_enquiry_insert();


create or replace function public.aaa_sanitize_public_waitlist_insert()
returns trigger
language plpgsql
as $function$
begin
  if auth.role() <> 'authenticated' then
    new.status               := 'waiting';
    new.notified_at          := null;
    new.offer_expiry         := null;
    new.converted_enquiry_id := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists aaa_sanitize_public_waitlist_insert on public.waitlist;
create trigger aaa_sanitize_public_waitlist_insert
  before insert on public.waitlist
  for each row execute function public.aaa_sanitize_public_waitlist_insert();
