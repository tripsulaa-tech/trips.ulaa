// Stowaway: word pairs, clue challenges and dares.
// Explorers get one word of a pair, Stowaways get the other. Which side is
// which is decided at random every round (see stowawayEngine.ts), so the
// "first word" is never a giveaway. Every word appears in exactly one pair.

export type Level = 'easy' | 'medium' | 'hard';
export type Category = 'places' | 'food' | 'gear' | 'activities' | 'vibes';

export interface WordPair {
  id: string;
  category: Category;
  level: Level;
  a: string;
  b: string;
}

export const LEVELS: Array<{ id: Level; label: string; hint: string }> = [
  { id: 'easy', label: 'Easy', hint: 'Words are quite different' },
  { id: 'medium', label: 'Medium', hint: 'Clearly related' },
  { id: 'hard', label: 'Hard', hint: 'Nearly identical' },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  places: 'Places',
  food: 'Food',
  gear: 'Stay & gear',
  activities: 'Activities',
  vibes: 'Local vibes',
};

type Raw = Record<Category, Record<Level, Array<[string, string]>>>;

const RAW: Raw = {
  places: {
    easy: [
      ['Beach', 'Mountain'], ['Dunes', 'Rainforest'], ['Waterfall', 'Cave'], ['Island', 'Valley'],
      ['Monument', 'Lighthouse'], ['Palace', 'Glacier'], ['Village', 'Skyline'], ['Canyon', 'Lagoon'],
    ],
    medium: [
      ['Goa', 'Gokarna'], ['Coorg', 'Wayanad'], ['Munnar', 'Ooty'], ['Manali', 'Shimla'],
      ['Jaipur', 'Udaipur'], ['Hampi', 'Badami'], ['Pondicherry', 'Varkala'], ['Rishikesh', 'Haridwar'],
      ['Leh', 'Spiti'], ['Kodaikanal', 'Yercaud'], ['Alleppey', 'Kumarakom'], ['Darjeeling', 'Gangtok'],
      ['Jaisalmer', 'Bikaner'], ['Andaman', 'Lakshadweep'],
    ],
    hard: [
      ['Viewpoint', 'Lookout tower'], ['Fortress', 'Citadel'], ['Lake', 'Reservoir'], ['Dam', 'Barrage'],
      ['Old Goa', 'Fort Kochi'], ['Tea garden', 'Spice garden'], ['Bazaar', 'Flea market'], ['Monastery', 'Ashram'],
      ['Ridge', 'Summit'], ['Rann of Kutch', 'Salt flats'],
    ],
  },
  food: {
    easy: [
      ['Dosa', 'Pizza'], ['Buttermilk', 'Cola'], ['Biryani', 'Salad'], ['Momos', 'Burger'],
      ['Ice cream', 'Soup'], ['Samosa', 'Sandwich'], ['Maggi', 'Pasta'], ['Idli', 'Pancake'],
    ],
    medium: [
      ['Masala chai', 'Filter coffee'], ['Vada pav', 'Pav bhaji'], ['Parotta', 'Chapati'], ['Appam', 'Puttu'],
      ['Pani puri', 'Bhel puri'], ['Kulfi', 'Gelato'], ['Jalebi', 'Gulab jamun'], ['Thali', 'Buffet'],
      ['Fish curry', 'Prawn fry'], ['Chole bhature', 'Aloo paratha'], ['Tandoori chicken', 'Butter chicken'],
      ['Corn on the cob', 'Roasted peanuts'], ['Bonda', 'Bajji'], ['Payasam', 'Halwa'],
    ],
    hard: [
      ['Mango lassi', 'Mango shake'], ['Sweet lime soda', 'Lemon soda'], ['Rasgulla', 'Rasmalai'],
      ['Idiyappam', 'Noolputtu'], ['Egg roll', 'Kathi roll'], ['Banana chips', 'Jackfruit chips'],
      ['Poha', 'Upma'], ['Mysore pak', 'Besan ladoo'], ['Tender coconut', 'Sugarcane juice'], ['Dhokla', 'Khandvi'],
    ],
  },
  gear: {
    easy: [
      ['Tent', 'Hotel'], ['Backpack', 'Suitcase'], ['Sleeping bag', 'Bed'], ['Flashlight', 'Candle'],
      ['Sunscreen', 'Umbrella'], ['Hammock', 'Sofa'], ['Boots', 'Sandals'], ['Raincoat', 'Sweater'],
    ],
    medium: [
      ['Homestay', 'Resort'], ['Trolley bag', 'Duffel bag'], ['Power bank', 'Charger'], ['Houseboat', 'Cottage'],
      ['Treehouse', 'Cabin'], ['Hostel', 'Guesthouse'], ['Dorm', 'Villa'], ['Selfie stick', 'Tripod'],
      ['Water bottle', 'Thermos'], ['Sunglasses', 'Cap'], ['Windcheater', 'Poncho'], ['Binoculars', 'Camera'],
      ['Compass', 'Paper map'], ['Travel pillow', 'Eye mask'],
    ],
    hard: [
      ['Campfire', 'Bonfire'], ['Headlamp', 'Torch'], ['Hoodie', 'Jacket'], ['Sling bag', 'Tote bag'],
      ['Earbuds', 'Headphones'], ['Lantern', 'Lamp'], ['Pocket knife', 'Multitool'], ['Beanie', 'Balaclava'],
      ['Thermal wear', 'Fleece'], ['Alpenstock', 'Walking cane'],
    ],
  },
  activities: {
    easy: [
      ['Swimming', 'Hiking'], ['Trekking', 'Shopping'], ['Surfing', 'Skiing'], ['Cycling', 'Rowing'],
      ['Kayaking', 'Golfing'], ['Photography', 'Painting'], ['Dancing', 'Reading'], ['Fishing', 'Napping'],
    ],
    medium: [
      ['Rafting', 'Canoeing'], ['Paragliding', 'Skydiving'], ['Scuba diving', 'Snorkelling'],
      ['Stargazing', 'Bird watching'], ['Zipline', 'Flying fox'], ['Jeep ride', 'Boat ride'],
      ['Pottery class', 'Cooking class'], ['Yoga', 'Meditation'], ['Road trip', 'Flight'],
      ['Cafe hopping', 'Pub crawl'], ['Moonlit walk', 'Heritage walk'], ['Volleyball', 'Cricket'],
      ['Horse riding', 'Camel riding'], ['Singalong', 'Movie night'],
    ],
    hard: [
      ['Sunrise trek', 'Sunset trek'], ['Bungee jump', 'Rope swing'], ['Rock climbing', 'Rappelling'],
      ['Jungle safari', 'Desert safari'], ['Karaoke', 'Antakshari'], ['Sightseeing', 'City tour'],
      ['Sketching', 'Doodling'], ['Journaling', 'Scrapbooking'], ['Cliff jumping', 'Springboard'],
      ['Wild camping', 'Glamping'],
    ],
  },
  vibes: {
    easy: [
      ['Monsoon', 'Winter'], ['Dawn', 'Midnight'], ['Festival', 'Library'], ['Rain', 'Heatwave'],
      ['Crowd', 'Solitude'], ['Moonlight', 'Thunder'], ['Traffic', 'Birdsong'], ['Snowfall', 'Sandstorm'],
    ],
    medium: [
      ['Sleeper bus', 'Steam engine'], ['Ferry', 'Cable car'], ['Local train', 'Metro'], ['Dhaba', 'Bistro'],
      ['Roadside stall', 'Street cart'], ['Folk dance', 'Puppet show'], ['Temple bells', 'Church bells'],
      ['Kolam', 'Rangoli'], ['Bangles', 'Anklets'], ['Henna', 'Tattoo'], ['Handloom', 'Handicraft'],
      ['Sarees', 'Dupattas'], ['Dumb charades', 'Truth or dare'], ['Window seat', 'Aisle seat'],
    ],
    hard: [
      ['Auto rickshaw', 'Tuk tuk'], ['Bargaining', 'Haggling'], ['Gossip', 'Banter'], ['Photo dump', 'Reels binge'],
      ['Hill breeze', 'Sea breeze'], ['Golden hour', 'Blue hour'], ['Homesick', 'Wanderlust'],
      ['Nostalgia', 'Deja vu'], ['Giggles', 'Laughter'], ['Sunny day', 'Clear sky'],
    ],
  },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const WORD_PAIRS: WordPair[] = (Object.keys(RAW) as Category[]).flatMap(category =>
  (Object.keys(RAW[category]) as Level[]).flatMap(level =>
    RAW[category][level].map(([a, b]) => ({ id: `${slug(a)}_${slug(b)}`, category, level, a, b })),
  ),
);

// ── Clue challenge cards: a twist on how each player gives her clue ──
export interface Challenge { id: string; title: string; text: string }

export const CHALLENGES: Challenge[] = [
  { id: 'one-word', title: 'One word only', text: 'Give your clue in a single word.' },
  { id: 'feeling', title: 'Describe a feeling', text: 'Clue it by how it makes you feel, not what it is.' },
  { id: 'whisper', title: 'Whisper it', text: 'Whisper your clue. Everyone leans in.' },
  { id: 'no-repeat', title: 'No repeating', text: 'You cannot reuse an idea someone already said.' },
  { id: 'emoji', title: 'Emoji only', text: 'Use up to three emojis (say them out loud).' },
  { id: 'smell-sound', title: 'Smell or sound', text: 'Clue it with a smell or a sound it brings to mind.' },
  { id: 'colour', title: 'Name a colour', text: 'Your clue must be a colour or a shade.' },
  { id: 'memory', title: 'Trip memory', text: 'Clue it with a real memory from a trip. Keep it to one sentence.' },
  { id: 'opposite', title: 'The opposite', text: 'Say something it is NOT like.' },
  { id: 'rhyme', title: 'Make it rhyme', text: 'Your clue has to rhyme with something.' },
  { id: 'sentence-three', title: 'Three words', text: 'Exactly three words. No more, no less.' },
  { id: 'price', title: 'Rupees and paise', text: 'Clue it by how much it would cost.' },
  { id: 'act', title: 'Act it out', text: 'No talking. Act your clue in five seconds.' },
  { id: 'weather', title: 'Weather report', text: 'Describe it as a weather forecast.' },
];

// ── Trip dares for the losing side (optional) ──
export const DARES: string[] = [
  'Plan the next stop of the trip.',
  'Pick the playlist for the ride.',
  'Order the chai for the whole group.',
  'Do your best tour-guide voice for 20 seconds.',
  'Tell a travel story where one detail is a lie. Group guesses it.',
  'Give everyone a compliment about how they travel.',
  'Sing the chorus of any road trip song.',
  'Carry the first-aid bag on the next trek.',
  'Take the middle seat on the next ride.',
  'Be the group photographer for the next hour.',
  'Say the next three sentences in a different accent.',
  'Plan a surprise snack for the group.',
  'Teach everyone one word in your mother tongue.',
  'Describe your dream trip in exactly ten words.',
];

// ── Editable content (Admin -> Games -> Stowaway) ──
// The engine and the online room read WORD_PAIRS / CHALLENGES / DARES directly,
// so saved edits are applied by replacing the contents of those arrays in place
// (applyStowawayContent). The built-in lists are captured first so the admin can
// reset to them.

export interface StowawayPairInput { category: Category; level: Level; a: string; b: string }
export interface StowawayChallengeInput { id: string; title: string; text: string }
export interface StowawayContent {
  pairs: StowawayPairInput[];
  challenges: StowawayChallengeInput[];
  dares: string[];
}

export const STOWAWAY_CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
export const STOWAWAY_LEVELS = LEVELS.map(l => l.id);

export const STOWAWAY_DEFAULTS: StowawayContent = {
  pairs: WORD_PAIRS.map(({ category, level, a, b }) => ({ category, level, a, b })),
  challenges: CHALLENGES.map(c => ({ ...c })),
  dares: [...DARES],
};

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function sanitizeStowawayContent(raw: unknown): StowawayContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { pairs?: unknown; challenges?: unknown; dares?: unknown };

  let pairs: StowawayPairInput[] = Array.isArray(r.pairs)
    ? r.pairs.flatMap((p): StowawayPairInput[] => {
      const o = (p ?? {}) as Record<string, unknown>;
      const a = clean(o.a, 40);
      const b = clean(o.b, 40);
      const category = o.category as Category;
      const level = o.level as Level;
      if (!a || !b || a.toLowerCase() === b.toLowerCase() || !STOWAWAY_CATEGORIES.includes(category) || !STOWAWAY_LEVELS.includes(level)) return [];
      return [{ category, level, a, b }];
    })
    : [];
  // A round is dealt per level, so every level must keep some pairs.
  for (const level of STOWAWAY_LEVELS) {
    if (!pairs.some(p => p.level === level)) pairs = [...pairs, ...STOWAWAY_DEFAULTS.pairs.filter(p => p.level === level)];
  }

  const used = new Set<string>();
  const challenges: StowawayChallengeInput[] = Array.isArray(r.challenges)
    ? r.challenges.flatMap((c): StowawayChallengeInput[] => {
      const o = (c ?? {}) as Record<string, unknown>;
      const title = clean(o.title, 40);
      const text = clean(o.text, 200);
      if (!title || !text) return [];
      let id = clean(o.id, 40) || slug(title) || 'challenge';
      while (used.has(id)) id = `${id}-2`;
      used.add(id);
      return [{ id, title, text }];
    })
    : [];

  const dares = Array.isArray(r.dares) ? r.dares.map(d => clean(d, 200)).filter(Boolean) : [];

  return {
    pairs,
    challenges: challenges.length ? challenges : STOWAWAY_DEFAULTS.challenges,
    dares: dares.length ? dares : STOWAWAY_DEFAULTS.dares,
  };
}

export function applyStowawayContent(c: StowawayContent) {
  WORD_PAIRS.splice(0, WORD_PAIRS.length, ...c.pairs.map(p => ({ ...p, id: `${slug(p.a)}_${slug(p.b)}` })));
  CHALLENGES.splice(0, CHALLENGES.length, ...c.challenges);
  DARES.splice(0, DARES.length, ...c.dares);
}
