-- ============================================================================
-- ULAA — Supabase schema (public schema)
--
-- This file is a snapshot of the LIVE database, regenerated from direct
-- introspection (information_schema + pg_catalog) on 2026-07-24. It is
-- documentation only — nothing here is applied automatically. To change the
-- live schema, run SQL directly in Supabase → SQL Editor, then update this
-- file to match.
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
  constraint completed_trips_pkey primary key (id),
  constraint completed_trips_slug_key unique (slug),
  constraint completed_trips_trip_type_check
    check (trip_type = any (array['domestic'::text, 'international'::text]))
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
  constraint upcoming_trips_pkey primary key (id),
  constraint upcoming_trips_slug_key unique (slug),
  constraint upcoming_trips_trip_type_check
    check (trip_type = any (array['domestic'::text, 'international'::text]))
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
    ]))
);

create index enquiries_is_paid_idx on public.enquiries using btree (is_paid);
create index enquiries_source_idx on public.enquiries using btree (source);

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
  found_trip_type text;
begin
  if new.trip_id is not null and new.trip_type is null then
    select trip_type into found_trip_type from upcoming_trips where id = new.trip_id
    union all
    select trip_type from completed_trips where id = new.trip_id
    limit 1;

    new.trip_type := found_trip_type;
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
    original_itinerary, original_highlights, original_included, original_not_included
  )
  select
    ut.id, ut.title, ut.destination, ut.slug, ut.start_date, ut.description,
    ut.cover_image, ut.gallery_images, false, ut.trip_type,
    ut.itinerary, ut.highlights, ut.included, ut.not_included
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
