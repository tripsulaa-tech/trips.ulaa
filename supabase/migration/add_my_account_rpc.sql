-- =============================================================================
-- add_my_account_rpc.sql
-- =============================================================================
-- Powers the customer /account page. Returns the signed-in customer's own
-- details, bookings (incl. group seats) and recorded payments as one JSON
-- document, matched on the verified email in their JWT.
--
-- Only customer-safe columns are exposed — no admin notes, follow-up data,
-- third-party charges, source, or refund suggestions. The enquiries/payments
-- tables stay admin-only; this SECURITY DEFINER function is the only way a
-- customer reads their own rows.
--
-- Requires add_registered_user_accounts.sql (account sign-up gating) and keep
-- "Secure email change" ON in Supabase Auth, since the email decides whose
-- data an account sees. Safe to re-run.
-- =============================================================================

create or replace function public.my_account()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email
  ),
  mine as (
    select e.*
    from public.enquiries e, me
    where me.email <> ''
      and lower(trim(e.email)) = me.email
      and e.deleted_at is null
  )
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select full_name, age, phone, email, city, emergency_contact
        from mine order by created_at desc limit 1
      ) p
    ),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.created_at desc) from (
        select m.id, m.booking_id, m.group_id, m.group_size, m.trip_id,
               coalesce(t.title, m.trip_title)            as trip_title,
               t.slug                                      as trip_slug,
               t.destination,
               t.cover_image,
               coalesce(m.departure_date, t.start_date)   as departure_date,
               t.end_date,
               m.package_type, m.journey_stage, m.booking_state,
               m.total_amount, m.amount_paid, m.refund_amount,
               m.balance_due_date, m.cancelled_at, m.checked_in_at, m.created_at
        from mine m
        left join public.upcoming_trips t on t.id = m.trip_id
      ) b
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.paid_at desc) from (
        select pm.id, pm.enquiry_id, pm.amount, pm.payment_type,
               pm.payment_method, pm.paid_at, pm.invoice_number
        from public.payments pm
        join mine m on m.id = pm.enquiry_id
        where pm.status = 'paid'
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.my_account() from public, anon;
grant  execute on function public.my_account() to authenticated;
