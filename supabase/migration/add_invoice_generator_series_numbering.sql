-- ============================================================================
-- Fixes Invoice Generator numbering so it's a real, gapless series matching
-- what's actually SAVED (JJ001, JJ002, JJ003…) instead of an independent
-- counter that also bumped every time the form was merely opened or "Next
-- Number" was tapped — which meant the number shown could run ahead of how
-- many invoices had actually been saved (e.g. jump to JJ004 after only two
-- saves, because two page loads/abandoned drafts also consumed a number).
--
-- Supersedes the numbering half of add_invoice_generator_records.sql:
--   - invoice_generator_number_sequences / next_invoice_generator_number()
--     from that migration are dropped — that table tracked its own
--     independent counter, decoupled from actual saved rows, which is
--     exactly the gap problem above.
--   - Replaced with: a BEFORE INSERT trigger that assigns the number
--     itself, unconditionally, as (max existing seq in this table) + 1 —
--     so the series can only ever advance when a row is actually inserted.
--     Same "the database is the only thing that can assign this, ignore
--     whatever the client sent" shape as assign_invoice_number() /
--     next_invoice_number() in add_invoice_generation.sql, just simplified
--     since this tool has no per-year reset.
--   - A separate, read-only next_invoice_generator_number() (same name,
--     new behavior) is kept so the UI can still *preview* what the next
--     number will probably be before saving — it just peeks at
--     coalesce(max(invoice_seq), 0) + 1 without reserving/incrementing
--     anything. If two admins save at nearly the same moment, the trigger
--     (not the peek) is what actually decides the final number for each,
--     so the series itself never has gaps or a collision even though the
--     preview shown to one of them briefly wasn't the one they ended up
--     getting.
--
-- Also switches the padding from 2 digits (JJ01) to 3 (JJ001) to match
-- how real invoice books/series are usually numbered.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`), after
-- add_invoice_generator_records.sql. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- invoice_seq — the actual series position (1, 2, 3…), separate from the
-- display string in invoice_number (which also carries the prefix). This
-- is what "next" is computed from; invoice_number is derived from it.
-- ----------------------------------------------------------------------------
alter table public.invoice_generator_invoices
  add column if not exists invoice_seq integer;

-- Backfill any rows saved under the old sequence-table numbering (e.g.
-- "JJ07") by assigning them a seq in save order, oldest first — so the
-- series continues smoothly from whatever was already saved instead of
-- restarting at 1 and colliding with real invoice numbers already handed
-- to clients.
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from public.invoice_generator_invoices
    where invoice_seq is null
    order by created_at asc
  loop
    n := n + 1;
    update public.invoice_generator_invoices set invoice_seq = n where id = r.id;
  end loop;
end $$;

alter table public.invoice_generator_invoices
  alter column invoice_seq set not null;

create unique index if not exists invoice_generator_invoices_invoice_seq_unique
  on public.invoice_generator_invoices (invoice_seq);

-- ----------------------------------------------------------------------------
-- Drop the old independent-counter approach.
-- ----------------------------------------------------------------------------
drop function if exists public.next_invoice_generator_number(text);
drop table if exists public.invoice_generator_number_sequences;

-- ----------------------------------------------------------------------------
-- Trigger: the ONLY place an invoice_number/invoice_seq is ever assigned.
-- Overwrites whatever the client sent (an admin can't edit this from the
-- form, and now can't influence it via the API payload either) with
-- (current max seq) + 1, so the series can only grow one at a time, in
-- save order, with zero gaps.
-- ----------------------------------------------------------------------------
create or replace function public.assign_invoice_generator_number() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seq integer;
  prefix text := coalesce(nullif(trim(new.invoice_number_prefix), ''), 'JJ');
begin
  select coalesce(max(invoice_seq), 0) + 1 into seq from public.invoice_generator_invoices;
  new.invoice_seq := seq;
  new.invoice_number := prefix || lpad(seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_invoice_generator_assign_number on public.invoice_generator_invoices;
create trigger trg_invoice_generator_assign_number
  before insert on public.invoice_generator_invoices
  for each row execute function public.assign_invoice_generator_number();

-- ----------------------------------------------------------------------------
-- Read-only peek for the live "what will the next number be" preview in
-- the form, before anything is actually saved. Does not reserve or
-- increment anything — see the header note on why that's fine.
-- ----------------------------------------------------------------------------
create or replace function public.next_invoice_generator_number(p_prefix text default 'JJ') returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(p_prefix), ''), 'JJ')
    || lpad(((select coalesce(max(invoice_seq), 0) + 1 from public.invoice_generator_invoices))::text, 3, '0');
$$;
