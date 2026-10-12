// Yaaru Fake? special roles: pure assignment logic (no React, no storage).
// A special role sits on top of a core role (Traveller, Pickpocket or Stranger)
// and any player can get one. One special per player, never more.
// This file only decides WHO gets WHAT. What each special does in a round
// (points, vote rules, final guesses) is built on top of it in later phases.

export type SpecialId =
  | 'clown' | 'rivals' | 'sleepyhead'                        // Batch 1
  | 'returnTicket' | 'tripLeader' | 'backseatRider' | 'driver' // Batch 2
  | 'buddies' | 'payback' | 'luckyDip';                       // Batch 3

/** Specials that sit on one player. Rivals and Buddies need two. */
export type SoloSpecialId = Exclude<SpecialId, 'rivals' | 'buddies'>;

export interface SpecialDef {
  id: SpecialId;
  name: string;
  batch: 1 | 2 | 3;
  /** Rivals and Buddies are dealt to two players at once. */
  pair: boolean;
}

export const SPECIALS: readonly SpecialDef[] = [
  { id: 'clown', name: 'Clown', batch: 1, pair: false },
  { id: 'rivals', name: 'Rivals', batch: 1, pair: true },
  { id: 'sleepyhead', name: 'Sleepyhead', batch: 1, pair: false },
  { id: 'returnTicket', name: 'Return Ticket', batch: 2, pair: false },
  { id: 'tripLeader', name: 'Trip Leader', batch: 2, pair: false },
  { id: 'backseatRider', name: 'Backseat Rider', batch: 2, pair: false },
  { id: 'driver', name: 'Driver', batch: 2, pair: false },
  { id: 'buddies', name: 'Buddies', batch: 3, pair: true },
  { id: 'payback', name: 'Payback', batch: 3, pair: false },
  { id: 'luckyDip', name: 'Lucky Dip', batch: 3, pair: false },
];

/** One-line "what is it for" for each special, for the host's picker (not per player). */
export const SPECIAL_BLURB: Record<SpecialId, string> = {
  clown: 'Get voted out in the first 2 stops and score +4, whatever your role.',
  rivals: 'Two players are Rivals. If your Rival is voted out before you, +2.',
  sleepyhead: 'Asleep at Stop 1: skips describing and stays silent. Still aboard at the end: +1.',
  returnTicket: 'The first time you are voted out, you stay aboard and the group votes again.',
  tripLeader: 'Breaks any tied vote. Everyone can see who the Trip Leader is.',
  backseatRider: 'When voted out, one guess at the other side\'s word: +3 if right. Keeps voting.',
  driver: 'Starts the description round at every stop. Everyone can see who the Driver is.',
  buddies: 'Two players are Buddies. Both still aboard at the end: +2 each.',
  payback: 'When voted out, take one other player with you. +2 if they were on the other side.',
  luckyDip: 'Turns into a random ability from the ticked ones (never a pair or Payback).',
};

const DEF_BY_ID = new Map(SPECIALS.map(d => [d.id, d]));

export const specialName = (id: SpecialId): string => DEF_BY_ID.get(id)?.name ?? id;

/** At most one special per 3 players: 5 players -> 1, 9 players -> 3. */
export const maxSpecials = (players: number): number => Math.max(0, Math.floor(players / 3));

export interface SpecialAssignment {
  special: SpecialId;
  /** Lucky Dip only: the ability it turned into (Batch 1 or 2, never a pair). */
  dipAs?: SoloSpecialId;
  /** Rivals and Buddies only: the other player in the pair. */
  partner?: string;
}

/** Anything carrying the special fields (a SpecialAssignment, or a game seat). */
export interface SpecialLike { special?: SpecialId; dipAs?: SoloSpecialId; partner?: string }

/** The ability that actually applies: a Lucky Dip's drawn ability, else the special itself. */
export const activeSpecial = (a: SpecialLike): SpecialId | undefined => a.dipAs ?? a.special;

/** Display name for an ability id; `dip` marks one that came from a Lucky Dip. */
export const specialDisplayName = (id: SpecialId, dip = false): string =>
  (dip ? `Lucky Dip: ${specialName(id)}` : specialName(id));

/** Display name of the ability that applies, or null when there is no special. */
export const specialLabel = (a: SpecialLike): string | null => {
  const id = activeSpecial(a);
  if (!id) return null;
  return a.dipAs ? `Lucky Dip: ${specialName(id)}` : specialName(id);
};

/** Every special is switched on for pass-and-play. */
export const ENABLED_SPECIALS: readonly SpecialId[] = SPECIALS.map(d => d.id);

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deals specials to a list of unique player names.
 * - `enabled`: which specials may appear (each at most once per round).
 * - `count`: how many specials to hand out; capped at maxSpecials(players).
 *   A pair (Rivals, Buddies) uses two of them. Omit for the cap.
 * - One special per player, so Rivals and Buddies can never share a player.
 * - Specials land on any player, whatever their core role.
 * - Lucky Dip draws a solo ability from Batch 1 or 2 that is enabled and not
 *   already dealt this round. If none is left, the Lucky Dip is dropped.
 * Returns only the players who got one.
 */
