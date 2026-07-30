-- ============================================================================
-- ULAA — Supabase schema (public schema)
--
-- This file is a snapshot of the LIVE database, regenerated from direct
-- introspection (information_schema + pg_catalog) on 2026-07-24, then hand-
-- updated on 2026-07-26 to add the waitlist-conversion + seat-integrity
-- migration (converted_enquiry_id column, enforce_waitlist_conversion,
-- recompute_trip_seats, trg_enquiries_seat_sync, enforce_trip_capacity, and
-- their triggers). It is documentation only — nothing here is applied
-- automatically. To change the live schema, run SQL directly in Supabase →
-- SQL Editor, then update this file to match.
--
-- Previous versions of this file were reconstructed from app code and had
-- several gaps (missing column defaults, missing check constraints, unclear
-- FK targets, incomplete trigger/function bindings, a missing RLS delete
-- policy on `enquiries`). All of those are resolved below.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
-- pg_net              0.20.4  -- used by notify_new_enquiry() to call the send-push edge function
-- pg_stat_statements  1.11    -- query performance stats (Supabase default)
-- pgcrypto            1.3     -- gen_random_uuid()
-- plpgsql             1.0     -- procedural language
-- supabase_vault      0.3.1   -- used by notify_new_enquiry() to read the edge_function_secret
-- uuid-ossp           1.1     -- uuid_generate_v4()


-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- completed_trips
-- ----------------------------------------------------------------------------
create table public.completed_trips (
  id                     uuid not null default uuid_generate_v4(),
  title                  text not null,
  destination            text not null,
  slug                   text not null,
  trip_date              date not null,
  description            text not null,
  story                  text,
  participants           integer default 0,
  cover_image            text,
  gallery_images         text[] default '{}'::text[],
  is_published           boolean default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  batch                  text,
  map_url                text,
  trip_type              text,
  original_itinerary     jsonb,
  original_highlights    text[],
  original_included      text[],
  original_not_included  text[],
  -- Public-facing like count on the album page — see
  -- add_completed_trip_likes.sql for the increment/decrement RPCs that are
  -- the only public-safe way to change this (direct updates still require
  -- an admin session, same as every other column here).
  likes_count            integer not null default 0,
  constraint completed_trips_pkey primary key (id),
  constraint completed_trips_slug_key unique (slug),
  constraint completed_trips_trip_type_check
    check (trip_type = any (array['domestic'::text, 'international'::text])),
  constraint completed_trips_likes_count_check check (likes_count >= 0)
);

-- ----------------------------------------------------------------------------
-- upcoming_trips
-- ----------------------------------------------------------------------------
create table public.upcoming_trips (
  id                      uuid not null default uuid_generate_v4(),
  title                   text not null,
  destination             text not null,
  slug                    text not null,
  start_date              date not null,
  end_date                date not null,
  duration                text not null,
  description             text not null,
  highlights              text[] default '{}'::text[],
  itinerary               jsonb default '[]'::jsonb,
  included                text[] default '{}'::text[],
  not_included            text[] default '{}'::text[],
  things_to_carry         text[] default '{}'::text[],
  meeting_point           text,
  faqs                    jsonb default '[]'::jsonb,
  total_seats             integer not null default 20,
  seats_booked            integer not null default 0,
  price                   numeric(10, 2),
  cover_image             text,
  gallery_images          text[] default '{}'::text[],
  is_published            boolean default false,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  early_bird_price        numeric(10, 2),
  early_bird_deadline     date,
  meeting_point_map_url   text,
  terms_and_conditions    text,
  trip_type               text,
  cancellation_policy     jsonb,
  -- Independent "was ₹X" marketing price — shown crossed out next to
  -- whichever price (regular or early-bird) is currently active, instead of
  -- always crossing out the regular price during early-bird only. Optional;
  -- see add_strike_through_price.sql and getStrikeThroughPrice in
  -- src/utils/index.ts for the fallback when it's left unset.
  strike_through_price    numeric(10, 2),
  -- Optional per-trip age eligibility range shown/enforced on the public
  -- Book Your Seat / Join Waitlist forms. Either side left null means that
  -- side is unrestricted; both null falls back to the app's default 18-65
  -- rule — see add_trip_age_range.sql and validateAge in
  -- src/utils/formValidation.ts.
  min_age                 integer,
  max_age                 integer,
  -- Optional structured assembly-point logistics shown alongside
  -- meeting_point on the public trip page and the itinerary PDF. See
  -- add_trip_meeting_point_details.sql.
  meeting_time            text,
  meeting_terminal        text,
  meeting_details         text,
  -- Extended content blocks collected by Admin → Trips → Add/Edit Trip
  -- (Overview & Itinerary / Accommodation / Founder / End Banner tabs).
  -- See add_trip_extended_content_blocks.sql for the full rationale.
  highlight_cards         jsonb default '[]'::jsonb,
  accommodation_description text,
  accommodation_photos    text[] default '{}'::text[],
  included_items          jsonb default '[]'::jsonb,
  not_included_items      jsonb default '[]'::jsonb,
  gallery_items           jsonb default '[]'::jsonb,
  fashion_photos          text[] default '{}'::text[],
  trip_founder            jsonb,
  confidence_items        jsonb default '[]'::jsonb,
  confidence_description  text,
  meeting_address         text,
  end_banner              jsonb,
  constraint upcoming_trips_pkey primary key (id),
  constraint upcoming_trips_slug_key unique (slug),
  constraint upcoming_trips_trip_type_check
    check (trip_type = any (array['domestic'::text, 'international'::text])),
  constraint upcoming_trips_strike_through_price_check
    check (strike_through_price is null or strike_through_price >= 0),
  constraint upcoming_trips_min_age_check
    check (min_age is null or min_age >= 0),
  constraint upcoming_trips_max_age_check
    check (max_age is null or max_age >= 0),
  constraint upcoming_trips_age_range_check
    check (min_age is null or max_age is null or min_age <= max_age),
  -- Prevents recompute_trip_seats() from storing a negative count if a
  -- cancellation/refund trigger fires in an unexpected order.
  constraint upcoming_trips_seats_booked_nonneg
    check (seats_booked >= 0)
);

