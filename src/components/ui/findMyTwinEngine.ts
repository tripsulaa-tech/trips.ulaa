// "Find My Twin": the questions, the conversation prompts and a few helpers.
// The compatibility maths and the pairing live in the database
// (supabase/migration/add_find_my_twin.sql) so nobody can peek at another
// player's answers. The database only sees positions ("answer 3 was the left
// option"). The questions (how many, their wording, icons and weights) and the
// number of rounds are edited from Admin -> Games and saved in `site_content`
// ("game:twin-prompts"); the database reads that same row when it scores and
// pairs (supabase/migration/make_find_my_twin_editable.sql), so both sides always
// agree. Without a saved row the built-in 10 questions and 4 rounds apply.

import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import {
  BeachBall, Mountains, Leaf, Coffee, SunHorizon, MoonStars, ShoppingBag, ForkKnife, Camera, VideoCamera,
  Bed, Tent, Car, Airplane, ListChecks, Compass, Buildings, Tree, Armchair, PersonSimpleHike,
  Sun, Moon, Heart, Star, MusicNotes, Wine, Pizza, Fish, Bicycle, Train, Boat, Bus, Island, Campfire,
  Waves, Snowflake, Umbrella, Backpack, Binoculars, Suitcase, Hamburger, IceCream, Cookie, Television,
  GameController, PawPrint, Flower, Sunglasses, SwimmingPool, House, Clock, BookOpen, Wallet, MapPin,
  Smiley, Lightning, BeerStein, Martini, Cake, Path, Alarm, Footprints, Taxi, Motorcycle, MapTrifold,
} from '@phosphor-icons/react';

// The icons an admin can give a question option. Stored by key (never by
// component) so a saved question survives code changes.
export const TWIN_ICONS: Record<string, { label: string; Icon: PhosphorIcon }> = {
  beach: { label: 'Beach', Icon: BeachBall }, mountains: { label: 'Mountains', Icon: Mountains },
  leaf: { label: 'Leaf', Icon: Leaf }, coffee: { label: 'Coffee', Icon: Coffee },
  sunrise: { label: 'Sunrise', Icon: SunHorizon }, night: { label: 'Night', Icon: MoonStars },
  shopping: { label: 'Shopping', Icon: ShoppingBag }, food: { label: 'Food', Icon: ForkKnife },
  camera: { label: 'Camera', Icon: Camera }, video: { label: 'Video', Icon: VideoCamera },
  bed: { label: 'Bed', Icon: Bed }, tent: { label: 'Tent', Icon: Tent },
  car: { label: 'Car', Icon: Car }, airplane: { label: 'Airplane', Icon: Airplane },
  checklist: { label: 'Checklist', Icon: ListChecks }, compass: { label: 'Compass', Icon: Compass },
  buildings: { label: 'City', Icon: Buildings }, tree: { label: 'Tree', Icon: Tree },
  armchair: { label: 'Relax', Icon: Armchair }, hike: { label: 'Hike', Icon: PersonSimpleHike },
  sun: { label: 'Sun', Icon: Sun }, moon: { label: 'Moon', Icon: Moon },
  heart: { label: 'Heart', Icon: Heart }, star: { label: 'Star', Icon: Star },
  music: { label: 'Music', Icon: MusicNotes }, wine: { label: 'Wine', Icon: Wine },
  pizza: { label: 'Pizza', Icon: Pizza }, burger: { label: 'Burger', Icon: Hamburger },
  fish: { label: 'Seafood', Icon: Fish }, icecream: { label: 'Ice cream', Icon: IceCream },
  cookie: { label: 'Snacks', Icon: Cookie }, cake: { label: 'Cake', Icon: Cake },
  beer: { label: 'Beer', Icon: BeerStein }, cocktail: { label: 'Cocktail', Icon: Martini },
  bicycle: { label: 'Bicycle', Icon: Bicycle }, motorcycle: { label: 'Bike', Icon: Motorcycle },
  taxi: { label: 'Taxi', Icon: Taxi }, bus: { label: 'Bus', Icon: Bus },
  train: { label: 'Train', Icon: Train }, boat: { label: 'Boat', Icon: Boat },
  island: { label: 'Island', Icon: Island }, waves: { label: 'Waves', Icon: Waves },
  pool: { label: 'Pool', Icon: SwimmingPool }, snow: { label: 'Snow', Icon: Snowflake },
  umbrella: { label: 'Umbrella', Icon: Umbrella }, campfire: { label: 'Campfire', Icon: Campfire },
  backpack: { label: 'Backpack', Icon: Backpack }, suitcase: { label: 'Suitcase', Icon: Suitcase },
  binoculars: { label: 'Binoculars', Icon: Binoculars }, paw: { label: 'Wildlife', Icon: PawPrint },
  flower: { label: 'Flowers', Icon: Flower }, sunglasses: { label: 'Sunglasses', Icon: Sunglasses },
  house: { label: 'Home', Icon: House }, clock: { label: 'Clock', Icon: Clock },
  alarm: { label: 'Alarm', Icon: Alarm }, book: { label: 'Book', Icon: BookOpen },
  tv: { label: 'TV', Icon: Television }, game: { label: 'Games', Icon: GameController },
  wallet: { label: 'Budget', Icon: Wallet }, pin: { label: 'Pin', Icon: MapPin },
  map: { label: 'Map', Icon: MapTrifold }, path: { label: 'Path', Icon: Path },
  footprints: { label: 'Walk', Icon: Footprints }, smile: { label: 'Smile', Icon: Smiley },
  lightning: { label: 'Energy', Icon: Lightning },
};
export const TWIN_ICON_KEYS = Object.keys(TWIN_ICONS);
const FALLBACK_ICON = Compass;

