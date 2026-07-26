-- ============================================================================
-- ULAA — Notify admin when a seat frees up on a trip with a waitlist
-- Run this AFTER add_waitlist.sql (which must already be applied) in
-- Supabase → SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- notify_seat_available — fires after a trip's seats_booked count DROPS
-- (i.e. a cancellation freed up a seat). If that trip still has anyone
-- 'waiting' on the waitlist, drops an admin notification + push so the
-- admin knows to reach out, instead of relying on someone remembering to
-- check the waitlist page.
--
-- Deliberately does NOT auto-email/SMS the waitlisted person — there's no
-- outbound email/SMS service wired up in this app yet (only the in-app
-- notification bell + push, same as everywhere else). The actual outreach
-- to the customer stays a manual step for the admin, same as it already is
-- for enquiries.
-- ----------------------------------------------------------------------------
create or replace function public.notify_seat_available()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  waiting_count integer;
  target_link text;
begin
  -- Only care about a seat freeing up, not a seat being booked.
  if new.seats_booked >= old.seats_booked then
    return new;
  end if;

  select count(*) into waiting_count
    from public.waitlist
   where trip_id = new.id
     and status = 'waiting';

  if waiting_count = 0 then
    return new;
  end if;

  target_link := '/admin/waitlist?trip=' || new.id::text;

  insert into notifications (type, title, body, link)
  values (
    'seat_available',
    'A seat opened up on ' || new.title,
    waiting_count || ' ' || (case when waiting_count = 1 then 'person is' else 'people are' end)
      || ' waiting for this trip',
    target_link
  );

  begin
    perform net.http_post(
      url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'edge_function_secret' limit 1
        )
      ),
      body := jsonb_build_object(
        'title', 'A seat opened up on ' || new.title,
        'body', waiting_count || ' ' || (case when waiting_count = 1 then 'person is' else 'people are' end)
          || ' waiting for this trip',
        'link', target_link
      )
    );
  exception when others then
    raise warning 'send-push call failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

create trigger on_trip_seat_freed
  after update on public.upcoming_trips
  for each row execute function public.notify_seat_available();
