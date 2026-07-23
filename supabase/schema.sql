-- ============================================================================
-- ULAA (tripsulaa-tech) — Supabase Postgres schema
-- Reconstructed from live DB introspection (project: wephglgonrmtcmhfbjqe)
-- Generated: 2026-07-23
--
-- KNOWN GAPS — verify against live DB before treating this as authoritative:
--   1. Column DEFAULT values were not captured (e.g. is_published default,
--      created_at default now(), status default, etc.) — run:
--        select table_name, column_name, column_default
--        from information_schema.columns where table_schema = 'public';
--   2. CHECK constraints not queried (e.g. enquiries.status enum-like values,
--      package_type allowed values) — run:
--        select conname, conrelid::regclass, pg_get_constraintdef(oid)
--        from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace;
--   3. push_subscriptions.admin_id FK target came back NULL in the constraints
--      query — likely references auth.users(id), not confirmed.
--   4. Trigger-to-function bindings not queried — we have the function bodies
--      (notify_new_enquiry, rls_auto_enable, update_updated_at) but not which
--      tables/events call them. notify_new_enquiry clearly fires AFTER INSERT
--      on enquiries; update_updated_at is presumably attached to every table
--      with an updated_at column (completed_trips, enquiries, upcoming_trips,
--      site_content). Confirm with:
--        select trigger_name, event_manipulation, event_object_table, action_statement
--        from information_schema.triggers where trigger_schema = 'public';
--   5. Enumerated types (Database > Enumerated Types in dashboard) not pulled.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions in use (inferred from function bodies — confirm exact list via
-- Database > Extensions in dashboard)
-- ----------------------------------------------------------------------------
-- pg_net    -- used by notify_new_enquiry() for net.http_post
-- supabase_vault -- used by notify_new_enquiry() for vault.decrypted_secrets

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.completed_trips (
  id uuid not null,
  title text not null,
  destination text not null,
  slug text not null,
  trip_date date not null,
  description text not null,
  story text,
  participants int4,
  cover_image text,
  gallery_images text[],
  is_published bool,
  created_at timestamptz,
  updated_at timestamptz,
  batch text,
  map_url text,
  trip_type text check (trip_type is null or trip_type in ('domestic', 'international')),
  constraint completed_trips_pkey primary key (id),
  constraint completed_trips_slug_key unique (slug)
);

create table public.upcoming_trips (
  id uuid not null,
  title text not null,
  destination text not null,
  slug text not null,
  start_date date not null,
  end_date date not null,
  duration text not null,
  description text not null,
  highlights text[],
  itinerary jsonb,
  included text[],
  not_included text[],
  things_to_carry text[],
  meeting_point text,
  faqs jsonb,
  total_seats int4 not null,
  seats_booked int4 not null,
  price numeric,
  cover_image text,
  gallery_images text[],
  is_published bool,
  created_at timestamptz,
  updated_at timestamptz,
  early_bird_price numeric,
  early_bird_deadline date,
  meeting_point_map_url text,
  terms_and_conditions text,
  cancellation_policy jsonb,
  trip_type text check (trip_type is null or trip_type in ('domestic', 'international')),
  constraint upcoming_trips_pkey primary key (id),
  constraint upcoming_trips_slug_key unique (slug)
);

