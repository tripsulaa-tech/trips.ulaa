-- ============================================================================
-- Renames the 'extra_charge' payment_type value to 'addon', matching the
-- "Add-on" label already shown everywhere in the UI (Type dropdowns, badges,
-- activity log, invoice PDF — see the earlier UI-only rename). Was left as
-- 'extra_charge' at the DB layer initially to avoid touching existing
-- payments rows; doing that now for consistency, since the app code has
-- been updated in the same change to read/write 'addon' instead.
--
-- Safe to run more than once: the UPDATE is a no-op once no rows match, and
-- the constraint drop/add uses IF EXISTS / replaces the same name.
-- ============================================================================

update public.payments
  set payment_type = 'addon'
  where payment_type = 'extra_charge';

alter table public.payments
  drop constraint if exists payments_payment_type_check;

alter table public.payments
  add constraint payments_payment_type_check
    check (payment_type = any (array[
      'booking_amount'::text, 'balance'::text, 'installment'::text, 'refund'::text,
      'full_payment'::text, 'advance'::text, 'addon'::text
    ]));
