-- ============================================================================
-- ULAA — Wire up is_no_show into the refund suggestion.
--
-- is_no_show was scaffolded onto enquiries but never actually used anywhere
-- (no frontend read/write, no trigger reference) — a legacy-field audit
-- flagged it as dead. Per the site's own T&C (cancellationPolicy.ts
-- `noShow`), a no-show forfeits the full amount paid, no exceptions, so
-- this wires the column into public.suggest_refund_amount()'s output
-- instead of dropping it.
--
-- on_enquiry_cancelled() already recomputes suggested_refund_amount when
-- cancelled_at transitions null -> set. This extends it to also recompute
-- whenever is_no_show is toggled on its own — an admin may mark a no-show
-- after the trip has already departed, independent of whether the booking
-- was ever formally cancelled in the system. Function name is left
-- unchanged to avoid touching the trigger definition below it.
-- ============================================================================

create or replace function public.on_enquiry_cancelled()
returns trigger
language plpgsql
as $function$
begin
  if new.cancelled_at is not null and old.cancelled_at is null then
    new.booking_status := 'cancelled';
  end if;

  -- Recompute the suggestion on either trigger: a fresh cancellation, or
  -- is_no_show flipping (in either direction — unmarking a mistaken
  -- no-show should fall back to the normal cancellation-window math).
  if (new.cancelled_at is not null and old.cancelled_at is null)
     or (new.is_no_show is distinct from old.is_no_show) then
    if new.is_no_show then
      new.suggested_refund_amount := 0;
    else
      new.suggested_refund_amount := public.suggest_refund_amount(new.id, coalesce(new.cancelled_at, now())::date);
    end if;
  end if;

  return new;
end;
$function$;