create table public.enquiries (
  id uuid not null,
  full_name text not null,
  age int4,
  phone text not null,
  email text not null,
  city text,
  emergency_contact text,
  message text,
  trip_id uuid,
  trip_title text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  source text not null,
  is_paid bool not null,
  package_type text not null,
  total_amount numeric,
  amount_paid numeric not null,
  terms_accepted bool not null,
  cancelled_at timestamptz,
  refund_amount numeric not null,
  -- added for booking-lifecycle / refund-tier support (see clauses 1-3 of T&C)
  trip_type text,                      -- 'domestic' | 'international'
  departure_date date,                 -- snapshotted at booking confirmation
  booking_amount numeric not null default 0,   -- always non-refundable (clause 1)
  third_party_charges numeric,         -- manually entered at cancellation time
  is_no_show bool not null default false,      -- distinct from cancellation (clause 8)
  suggested_refund_amount numeric,     -- auto-computed suggestion, not authoritative
  balance_due_date date generated always as (
    case
      when trip_type = 'domestic' then departure_date - 7
      when trip_type = 'international' then departure_date - 30
      else null
    end
  ) stored,
  -- status ('new'/'contacted'/'closed') tracks LEAD follow-up stage — kept
  -- as-is. booking_status tracks the payment/booking lifecycle separately,
  -- since a 'closed' lead can mean either "went nowhere" or "fully paid
  -- booking" — those are two different dimensions, not one status field.
  booking_status text,
  constraint enquiries_pkey primary key (id),
  constraint enquiries_trip_type_check
    check (trip_type is null or trip_type in ('domestic', 'international')),
  constraint enquiries_booking_status_check
    check (booking_status is null or booking_status in (
      'booking_confirmed', 'balance_pending',
      'fully_paid', 'cancelled', 'completed'
    ))
  -- note: trip_id is uuid but no FK — can point to either upcoming_trips
  -- or completed_trips, so it's intentionally left unconstrained.
);

comment on column public.enquiries.booking_amount is
  'Non-refundable deposit required to confirm the booking (T&C clause 1).';
comment on column public.enquiries.third_party_charges is
  'Manually entered at cancellation time — actual airline/hotel/vendor penalty, not derivable from stored data.';
comment on column public.enquiries.suggested_refund_amount is
  'Auto-computed suggestion only (see suggest_refund_amount()). Admin sets the authoritative refund_amount independently.';
comment on column public.enquiries.balance_due_date is
  'Auto-derived from departure_date + trip_type per T&C clause 2. Not editable directly.';

create table public.gallery (
  id uuid not null,
  image_url text not null,
  alt_text text,
  destination text,
  sort_order int4,
  is_featured bool,
  created_at timestamptz,
  constraint gallery_pkey primary key (id)
);

create table public.trip_images (
  id uuid not null,
  trip_id uuid not null,
  trip_type text not null,
  image_url text not null,
  alt_text text,
  sort_order int4,
  is_cover bool,
  created_at timestamptz,
  constraint trip_images_pkey primary key (id)
  -- trip_type likely discriminates 'upcoming' | 'completed' for trip_id target
);

create table public.testimonials (
  id uuid not null,
  name text not null,
  photo text,
  review text not null,
  rating int4,
  destination text,
  is_published bool,
  sort_order int4,
  created_at timestamptz,
  constraint testimonials_pkey primary key (id)
);

create table public.notifications (
  id uuid not null,
  type text not null,
  title text not null,
  body text,
  link text,
  is_read bool,
  created_at timestamptz,
  constraint notifications_pkey primary key (id)
);

create table public.push_subscriptions (
  id uuid not null,
  admin_id uuid,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz,
  constraint push_subscriptions_pkey primary key (id),
  constraint push_subscriptions_endpoint_key unique (endpoint)
  -- constraint push_subscriptions_admin_id_fkey foreign key (admin_id)
  --   references auth.users (id)  -- TODO: confirm target table
);

