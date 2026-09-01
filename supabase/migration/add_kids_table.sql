-- ============================================================================
-- Promotes "kids" from a bare headcount on the parent enquiry
-- (enquiries.kids_count / kids_amount, see add_trip_kids_option.sql) into
-- real, independently-trackable records: one row per kid, each with its own
-- name, status, and follow-up reminder — instead of every kid on a booking
-- being an indistinguishable unit of a single number.
--
-- Deliberately layered ON TOP of kids_count/kids_amount rather than
-- replacing them: those two stay the source of truth for pricing (kids
-- never occupy a seat or get an age collected for pricing purposes — see
-- add_trip_kids_option.sql/add_kids_payment_tracking.sql, both untouched by
-- this migration) and the DB auto-pricing trigger still keys off
-- kids_count exactly as before. This table is the identity/tracking layer
-- alongside that: who each kid actually is, and where their own admin
-- follow-up stands, independent of the parent enquiry's own status/
-- follow_up_at.
--
--   kids.enquiry_id  - the parent booking this kid belongs to. For a group
--     booking (one enquiry row per seat), kids are only ever attached to
--     the group's lead row (group_seq = 1) — same convention kids_count/
--     kids_amount already follow, so a group's kids aren't duplicated
--     once per seat.
--
--   kids.name        - optional (the public booking form may only collect
--     a headcount with no names typed in) — falls back to "Kid N" in the
--     UI when blank, never in the data itself.
--
--   kids.age         - optional, admin-entered only. The public booking
--     form still deliberately collects no age for kids (unchanged product
--     decision — see add_trip_kids_option.sql) — this is just a place for
--     an admin to note it later if it comes up in conversation.
--
--   kids.status      - this kid's own trackable state, independent of the
--     parent enquiry's status/journey_stage. 'pending' (default, nothing
--     confirmed about this kid yet) -> 'confirmed' (admin has verified
--     details) -> 'checked_in' (present on departure day, mirrors
--     enquiries.checked_in_at conceptually but tracked per kid) — or
--     'cancelled' if this one kid drops out of an otherwise-active
--     booking without cancelling the whole enquiry.
--
--   kids.follow_up_at / kids.follow_up_notes - a reminder layered on this
--     one kid's record, same idea as enquiries.follow_up_at
--     (add_enquiry_follow_up.sql) but scoped to the kid, not the whole
--     lead. Only meaningful while status = 'pending', same "reminder on a
--     live item, not a closed one" rule that field follows.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

create table if not exists public.kids (
  id                uuid not null default uuid_generate_v4(),
  enquiry_id        uuid not null references public.enquiries(id) on delete cascade,
  name              text,
  age               integer,
  status            text not null default 'pending',
  follow_up_at      date,
  follow_up_notes   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint kids_pkey primary key (id),
  constraint kids_age_check check (age is null or (age >= 0 and age <= 17)),
  constraint kids_status_check
    check (status = any (array['pending'::text, 'confirmed'::text, 'checked_in'::text, 'cancelled'::text])),
  -- Same "reminder only while still live" rule as
  -- enquiries_follow_up_requires_contacted_status in add_enquiry_follow_up.sql.
  constraint kids_follow_up_requires_pending_status
    check (follow_up_at is null or status = 'pending')
);

create index if not exists kids_enquiry_id_idx on public.kids using btree (enquiry_id);
-- Only rows with a reminder actually set need to be found quickly (the
-- "kid follow-ups due" list in Admin) — a partial index keeps it small.
create index if not exists kids_follow_up_at_idx
  on public.kids using btree (follow_up_at)
  where follow_up_at is not null;

-- Keeps updated_at honest on every edit (status change, follow-up set,
-- name/age correction, ...), same pattern used elsewhere in this schema.
create or replace function public.set_kids_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists kids_set_updated_at on public.kids;
create trigger kids_set_updated_at
  before update on public.kids
  for each row execute function public.set_kids_updated_at();

-- RLS is auto-enabled on this new table by the rls_auto_enable event
-- trigger already installed in schema.sql. Policies mirror enquiries':
-- the public booking form can insert kid rows alongside its enquiry
-- (nothing else), everything else needs an authenticated admin session.
drop policy if exists "Public insert kids" on public.kids;
create policy "Public insert kids" on public.kids
  for insert with check (true);
drop policy if exists "Admin read kids" on public.kids;
create policy "Admin read kids" on public.kids
  for select using (auth.role() = 'authenticated');
drop policy if exists "Admin update kids" on public.kids;
create policy "Admin update kids" on public.kids
  for update using (auth.role() = 'authenticated');
drop policy if exists "Admin delete kids" on public.kids;
create policy "Admin delete kids" on public.kids
  for delete using (auth.role() = 'authenticated');

-- One-time backfill: every enquiry submitted before this migration only
-- ever recorded a kids_count number, with no per-kid rows to recover a
-- name from — so this seeds one nameless (name left null, displays as
-- "Kid N" client-side) 'pending' row per existing kid, on each group's
-- lead row only (kids_count is only ever meaningful there — see
-- add_trip_kids_option.sql), so the CRM view isn't empty for bookings that
-- predate this table. Safe to re-run: only fires for enquiries that don't
-- already have kid rows.
insert into public.kids (enquiry_id, status)
select e.id, 'pending'
from public.enquiries e, generate_series(1, e.kids_count) gs
where e.kids_count > 0
  and coalesce(e.group_seq, 1) = 1
  and not exists (select 1 from public.kids k where k.enquiry_id = e.id);
