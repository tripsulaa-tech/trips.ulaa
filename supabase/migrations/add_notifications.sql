-- Notifications for the admin panel.
-- Rows are created automatically by DB triggers (see below) so nothing
-- can slip through just because the frontend forgot to call an API.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,           -- e.g. 'new_enquiry'
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                    -- where clicking the notification should take the admin
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications (is_read) WHERE is_read = FALSE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Only logged-in admins can see or update notifications.
CREATE POLICY "Admin read notifications" ON notifications
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin update notifications" ON notifications
  FOR UPDATE USING (auth.role() = 'authenticated');

-- =============================================
-- Auto-create a notification whenever a new enquiry comes in.
-- SECURITY DEFINER so it can insert into `notifications` even though
-- the enquiry itself was inserted by an anonymous public visitor
-- (who has no insert rights on the notifications table).
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_enquiry_created ON enquiries;
CREATE TRIGGER on_enquiry_created
  AFTER INSERT ON enquiries
  FOR EACH ROW EXECUTE FUNCTION notify_new_enquiry();

-- =============================================
-- Enable realtime so the admin bell updates live without polling.
-- Safe to re-run: skips if already added to the publication.
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
