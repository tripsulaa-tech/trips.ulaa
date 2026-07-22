-- Web Push support: store per-device subscriptions for admins, and
-- have new-enquiry notifications trigger an actual push, not just
-- an in-app bell update.

-- =============================================
-- 1. Table of push subscriptions (one row per device/browser)
-- =============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Admins can manage their own subscriptions.
CREATE POLICY "Admin manage own push subscriptions" ON push_subscriptions
  FOR ALL
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

-- =============================================
-- 2. Enable pg_net so Postgres can call the edge function over HTTP
-- =============================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =============================================
-- 3. Extend notify_new_enquiry() to also fire a push, in addition
--    to the existing notifications-table insert it already does.
--
-- IMPORTANT: replace the placeholders below with your actual
-- project ref and a service-role-scoped secret before running this
-- (see PUSH_NOTIFICATIONS_SETUP.md, step 6).
-- =============================================
CREATE OR REPLACE FUNCTION notify_new_enquiry()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (type, title, body, link)
  VALUES (
    'new_enquiry',
    'New enquiry from ' || NEW.full_name,
    COALESCE(NEW.trip_title, 'General enquiry') || ' · ' || NEW.email,
    '/admin/enquiries'
  );

  -- Fire-and-forget HTTP call to the send-push edge function.
  -- The shared secret is pulled from Supabase Vault at call time — it is
  -- NEVER hardcoded here. Before running this migration, store it once via:
  --   select vault.create_secret('<your-new-rotated-secret>', 'edge_function_secret');
  -- (Do this in the SQL editor directly — not committed to this file or git.)
  PERFORM extensions.net.http_post(
    url := 'https://wephglgonrmtcmhfbjqe.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'edge_function_secret'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'title', 'New enquiry from ' || NEW.full_name,
      'body', COALESCE(NEW.trip_title, 'General enquiry') || ' · ' || NEW.email,
      'link', '/admin/enquiries'
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Trigger already exists from add_notifications.sql and doesn't need
-- to be recreated — it calls the function above, which now does both.
