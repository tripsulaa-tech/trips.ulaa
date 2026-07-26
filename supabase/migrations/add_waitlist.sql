-- ============================================================================
-- ULAA — Add waitlist feature
-- Run this once in Supabase → SQL Editor. Mirrors the conventions already
-- used for `enquiries` (public insert only, admin does everything else,
-- notify_new_enquiry()-style trigger for the admin notification bell).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- waitlist
-- ----------------------------------------------------------------------------
-- trip_id is intentionally NOT a foreign key, same reasoning as
-- enquiries.trip_id: upcoming_trips rows get deleted/replaced by
-- completed_trips once a trip finishes, and we still want the historical
-- waitlist record to remain queryable.
create table public.waitlist (
  id            uuid not null default uuid_generate_v4(),
  trip_id       uuid not null,
  trip_title    text,
  full_name     text not null,
  phone         text not null,
  email         text not null,
  message       text,
  status        text not null default 'waiting'::text,
  notified_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint waitlist_pkey primary key (id),
  constraint waitlist_status_check
    check (status = any (array['waiting'::text, 'notified'::text, 'converted'::text, 'declined'::text])),
  -- Prevents the same person from spamming the same sold-out trip's waitlist
  -- with repeat submissions.
  constraint waitlist_trip_email_unique unique (trip_id, email)
);

create index waitlist_trip_id_idx on public.waitlist using btree (trip_id);
create index waitlist_status_idx on public.waitlist using btree (status);
create index waitlist_created_at_idx on public.waitlist using btree (created_at desc);

-- ----------------------------------------------------------------------------
-- notify_new_waitlist_signup — same shape as notify_new_enquiry(): drops an
-- in-app notification row and best-effort fires the existing send-push edge
-- function. Wrapped so a push failure never blocks the waitlist insert.
-- ----------------------------------------------------------------------------
create or replace function public.notify_new_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net'
as $function$
declare
  target_link text;
begin
  target_link := '/admin/waitlist?trip=' || new.trip_id::text;

  insert into notifications (type, title, body, link)
  values (
    'new_waitlist',
    'Waitlist signup from ' || new.full_name,
    coalesce(new.trip_title, 'A trip') || ' · ' || new.email,
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
        'title', 'Waitlist signup from ' || new.full_name,
        'body', coalesce(new.trip_title, 'A trip') || ' · ' || new.email,
        'link', target_link
      )
    );
  exception when others then
    raise warning 'send-push call failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

create trigger on_waitlist_created
  after insert on public.waitlist
  for each row execute function public.notify_new_waitlist_signup();

-- ----------------------------------------------------------------------------
-- RLS — public can only insert (submit the waitlist form); everything else
-- requires an authenticated admin session, identical to enquiries.
-- ----------------------------------------------------------------------------
alter table public.waitlist enable row level security;

create policy "Public insert waitlist" on public.waitlist
  for insert with check (true);
create policy "Admin read waitlist" on public.waitlist
  for select using (auth.role() = 'authenticated');
create policy "Admin update waitlist" on public.waitlist
  for update using (auth.role() = 'authenticated');
create policy "Admin delete waitlist" on public.waitlist
  for delete using (auth.role() = 'authenticated');
