-- =============================================
-- ULAA Travel Website - Database Schema
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- Upcoming Trips
-- =============================================
CREATE TABLE IF NOT EXISTS upcoming_trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration TEXT NOT NULL,
  description TEXT NOT NULL,
  highlights TEXT[] DEFAULT '{}',
  itinerary JSONB DEFAULT '[]',
  included TEXT[] DEFAULT '{}',
  not_included TEXT[] DEFAULT '{}',
  things_to_carry TEXT[] DEFAULT '{}',
  meeting_point TEXT,
  meeting_point_map_url TEXT,
  faqs JSONB DEFAULT '[]',
  total_seats INTEGER NOT NULL DEFAULT 20,
  seats_booked INTEGER NOT NULL DEFAULT 0,
  price DECIMAL(10,2),
  early_bird_price DECIMAL(10,2),
  early_bird_deadline DATE,
  cover_image TEXT,
  gallery_images TEXT[] DEFAULT '{}',
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Completed Trips
-- =============================================
CREATE TABLE IF NOT EXISTS completed_trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  map_url TEXT,
  slug TEXT UNIQUE NOT NULL,
  trip_date DATE NOT NULL,
  description TEXT NOT NULL,
  story TEXT,
  batch TEXT,
  participants INTEGER DEFAULT 0,
  cover_image TEXT,
  gallery_images TEXT[] DEFAULT '{}',
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Trip Images
-- =============================================
CREATE TABLE IF NOT EXISTS trip_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL,
  trip_type TEXT NOT NULL CHECK (trip_type IN ('upcoming', 'completed', 'gallery')),
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  is_cover BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Gallery
-- =============================================
CREATE TABLE IF NOT EXISTS gallery (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_url TEXT NOT NULL,
  alt_text TEXT,
  destination TEXT,
  sort_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Enquiries (Bookings)
-- =============================================
CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  age INTEGER,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT,
  emergency_contact TEXT,
  message TEXT,
  trip_id UUID,
  trip_title TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  source TEXT NOT NULL DEFAULT 'website'
    CHECK (source IN ('website', 'whatsapp', 'phone', 'instagram', 'walk_in', 'other')),
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  package_type TEXT NOT NULL DEFAULT 'normal' CHECK (package_type IN ('early_bird', 'normal')),
  total_amount DECIMAL(10,2),
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS enquiries_source_idx ON enquiries (source);
CREATE INDEX IF NOT EXISTS enquiries_is_paid_idx ON enquiries (is_paid);

-- =============================================
-- Testimonials
-- =============================================
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  photo TEXT,
  review TEXT NOT NULL,
  rating INTEGER DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  destination TEXT,
  is_published BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Site Content (editable copy, e.g. About page)
-- =============================================
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Notifications (for the admin panel bell)
-- Rows are created automatically by triggers, not the frontend.
-- =============================================
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

-- =============================================
-- Push Subscriptions (Web Push, one row per admin device/browser)
-- =============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- pg_net lets Postgres call the send-push edge function over HTTP
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =============================================
-- Row Level Security Policies
-- =============================================

-- Enable RLS
ALTER TABLE upcoming_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Public read for published trips
CREATE POLICY "Public read upcoming trips" ON upcoming_trips
  FOR SELECT USING (is_published = TRUE);

CREATE POLICY "Admin all upcoming trips" ON upcoming_trips
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public read completed trips" ON completed_trips
  FOR SELECT USING (is_published = TRUE);

CREATE POLICY "Admin all completed trips" ON completed_trips
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public read trip images" ON trip_images
  FOR SELECT USING (TRUE);

CREATE POLICY "Admin all trip images" ON trip_images
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public read gallery" ON gallery
  FOR SELECT USING (TRUE);

CREATE POLICY "Admin all gallery" ON gallery
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public insert enquiries" ON enquiries
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Admin read enquiries" ON enquiries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin update enquiries" ON enquiries
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Public read testimonials" ON testimonials
  FOR SELECT USING (is_published = TRUE);

CREATE POLICY "Admin all testimonials" ON testimonials
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public read site content" ON site_content
  FOR SELECT USING (TRUE);

CREATE POLICY "Admin all site content" ON site_content
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Admin read notifications" ON notifications
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin update notifications" ON notifications
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admin manage own push subscriptions" ON push_subscriptions
  FOR ALL
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

-- =============================================
-- Updated At Trigger
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_upcoming_trips_updated_at
  BEFORE UPDATE ON upcoming_trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_completed_trips_updated_at
  BEFORE UPDATE ON completed_trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_enquiries_updated_at
  BEFORE UPDATE ON enquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER site_content_updated_at
  BEFORE UPDATE ON site_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Notifications Trigger
-- Auto-creates a notification whenever a new enquiry comes in, and
-- also fires a Web Push notification via the send-push edge function.
-- SECURITY DEFINER so it can insert into `notifications` even though
-- the enquiry itself was inserted by an anonymous public visitor.
--
-- One-time setup required before this works: store the edge function's
-- shared secret in Supabase Vault (do this in the SQL editor directly,
-- never commit it):
--   select vault.create_secret('<your-rotated-secret>', 'edge_function_secret');
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

DROP TRIGGER IF EXISTS on_enquiry_created ON enquiries;
CREATE TRIGGER on_enquiry_created
  AFTER INSERT ON enquiries
  FOR EACH ROW EXECUTE FUNCTION notify_new_enquiry();

-- Enable realtime so the admin bell updates live without polling.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- =============================================
-- Storage Buckets (run in Supabase dashboard)
-- All uploads (trip covers, gallery, albums, testimonial photos) go
-- through a single public bucket. Paths are organized by folder
-- prefix (e.g. "trip-covers/...", "albums/<id>/...") rather than by
-- separate buckets.
-- =============================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('ulaa', 'ulaa', true);