create table public.site_content (
  key text not null,
  content jsonb not null,
  updated_at timestamptz,
  constraint site_content_pkey primary key (key)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  amount numeric not null,
  payment_type text not null check (payment_type in (
    'booking_amount', 'balance', 'installment', 'refund'
  )),
  payment_method text,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.payments is
  'Ledger of individual payments/refunds against an enquiry. enquiries.amount_paid is a cached rollup kept in sync via trigger — this table is the source of truth.';

-- ============================================================================
-- INDEXES (beyond those implied by PK/UNIQUE above)
-- ============================================================================

create index enquiries_source_idx on public.enquiries using btree (source);
create index enquiries_is_paid_idx on public.enquiries using btree (is_paid);
create index notifications_is_read_idx on public.notifications using btree (is_read) where (is_read = false);
create index notifications_created_at_idx on public.notifications using btree (created_at desc);
create index payments_enquiry_id_idx on public.payments using btree (enquiry_id);
create index payments_paid_at_idx on public.payments using btree (paid_at desc);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

create or replace function public.notify_new_enquiry()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
DECLARE
  target_link TEXT;
BEGIN
  target_link := '/admin/enquiries?trip=' || COALESCE(NEW.trip_id::text, 'unlinked')
                 || '&enquiry=' || NEW.id::text;

  INSERT INTO notifications (type, title, body, link)
  VALUES (
    'new_enquiry',
    'New enquiry from ' || NEW.full_name,
    COALESCE(NEW.trip_title, 'General enquiry') || ' · ' || NEW.email,
    target_link
  );

  -- Push notification is best-effort: if this fails for any reason,
  -- it must never block the actual enquiry from being saved.
  BEGIN
    PERFORM net.http_post(
      url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'edge_function_secret' limit 1
        )
      ),
      body := jsonb_build_object(
        'title', 'New enquiry from ' || NEW.full_name,
        'body', COALESCE(NEW.trip_title, 'General enquiry') || ' · ' || NEW.email,
        'link', target_link
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'send-push call failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Auto-populates enquiries.trip_type from the linked trip on insert, so it
-- doesn't need to be hand-set per enquiry once the trip itself is tagged.
create or replace function public.set_enquiry_trip_type()
returns trigger
language plpgsql
as $function$
DECLARE
  found_trip_type text;
BEGIN
  if NEW.trip_id is not null and NEW.trip_type is null then
    select trip_type into found_trip_type from public.upcoming_trips where id = NEW.trip_id
    union all
    select trip_type from public.completed_trips where id = NEW.trip_id
    limit 1;

    NEW.trip_type := found_trip_type;
  end if;
  return NEW;
END;
$function$;

-- Keeps enquiries.amount_paid (gross paid-in) and refund_amount (paid-back)
-- in sync with the payments ledger independently — refunds must never
-- reduce amount_paid, since that's the historical record of what was
-- actually collected.
create or replace function public.sync_enquiry_amount_paid()
returns trigger
language plpgsql
as $function$
DECLARE
  target_enquiry_id uuid;
  new_amount_paid numeric;
  new_refund_amount numeric;
BEGIN
  target_enquiry_id := coalesce(NEW.enquiry_id, OLD.enquiry_id);

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
END;
$function$;

-- Refund SUGGESTION only per T&C clause 3 interpretation (see migration file
-- header for the assumptions this encodes) — never authoritative.
create or replace function public.suggest_refund_amount(
  p_enquiry_id uuid,
  p_as_of_date date default current_date
)
returns numeric
language plpgsql
as $function$
DECLARE
  e record;
  days_before int;
  refundable_base numeric;
  suggested numeric;
BEGIN
  select trip_type, departure_date, amount_paid, booking_amount, third_party_charges
    into e
    from public.enquiries
   where id = p_enquiry_id;

  if e.departure_date is null or e.trip_type is null then
    return null;
  end if;

  days_before := e.departure_date - p_as_of_date;
  refundable_base := greatest(e.amount_paid - e.booking_amount, 0);

  if e.trip_type = 'domestic' then
    if days_before > 15 then
      suggested := 0;
    elsif days_before between 8 and 15 then
      suggested := refundable_base * 0.5 - coalesce(e.third_party_charges, 0);
    else
      suggested := 0;
    end if;

  elsif e.trip_type = 'international' then
    if days_before > 45 then
      suggested := refundable_base;
    elsif days_before between 31 and 45 then
      suggested := refundable_base - coalesce(e.third_party_charges, 0);
    else
      suggested := 0;
    end if;

  else
    return null;
  end if;

  return greatest(suggested, 0);
END;
$function$;

-- Auto-populates suggested_refund_amount + status when cancelled_at is first set.
create or replace function public.on_enquiry_cancelled()
returns trigger
language plpgsql
as $function$
BEGIN
  if NEW.cancelled_at is not null and OLD.cancelled_at is null then
    NEW.suggested_refund_amount := public.suggest_refund_amount(NEW.id, NEW.cancelled_at::date);
    NEW.booking_status := 'cancelled';
  end if;
  return NEW;
END;
$function$;

-- Written but NOT scheduled by default — see pg_cron note near the trigger
-- definitions below. Flags/cancels bookings that missed the balance deadline
-- (T&C clause 2).
create or replace function public.auto_cancel_unpaid_bookings()
returns void
language plpgsql
as $function$
BEGIN
  update public.enquiries
     set booking_status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now())
   where balance_due_date is not null
     and balance_due_date < current_date
     and booking_status not in ('fully_paid', 'cancelled', 'completed');
