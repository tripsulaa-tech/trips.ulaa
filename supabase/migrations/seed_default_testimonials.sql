-- =============================================
-- Seed: Insert the default testimonials that were
-- previously hardcoded as a fallback in Testimonials.tsx,
-- so they become real, editable rows in Admin > Testimonials.
--
-- Safe to run more than once — it skips any row that
-- already matches on name + destination.
-- Run this once in the Supabase SQL editor.
-- =============================================

INSERT INTO testimonials (name, photo, review, rating, destination, is_published, sort_order)
SELECT * FROM (VALUES
  (
    'Priya Sharma',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80',
    'ULAA completely changed how I travel. I went from being someone who never traveled alone to summiting passes at 15,000 feet. The sisterhood is real — these trips gave me lifelong friends and a new version of myself.',
    5, 'Spiti Valley', true, 1
  ),
  (
    'Ananya Krishnan',
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&q=80',
    'As someone who was skeptical about group travel, ULAA proved me completely wrong. Small groups, thoughtful itineraries, and an organizer who genuinely cares. Already booked my second trip!',
    5, 'Kerala Backwaters', true, 2
  ),
  (
    'Meera Nair',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200&q=80',
    'The hidden gems ULAA finds are unreal. Places I didn''t even know existed. And the safety and comfort they provide makes you forget all your worries. Pure magic, every single time.',
    5, 'Meghalaya', true, 3
  ),
  (
    'Ritu Agarwal',
    'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=200&q=80',
    'I travelled solo for the first time ever on a ULAA trip and it was the best decision of my life. The team is professional, the destinations are stunning, and the women you meet become family.',
    5, 'Andaman Islands', true, 4
  )
) AS v(name, photo, review, rating, destination, is_published, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM testimonials t
  WHERE t.name = v.name AND t.destination = v.destination
);
