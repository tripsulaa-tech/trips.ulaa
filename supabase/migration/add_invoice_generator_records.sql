-- ============================================================================
-- Adds persistence for Admin → Invoice Generator (src/admin/AdminInvoiceGenerator.tsx).
--
-- Two things, both requested together:
--   1. Every generated invoice is now saved to `invoice_generator_invoices`
--      so past invoices can be browsed and reused as a starting point for a
--      new one, instead of the form being a one-off, throwaway session.
--   2. The invoice number is assigned server-side by
--      `next_invoice_generator_number()` instead of being tracked in the
--      browser's localStorage and left as a free-text field the admin could
--      edit. This is the same "one counter, bumped atomically, per-row
--      constraint" shape as next_invoice_number() in
--      add_invoice_generation.sql / next_booking_id() in
--      add_booking_id_invoice.sql — just prefix-agnostic (one running count
--      shared across prefixes) to match this tool's existing "changing the
--      prefix just relabels the same sequence" behavior from
--      src/utils/invoiceGeneratorPdf.ts's old localStorage version.
--
-- This is unrelated to the payments/booking invoice numbering in
-- add_invoice_generation.sql (next_invoice_number(), 'INV-2026-00101' style)
-- — that one is per-payment, tied to an Enquiry; this one is for the
-- standalone one-off invoice tool with no backing booking record.
--
-- Mirrors creator_rate_calculations.sql's shape for a straightforward
-- admin-managed table: uuid pk, created_at, RLS restricted to authenticated
-- admins only (no public policy — this is an internal tool, never
-- customer-facing).
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Invoice number sequence — single running counter, independent of which
-- prefix is in use at the time (matches the old localStorage behavior: JJ01,
-- JJ02… stays JJ03 even after the admin types a different prefix, rather
-- than starting a second, parallel sequence per prefix). Same
-- "insert .. on conflict .. returning" pattern as booking_id_sequences /
-- invoice_number_sequences elsewhere in this schema, just keyed on a single
-- fixed row instead of one row per year.
-- ----------------------------------------------------------------------------
create table if not exists public.invoice_generator_number_sequences (
  id        boolean not null default true,
  last_seq  integer not null default 0,
  constraint invoice_generator_number_sequences_pkey primary key (id),
  constraint invoice_generator_number_sequences_single_row check (id)
);

create or replace function public.next_invoice_generator_number(p_prefix text default 'JJ') returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  seq integer;
  prefix text := coalesce(nullif(trim(p_prefix), ''), 'JJ');
begin
  insert into public.invoice_generator_number_sequences (id, last_seq)
  values (true, 1)
  on conflict (id) do update set last_seq = public.invoice_generator_number_sequences.last_seq + 1
  returning last_seq into seq;

  return prefix || lpad(seq::text, 2, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- invoice_generator_invoices — one row per generated invoice. Stores the
-- exact same shape the form/PDF already works with (InvoiceGeneratorData in
-- src/utils/invoiceGeneratorPdf.ts), so a saved row can be loaded straight
-- back into the form to reuse (same billing address, bank details, etc. for
-- a repeat client) or re-downloaded as an identical PDF later.
-- ----------------------------------------------------------------------------
create table if not exists public.invoice_generator_invoices (
  id                      uuid not null default uuid_generate_v4(),

  -- Server-assigned, never edited by the admin — see
  -- next_invoice_generator_number() above.
  invoice_number          text not null,
  invoice_number_prefix   text not null default 'JJ',

  invoice_title           text not null default '',
  invoice_subtitle        text not null default '',
  billing_company_name    text not null default '',
  billing_address         text not null default '',
  invoice_date            date not null default current_date,

  -- [{ description, subDescription, amount }, ...] — same shape as
  -- InvoiceGeneratorLineItem, minus the client-only `id` used as a React
  -- list key.
  items                   jsonb not null default '[]'::jsonb,
  -- { accountNumber, ifscCode, bankName, accountHolderName, gpayNumber }
  bank                    jsonb not null default '{}'::jsonb,
  signatory_name          text not null default '',

  -- Denormalized sum of items[].amount at save time, so the history list
  -- can show a total without re-summing/parsing jsonb on every read.
  total                   numeric not null default 0,

  created_at              timestamptz default now(),

  constraint invoice_generator_invoices_pkey primary key (id)
);

create unique index if not exists invoice_generator_invoices_invoice_number_unique
  on public.invoice_generator_invoices (invoice_number);

create index if not exists invoice_generator_invoices_created_at_idx
  on public.invoice_generator_invoices (created_at desc);

alter table public.invoice_generator_invoices enable row level security;

create policy "Admin all invoice generator invoices" on public.invoice_generator_invoices
  for all using (auth.role() = 'authenticated');
