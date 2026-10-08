// "Find My Twin": the questions, the conversation prompts and a few helpers.
// The compatibility maths and the pairing live in the database
// (supabase/migration/add_find_my_twin.sql) so nobody can peek at another
// player's answers. The ORDER of QUESTIONS must match that file.

import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import {
  BeachBall, Mountains, Leaf, Coffee, SunHorizon, MoonStars, ShoppingBag, ForkKnife, Camera, VideoCamera,
  Bed, Tent, Car, Airplane, ListChecks, Compass, Buildings, Tree, Armchair, PersonSimpleHike,
} from '@phosphor-icons/react';

interface TwinOption { label: string; Icon: PhosphorIcon }
export interface TwinQuestion {
  id: string;
  /** Left option is stored as '0', right option as '1'. */
  left: TwinOption;
  right: TwinOption;
}

// Ten travel-style this-or-that questions. Keep the order in sync with the
// weights in supabase/migration/update_find_my_twin_10_questions.sql.
export const QUESTIONS: TwinQuestion[] = [
  { id: 'place', left: { label: 'Beach', Icon: BeachBall }, right: { label: 'Mountain', Icon: Mountains } },
  { id: 'drink', left: { label: 'Tea', Icon: Leaf }, right: { label: 'Coffee', Icon: Coffee } },
  { id: 'clock', left: { label: 'Early bird', Icon: SunHorizon }, right: { label: 'Night owl', Icon: MoonStars } },
  { id: 'spend', left: { label: 'Shopping', Icon: ShoppingBag }, right: { label: 'Food', Icon: ForkKnife } },
  { id: 'capture', left: { label: 'Photos', Icon: Camera }, right: { label: 'Videos', Icon: VideoCamera } },
  { id: 'stay', left: { label: 'Cosy hotel', Icon: Bed }, right: { label: 'Camping', Icon: Tent } },
  { id: 'move', left: { label: 'Road trip', Icon: Car }, right: { label: 'Flight', Icon: Airplane } },
  { id: 'pace', left: { label: 'Planned itinerary', Icon: ListChecks }, right: { label: 'Go with the flow', Icon: Compass } },
  { id: 'scene', left: { label: 'City lights', Icon: Buildings }, right: { label: 'Countryside', Icon: Tree } },
  { id: 'vibe', left: { label: 'Slow and relaxed', Icon: Armchair }, right: { label: 'Adventure', Icon: PersonSimpleHike } },
];

export const MAX_ROUNDS = 4;
export const MIN_PLAYERS = 2;

/** The conversation starter that unlocks once two twins have found each other. */
const PROMPTS: string[] = [
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