-- ----------------------------------------------------------------------------
-- enquiries
-- ----------------------------------------------------------------------------
-- trip_id is intentionally NOT a foreign key: it can point to either
-- upcoming_trips.id or completed_trips.id (or be null for a general
-- enquiry), so there's no single table it can reference.
create table public.enquiries (
  id                        uuid not null default uuid_generate_v4(),
  full_name                 text not null,
  age                       integer,
  phone                     text not null,
  email                     text not null,
  city                      text,
  emergency_contact         text,
  message                   text,
  trip_id                   uuid,
  trip_title                text,
  status                    text default 'new'::text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  source                    text not null default 'website'::text,
  is_paid                   boolean not null default false,
  package_type              text not null default 'normal'::text,
  total_amount              numeric(10, 2),
  amount_paid                numeric(10, 2) not null default 0,
  terms_accepted            boolean not null default false,
  cancelled_at              timestamptz,
  refund_amount             numeric(10, 2) not null default 0,
  trip_type                 text,
  departure_date            date,
  booking_amount            numeric not null default 0,
  third_party_charges       numeric,
  is_no_show                boolean not null default false,
  suggested_refund_amount   numeric,
  booking_status            text,
  balance_due_date          date,
  -- Group bookings: a "Group" submission from the public booking form
  -- inserts one row per seat, all sharing group_id/group_size. group_seq is
  -- each row's 1-based position within that group (solo bookings are always
  -- group_seq = 1). See add_group_bookings.sql for the full rationale.
  group_id                  uuid,
  group_size                integer,
  group_seq                 integer not null default 1,
  -- Admin-only escape hatch from enforce_enquiry_capacity_or_waitlist()
  -- (see add_enquiry_capacity_enforcement.sql) — always false on the public
  -- form, which never sets it.
  bypass_capacity_check     boolean not null default false,
  -- Soft-delete timestamp: NULL means the row is live. When set, the row is
  -- hidden from all normal queries (getEnquiries filters deleted_at IS NULL)
  -- but the data and payment history are preserved for recovery. See
  -- add_soft_delete_enquiries.sql.
  deleted_at                timestamptz,
  constraint enquiries_pkey primary key (id),
  constraint enquiries_status_check
    check (status = any (array['new'::text, 'contacted'::text, 'closed'::text])),
  constraint enquiries_source_check
    check (source = any (array['website'::text, 'whatsapp'::text, 'phone'::text, 'instagram'::text, 'walk_in'::text, 'other'::text])),
  constraint enquiries_package_type_check
    check (package_type = any (array['early_bird'::text, 'normal'::text])),
  constraint enquiries_trip_type_check
    check (trip_type is null or trip_type = any (array['domestic'::text, 'international'::text])),
  constraint enquiries_amount_paid_check
    check (total_amount is null or amount_paid <= total_amount),
  constraint enquiries_booking_status_check
    check (booking_status is null or booking_status = any (array[
      'booking_confirmed'::text, 'balance_pending'::text, 'fully_paid'::text,
      'cancelled'::text, 'completed'::text
    ])),
  constraint enquiries_group_size_check
    check (group_size is null or group_size >= 2),
  constraint enquiries_group_seq_check
    check (group_seq >= 1)
);

create index enquiries_is_paid_idx on public.enquiries using btree (is_paid);
create index enquiries_source_idx on public.enquiries using btree (source);
create index enquiries_group_id_idx on public.enquiries using btree (group_id);

-- Duplicate-submission protection, keyed so group bookings (N rows sharing
-- identical name/phone/email/trip by design) can coexist — see
-- add_duplicate_submission_constraints.sql and add_group_bookings.sql.
-- The partial index also excludes soft-deleted rows so a deleted enquiry
-- doesn't block re-submission with the same contact details.
create unique index enquiries_trip_name_phone_email_active_unique
  on public.enquiries (trip_id, lower(trim(full_name)), phone, lower(trim(email)), group_seq)
  where (cancelled_at is null and deleted_at is null);

-- ----------------------------------------------------------------------------
-- payments
-- ----------------------------------------------------------------------------
create table public.payments (
  id              uuid not null default gen_random_uuid(),
  enquiry_id      uuid not null,
  amount          numeric not null,
  payment_type    text not null,
  payment_method  text,
  paid_at         timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now(),
  constraint payments_pkey primary key (id),
  constraint payments_enquiry_id_fkey foreign key (enquiry_id)
    references public.enquiries (id) on delete cascade,
  constraint payments_payment_type_check
    check (payment_type = any (array['booking_amount'::text, 'balance'::text, 'installment'::text, 'refund'::text]))
);

