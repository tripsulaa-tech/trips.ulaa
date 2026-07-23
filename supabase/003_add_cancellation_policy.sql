-- ============================================================================
-- Migration: Per-trip Cancellation Policy
-- Run this directly against the live DB (SQL Editor or psql).
--
-- Adds a `cancellation_policy` jsonb column to `upcoming_trips` so each trip
-- can have its own refund-by-day schedule, editable from
-- Admin -> Upcoming Trips -> Add/Edit Trip -> Cancellation Policy.
--
-- Shape stored in this column (see src/types/index.ts -> CancellationPolicy):
-- {
--   "payment_due_days": 30,
--   "refund_min_days": 7,
--   "refund_max_days": 14,
--   "tiers": [
--     { "min_days": 45, "max_days": null, "description": "..." },
--     { "min_days": 31, "max_days": 45,   "description": "..." },
--     { "min_days": null, "max_days": 30, "description": "..." }
--   ]
-- }
--
-- Existing trips will have cancellation_policy = null until an admin opens
-- and re-saves them; the app falls back to DEFAULT_CANCELLATION_POLICY
-- (src/constants/cancellationPolicy.ts) on both Admin and the public trip
-- page whenever this column is null, so nothing breaks for older rows.
-- ============================================================================

alter table public.upcoming_trips
  add column if not exists cancellation_policy jsonb;
