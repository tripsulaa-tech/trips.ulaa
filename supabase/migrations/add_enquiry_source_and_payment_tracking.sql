-- =============================================
-- Migration: Add enquiry source tracking and payment fields
-- These columns are already live in production (applied directly via
-- the SQL editor at some point) but were never committed as a
-- migration file. This documents that change so a fresh project
-- setup matches production.
-- =============================================

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website'
    CHECK (source IN ('website', 'whatsapp', 'phone', 'instagram', 'walk_in', 'other')),
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS package_type TEXT NOT NULL DEFAULT 'normal'
    CHECK (package_type IN ('early_bird', 'normal')),
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS enquiries_source_idx ON enquiries (source);
CREATE INDEX IF NOT EXISTS enquiries_is_paid_idx ON enquiries (is_paid);
