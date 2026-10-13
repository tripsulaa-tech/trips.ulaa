-- Admin two-factor sign-in — STEP 1 of 2 (safe to run any time; changes no
-- behaviour by itself).
--
-- The admin login now has three stages: password -> "is this account an
-- admin?" -> authenticator code. The middle question has to be answerable
-- BEFORE the code is entered, so it can't use is_admin() once that function
-- starts demanding a verified code (STEP 2). This function is that question:
-- it only checks the allowlist, and says nothing about the strength of the
-- current login.
--
-- ROLLOUT ORDER
--   1. Run this file.
--   2. Deploy the frontend (AuthContext.tsx / AdminMfaStep.tsx / AdminLogin.tsx).
--   3. Each admin signs in once and sets up their authenticator app.
--   4. Run add_admin_mfa_step2_enforce.sql.
-- (Supabase: Authentication -> Sign In / Providers -> Multi-Factor must have
-- TOTP enabled — it is on by default for current projects.)

create or replace function public.is_admin_allowlisted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke execute on function public.is_admin_allowlisted() from public, anon;
grant execute on function public.is_admin_allowlisted() to authenticated;
