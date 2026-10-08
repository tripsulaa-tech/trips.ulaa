-- =============================================================================
-- add_registered_user_accounts.sql
-- =============================================================================
-- Customer accounts, for people who have already sent an enquiry.
--
--   * Sign-up (email + password, Supabase Auth) only succeeds when the email
--     matches a live row in public.enquiries. Enforced by a trigger on
--     auth.users, so calling the Auth API directly can't bypass it.
--   * Customers are NOT admins. Every admin policy still checks is_admin().
--   * my_enquiry_profile() lets a signed-in customer fetch the details from
--     their latest enquiry (to prefill the booking form) without opening up
--     read access on the enquiries table.
--
-- BEFORE YOU RUN THIS (Supabase dashboard)
--   * Authentication -> Providers -> Email: sign-ups ON, "Confirm email" ON.
--     Confirmation is what proves the person owns the enquiry email; without
--     it anyone who knows an enquiry email could claim that account.
--   * Authentication -> URL Configuration: add <your-site>/account to
--     Redirect URLs (confirmation links land there).
--   * Creating an admin from the dashboard ("Add user") now needs the email in
--     account_signup_exceptions first:
--       insert into public.account_signup_exceptions (email) values ('you@x.com');
-- Safe to re-run.
-- =============================================================================

create table if not exists public.account_signup_exceptions (
  email text primary key
);
alter table public.account_signup_exceptions enable row level security;
revoke all on table public.account_signup_exceptions from anon, authenticated;

-- Everyone who already has an account keeps working (not retroactively blocked).
create or replace function public.enforce_enquiry_for_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
begin
  if v_email <> '' and (
    exists (
      select 1 from public.enquiries e
      where lower(trim(e.email)) = v_email and e.deleted_at is null
    )
    or exists (
      select 1 from public.account_signup_exceptions x
      where lower(trim(x.email)) = v_email
    )
  ) then
    return new;
  end if;
  raise exception 'signup_requires_enquiry';
end;
$$;
revoke execute on function public.enforce_enquiry_for_signup() from public, anon, authenticated;

drop trigger if exists enforce_enquiry_for_signup on auth.users;
create trigger enforce_enquiry_for_signup
  before insert on auth.users
  for each row execute function public.enforce_enquiry_for_signup();

create or replace function public.my_enquiry_profile()
returns table (
  full_name         text,
  age               integer,
  phone             text,
  email             text,
  city              text,
  emergency_contact text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.full_name, e.age, e.phone, e.email, e.city, e.emergency_contact
  from public.enquiries e
  where lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    and e.deleted_at is null
  order by e.created_at desc
  limit 1;
$$;
revoke execute on function public.my_enquiry_profile() from public, anon;
grant  execute on function public.my_enquiry_profile() to authenticated;
