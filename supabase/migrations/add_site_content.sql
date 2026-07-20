-- =============================================
-- Migration: Add site_content table for editable
-- copy (About page, etc.), managed from Admin.
-- Run this once in the Supabase SQL editor.
-- =============================================

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read site content" ON site_content
  FOR SELECT USING (TRUE);

CREATE POLICY "Admin all site content" ON site_content
  FOR ALL USING (auth.role() = 'authenticated');

-- Reuses the update_updated_at() function created in schema.sql
DROP TRIGGER IF EXISTS site_content_updated_at ON site_content;
CREATE TRIGGER site_content_updated_at
  BEFORE UPDATE ON site_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
