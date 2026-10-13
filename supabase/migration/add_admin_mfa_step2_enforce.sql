-- Admin two-factor sign-in — STEP 2 of 2: make the DATABASE require it.
--
-- Until now is_admin() meant "this user is on the admins list". It now also
-- means "and this login completed a second factor": Supabase puts the
-- assurance level in the access token, and `aal2` only appears after a valid
-- authenticator code. Every admin policy and admin-only function already
-- calls is_admin(), so this one change protects all of them — including the
-- booking-email function — even against someone who has the admin's password.
--
-- RUN THIS ONLY AFTER add_admin_mfa_step1_allowlist_check.sql, the frontend
-- deploy, and every admin has signed in once and set up their authenticator
-- app. The block below refuses to continue if any admin hasn't, so you can't
-- lock someone out by accident.
--
-- Admins who are signed in at the moment you run this keep a password-only
-- token (aal1) until they sign in again, so they will see the admin screens
-- empty until they do.
--
-- LOST PHONE / NEW PHONE: from the SQL editor remove that admin's factor —
--     delete from auth.mfa_factors
--      where user_id = (select id from auth.users where email = 'admin@example.com');
-- They then get the "set up two-factor" screen at their next sign-in.
--
-- ROLLBACK (back to allowlist-only):
--     create or replace function public.is_admin() returns boolean
--     language sql stable security definer set search_path = public as $$
--       select exists (select 1 from public.admins where user_id = auth.uid());
--     $$;

do $$
declare
  missing text;
begin
  select string_agg(coalesce(u.email, a.user_id::text), ', ') into missing
  from public.admins a
  left join auth.users u on u.id = a.user_id
  where not exists (
    select 1 from auth.mfa_factors f
    where f.user_id = a.user_id and f.status = 'verified' and f.factor_type = 'totp'
  );
  if missing is not null then
    raise exception 'Not run: these admins have no authenticator set up yet: %. Have them sign in once, finish the setup screen, then run this again. (Remove any account that is not an admin from public.admins.)', missing;
  end if;
end $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

grant execute on function public.is_admin() to anon, authenticated;
