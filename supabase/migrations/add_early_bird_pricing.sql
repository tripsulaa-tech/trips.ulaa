-- =============================================
-- Migration: Add early-bird pricing to upcoming_trips
-- Run this once in the Supabase SQL editor.
-- =============================================

ALTER TABLE upcoming_trips
  ADD COLUMN IF NOT EXISTS early_bird_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS early_bird_deadline DATE;