interface TwinOption { label: string; icon: string; Icon: PhosphorIcon }
export interface TwinQuestion {
  id: string;
  /** Left option is stored as '0', right option as '1'. */
  left: TwinOption;
  right: TwinOption;
}

/** The editable part of one option (what gets saved). */
export interface TwinOptionDraft { label: string; icon: string }
export interface TwinQuestionDraft {
  left: TwinOptionDraft;
  right: TwinOptionDraft;
  /** How much this question counts toward the match % (1 to 20, compared with the other questions). */
  weight: number;
}

export const TWIN_MAX_LABEL = 24;
export const TWIN_MIN_QUESTIONS = 3;
export const TWIN_MAX_QUESTIONS = 20;
export const TWIN_MIN_WEIGHT = 1;
export const TWIN_MAX_WEIGHT = 20;
export const TWIN_DEFAULT_WEIGHT = 10;

// The built-in travel-style this-or-that questions. Their weights are the ones
// the database used before the questions became editable.
const q = (l: string, li: string, r: string, ri: string, weight: number): TwinQuestionDraft => ({ left: { label: l, icon: li }, right: { label: r, icon: ri }, weight });

export const TWIN_QUESTIONS_DEFAULTS: TwinQuestionDraft[] = [
  q('Beach', 'beach', 'Mountain', 'mountains', 14),
  q('Tea', 'leaf', 'Coffee', 'coffee', 8),
  q('Early bird', 'sunrise', 'Night owl', 'night', 10),
  q('Shopping', 'shopping', 'Food', 'food', 10),
  q('Photos', 'camera', 'Videos', 'video', 8),
  q('Cosy hotel', 'bed', 'Camping', 'tent', 12),
  q('Road trip', 'car', 'Flight', 'airplane', 10),
  q('Planned itinerary', 'checklist', 'Go with the flow', 'compass', 12),
  q('City lights', 'buildings', 'Countryside', 'tree', 8),
  q('Slow and relaxed', 'armchair', 'Adventure', 'hike', 8),
];

const toOption = (o: TwinOptionDraft): TwinOption => ({ label: o.label, icon: o.icon, Icon: (TWIN_ICONS[o.icon] ?? { Icon: FALLBACK_ICON }).Icon });
const toQuestion = (d: TwinQuestionDraft, i: number): TwinQuestion => ({ id: `q${i + 1}`, left: toOption(d.left), right: toOption(d.right) });

