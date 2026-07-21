-- Add an optional "batch" label (e.g. "Batch 1", "Batch 2") to completed trips,
-- shown as a tag next to the album title instead of being baked into the title text.
ALTER TABLE completed_trips
  ADD COLUMN IF NOT EXISTS batch TEXT;