create index payments_enquiry_id_idx on public.payments using btree (enquiry_id);
create index payments_paid_at_idx on public.payments using btree (paid_at desc);

-- ----------------------------------------------------------------------------
-- waitlist
-- ----------------------------------------------------------------------------
-- trip_id is intentionally NOT a foreign key, same reasoning as
-- enquiries.trip_id: upcoming_trips rows get deleted/replaced by
-- completed_trips once a trip finishes, and we still want the historical
-- waitlist record to remain queryable.
create table public.waitlist (
  id                    uuid not null default uuid_generate_v4(),
  trip_id               uuid not null,
  trip_title            text,
  full_name             text not null,
  phone                 text not null,
  email                 text not null,
  message               text,
  status                text not null default 'waiting'::text,
  notified_at           timestamptz,
  -- Set once this entry is converted into a real, paid booking (see
  -- markWaitlistConverted in api.ts). NOT a foreign key to enquiries in the
  -- sense of enforcing existence at insert time via app code, but IS a real
  -- FK constraint here — unlike trip_id, enquiries rows are never deleted
  -- out from under an old waitlist record the way upcoming_trips rows are,
  -- so this one is safe to enforce. on delete set null so a later manual
  -- delete of the enquiry doesn't block deleting this row.
  converted_enquiry_id  uuid references public.enquiries (id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint waitlist_pkey primary key (id),
  constraint waitlist_status_check
    check (status = any (array['waiting'::text, 'notified'::text, 'converted'::text, 'declined'::text])),
  -- Prevents the same person from spamming the same sold-out trip's
  -- waitlist with repeat submissions.
  constraint waitlist_trip_email_unique unique (trip_id, email)
);

create index waitlist_trip_id_idx on public.waitlist using btree (trip_id);
create index waitlist_status_idx on public.waitlist using btree (status);
create index waitlist_created_at_idx on public.waitlist using btree (created_at desc);
create index waitlist_converted_enquiry_id_idx on public.waitlist using btree (converted_enquiry_id);

-- ----------------------------------------------------------------------------
-- gallery
-- ----------------------------------------------------------------------------
create table public.gallery (
  id            uuid not null default uuid_generate_v4(),
  image_url     text not null,
  alt_text      text,
  destination   text,
  sort_order    integer default 0,
  is_featured   boolean default false,
  created_at    timestamptz default now(),
  constraint gallery_pkey primary key (id)
);

-- ----------------------------------------------------------------------------
-- trip_images
-- ----------------------------------------------------------------------------
-- trip_id is intentionally NOT a foreign key, same reasoning as
-- enquiries.trip_id: it's polymorphic across upcoming_trips/completed_trips,
-- disambiguated by the trip_type column.
create table public.trip_images (
  id            uuid not null default uuid_generate_v4(),
  trip_id       uuid not null,
  trip_type     text not null,
  image_url     text not null,
  alt_text      text,
  sort_order    integer default 0,
  is_cover      boolean default false,
  created_at    timestamptz default now(),
  constraint trip_images_pkey primary key (id),
  constraint trip_images_trip_type_check
    check (trip_type = any (array['upcoming'::text, 'completed'::text, 'gallery'::text]))
);

-- ----------------------------------------------------------------------------
-- testimonials
-- ----------------------------------------------------------------------------
create table public.testimonials (
  id            uuid not null default uuid_generate_v4(),
  name          text not null,
  photo         text,
  review        text not null,
  rating        integer default 5,
  destination   text,
  is_published  boolean default true,
  sort_order    integer default 0,
  created_at    timestamptz default now(),
  constraint testimonials_pkey primary key (id),
  constraint testimonials_rating_check check (rating >= 1 and rating <= 5)
);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table public.notifications (
  id            uuid not null default uuid_generate_v4(),
  type          text not null,
  title         text not null,
  body          text,
  link          text,
  is_read       boolean default false,
  created_at    timestamptz default now(),
  constraint notifications_pkey primary key (id)
);

create index notifications_created_at_idx on public.notifications using btree (created_at desc);
create index notifications_is_read_idx on public.notifications using btree (is_read) where (is_read = false);

-- ----------------------------------------------------------------------------
-- push_subscriptions
-- ----------------------------------------------------------------------------
-- admin_id is intentionally NOT a foreign key to auth.users — it's a bare
-- uuid column, scoped only by the RLS policy below (auth.uid() = admin_id).
create table public.push_subscriptions (
  id            uuid not null default uuid_generate_v4(),
  admin_id      uuid,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz default now(),
  constraint push_subscriptions_pkey primary key (id),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

-- ----------------------------------------------------------------------------
-- site_content
-- ----------------------------------------------------------------------------
-- Generic key/value store for editable page content (About, Why ULAA, etc).
create table public.site_content (
  key           text not null,
  content       jsonb not null,
  updated_at    timestamptz default now(),
  constraint site_content_pkey primary key (key)
);


-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Marks bookings as cancelled once their balance_due_date has passed without
-- being paid in full. Not wired to any DB trigger — invoke on a schedule
-- (pg_cron / a scheduled edge function) if this needs to run automatically.
create or replace function public.auto_cancel_unpaid_bookings()
returns void
language plpgsql
as $function$
begin
  update public.enquiries
     set booking_status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now())
   where balance_due_date is not null
     and balance_due_date < current_date
     and booking_status not in ('fully_paid', 'cancelled', 'completed');
end;
$function$;

-- Rejects an insert/update that would newly hold a seat (cancelled_at is
-- null and amount_paid > 0, having not been true before the change) on a
-- trip that's already at total_seats. Covers both a brand-new paid enquiry
-- and a reactivation (uncancel) of an old one — previously a reactivation
-- could silently overbook, since the seats_booked counter just capped at
-- total_seats without stopping the enquiry itself from being marked booked.
--
-- `for update` below locks the trip's upcoming_trips row for the rest of
-- this transaction. Without it, two payments for the same trip recorded at
-- nearly the same moment (e.g. Bulk Save firing several recordPayment calls
-- concurrently, or two people paying at once) each read the same
-- not-yet-updated seats_booked value, both pass the check, and both get
-- admitted — overbooking the trip past total_seats. Locking forces the
-- second transaction to wait until the first commits (and the seat-sync
-- trigger has recomputed seats_booked) before it reads the count, so the
-- check always sees an up-to-date value.
create or replace function public.enforce_trip_capacity()
returns trigger
language plpgsql
as $function$
declare
  v_becomes_booked boolean := (new.cancelled_at is null and new.amount_paid > 0);
  v_was_booked boolean := (tg_op = 'UPDATE' and old.cancelled_at is null and old.amount_paid > 0);
  v_seats_booked int;
  v_total_seats int;
begin
  if new.trip_id is not null and v_becomes_booked and not v_was_booked then
    select seats_booked, total_seats into v_seats_booked, v_total_seats
    from public.upcoming_trips where id = new.trip_id
    for update;

    if v_total_seats is not null and v_seats_booked >= v_total_seats then
      raise exception 'This trip has no seats left (% / % booked).', v_seats_booked, v_total_seats;
    end if;
  end if;
  return new;
end;
$function$;

-- Enforces capacity at plain enquiry SUBMISSION time, not just at payment
-- time. enforce_trip_capacity() above only rejects the amount_paid 0→>0
-- transition, so an ordinary (unpaid) public-form enquiry was never checked
-- against capacity at the DB level — the enquiry-vs-waitlist decision lived
-- entirely in the browser (BookingForm's remainingSeats, computed once on
-- page load) and could go stale if seats filled up while the form was still
-- open. This locks the trip row and checks the request (1 seat for solo,
-- group_size for a group) against the trip's real, current
-- seats_booked/total_seats, raising a plain 'SEATS_UNAVAILABLE' marker
-- (matched by src/services/api.ts, same convention as AGE_NOT_ELIGIBLE) so
-- the UI can fall back to a waitlist signup instead of failing outright.
-- See add_enquiry_capacity_enforcement.sql for the full rationale.
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
  -- first row of a group submission — a group inserts one row per seat in
  -- a single multi-row INSERT (see submitGroupEnquiry in api.ts), so
  -- checking group_seq = 1 against the full group_size (rather than
  -- checking every row against just 1 seat) rejects/accepts the whole
  -- group atomically. Admin's explicit override skips this entirely.
  if new.trip_id is null
     or new.cancelled_at is not null
     or coalesce(new.bypass_capacity_check, false)
     or (new.group_seq is not null and new.group_seq > 1) then
    return new;
  end if;

  select seats_booked, total_seats
    into v_seats_booked, v_total_seats
    from public.upcoming_trips
   where id = new.trip_id
     for update;

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

-- Rejects an insert into enquiries/waitlist whose age falls outside the
-- referenced trip's optional min_age/max_age (see add_trip_age_range.sql).
-- Fails open whenever there's nothing to check (age/trip_id missing, no
-- matching upcoming_trips row, or the trip has no range configured) — see
-- add_trip_age_eligibility_enforcement.sql for the full rationale. Message
-- is a plain marker, not prose; src/services/api.ts catches it and supplies
-- friendly copy, same pattern as the DUPLICATE_ENQUIRY/
-- DUPLICATE_WAITLIST_ENTRY unique-violation handling.
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