/** The live questions. Swapped in place by `applyTwinPrompts`, so everything that imports it sees the edits. */
export const QUESTIONS: TwinQuestion[] = TWIN_QUESTIONS_DEFAULTS.map(toQuestion);

export const TWIN_MAX_ROUNDS = 12;
export const MIN_PLAYERS = 2;

/** The conversation starter that unlocks once two twins have found each other. */
const PROMPTS: string[] = [
  'What\'s one place you desperately want to visit?',
  'What\'s the most spontaneous trip you have ever taken?',
  'What is the one thing you never leave home without on a trip?',
  'Describe your perfect travel day, from sunrise to midnight.',
];

/** One round per conversation starter: round 1 uses the first, round 2 the second, and so on. */
export const getMaxRounds = () => PROMPTS.length;

export const promptFor = (round: number) => PROMPTS[Math.max(0, Math.min(PROMPTS.length - 1, round - 1))];

// ── Editable content (Admin -> Games -> Find My Twin) ──
// The conversation starters (one per round) and the questions are editable.
export interface TwinPromptsContent { prompts: string[]; questions: TwinQuestionDraft[] }
export const TWIN_PROMPTS_DEFAULTS: TwinPromptsContent = {
  prompts: [...PROMPTS],
  questions: TWIN_QUESTIONS_DEFAULTS.map(d => ({ left: { ...d.left }, right: { ...d.right }, weight: d.weight })),
};

const cleanLabel = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, TWIN_MAX_LABEL) : '');
const cleanWeight = (v: unknown) => {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN;
  return Number.isFinite(n) ? Math.max(TWIN_MIN_WEIGHT, Math.min(TWIN_MAX_WEIGHT, n)) : TWIN_DEFAULT_WEIGHT;
};

type RawOption = { label?: unknown; icon?: unknown } | undefined;
const cleanIcon = (o: RawOption) => (typeof o?.icon === 'string' && o.icon in TWIN_ICONS ? o.icon : 'compass');

function sanitizeQuestions(raw: unknown): TwinQuestionDraft[] | null {
  if (!Array.isArray(raw) || raw.length < TWIN_MIN_QUESTIONS || raw.length > TWIN_MAX_QUESTIONS) return null;
  const out: TwinQuestionDraft[] = [];
  for (const item of raw) {
    const it = item as { left?: RawOption; right?: RawOption; weight?: unknown } | null;
    const l = cleanLabel(it?.left?.label);
    const r = cleanLabel(it?.right?.label);
    if (!l || !r || l.toLowerCase() === r.toLowerCase()) return null;
    out.push({ left: { label: l, icon: cleanIcon(it?.left) }, right: { label: r, icon: cleanIcon(it?.right) }, weight: cleanWeight(it?.weight) });
  }
  return out;
}

export function sanitizeTwinPrompts(raw: unknown): TwinPromptsContent | null {
  const body = raw as { prompts?: unknown; questions?: unknown } | null;
  const list = body?.prompts;
  const prompts = Array.isArray(list)
    ? list
      .map(p => (typeof p === 'string' ? p.replace(/\s+/g, ' ').trim().slice(0, 200) : ''))
      .filter(Boolean)
      .slice(0, TWIN_MAX_ROUNDS)
    : [];
  const questions = sanitizeQuestions(body?.questions);
  if (!prompts.length && !questions) return null;
  return {
    prompts: prompts.length ? prompts : [...TWIN_PROMPTS_DEFAULTS.prompts],
    questions: questions ?? TWIN_PROMPTS_DEFAULTS.questions,
  };
}

/** Swaps the live prompts and questions in place; `promptFor`, `getMaxRounds` and `QUESTIONS` are read on every render. */
export function applyTwinPrompts(c: TwinPromptsContent) {
  PROMPTS.splice(0, PROMPTS.length, ...c.prompts);
  QUESTIONS.splice(0, QUESTIONS.length, ...c.questions.map(toQuestion));
}

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