END;
$function$;

-- ============================================================================
-- TRIGGERS
-- Bindings confirmed via information_schema.triggers. NOTE: that view's
-- event_manipulation column only gave us INSERT/UPDATE, not BEFORE/AFTER
-- timing (action_timing) — timing below follows standard Postgres/Supabase
-- convention (updated_at bumped BEFORE UPDATE, notification fired AFTER
-- INSERT) but hasn't been independently confirmed. Run this to verify timing:
--   select trigger_name, action_timing from information_schema.triggers
--   where trigger_schema = 'public';
-- ============================================================================

-- Event trigger (fires on DDL, not table-scoped)
-- create event trigger rls_auto_enable_trigger
--   on ddl_command_end
--   execute function public.rls_auto_enable();

create trigger on_enquiry_created
  after insert on public.enquiries
  for each row execute function public.notify_new_enquiry();

create trigger update_completed_trips_updated_at
  before update on public.completed_trips
  for each row execute function public.update_updated_at();

create trigger update_upcoming_trips_updated_at
  before update on public.upcoming_trips
  for each row execute function public.update_updated_at();

create trigger update_enquiries_updated_at
  before update on public.enquiries
  for each row execute function public.update_updated_at();

create trigger site_content_updated_at
  before update on public.site_content
  for each row execute function public.update_updated_at();

create trigger enquiry_trip_type_from_trip
  before insert on public.enquiries
  for each row execute function public.set_enquiry_trip_type();

create trigger sync_amount_paid_on_payments_change
  after insert or update or delete on public.payments
  for each row execute function public.sync_enquiry_amount_paid();

create trigger enquiry_cancelled_trigger
  before update on public.enquiries
  for each row execute function public.on_enquiry_cancelled();

-- auto_cancel_unpaid_bookings() is NOT wired to a schedule by default.
-- To enable (requires pg_cron extension, enabled separately in dashboard):
-- select cron.schedule('auto-cancel-unpaid-bookings', '0 3 * * *',
--   $$select public.auto_cancel_unpaid_bookings();$$);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.completed_trips enable row level security;
alter table public.upcoming_trips enable row level security;
alter table public.enquiries enable row level security;
alter table public.gallery enable row level security;
alter table public.trip_images enable row level security;
alter table public.testimonials enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.site_content enable row level security;
alter table public.payments enable row level security;

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

-- enquiries
create policy "Admin read enquiries" on public.enquiries
  for select using (auth.role() = 'authenticated');
create policy "Admin update enquiries" on public.enquiries
  for update using (auth.role() = 'authenticated');
create policy "Public insert enquiries" on public.enquiries
  for insert with check (true);

-- gallery
create policy "Public read gallery" on public.gallery
  for select using (true);
create policy "Admin all gallery" on public.gallery
  for all using (auth.role() = 'authenticated');

-- trip_images
create policy "Public read trip images" on public.trip_images
  for select using (true);
create policy "Admin all trip images" on public.trip_images
  for all using (auth.role() = 'authenticated');

-- testimonials
create policy "Public read testimonials" on public.testimonials
  for select using (is_published = true);
create policy "Admin all testimonials" on public.testimonials
  for all using (auth.role() = 'authenticated');

-- notifications
create policy "Admin read notifications" on public.notifications
  for select using (auth.role() = 'authenticated');
create policy "Admin update notifications" on public.notifications
  for update using (auth.role() = 'authenticated');

-- push_subscriptions
create policy "Admin manage own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = admin_id) with check (auth.uid() = admin_id);

-- site_content
create policy "Public read site content" on public.site_content
  for select using (true);
create policy "Admin all site content" on public.site_content
  for all using (auth.role() = 'authenticated');

-- payments
create policy "Admin all payments" on public.payments
  for all using (auth.role() = 'authenticated');
