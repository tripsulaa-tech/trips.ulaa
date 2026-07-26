-- ============================================================================
-- ULAA — Partial group-waitlist conversion
-- Run this once in Supabase → SQL Editor, AFTER add_waitlist_group_size.sql.
--
-- Problem: a waitlist row for a group (e.g. group_size = 3) only ever
-- tracked ONE linked enquiry via converted_enquiry_id, and converting a
-- single person immediately flipped the whole row to status = 'converted'.
-- That meant:
--   - Converting 1 of 3 people silently closed out the entry — the other 2
--     had no seat tracking, no way to tell they still needed converting,
--     and the "Convert" action disappeared for them (canConvert() excludes
--     'converted' rows).
--   - The Waitlist page had no way to show "2 of 3 converted so far", so a
--     partially-seated group looked identical to a solo entry that was
--     fully done.
--
-- Fix: track every linked enquiry for a waitlist row (not just one) via
-- converted_enquiry_ids, and only flip status to 'converted' once that
-- array has at least group_size entries. converted_enquiry_id is left in
-- place (unused going forward) rather than dropped, since it's a real FK
-- and existing rows/links to it aren't worth churning in the same pass.
-- ============================================================================

alter table public.waitlist
  add column converted_enquiry_ids uuid[] not null default '{}';

comment on column public.waitlist.converted_enquiry_ids is
  'Every enquiry that has been converted from this waitlist signup so far. A group entry (group_size > 1) only flips status to ''converted'' once this array has at least group_size entries — until then it stays ''waiting''/''notified'' with a partial count, so the remaining seats are still actionable from the Waitlist page. Superset of the older single converted_enquiry_id column, which is left in place but no longer written to.';

-- Backfill: anything already converted under the old single-id column
-- becomes a one-element array, so existing "fully converted" solo entries
-- (and any group entries that happened to have exactly 1 seat needed)
-- keep showing correctly.
update public.waitlist
  set converted_enquiry_ids = array[converted_enquiry_id]
  where converted_enquiry_id is not null
    and converted_enquiry_ids = '{}';

-- Replaces the previous single-id version of this trigger (see schema.sql).
-- Same intent, extended to an array: every id ever added to
-- converted_enquiry_ids must point at a paid enquiry, moving TO
-- 'converted' requires the full group's worth of linked, paid enquiries
-- (not just the first one), and moving AWAY from 'converted' is still
-- blocked while any linked enquiry is an active booking.
create or replace function public.enforce_waitlist_conversion()
returns trigger
language plpgsql
as $function$
declare
  v_needed int := greatest(coalesce(new.group_size, 1), 1);
begin
  if new.converted_enquiry_ids is distinct from old.converted_enquiry_ids then
    if exists (
      select 1 from unnest(new.converted_enquiry_ids) eid
      where not exists (select 1 from public.enquiries where id = eid and amount_paid > 0)
    ) then
      raise exception 'Cannot link a conversion without an advance payment recorded on that enquiry.';
    end if;
  end if;

  if new.status = 'converted' and old.status is distinct from 'converted' then
    if coalesce(array_length(new.converted_enquiry_ids, 1), 0) < v_needed then
      raise exception 'Cannot mark converted until all % seat(s) in this group are linked to a paid enquiry.', v_needed;
    end if;
  end if;

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
