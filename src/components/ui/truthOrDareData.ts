// Prompt bank for "Truth or Dare" (pass-and-play). Travel-flavoured and
// group-safe: no alcohol, no touching strangers, nothing risky or embarrassing
// enough to spoil a trip. Add lines freely; each list is shuffled per game and
// a prompt is never repeated until its list runs out.

export type TodKind = 'truth' | 'dare';
export type TodLevel = 'chill' | 'spicy' | 'wild';

export const TOD_LEVELS: { id: TodLevel; label: string; blurb: string }[] = [
  { id: 'chill', label: 'Chill', blurb: 'Easy icebreakers' },
  { id: 'spicy', label: 'Spicy', blurb: 'A little braver' },
  { id: 'wild', label: 'Wild', blurb: 'Go all in' },
];

const BASE: Record<TodKind, Record<TodLevel, string[]>> = {
  truth: {
    chill: [
      'What is the first thing you pack, every single time?',
      'Which place has been your favourite trip so far, and why?',
      'What is your go-to travel snack?',
      'Window seat, aisle seat or middle seat? Defend your answer.',
      'What is the best meal you have ever eaten while travelling?',
      'Are you an early-morning explorer or a sleep-in-and-brunch traveller?',
      'What is one destination you keep putting off, and what is stopping you?',
      'What song instantly puts you in holiday mode?',
      'What is your most useless travel gadget?',
      'Which famous landmark was the most underwhelming in real life?',
      'What is your best tip for packing light?',
      'Beach, mountains or city: pick one forever.',
      'What is the nicest thing a stranger has done for you on a trip?',
      'What is the one thing you always forget to pack?',
      'Which language do you wish you could speak fluently on your travels?',
      'What is your dream travel buddy like?',
    ],
    spicy: [
      'What is the most embarrassing thing that has happened to you while travelling?',
      'Have you ever got completely lost? What happened?',
      'What is a travel habit of yours that annoys other people?',
      'What is the most you have ever overspent on a trip, and was it worth it?',
      'Which group member would you trust most to navigate? Least?',
      'What is a lie you have told to get out of a plan on a trip?',
      'What is the pettiest thing that has ever annoyed you on a journey?',
      'What is the scariest moment you have had while travelling?',
      'Have you ever pretended to understand a local and just nodded along?',
      'What is something you did on a trip that you would never do at home?',
      'Who here would you pick as your emergency contact on a trip, and why?',
      'What is the worst accommodation you have ever stayed in?',
      'What is your biggest travel regret?',
      'What is the most unreasonable thing you have packed?',
      'If we got stranded for a day, who would crack first?',
      'What is the most awkward conversation you have had with a fellow traveller?',
    ],
    wild: [
      'Tell us about your most chaotic travel day, from start to finish.',
      'What is something about you that would surprise everyone in this group?',
      'What is the biggest risk you have taken on a trip, and would you do it again?',
      'What is the most dramatic thing you have done because of a missed flight or train?',
      'Which person in this group would be the worst travel partner and why? Say it kindly!',
      'What is a secret travel dream you have never told anyone?',
      'Describe the first impression you had of each person here.',
      'What is the biggest thing you have ever lied about on social media from a trip?',
      'What is one fear you want to beat before the end of this trip?',
      'If you could swap lives with anyone here for a week, who and why?',
      'What is the most spontaneous decision you have ever made while travelling?',
      'What is the one thing you would do on this trip if nobody judged you?',
      'What is the funniest rumour or misunderstanding you have been part of on a trip?',
      'Which travel red flag do you ignore when you really want to go?',
      'What is something you pretend to love about travelling but secretly do not?',
      'Share the most unhinged text or voice note you have sent from a trip.',
    ],
  },
  dare: {
    chill: [
      'Do your best flight-attendant safety demonstration.',
      'Give everyone in the group a travel nickname.',
      'Speak only in questions for the next two minutes.',
      'Do an impression of a tour guide describing the room you are in.',
      'Show the group the last photo in your camera roll and explain it.',
      'Sing the chorus of a song that mentions a place.',
      'Walk like a model down an imaginary airport runway.',
      'Talk in an accent of your choice until your next turn.',
      'Compliment every person in the group, one by one.',
      'Do a dramatic slow-motion reaction to seeing the sunrise.',
      'Teach the group one word or phrase in a language you know.',
      'Mime a travel scene and let the group guess it.',
      'Hold a plank for 20 seconds while telling us your best travel story.',
      'Say the alphabet backwards as fast as you can.',
      'Pose for a group photo in the silliest travel-brochure pose you can.',
      'Describe your dream trip in the voice of a nature documentary host.',
    ],
    spicy: [
      'Let the group pick a photo on your phone to post as a story.',
      'Do your best impression of someone in this group until they guess who.',
      'Swap a piece of clothing or an accessory with the person to your left for the next round.',
      'Dance for 30 seconds with no music.',
      'Call or voice-note someone you love and tell them one thing you adore about them.',
      'Give a two-minute travel pitch for a place you have never visited, as if you were a tour operator.',
      'Let someone in the group send one harmless emoji from your phone to anyone they choose.',
      'Do a catwalk and pose for a "Cover of a Travel Magazine" shot.',
      'Narrate everything you do in the third person until your next turn.',
      'Eat or drink something the group chooses (nothing gross, nothing you are allergic to!).',
      'Hold eye contact with the person across from you for 20 seconds without laughing.',
      'Recite a famous movie line with full drama.',
      'Do 10 squats while naming 10 countries.',
      'Fake a very emotional farewell to a place on the table, like an airport goodbye.',
      'Rewrite the lyrics of a famous song so it is about this trip and sing it.',
      'Let the group ask you any one question and answer it in a single word.',
    ],
    wild: [
      'Make up a rap about this trip, with at least four lines.',
      'Make a short video telling your future self about this trip and post it, or save it for later.',
      'Go up to the next table or group and get them to teach you a word in their language, then report back.',
      'Do a dramatic, over-the-top slow-motion run to the nearest doorway and back.',
      'Pitch the group on your wildest business idea for a travel startup, in 60 seconds.',
      'Let the group choose your next profile picture from your camera roll for 24 hours.',
      'Take a selfie with a stranger who agrees, and ask them for their best travel tip.',
      'Act out a full scene from a movie with the group playing the other roles.',
      'Do your most dramatic airport reunion with an inanimate object of the group\'s choice.',
      'Lead the group in a three-move dance routine and have everyone copy you.',
      'Switch seats with every person in the group, giving each one a compliment as you go.',
      'Plan a one-day itinerary for the group in 60 seconds, then commit to doing one stop from it.',
      'Do a stand-up comedy set about your worst travel moment, for one minute.',
      'Speak like a sports commentator describing the next five minutes of the group.',
      'Strike a pose that looks like a famous landmark and let the group guess which one.',
      'Wear something silly that the group picks for the rest of the game.',
    ],
  },
};

