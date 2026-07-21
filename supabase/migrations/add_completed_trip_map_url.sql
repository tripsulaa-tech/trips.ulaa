-- Add an optional Google Maps link for the completed trip's destination,
-- so the location badge on the album page can deep-link to an exact pin
-- instead of falling back to a plain text search.
ALTER TABLE completed_trips
  ADD COLUMN IF NOT EXISTS map_url TEXT;
