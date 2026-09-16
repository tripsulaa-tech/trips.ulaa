-- ============================================================================
-- add_public_text_length_guards.sql
--
-- Security-audit follow-up. `enquiries` and `waitlist` both accept public,
-- unauthenticated inserts (RLS: `with check (true)`) from the booking form
-- and waitlist signup. The only validation on their free-text columns
-- (full_name, phone, email, city, emergency_contact, message) previously
-- lived client-side in src/utils/formValidation.ts -- pure UX, since the
-- Supabase anon key is public and anyone can POST directly to
-- /rest/v1/enquiries or /rest/v1/waitlist, bypassing the React form
-- entirely. This adds real, non-bypassable length bounds at the DB layer.
--
-- Run this directly in Supabase -> SQL Editor against the live database,
-- then it's folded into schema.sql (already done in this commit).
-- ============================================================================

alter table public.enquiries
  add constraint enquiries_full_name_len check (char_length(full_name) between 1 and 120),
  add constraint enquiries_phone_len check (char_length(phone) <= 20),
  add constraint enquiries_email_len check (char_length(email) <= 254),
  add constraint enquiries_city_len check (city is null or char_length(city) <= 100),
  add constraint enquiries_emergency_contact_len check (emergency_contact is null or char_length(emergency_contact) <= 100),
  add constraint enquiries_message_len check (message is null or char_length(message) <= 2000);

alter table public.waitlist
  add constraint waitlist_full_name_len check (char_length(full_name) between 1 and 120),
  add constraint waitlist_phone_len check (char_length(phone) <= 20),
  add constraint waitlist_email_len check (char_length(email) <= 254),
  add constraint waitlist_message_len check (message is null or char_length(message) <= 2000);
