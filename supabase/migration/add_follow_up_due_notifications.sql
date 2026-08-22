-- ============================================================================
-- Notifies the admin (in-app + push, same channels as notify_new_enquiry())
-- the moment a Lead Follow-up (follow_up_at/follow_up_time, see
-- add_enquiry_follow_up.sql + add_contact_outcome.sql) or a Booking
-- Follow-up (booking_follow_up_at/booking_follow_up_time, see
-- add_booking_follow_up.sql) comes due — so a reminder the admin set for
-- "call back Aug 15 at 2pm" actually surfaces at 2pm instead of relying on
-- someone remembering to check the Enquiries tab.
--
-- Unlike notify_new_enquiry()/notify_new_waitlist_signup() (which fire
-- instantly off an INSERT trigger), a follow-up becomes "due" purely by
-- the clock ticking forward — nothing about the row changes. So this can't
-- be a row trigger; it's a function invoked on a schedule (pg_cron, set up
-- at the bottom of this file) that scans for anything due since it last ran.
--
-- All follow-up times in the app are entered by IST-based admins with no
-- timezone picker (see AdminContactOutcomeModal.tsx / AdminBookingFollowUpModal.tsx
-- <input type="time">), so "due" is evaluated against Asia/Kolkata local
-- time, not the DB's UTC `now()`.
--
-- Run this once in Supabase → SQL Editor (or `supabase db execute`).
-- Safe to re-run — cron.schedule() below upserts by job name.
-- ============================================================================

-- ---- De-dupe tracking columns -----------------------------------------
-- The cron job runs every few minutes, so without these it would re-fire
-- the same "due" reminder on every single run for the rest of the day (or
-- until the admin acts on it). Each column records the local date this
-- row's reminder was last pushed for — the function below only notifies
-- when that's distinct from today, i.e. once per reminder per day.
alter table public.enquiries
  add column if not exists follow_up_notified_on date;
alter table public.enquiries
  add column if not exists booking_follow_up_notified_on date;

-- ---- The scheduled check ------------------------------------------------
create or replace function public.notify_due_follow_ups()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  ist_now       timestamp := now() at time zone 'Asia/Kolkata';
  ist_today     date := ist_now::date;
  ist_clock     time := ist_now::time;
  target_link   text;
  push_secret   text;
  rec           record;
begin
  push_secret := (
    select decrypted_secret from vault.decrypted_secrets
    where name = 'edge_function_secret' limit 1
  );

  -- ---- Lead Follow-ups (pre-booking, "call back Aug 15") -----------------
  for rec in
    select *
    from public.enquiries
    where status = 'contacted'
      and follow_up_at = ist_today
      and (follow_up_time is null or follow_up_time::time <= ist_clock)
      and follow_up_notified_on is distinct from ist_today
  loop
    target_link := '/admin/enquiries?trip=' || coalesce(rec.trip_id::text, 'unlinked')
                   || '&enquiry=' || rec.id::text;

    insert into notifications (type, title, body, link)
    values (
      'lead_follow_up_due',
      'Follow up with ' || rec.full_name,
      coalesce(rec.trip_title, 'General enquiry') || ' · due today'
        || case when rec.follow_up_time is not null then ' at ' || rec.follow_up_time else '' end,
      target_link
    );

    begin
      perform net.http_post(
        url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || push_secret
        ),
        body := jsonb_build_object(
          'title', 'Follow up with ' || rec.full_name,
          'body', coalesce(rec.trip_title, 'General enquiry') || ' · due today'
            || case when rec.follow_up_time is not null then ' at ' || rec.follow_up_time else '' end,
          'link', target_link
        )
      );
    exception when others then
      raise warning 'send-push call failed (lead follow-up %): %', rec.id, sqlerrm;
    end;

    update public.enquiries set follow_up_notified_on = ist_today where id = rec.id;
  end loop;

  -- ---- Booking Follow-ups (post-booking, "balance payment due") ---------
  for rec in
    select *
    from public.enquiries
    where booking_state = 'active'
      and booking_follow_up_at = ist_today
      and (booking_follow_up_time is null or booking_follow_up_time::time <= ist_clock)
      and booking_follow_up_notified_on is distinct from ist_today
  loop
    target_link := '/admin/enquiries?trip=' || coalesce(rec.trip_id::text, 'unlinked')
                   || '&enquiry=' || rec.id::text;

    insert into notifications (type, title, body, link)
    values (
      'booking_follow_up_due',
      'Booking follow-up: ' || rec.full_name,
      coalesce(rec.booking_follow_up_type, 'Reminder') || ' · ' || coalesce(rec.trip_title, 'a trip')
        || ' · due today'
        || case when rec.booking_follow_up_time is not null then ' at ' || rec.booking_follow_up_time else '' end,
      target_link
    );

    begin
      perform net.http_post(
        url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || push_secret
        ),
        body := jsonb_build_object(
          'title', 'Booking follow-up: ' || rec.full_name,
          'body', coalesce(rec.booking_follow_up_type, 'Reminder') || ' · ' || coalesce(rec.trip_title, 'a trip')
            || ' · due today'
            || case when rec.booking_follow_up_time is not null then ' at ' || rec.booking_follow_up_time else '' end,
          'link', target_link
        )
      );
    exception when others then
      raise warning 'send-push call failed (booking follow-up %): %', rec.id, sqlerrm;
    end;

    update public.enquiries set booking_follow_up_notified_on = ist_today where id = rec.id;
  end loop;
end;
$function$;

-- ---- Schedule it ---------------------------------------------------------
-- Requires the pg_cron extension (Supabase → Database → Extensions →
-- enable "pg_cron"). Runs every 15 minutes, so a reminder set for "2:00 PM"
-- fires within 15 minutes of that time rather than waiting for a once-daily
-- pass. cron.schedule() upserts by job name, so re-running this file just
-- updates the existing schedule rather than creating duplicates.
select cron.schedule(
  'notify-due-follow-ups',
  '*/15 * * * *',
  $$select public.notify_due_follow_ups();$$
);
