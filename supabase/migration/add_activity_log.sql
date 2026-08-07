-- ============================================================================
-- Adds `activity_log`: one immutable row per meaningful action taken on an
-- enquiry/booking (CRM spec section 14 — "Every action creates an
-- immutable log... Nothing should be editable.").
--
-- Deliberately a single free-text `action` + optional `details` pair, not a
-- typed enum + structured JSON payload — every existing "history" table in
-- this schema (payments) already proved that pattern out, and the timeline
-- is read-only display, never branched on by other code, so a rigid schema
-- would add ceremony without adding safety.
--
-- Written to by logActivity() in src/services/api.ts, called from every
-- state-changing enquiry function (recordContactOutcome, recordPayment,
-- checkInEnquiry, cancelEnquiry, recordRefund, etc). Logging is
-- best-effort: a logActivity() failure is caught and console.error'd, never
-- allowed to fail the primary action it's describing — an audit trail gap
-- is bad, but blocking a real payment/check-in because the log insert
-- hiccuped would be worse.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run (every statement is guarded).
-- ============================================================================

create table if not exists public.activity_log (
  id          uuid not null default uuid_generate_v4(),
  enquiry_id  uuid not null references public.enquiries (id) on delete cascade,
  action      text not null,
  details     text,
  created_at  timestamptz not null default now(),
  constraint activity_log_pkey primary key (id)
);

create index if not exists activity_log_enquiry_id_idx on public.activity_log using btree (enquiry_id);
create index if not exists activity_log_created_at_idx on public.activity_log using btree (created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "Admin read activity log" on public.activity_log;
create policy "Admin read activity log" on public.activity_log
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admin insert activity log" on public.activity_log;
create policy "Admin insert activity log" on public.activity_log
  for insert with check (auth.role() = 'authenticated');

-- Deliberately no update/delete policy of any kind, for admins or anyone
-- else — the whole point of this table is that once written, a row is
-- never editable or removable. With RLS enabled and no UPDATE/DELETE
-- policy, both are denied outright regardless of role.

-- ----------------------------------------------------------------------------
-- "Website enquiry submitted" / "Enquiry logged" — the one timeline event
-- that has to happen at INSERT time regardless of whether the caller is an
-- authenticated admin (createManualEnquiry, a walk-in/phone entry) or the
-- anonymous public booking form (submitEnquiry/submitGroupEnquiry). A DB
-- trigger is the only choke point both paths actually share — logActivity()
-- in src/services/api.ts covers every *other* timeline event (all of which
-- are admin-only actions), but can't cover this one without either
-- duplicating logic on both insert paths or opening a public INSERT policy
-- on activity_log itself (rejected: that's a wide-open, unvalidated public
-- write channel for a table whose entire value proposition is trustworthy
-- history). `security definer` here is the same escape hatch
-- notify_new_enquiry() already uses to write into `notifications` from an
-- anonymous public-form insert — this follows that existing pattern rather
-- than inventing a new one.
create or replace function public.log_enquiry_created_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.activity_log (enquiry_id, action, details)
  values (
    new.id,
    case when new.source = 'website' then 'Website enquiry submitted' else 'Enquiry logged (' || new.source || ')' end,
    coalesce(new.trip_title, 'No trip selected')
  );
  return new;
end;
$function$;

drop trigger if exists on_enquiry_created_log_activity on public.enquiries;
create trigger on_enquiry_created_log_activity
  after insert on public.enquiries
  for each row execute function public.log_enquiry_created_activity();
