-- ============================================================================
-- ULAA — Fix waitlist conversion trigger + seat notification dedup
-- Run this once in Supabase → SQL Editor.
--
-- Two fixes:
--
-- 1. enforce_waitlist_conversion(): The schema.sql snapshot still had the
--    old version checking converted_enquiry_id (singular column) instead
--    of converted_enquiry_ids (array). The migration
--    add_waitlist_partial_group_conversion.sql already deployed the correct
--    version to the live DB — this migration is only needed if your DB is
--    still running the old version. Safe to re-run either way (CREATE OR
--    REPLACE).
--
-- 2. notify_seat_available(): Two concurrent cancellations (or a bulk
--    cancel) could both fire this trigger before the other's notification
--    row was visible, producing duplicate "seat opened up" notifications
--    for the same trip within seconds. Added a 30-second cooldown check
--    against the notifications table so the admin gets one notification,
--    not two.
-- ============================================================================

-- 1. Ensure enforce_waitlist_conversion uses the array column
create or replace function public.enforce_waitlist_conversion()
returns trigger
language plpgsql
as $function$
declare
  v_needed int := greatest(coalesce(new.group_size, 1), 1);
begin
  if new.converted_enquiry_ids is distinct from old.converted_enquiry_ids then
    if exists (
      select 1 from unnest(new.converted_enquiry_ids) eid
      where not exists (select 1 from public.enquiries where id = eid and amount_paid > 0)
    ) then
      raise exception 'Cannot link a conversion without an advance payment recorded on that enquiry.';
    end if;
  end if;

  if new.status = 'converted' and old.status is distinct from 'converted' then
    if coalesce(array_length(new.converted_enquiry_ids, 1), 0) < v_needed then
      raise exception 'Cannot mark converted until all % seat(s) in this group are linked to a paid enquiry.', v_needed;
    end if;
  end if;

  if old.status = 'converted' and new.status is distinct from 'converted' then
    if exists (
      select 1 from unnest(old.converted_enquiry_ids) eid
      where exists (select 1 from public.enquiries where id = eid and cancelled_at is null)
    ) then
      raise exception 'This waitlist entry is linked to an active booking. Cancel the booking in Enquiries first.';
    end if;
  end if;

  return new;
end;
$function$;


-- 2. Add deduplication cooldown to notify_seat_available
create or replace function public.notify_seat_available()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  waiting_count integer;
  target_link text;
  recent_exists boolean;
begin
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

  -- Deduplication: skip if a seat_available notification for this same trip
  -- was already created within the last 30 seconds.
  select exists (
    select 1 from public.notifications
     where type = 'seat_available'
       and link like '%' || new.id::text || '%'
       and created_at > now() - interval '30 seconds'
  ) into recent_exists;

  if recent_exists then
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
