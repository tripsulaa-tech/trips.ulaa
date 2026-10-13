-- Lock down the three numbering-counter tables.
--
-- booking_id_sequences, invoice_number_sequences and
-- invoice_generator_number_sequences were created without RLS, so with
-- Supabase's default grants anyone holding the public anon key could
-- read or overwrite them through the REST API (e.g. reset a counter and
-- cause duplicate booking IDs / invoice numbers).
--
-- Nothing in the app touches these tables directly: they are only used by
-- next_booking_id(), next_invoice_number() and
-- next_invoice_generator_number(), all of which are SECURITY DEFINER and
-- keep working with RLS on and no policies (deny-all for API roles).
--
-- Safe to run repeatedly. Tables that don't exist yet are skipped.

do $$
declare
  t text;
begin
  foreach t in array array[
    'booking_id_sequences',
    'invoice_number_sequences',
    'invoice_generator_number_sequences'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
