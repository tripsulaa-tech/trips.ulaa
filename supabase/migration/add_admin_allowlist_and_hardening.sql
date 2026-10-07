-- =============================================================================
-- add_admin_allowlist_and_hardening.sql
-- =============================================================================
-- WHY THIS MIGRATION EXISTS (security review of the public site)
--
-- 1. "Logged in" was treated as "admin". Every admin policy was
--    `auth.role() = 'authenticated'`, and there was no admin list. If Supabase
--    Auth signups are enabled (the default), anyone holding the public anon
--    key could register an account and then read / edit / delete every
--    enquiry, payment, waitlist entry, invoice and finance snapshot.
--    -> New `admins` table + `public.is_admin()`; every policy and admin-only
--       function now checks it instead.
--
-- 2. Public like policies (`insert/delete ... using (true)`) let anyone wipe or
--    fake likes with one REST call. The like/unlike RPCs are SECURITY DEFINER
--    and don't need them.  -> policies dropped.
--
-- 3. SECURITY DEFINER functions are callable through the REST RPC endpoint by
--    anon unless EXECUTE is revoked. Several had no caller check
--    (rename_*_slug, next_*_number, notify_due_follow_ups).
--    -> EXECUTE revoked from public/anon/authenticated. Triggers and the
--       pg_cron job still run them (they execute as the function owner).
--
-- 4. The honeypot / fill-time bot check only runs in the browser. A direct
--    request with the anon key skips it.  -> per-contact rate limit trigger on
--    the public enquiry and waitlist inserts.
--
-- BEFORE YOU RUN THIS
--   * Every user that currently exists in auth.users is copied into `admins`
--     below so you are not locked out. Afterwards run
--         select a.user_id, u.email from public.admins a join auth.users u on u.id = a.user_id;
--     and delete any row that is not one of your own admins.
--   * Also turn OFF "Allow new users to sign up" in Supabase ->
--     Authentication -> Providers -> Email. This migration protects the data
--     even if you forget, but closing signups removes the attack surface.
--   * Safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Admin allowlist
-- -----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- No policies on purpose: nobody can read or write this table through the API.
-- Manage it from the SQL editor. is_admin() below reads it as its owner.
revoke all on table public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Keep today's admins working.
insert into public.admins (user_id)
select id from auth.users
on conflict (user_id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Rewrite every existing "auth.role() = 'authenticated'" policy
--    (public tables, plus storage.objects when this role is allowed to edit it)
-- -----------------------------------------------------------------------------
do $$
declare
  r         record;
  new_using text;
  new_check text;
  stmt      text;
  pat       constant text := 'auth\.role\(\)\s*=\s*''authenticated''(::text)?';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
       and (coalesce(qual, '') ~ 'auth\.role\(\)' or coalesce(with_check, '') ~ 'auth\.role\(\)')
  loop
    new_using := regexp_replace(r.qual,       pat, 'public.is_admin()', 'g');
    new_check := regexp_replace(r.with_check, pat, 'public.is_admin()', 'g');

    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual       is not null then stmt := stmt || format(' using (%s)',      new_using); end if;
    if r.with_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;

    begin
      execute stmt;
    exception when insufficient_privilege then
      raise notice 'Skipped %.% policy "%" (not allowed to alter it from here) - update it in the dashboard.',
        r.schemaname, r.tablename, r.policyname;
    end;
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 3. Functions that checked auth.role() directly
-- -----------------------------------------------------------------------------
create or replace function public.aaa_sanitize_public_enquiry_insert()
returns trigger
language plpgsql
as $function$
begin
  if not public.is_admin() then
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
    if new.source is distinct from 'website' then
      new.source := 'website';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.aaa_sanitize_public_waitlist_insert()
returns trigger
language plpgsql
as $function$
begin
  if not public.is_admin() then
    new.status               := 'waiting';
    new.notified_at          := null;
    new.offer_expiry         := null;
    new.converted_enquiry_id := null;
  end if;
  return new;
end;
$function$;

create or replace function public.delete_enquiry_cascade(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  delete from public.enquiries where id = p_enquiry_id;
end;
$function$;


-- -----------------------------------------------------------------------------
-- 4. Likes: only the SECURITY DEFINER RPCs may write
-- -----------------------------------------------------------------------------
drop policy if exists "Public insert completed trip likes" on public.completed_trip_likes;
drop policy if exists "Public delete completed trip likes" on public.completed_trip_likes;


-- -----------------------------------------------------------------------------
-- 5. Lock down SECURITY DEFINER functions that were callable through /rpc
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'rename_upcoming_trip_slug',
         'rename_completed_trip_slug',
         'next_invoice_number',
         'next_booking_id',
         'notify_due_follow_ups'
       )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;

  -- The admin invoice form previews the next number through this one, so it
  -- stays callable by signed-in users, but no longer by the anonymous public.
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'next_invoice_generator_number'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 6. Rate limit on the public enquiry / waitlist inserts
--    Named "aab_" so it runs right after the "aaa_" sanitize trigger and
--    before every other BEFORE INSERT trigger.
--    Limit: 25 rows per phone number or email in any 10 minutes (a large group
--    booking inserts one row per traveller, so the limit is deliberately
--    generous). The client maps the RATE_LIMITED marker to a friendly message.
-- -----------------------------------------------------------------------------
create or replace function public.aab_rate_limit_public_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  recent integer;
begin
  if public.is_admin() then
    return new;
  end if;

  execute format(
    'select count(*) from public.%I
      where created_at > now() - interval ''10 minutes''
        and (lower(email) = lower($1)
             or regexp_replace(phone, ''\D'', '''', ''g'') = regexp_replace($2, ''\D'', '''', ''g''))',
    tg_table_name)
  into recent
  using new.email, new.phone;

  if recent >= 25 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

drop trigger if exists aab_rate_limit_public_enquiry_insert on public.enquiries;
create trigger aab_rate_limit_public_enquiry_insert
  before insert on public.enquiries
  for each row execute function public.aab_rate_limit_public_insert();

drop trigger if exists aab_rate_limit_public_waitlist_insert on public.waitlist;
create trigger aab_rate_limit_public_waitlist_insert
  before insert on public.waitlist
  for each row execute function public.aab_rate_limit_public_insert();