export function assignSpecials(
  names: readonly string[],
  enabled: readonly SpecialId[],
  count: number = Infinity,
  rng: () => number = Math.random,
): Map<string, SpecialAssignment> {
  const out = new Map<string, SpecialAssignment>();
  let slots = Math.min(Math.max(0, Math.floor(count)), maxSpecials(names.length));
  if (slots === 0) return out;

  const chosen: SpecialDef[] = [];
  for (const id of shuffled([...new Set(enabled)], rng)) {
    const def = DEF_BY_ID.get(id);
    if (!def) continue;
    const cost = def.pair ? 2 : 1;
    if (cost > slots) continue;
    chosen.push(def);
    slots -= cost;
    if (slots === 0) break;
  }

  const order = shuffled(names, rng);
  let next = 0;
  for (const def of chosen) {
    if (def.pair) {
      const a = order[next++];
      const b = order[next++];
      out.set(a, { special: def.id, partner: b });
      out.set(b, { special: def.id, partner: a });
    } else {
      out.set(order[next++], { special: def.id });
    }
  }

  const dealt = new Set<SpecialId>(chosen.map(d => d.id));
  for (const [name, a] of out) {
    if (a.special !== 'luckyDip') continue;
    const pool = SPECIALS.filter(d =>
      !d.pair && d.id !== 'luckyDip' && d.batch <= 2 && enabled.includes(d.id) && !dealt.has(d.id));
    if (pool.length === 0) { out.delete(name); continue; }
    const pick = pool[Math.floor(rng() * pool.length)].id as SoloSpecialId;
    dealt.add(pick);
    out.set(name, { ...a, dipAs: pick });
  }
  return out;
}

// ── What the specials do ──
// Tune the numbers here; the game and the tests both read these.

export const CLOWN_POINTS = 4;
/** The Clown scores if voted out at one of the first this-many stops. */
export const CLOWN_EARLY_STOPS = 2;
export const RIVAL_POINTS = 2;
export const SLEEPY_POINTS = 1;
export const BACKSEAT_POINTS = 3;
export const BUDDY_POINTS = 2;
export const PAYBACK_POINTS = 2;

/** What a player sees on their boarding pass. Null for specials not built yet. */
export function describeSpecial(a: SpecialLike): string | null {
  switch (activeSpecial(a)) {
    case 'clown':
      return `Get voted out in the first ${CLOWN_EARLY_STOPS} stops and you score +${CLOWN_POINTS}, whatever your role. Your team still loses its points.`;
    case 'rivals':
      return a.partner
        ? `${a.partner} is your Rival. If they are voted out before you, you score +${RIVAL_POINTS}.`
        : null;
    case 'sleepyhead':
      return `You are asleep at Stop 1: skip your turn in the description round and stay silent in the discussion. Awake from Stop 2. Still aboard at the end of the round: +${SLEEPY_POINTS}.`;
    case 'returnTicket':
      return 'The first time you are voted out, you stay aboard and the group votes again.';
    case 'tripLeader':
      return 'You are the Trip Leader. If the vote is tied, you decide.';
    case 'backseatRider':
      return `When you are voted out you get one guess at the other side's word: +${BACKSEAT_POINTS} if right. You keep voting from the back seat.`;
    case 'driver':
      return 'You are the Driver. You start the description round at every stop.';
    case 'buddies':
      return a.partner
        ? `${a.partner} is your Buddy. If you are both still aboard at the end of the round, you each score +${BUDDY_POINTS}.`
        : null;
    case 'payback':
      return `When you are voted out, you take one other player with you. +${PAYBACK_POINTS} if they were on the other side.`;
    default:
      return null;
  }
}

/** Specials everyone can see on the vote screen, because the group needs them. */
export const PUBLIC_SPECIALS: readonly SpecialId[] = ['tripLeader', 'driver'];

/** The bits of a seat the bonus rules need. */
export interface BonusSeat {
  name: string;
  special?: SpecialId;
  dipAs?: SoloSpecialId;
  partner?: string;
  /** Stop number (1, 2, ...) at which they were voted out. Unset if never voted out. */
  outStop?: number;
  /** 1 for the first player voted out this round, 2 for the next, ... */
  outOrder?: number;
  /** Backseat Rider guessed the other side's word correctly. */
  riderHit?: boolean;
  /** Payback took down a player from the other side. */
  paybackHit?: boolean;
}

/** Extra points from special roles, per player name. Added on top of team points. */
export function specialBonus(seats: readonly BonusSeat[]): Record<string, number> {
  const byName = new Map(seats.map(s => [s.name, s]));
  const out: Record<string, number> = {};
  for (const s of seats) {
    out[s.name] = 0;
    if (!s.special) continue;
    const sp = s.dipAs ?? s.special;
    if (sp === 'clown' && s.outStop !== undefined && s.outStop <= CLOWN_EARLY_STOPS) out[s.name] += CLOWN_POINTS;
    if (sp === 'rivals' && s.partner) {
      const rival = byName.get(s.partner);
      const rivalOut = rival?.outOrder;
      if (rivalOut !== undefined && rivalOut < (s.outOrder ?? Infinity)) out[s.name] += RIVAL_POINTS;
    }
    if (sp === 'sleepyhead' && s.outOrder === undefined) out[s.name] += SLEEPY_POINTS;
    if (sp === 'backseatRider' && s.riderHit) out[s.name] += BACKSEAT_POINTS;
    if (sp === 'payback' && s.paybackHit) out[s.name] += PAYBACK_POINTS;
    if (sp === 'buddies' && s.partner && s.outOrder === undefined && byName.get(s.partner)?.outOrder === undefined) {
      out[s.name] += BUDDY_POINTS;
    }
  }
  return out;
}