-- Enforces the waitlist "converted" status can only be set/unset correctly:
-- moving TO converted requires a converted_enquiry_id pointing at an
-- enquiry that actually has amount_paid > 0 (blocks marking someone
-- converted straight from the status dropdown with no real booking behind
-- it). Moving AWAY from converted is blocked while any linked enquiry is
-- still an active (non-cancelled) booking — the booking itself may only be
-- changed from the Enquiries screen, never by flipping this dropdown.
--
-- Updated to use converted_enquiry_ids (array) instead of the legacy
-- converted_enquiry_id (singular) — see add_waitlist_partial_group_conversion.sql.
create or replace function public.enforce_waitlist_conversion()
returns trigger
language plpgsql
as $function$
declare
  v_needed int := greatest(coalesce(new.group_size, 1), 1);
begin
  -- Whenever the array of linked enquiry ids changes, every id in it must
  -- point at an enquiry that actually has an advance payment on it.
  if new.converted_enquiry_ids is distinct from old.converted_enquiry_ids then
    if exists (
      select 1 from unnest(new.converted_enquiry_ids) eid
      where not exists (select 1 from public.enquiries where id = eid and amount_paid > 0)
    ) then
      raise exception 'Cannot link a conversion without an advance payment recorded on that enquiry.';
    end if;
  end if;

  -- Moving TO 'converted' requires the full group's worth of linked, paid
  -- enquiries (not just the first one).
  if new.status = 'converted' and old.status is distinct from 'converted' then
    if coalesce(array_length(new.converted_enquiry_ids, 1), 0) < v_needed then
      raise exception 'Cannot mark converted until all % seat(s) in this group are linked to a paid enquiry.', v_needed;
    end if;
  end if;

  -- Moving AWAY from 'converted' is blocked while any linked enquiry is
  -- still an active (non-cancelled) booking.
  if old.status = 'converted' and new.status is distinct from 'converted' then
    if exists (
      select 1 from unnest(old.converted_enquiry_ids) eid
      where exists (select 1 from public.enquiries where id = eid and cancelled_at is null)
    ) then
      raise exception 'This waitlist entry is linked to an active booking. Cancel the booking in Enquiries first.';
    end if;
  end if;

  return new;
