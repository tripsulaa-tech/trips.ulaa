-- ============================================================================
-- ULAA — Age eligibility enforcement at the database level
-- Run this once in Supabase → SQL Editor, AFTER add_trip_age_range.sql.
--
-- Context: min_age/max_age (add_trip_age_range.sql) were only enforced by
-- the public form's client-side validation (validateAge in
-- src/utils/formValidation.ts) — nothing stopped a row outside that range
-- from being inserted directly (a manual admin entry, a bulk waitlist
-- conversion, or the client-side check simply being bypassed). Duplicate
-- submissions already have this kind of belt-and-suspenders protection —
-- a unique index that fires regardless of how the row gets inserted, with
-- app code catching it and surfacing a friendly message (see
-- add_duplicate_submission_constraints.sql and submitEnquiry/
-- submitWaitlist in src/services/api.ts). This adds the same shape of
-- protection for age eligibility.
--
-- A BEFORE INSERT trigger on both enquiries and waitlist looks up the
-- referenced trip's min_age/max_age from upcoming_trips and rejects the
-- row if age falls outside it. INSERT-only (not UPDATE) — matching where
-- age is actually set today (submission time), not something edited
-- afterward — so admins can still freely correct/edit an existing row's
-- age from Admin without being blocked retroactively.
--
-- Fails open, on purpose, whenever there's nothing to check against:
--   - NEW.age is null (age isn't required on every manual/admin entry)
--   - NEW.trip_id is null (a general enquiry with no trip attached)
--   - trip_id doesn't match a row in upcoming_trips (the trip has since
--     moved to completed_trips, or trip_id points elsewhere) — same
--     "PII-free, never blocks on a lookup miss" spirit as
--     get_waitlist_reserved_counts.
--   - the matched trip has no min_age/max_age configured at all (falls
--     back to unrestricted at the DB level; the app's default 18-65 rule
--     is a client-side-only fallback, deliberately not duplicated here so
--     an admin can still hand-enter an exception outside 18-65 for a trip
--     that was never given an explicit range)
--
-- The exception message is a plain marker ('AGE_NOT_ELIGIBLE') rather than
-- a human-readable sentence, the same way DUPLICATE_ENQUIRY /
-- DUPLICATE_WAITLIST_ENTRY work — the app catches it and supplies its own
-- friendly copy (see submitEnquiry/submitGroupEnquiry/submitWaitlist/
-- createManualEnquiry in src/services/api.ts).
-- ============================================================================

create or replace function public.enforce_trip_age_eligibility()
returns trigger
language plpgsql
as $function$
declare
  v_min_age integer;
  v_max_age integer;
begin
  if new.age is null or new.trip_id is null then
    return new;
  end if;

  select min_age, max_age into v_min_age, v_max_age
  from public.upcoming_trips
  where id = new.trip_id;

  if not found then
    return new;
  end if;

  if (v_min_age is not null and new.age < v_min_age)
     or (v_max_age is not null and new.age > v_max_age) then
    raise exception 'AGE_NOT_ELIGIBLE';
  end if;

  return new;
end;
$function$;

drop trigger if exists enquiries_enforce_age_eligibility on public.enquiries;
create trigger enquiries_enforce_age_eligibility
  before insert on public.enquiries
  for each row execute function public.enforce_trip_age_eligibility();

drop trigger if exists waitlist_enforce_age_eligibility on public.waitlist;
create trigger waitlist_enforce_age_eligibility
  before insert on public.waitlist
  for each row execute function public.enforce_trip_age_eligibility();
