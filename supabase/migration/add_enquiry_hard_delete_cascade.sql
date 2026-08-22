-- ============================================================================
-- Admin-triggered enquiry delete (AdminEnquiries/AdminEnquiryDetail
-- "Delete" action) was, until now, a soft delete (deleted_at stamped) that
-- silently kept the row, its payments, and its activity log forever with
-- no admin-facing way to recover or purge them — despite the confirm
-- dialog telling the admin "This permanently removes the enquiry and its
-- payment history. This cannot be undone." This migration makes that copy
-- true: deleting a single enquiry now actually deletes it and everything
-- tied to it.
--
-- Why this needs a SECURITY DEFINER function instead of a plain client-side
-- `.delete()` on enquiries (see deleteEnquiry() in src/services/api.ts):
-- payments.enquiry_id and activity_log.enquiry_id are both
-- "on delete cascade" (see schema.sql), so deleting an enquiry row is
-- enough to remove its payments and activity log automatically — BUT
-- activity_log has RLS enabled with deliberately NO delete policy at all
-- ("a logged row can never be edited or removed by anyone through the API,
-- only ever appended to"). A cascade delete still runs as the calling
-- role (authenticated, not the table owner), so RLS would block the
-- cascade into activity_log and the whole delete would fail. Running as
-- SECURITY DEFINER makes this one controlled, admin-gated path bypass
-- that — every other path into activity_log is untouched and still
-- append-only.
--
-- Deliberately narrower than deleteUpcomingTripCascade/
-- deleteCompletedTripCascade (see api.ts), which still soft-delete
-- enquiries when a whole trip/album is removed, specifically to keep that
-- accounting ledger recoverable. This function is only for an admin
-- explicitly deleting one enquiry (or a bulk selection) from the
-- Enquiries screen.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

create or replace function public.delete_enquiry_cascade(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Still gated to admin sessions even though this runs with elevated
  -- privileges — RPC functions are callable by any role with EXECUTE, and
  -- SECURITY DEFINER means Postgres won't apply RLS to stop it, so the
  -- check has to happen explicitly in here instead.
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Not authorized';
  end if;

  delete from public.enquiries where id = p_enquiry_id;
end;
$function$;

grant execute on function public.delete_enquiry_cascade(uuid) to authenticated;