end;
$function$;

-- Fires after a new enquiry is inserted: creates an in-app notification row
-- and best-effort fires a push notification via the send-push edge
-- function. The push call is wrapped so it can never block the enquiry
-- insert if it fails.
create or replace function public.notify_new_enquiry()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  target_link text;
begin
  target_link := '/admin/enquiries?trip=' || coalesce(new.trip_id::text, 'unlinked')
                 || '&enquiry=' || new.id::text;

  insert into notifications (type, title, body, link)
  values (
    'new_enquiry',
    'New enquiry from ' || new.full_name,
    coalesce(new.trip_title, 'General enquiry') || ' · ' || new.email,
    target_link
  );

  begin
    perform net.http_post(
      url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'edge_function_secret' limit 1
        )
      ),
      body := jsonb_build_object(
        'title', 'New enquiry from ' || new.full_name,
        'body', coalesce(new.trip_title, 'General enquiry') || ' · ' || new.email,
        'link', target_link
      )
    );
  exception when others then
    raise warning 'send-push call failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

-- Fires after a new waitlist signup is inserted: same shape as
-- notify_new_enquiry() above — creates an in-app notification row and
-- best-effort fires a push notification. Wrapped so a push failure can
-- never block the waitlist insert.
create or replace function public.notify_new_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  target_link text;
begin
  target_link := '/admin/waitlist?trip=' || new.trip_id::text;

  insert into notifications (type, title, body, link)
  values (
    'new_waitlist',
    'Waitlist signup from ' || new.full_name,
    coalesce(new.trip_title, 'A trip') || ' · ' || new.email,
    target_link
  );

  begin
    perform net.http_post(
      url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'edge_function_secret' limit 1
        )
      ),
      body := jsonb_build_object(
        'title', 'Waitlist signup from ' || new.full_name,
        'body', coalesce(new.trip_title, 'A trip') || ' · ' || new.email,
        'link', target_link
      )
    );
  exception when others then
    raise warning 'send-push call failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

-- Fires after a trip's seats_booked count DROPS (i.e. a cancellation freed
-- up a seat). If that trip still has anyone 'waiting' on the waitlist,
-- drops an admin notification + push. Deliberately does NOT auto-email/SMS
-- the waitlisted person — there's no outbound email/SMS service wired up
-- in this app; the actual outreach stays a manual step for the admin.
create or replace function public.notify_seat_available()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  waiting_count integer;
  target_link text;
  recent_exists boolean;
begin
  if new.seats_booked >= old.seats_booked then
    return new;
  end if;

  select count(*) into waiting_count
    from public.waitlist
   where trip_id = new.id
     and status = 'waiting';

  if waiting_count = 0 then
    return new;
  end if;

  -- Deduplication: skip if a seat_available notification for this same trip
  -- was already created within the last 30 seconds (e.g. two concurrent
  -- cancellations both firing this trigger). The admin still sees one
  -- notification — just not a duplicate.
  select exists (
    select 1 from public.notifications
     where type = 'seat_available'
       and link like '%' || new.id::text || '%'
       and created_at > now() - interval '30 seconds'
  ) into recent_exists;

  if recent_exists then
    return new;
  end if;

  target_link := '/admin/waitlist?trip=' || new.id::text;

  insert into notifications (type, title, body, link)
  values (
    'seat_available',
    'A seat opened up on ' || new.title,
    waiting_count || ' ' || (case when waiting_count = 1 then 'person is' else 'people are' end)
      || ' waiting for this trip',
    target_link
  );

  begin
    perform net.http_post(
      url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'edge_function_secret' limit 1
        )
      ),
      body := jsonb_build_object(
        'title', 'A seat opened up on ' || new.title,
        'body', waiting_count || ' ' || (case when waiting_count = 1 then 'person is' else 'people are' end)
          || ' waiting for this trip',
        'link', target_link
      )
    );
  exception when others then
    raise warning 'send-push call failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

-- When a completed_trips row is inserted or updated, removes the matching
-- upcoming_trips row (a trip that's finished shouldn't still show as
-- upcoming). Used by sync_started_trip_albums() below.
create or replace function public.on_completed_trip_published()
returns trigger
language plpgsql
as $function$
begin
  delete from public.upcoming_trips where id = new.id;
  return new;
end;
$function$;

-- Public Like button on the album page (AlbumPage.tsx), deduped per
-- anonymous visitor since the public site has no login.
--
-- completed_trip_likes holds one row per (trip, visitor) — visitor_id is a
-- random UUID the client generates once and keeps in localStorage (see
-- getVisitorId in src/utils/utils-index.ts). The primary key on
-- (trip_id, visitor_id) is what actually stops a second like from the same
-- visitor: even a hand-crafted request re-using the same visitor_id gets
-- rejected by the DB itself, not just by a client-side flag. Clearing
-- localStorage does get a visitor a fresh id (and so a fresh like) — same
-- inherent limit any anonymous, no-login like button has — but that's a
-- meaningfully higher bar than trusting the browser alone.
create table public.completed_trip_likes (
  trip_id     uuid not null references public.completed_trips (id) on delete cascade,
  visitor_id  text not null,
  created_at  timestamptz not null default now(),
  constraint completed_trip_likes_pkey primary key (trip_id, visitor_id)
);

