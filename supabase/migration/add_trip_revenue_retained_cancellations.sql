-- ============================================================================
-- Trip Finance: count money KEPT from cancelled / no-show bookings.
--
-- Before: trip revenue only summed ACTIVE bookings (not cancelled, paid > 0),
-- so e.g. a no-show whose advance was not refunded (paid 1750, refund 0) was
-- missing from Trip Finance / Reports profit.
--
-- Now the app adds retainedRevenue = sum(amount_paid - refund_amount) over the
-- trip's cancelled bookings (never below 0 per booking). It is computed live
-- in the UI; this migration makes the saved copy (trip_finance_snapshots) carry
-- it too, so it survives after the upcoming trip row is deleted.
--
-- 1) trip_revenue_snapshot() now also returns 'retainedRevenue'.
-- 2) Backfill existing snapshot rows (merge only that key; nothing else touched).
--
-- Safe to re-run. Run once in Supabase -> SQL Editor.
-- ============================================================================

create or replace function public.trip_revenue_snapshot(p_trip_id uuid)
returns jsonb
language sql
stable
as $function$
  select jsonb_build_object(
    'bookedCount',    count(*),
    'totalRevenue',   coalesce(sum(e.total_amount), 0),
    'childFareCount', count(*) filter (where coalesce(e.has_child_addon, false)),
    'optionCounts',   coalesce((
      select jsonb_object_agg(o.opt, o.cnt)
      from (
        select opt, count(*) as cnt
        from (
          select distinct b.id as booking_id, unnest(b.selected_option_ids) as opt
          from public.enquiries b
          where b.trip_id = p_trip_id
            and b.deleted_at is null
            and b.cancelled_at is null
            and b.amount_paid > 0
        ) d
        group by opt
      ) o
    ), '{}'::jsonb),
    'retainedRevenue', coalesce((
      select sum(greatest(c.amount_paid - c.refund_amount, 0))
      from public.enquiries c
      where c.trip_id = p_trip_id
        and c.deleted_at is null
        and c.cancelled_at is not null
    ), 0)
  )
  from public.enquiries e
  where e.trip_id = p_trip_id
    and e.deleted_at is null
    and e.cancelled_at is null
    and e.amount_paid > 0;
$function$;

grant execute on function public.trip_revenue_snapshot(uuid) to authenticated;

-- Backfill: add retainedRevenue to saved copies from the trip's current
-- (non-deleted) cancelled enquiries. Only rows that don't have it yet.
update public.trip_finance_snapshots s
set trip_revenue = coalesce(s.trip_revenue, '{}'::jsonb) || jsonb_build_object(
  'retainedRevenue', coalesce((
    select sum(greatest(c.amount_paid - c.refund_amount, 0))
    from public.enquiries c
    where c.trip_id = s.trip_id
      and c.deleted_at is null
      and c.cancelled_at is not null
  ), 0)
)
where s.trip_revenue is null
   or not (s.trip_revenue ? 'retainedRevenue');