const MORE: Record<TodKind, Record<TodLevel, string[]>> = {
  truth: {
    chill: [
      'If you could teleport anywhere right now, where would you land first?',
      'What is the strangest food you have tried on a trip, and would you eat it again?',
      'Which of your travel photos is secretly your favourite?',
      'What would you tell your first-ever solo-trip self?',
      'Who in this group would you pick as your road-trip co-pilot?',
      'What is the most beautiful place you have ever woken up in?',
      'If your life was a travel documentary, what would it be called?',
      'What is the first thing you do when you check into a hotel room?',
    ],
    spicy: [
      'What is the most money you have wasted on a tourist trap?',
      'Whose trip photos make you secretly jealous?',
      'What is a rule you break on every single trip?',
      'What is the most awkward moment you have had with a local or a driver?',
      'Who here would get lost first on this trip? Why?',
      'What is a red flag in a travel partner that you can not forgive?',
      'Have you ever pretended to be fine on a trip when you were actually miserable?',
      'What is one thing you secretly judge other travellers for?',
    ],
    wild: [
      'What is the most outrageous thing you have done for the perfect photo?',
      'You are stranded on an island with one person here. Who, and what goes wrong first?',
      'What is a trip memory you have never fully told anyone?',
      'What is the boldest thing you want to do before this trip ends? Who will hold you to it?',
      'Rank everyone here by who would survive longest in the wilderness. Defend it.',
      'What is the biggest lie an itinerary ever told you?',
      'You can read one person\'s mind here for five minutes. Whose, and why?',
      'What would your friends say is your worst travel habit?',
    ],
  },
  dare: {
    chill: [
      'Name a country for every letter from A to M as fast as you can.',
      'Make up a slogan for this trip and get everyone to chant it.',
      'Do your best "arriving in a new city" movie-montage pose.',
      'Introduce the person on your left like they are a famous landmark.',
      'Say "I am a seasoned traveller" in five different accents.',
      'Tell a two-sentence horror story set in an airport.',
      'Show your reaction to seeing a breathtaking view for the first time.',
      'Describe the group\'s trip in three words per person.',
    ],
    spicy: [
      'Let the group pick a song and dance to it for 20 seconds.',
      'Re-enact the last thing you did today as dramatically as possible.',
      'Talk like a pirate captain giving directions until your next turn.',
      'Sketch your dream destination in 30 seconds and let the group guess it.',
      'Sell the group a trip to a place of their choosing in a 45-second pitch.',
      'Do a fashion-show walk using the most unlikely nearby item as an accessory.',
      'Invent a handshake with the person across from you, then perform it together.',
      'Whisper everything dramatically, like a spy, until your next turn.',
    ],
    wild: [
      'Perform a one-minute travel vlog intro as if you had a million followers.',
      'Recreate a famous movie-poster pose with the group and take a photo.',
      'Give an award-show speech thanking everyone for this trip. Include a tearful moment.',
      'Teach the group a dance move and make everyone do it together.',
      'Make up a song about the person on your right using three facts you know about them.',
      'Do a dramatic reality-show confession about this trip, straight to the camera.',
      'Pitch a surprise for the group in 30 seconds, then actually deliver it today.',
      'Let the group give you a silly character to play for the whole next round.',
    ],
  },
};