alter table public.completed_trip_likes enable row level security;

-- No accounts, so there's no user to scope these to — visitor_id itself is
-- the "capability": the public can only insert/delete a row it already
-- knows the id of, which in practice comes from the like RPCs below.
create policy "Public insert completed trip likes" on public.completed_trip_likes
  for insert with check (true);
create policy "Public delete completed trip likes" on public.completed_trip_likes
  for delete using (true);
create policy "Admin read completed trip likes" on public.completed_trip_likes
  for select using (auth.role() = 'authenticated');

-- Recomputes completed_trips.likes_count for one trip from real rows in
-- completed_trip_likes — mirrors recompute_trip_seats()'s "trust the
-- actual rows, not incremental +/-1 calls" pattern, so the count self-heals
-- even if some future code path forgets to adjust it manually.
create or replace function public.recompute_completed_trip_likes(p_trip_id uuid)
returns integer
language plpgsql
as $function$
declare
  new_count integer;
begin
  update public.completed_trips t
     set likes_count = (
       select count(*) from public.completed_trip_likes l
        where l.trip_id = p_trip_id
     )
   where t.id = p_trip_id
  returning likes_count into new_count;
  return new_count;
end;
$function$;

create or replace function public.trg_completed_trip_likes_sync()
returns trigger
language plpgsql
as $function$
begin
  perform public.recompute_completed_trip_likes(coalesce(new.trip_id, old.trip_id));
  return null;
end;
$function$;

create trigger on_completed_trip_likes_sync
  after insert or delete on public.completed_trip_likes
  for each row execute function public.trg_completed_trip_likes_sync();

