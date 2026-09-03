-- ============================================================================
-- Scopes activity_log entries to an individual kid, on top of the existing
-- enquiry_id scoping (add_activity_log.sql). Every kid-related action so far
-- (see logKidActivity in src/services/api/enquiries/kids.ts) has logged onto
-- the *parent* enquiry's Activity Timeline only — useful for "everything
-- that happened on this booking" but with no way to isolate one kid's own
-- history now that AdminKidDetail.tsx gives each kid a real page of its own
-- (own URL, own status/payment/edit actions) alongside the adult's.
--
-- kid_id is nullable and purely additive: every existing row (and every
-- future adult-only action) keeps kid_id null and continues to show up
-- exactly where it already did, on the parent enquiry's timeline
-- (getActivityLog never filters on kid_id). Only the kid-scoped calls this
-- migration's app-code counterpart now threads a kid id through start
-- setting it, so AdminKidDetail's own timeline (getActivityLogForKid) can
-- filter down to just that kid.
--
-- Deliberately "on delete set null", not "on delete cascade" — unlike
-- enquiry_id (whose cascade is fine because deleting an *enquiry* already
-- needs the SECURITY DEFINER delete_enquiry_cascade() escape hatch to push
-- through activity_log's own no-delete-policy RLS), deleteKid() is a plain
-- client-side `.delete()` running as the ordinary authenticated role. If
-- removing a kid cascade-deleted its activity_log rows too, that delete
-- would hit the very same "no DELETE policy on activity_log" wall and fail
-- outright, breaking the existing Delete-a-kid action. Setting kid_id to
-- null instead leaves the audit rows in place (untouched, un-deletable, as
-- designed) still attached to the parent enquiry's timeline — a deleted
-- kid's history simply stops being individually filterable, which matches
-- there being no more kid page left to filter it onto anyway.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run (every statement is guarded).
-- ============================================================================

alter table public.activity_log
  add column if not exists kid_id uuid references public.kids (id) on delete set null;

create index if not exists activity_log_kid_id_idx on public.activity_log using btree (kid_id);

-- ----------------------------------------------------------------------------
-- "Kid added" — the one kid-timeline event that has to happen at INSERT
-- time regardless of whether the caller is an authenticated admin
-- (createManualEnquiry's per-kid seed rows, or AdminKids/
-- AdminEnquiryKidsCard adding one directly) or the anonymous public
-- booking form (submitEnquiry/submitGroupEnquiry's createKidsForEnquiry) —
-- same reasoning as log_enquiry_created_activity() in add_activity_log.sql,
-- and for the same reason: a DB trigger is the only choke point both paths
-- actually share. `security definer` for the same reason that one needs
-- it too — the anonymous public-form path has no INSERT policy of its own
-- on activity_log.
create or replace function public.log_kid_created_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.activity_log (enquiry_id, kid_id, action, details)
  values (new.enquiry_id, new.id, 'Kid added', new.name);
  return new;
end;
$function$;

drop trigger if exists on_kid_created_log_activity on public.kids;
create trigger on_kid_created_log_activity
  after insert on public.kids
  for each row execute function public.log_kid_created_activity();
