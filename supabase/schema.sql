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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TRIGGER update_site_content_updated_at
  BEFORE UPDATE ON site_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Storage Buckets (run in Supabase dashboard)
-- =============================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('trip-images', 'trip-images', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('gallery', 'gallery', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