export const TOD_PROMPTS: Record<TodKind, Record<TodLevel, string[]>> = {
  truth: {
    chill: [...BASE.truth.chill, ...MORE.truth.chill],
    spicy: [...BASE.truth.spicy, ...MORE.truth.spicy],
    wild: [...BASE.truth.wild, ...MORE.truth.wild],
  },
  dare: {
    chill: [...BASE.dare.chill, ...MORE.dare.chill],
    spicy: [...BASE.dare.spicy, ...MORE.dare.spicy],
    wild: [...BASE.dare.wild, ...MORE.dare.wild],
  },
};

/** Twist cards: the whole group gets involved. Shown on "Surprise me" draws. */
export const TOD_TWISTS: { title: string; text: string }[] = [
  { title: 'Two truths and a lie', text: 'Tell three travel stories. The group votes on which one is made up.' },
  { title: 'Hot seat', text: 'Pick anyone. They ask you one question and you must answer honestly.' },
  { title: 'Group dare', text: 'Everyone strikes their best "just landed in paradise" pose at once. Pick the winner.' },
  { title: 'Most likely to', text: 'On three, everyone points at who is most likely to miss a flight. That person explains why they would.' },
  { title: 'Rapid fire', text: 'Answer five quick this-or-that travel questions from the group in 15 seconds.' },
  { title: 'Group story', text: 'Start a story with "We missed the last bus...". Everyone adds one sentence, round the circle.' },
  { title: 'Appreciation round', text: 'Everyone says one thing they admire about you. Then you do the same for the person on your left.' },
  { title: 'Swap', text: 'Hand this turn to someone else. They do a Truth or Dare of your choosing, and you owe them a favour.' },
  { title: 'Reverse', text: 'Ask the group one travel question of your own. Everyone answers, and you answer last.' },
  { title: 'Charades', text: 'Act out a famous place without speaking. The group has 30 seconds to guess it.' },
  { title: 'Group truth', text: 'Everyone shares their dream trip for next year. You go last and must top it.' },
  { title: 'Compliment chain', text: 'Give the person on your right a genuine compliment. They pass it on to the next person.' },
  { title: 'Plan it', text: 'The group gives you a destination and a budget. Pitch a one-day plan in 30 seconds.' },
  { title: 'Mirror', text: 'Pick a partner. For 20 seconds they copy your moves like a mirror, then swap.' },
];

// ── Editable content (Admin -> Games -> Truth or Dare) ──
export interface TodTwist { title: string; text: string }
export interface TodContent {
  prompts: Record<TodKind, Record<TodLevel, string[]>>;
  twists: TodTwist[];
}

export const TOD_DEFAULTS: TodContent = { prompts: TOD_PROMPTS, twists: TOD_TWISTS };

export const TOD_MAX_PROMPT = 300;
const KINDS: TodKind[] = ['truth', 'dare'];
const LEVEL_IDS: TodLevel[] = ['chill', 'spicy', 'wild'];

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Cleans saved content. A list that is missing or empty falls back to the built-in one,
 *  so a game can never end up with nothing to draw. */
export function sanitizeTodContent(raw: unknown): TodContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { prompts?: Record<string, Record<string, unknown>>; twists?: unknown };
  const prompts = {} as TodContent['prompts'];
  for (const k of KINDS) {
    prompts[k] = {} as Record<TodLevel, string[]>;
    for (const l of LEVEL_IDS) {
      const list = r.prompts?.[k]?.[l];
      const clean = Array.isArray(list) ? list.map(x => text(x, TOD_MAX_PROMPT)).filter(Boolean) : [];
      prompts[k][l] = clean.length ? clean : TOD_PROMPTS[k][l];
    }
  }
  const twists = Array.isArray(r.twists)
    ? r.twists
      .map(t => ({ title: text((t as TodTwist)?.title, 60), text: text((t as TodTwist)?.text, TOD_MAX_PROMPT) }))
      .filter(t => t.title && t.text)
    : [];
  return { prompts, twists: twists.length ? twists : TOD_TWISTS };
}