-- Thin RPCs the client calls — insert/delete the dedupe row and hand back
-- the freshly-recomputed count in the same round trip, rather than the
-- client trusting its own optimistic math. "on conflict do nothing" means
-- a same-visitor double-click is a harmless no-op, not an error.
create or replace function public.like_completed_trip(p_trip_id uuid, p_visitor_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.completed_trip_likes (trip_id, visitor_id)
  values (p_trip_id, p_visitor_id)
  on conflict (trip_id, visitor_id) do nothing;
  return public.recompute_completed_trip_likes(p_trip_id);
end;
$function$;

create or replace function public.unlike_completed_trip(p_trip_id uuid, p_visitor_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
begin
  delete from public.completed_trip_likes
   where trip_id = p_trip_id and visitor_id = p_visitor_id;
  return public.recompute_completed_trip_likes(p_trip_id);
end;
$function$;

-- When an enquiry's cancelled_at transitions from null to set, computes and
-- stamps the suggested refund amount and flips booking_status to cancelled.
create or replace function public.on_enquiry_cancelled()
returns trigger
language plpgsql
as $function$
begin
  if new.cancelled_at is not null and old.cancelled_at is null then
    new.suggested_refund_amount := public.suggest_refund_amount(new.id, new.cancelled_at::date);
    new.booking_status := 'cancelled';
  end if;
  return new;
end;
$function$;

-- Recomputes upcoming_trips.seats_booked for one trip from the actual
-- enquiries that hold a seat (not cancelled, amount_paid > 0), rather than
-- trusting the app's incremental +/-1 calls. Called by
-- trg_enquiries_seat_sync() below after any enquiries change, so the count
-- self-heals even if some future code path forgets to adjust it manually.
create or replace function public.recompute_trip_seats(p_trip_id uuid)
returns void
language plpgsql
as $function$
begin
  update public.upcoming_trips t
     set seats_booked = (
       select count(*) from public.enquiries e
        where e.trip_id = p_trip_id
          and e.cancelled_at is null
          and e.deleted_at  is null   -- exclude soft-deleted rows
          and e.amount_paid > 0
     )
   where t.id = p_trip_id;
end;
$function$;

-- Event trigger (not a per-table trigger): automatically enables RLS on any
-- new table created in the public schema, so RLS is never forgotten.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog', 'information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$function$;

-- Before inserting an enquiry with a trip_id but no explicit trip_type,
-- looks up the trip's type from whichever of upcoming_trips/completed_trips
-- it belongs to and snapshots it onto the enquiry.
create or replace function public.set_enquiry_trip_type()
returns trigger
language plpgsql
as $function$
declare
  found_trip_type    text;
  found_departure    date;
begin
  if new.trip_id is not null and new.trip_type is null then
    select trip_type, departure_date
      into found_trip_type, found_departure
      from upcoming_trips where id = new.trip_id
    union all
    select trip_type, departure_date
      from completed_trips where id = new.trip_id
    limit 1;

    new.trip_type := found_trip_type;

    -- Snapshot departure_date if the caller didn't supply one.
    if new.departure_date is null then
      new.departure_date := found_departure;
    end if;

    -- Auto-compute balance_due_date: 30 days before departure for domestic,
    -- 45 days for international. Only set when not already provided.
    if new.balance_due_date is null and new.departure_date is not null then
      if found_trip_type = 'domestic' then
        new.balance_due_date := (new.departure_date - interval '30 days')::date;
      elsif found_trip_type = 'international' then
        new.balance_due_date := (new.departure_date - interval '45 days')::date;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

-- Computes a suggested refund based on the trip's snapshotted departure
-- date, trip_type-specific cancellation windows, amount already paid
-- (minus the non-refundable booking_amount), and any third-party charges
-- to deduct. Returns null if the enquiry has no departure_date/trip_type
-- snapshotted yet.
create or replace function public.suggest_refund_amount(
  p_enquiry_id uuid,
  p_as_of_date date default current_date
)
returns numeric
language plpgsql
as $function$
declare
  e record;
  days_before int;
  refundable_base numeric; -- amount_paid excluding the booking amount
  suggested numeric;
begin
  select trip_type, departure_date, amount_paid, booking_amount, third_party_charges
    into e
    from public.enquiries
   where id = p_enquiry_id;

  if e.departure_date is null or e.trip_type is null then
    return null; -- can't compute without a snapshotted departure date + trip type
  end if;

  days_before := e.departure_date - p_as_of_date;
  refundable_base := greatest(e.amount_paid - e.booking_amount, 0);

  if e.trip_type = 'domestic' then
    if days_before > 15 then
      suggested := 0;
    elsif days_before between 8 and 15 then
      suggested := refundable_base * 0.5 - coalesce(e.third_party_charges, 0);
    else -- 7 days or fewer, including day-of
      suggested := 0;
    end if;

  elsif e.trip_type = 'international' then
    if days_before > 45 then
      suggested := refundable_base; -- only booking_amount is forfeited
    elsif days_before between 31 and 45 then
      suggested := refundable_base - coalesce(e.third_party_charges, 0);
    else -- 30 days or fewer
      suggested := 0;
    end if;

  else
    return null;
  end if;

  return greatest(suggested, 0);
end;
$function$;

-- Keeps enquiries.amount_paid and enquiries.refund_amount in sync with the
-- sum of their payments rows, any time a payment is inserted, updated, or
-- deleted. refund_amount sums rows where payment_type = 'refund';
-- amount_paid sums everything else.
create or replace function public.sync_enquiry_amount_paid()
returns trigger
language plpgsql
as $function$
declare
  target_enquiry_id uuid;
  new_amount_paid numeric;
  new_refund_amount numeric;
begin
  target_enquiry_id := coalesce(new.enquiry_id, old.enquiry_id);

  select coalesce(sum(amount) filter (where payment_type != 'refund'), 0),
         coalesce(sum(amount) filter (where payment_type = 'refund'), 0)
    into new_amount_paid, new_refund_amount
    from public.payments
   where enquiry_id = target_enquiry_id;

  update public.enquiries
     set amount_paid = new_amount_paid,
         refund_amount = new_refund_amount
   where id = target_enquiry_id;

  return null;
end;
$function$;

-- Copies any upcoming_trips row whose start_date has passed into
-- completed_trips (as unpublished, ready for the admin to fill in a story /
-- publish), then un-publishes it from upcoming_trips. Not wired to a DB
-- trigger — invoke on a schedule (pg_cron / a scheduled edge function).
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

-- AFTER trigger on enquiries: recomputes seats_booked for whichever trip
-- was affected (insert/update/delete) using recompute_trip_seats() above,
-- so upcoming_trips.seats_booked is always derived from real data instead
-- of drifting from missed adjustTripSeats() calls in the app.
create or replace function public.trg_enquiries_seat_sync()
returns trigger
language plpgsql
as $function$
begin
  perform public.recompute_trip_seats(coalesce(new.trip_id, old.trip_id));
  return null;
end;
$function$;

-- Generic BEFORE UPDATE trigger function: stamps updated_at = now() on any
-- table it's attached to.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger update_completed_trips_updated_at
  before update on public.completed_trips
  for each row execute function public.update_updated_at();
create trigger completed_trip_published_cleanup_insert
  after insert on public.completed_trips
  for each row execute function public.on_completed_trip_published();
create trigger completed_trip_published_cleanup_update
  after update on public.completed_trips
  for each row execute function public.on_completed_trip_published();

create trigger update_upcoming_trips_updated_at
  before update on public.upcoming_trips
  for each row execute function public.update_updated_at();

create trigger enquiry_trip_type_from_trip
  before insert on public.enquiries
  for each row execute function public.set_enquiry_trip_type();
create trigger enquiry_cancelled_trigger
  before update on public.enquiries
  for each row execute function public.on_enquiry_cancelled();
create trigger update_enquiries_updated_at
  before update on public.enquiries
  for each row execute function public.update_updated_at();
create trigger on_enquiry_created
  after insert on public.enquiries
  for each row execute function public.notify_new_enquiry();
-- Must run before enquiry_cancelled_trigger/notify_new_enquiry care about
-- ordering — Postgres fires same-timing triggers alphabetically by name,
-- and "capacity" < "cancelled_trigger", so this rejects an overbooking
-- attempt before any other BEFORE trigger on the row runs.
create trigger on_enquiries_capacity_check
  before insert or update on public.enquiries
  for each row execute function public.enforce_trip_capacity();
-- Gates plain (unpaid) enquiry submission against live capacity — see
-- enforce_enquiry_capacity_or_waitlist() above. Named later alphabetically
-- than on_enquiries_capacity_check purely to keep trigger order predictable;
-- the two don't overlap in practice since no insert path sets amount_paid > 0
-- directly.
create trigger on_enquiries_capacity_check_at_submit
  before insert on public.enquiries
  for each row execute function public.enforce_enquiry_capacity_or_waitlist();
create trigger on_enquiries_seat_sync
  after insert or update or delete on public.enquiries
  for each row execute function public.trg_enquiries_seat_sync();
-- Age eligibility (see add_trip_age_range.sql /
-- add_trip_age_eligibility_enforcement.sql) — insert-only, so editing an
-- existing row's age from Admin afterward is never blocked retroactively.
create trigger enquiries_enforce_age_eligibility
  before insert on public.enquiries
  for each row execute function public.enforce_trip_age_eligibility();

create trigger on_waitlist_created
  after insert on public.waitlist
  for each row execute function public.notify_new_waitlist_signup();
create trigger waitlist_enforce_age_eligibility
  before insert on public.waitlist
  for each row execute function public.enforce_trip_age_eligibility();
create trigger on_waitlist_status_change
  before update on public.waitlist
  for each row execute function public.enforce_waitlist_conversion();

create trigger on_trip_seat_freed
  after update on public.upcoming_trips
  for each row execute function public.notify_seat_available();

create trigger sync_amount_paid_on_payments_change
  after insert or update or delete on public.payments
  for each row execute function public.sync_enquiry_amount_paid();

create trigger site_content_updated_at
  before update on public.site_content
  for each row execute function public.update_updated_at();

-- Database event trigger (fires on DDL, not tied to any one table above).
create event trigger rls_auto_enable_trigger
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- RLS is enabled on every table in this schema (confirmed live: all 10
-- tables have relrowsecurity = true). "Admin" below means
-- auth.role() = 'authenticated', i.e. a logged-in Supabase Auth user
-- (the admin portal login). There is no separate "admin" role/claim.

alter table public.completed_trips enable row level security;
alter table public.upcoming_trips enable row level security;
alter table public.enquiries enable row level security;
alter table public.payments enable row level security;
alter table public.waitlist enable row level security;
alter table public.gallery enable row level security;
alter table public.trip_images enable row level security;
alter table public.testimonials enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.site_content enable row level security;

-- completed_trips
create policy "Admin all completed trips" on public.completed_trips
  for all using (auth.role() = 'authenticated');
create policy "Public read completed trips" on public.completed_trips
  for select using (is_published = true);

-- upcoming_trips
create policy "Admin all upcoming trips" on public.upcoming_trips
  for all using (auth.role() = 'authenticated');
create policy "Public read upcoming trips" on public.upcoming_trips
  for select using (is_published = true);

-- enquiries — public can only insert (submit the enquiry form); everything
-- else (read/update/delete) requires an authenticated admin session.
create policy "Public insert enquiries" on public.enquiries
  for insert with check (true);
create policy "Admin read enquiries" on public.enquiries
  for select using (auth.role() = 'authenticated');
create policy "Admin update enquiries" on public.enquiries
  for update using (auth.role() = 'authenticated');
create policy "Admin delete enquiries" on public.enquiries
  for delete using (auth.role() = 'authenticated');

-- payments — admin only, no public access at all (payments are only ever
-- written by the admin portal, never directly by the public form).
create policy "Admin all payments" on public.payments
  for all using (auth.role() = 'authenticated');

-- waitlist — public can only insert (submit the waitlist form); everything
-- else (read/update/delete) requires an authenticated admin session.
create policy "Public insert waitlist" on public.waitlist
  for insert with check (true);
create policy "Admin read waitlist" on public.waitlist
  for select using (auth.role() = 'authenticated');
create policy "Admin update waitlist" on public.waitlist
  for update using (auth.role() = 'authenticated');
create policy "Admin delete waitlist" on public.waitlist
  for delete using (auth.role() = 'authenticated');

-- gallery
create policy "Admin all gallery" on public.gallery
  for all using (auth.role() = 'authenticated');
create policy "Public read gallery" on public.gallery
  for select using (true);

-- trip_images
create policy "Admin all trip images" on public.trip_images
  for all using (auth.role() = 'authenticated');
create policy "Public read trip images" on public.trip_images
  for select using (true);

-- testimonials
create policy "Admin all testimonials" on public.testimonials
  for all using (auth.role() = 'authenticated');
create policy "Public read testimonials" on public.testimonials
  for select using (is_published = true);

-- notifications — admin can select/insert/update/delete freely. Inserts in
-- practice mostly come from notify_new_enquiry() running as SECURITY
-- DEFINER (which bypasses RLS anyway), but this policy also covers any
-- direct insert/delete the admin UI does itself.
create policy "Admin all notifications" on public.notifications
  for all using (auth.role() = 'authenticated');

-- push_subscriptions — each admin can only see/manage their own
-- subscription rows (admin_id is not a real FK, just RLS-scoped).
create policy "Admin manage own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = admin_id) with check (auth.uid() = admin_id);

-- site_content
create policy "Admin all site content" on public.site_content
  for all using (auth.role() = 'authenticated');
create policy "Public read site content" on public.site_content
  for select using (true);

-- Grants for the public Like button RPCs above — SECURITY DEFINER bypasses
-- RLS inside the function body, but EXECUTE still needs to be granted to
-- the roles the public site actually connects as.
grant execute on function public.like_completed_trip(uuid, text) to anon, authenticated;
grant execute on function public.unlike_completed_trip(uuid, text) to anon, authenticated;
