// "Find My Twin": the questions, the conversation prompts and a few helpers.
// The compatibility maths and the pairing live in the database
// (supabase/migration/add_find_my_twin.sql) so nobody can peek at another
// player's answers. The ORDER of QUESTIONS must match that file.

export interface TwinQuestion {
  id: string;
  /** Left option is stored as '0', right option as '1'. */
  left: { label: string; emoji: string };
  right: { label: string; emoji: string };
}

export const QUESTIONS: TwinQuestion[] = [
  { id: 'place', left: { label: 'Beach', emoji: '🏖️' }, right: { label: 'Mountain', emoji: '🏔️' } },
  { id: 'drink', left: { label: 'Tea', emoji: '🍵' }, right: { label: 'Coffee', emoji: '☕' } },
  { id: 'clock', left: { label: 'Early bird', emoji: '🌅' }, right: { label: 'Night owl', emoji: '🦉' } },
  { id: 'spend', left: { label: 'Shopping', emoji: '🛍️' }, right: { label: 'Food', emoji: '🍜' } },
  { id: 'capture', left: { label: 'Photos', emoji: '📸' }, right: { label: 'Videos', emoji: '🎥' } },
];

export const MAX_ROUNDS = 4;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 24;

/** The conversation starter that unlocks once two twins have found each other. */
export const PROMPTS: string[] = [
  'What\'s one place you desperately want to visit?',
  'What\'s the most spontaneous trip you have ever taken?',
  'What is the one thing you never leave home without on a trip?',
  'Describe your perfect travel day, from sunrise to midnight.',
];

export const promptFor = (round: number) => PROMPTS[Math.max(0, Math.min(PROMPTS.length - 1, round - 1))];

/** The '01101' string the database stores. */
export const encodeAnswers = (picks: Array<0 | 1>) => picks.join('');

/** A friendly label for a match percentage. */
export function matchTitle(score: number): string {
  if (score >= 90) return 'Travel twins!';
  if (score >= 80) return 'Almost the same trip';
  if (score >= 70) return 'Great travel buddies';
  if (score >= 60) return 'Opposites that explore';
  return 'A fresh perspective';
}
