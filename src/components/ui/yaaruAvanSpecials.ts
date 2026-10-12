// Yaaru Avan? special roles: pure assignment logic (no React, no storage).
// A special role sits on top of a core role (Tourist, Stranger or Pickpocket)
// and any player can get one. One special per player, never more.
// This file only decides WHO gets WHAT. What each special does in a round
// (points, vote rules, final guesses) is built on top of it in later phases.

export type SpecialId =
  | 'clown' | 'rivals'                           // Batch 1
  | 'returnTicket' | 'tripLeader' | 'backseatRider' // Batch 2
  | 'payback' | 'luckyDip' | 'lovers';           // Batch 3

/** Specials that sit on one player. Rivals (the Duelists) and Lovers need two. */
export type SoloSpecialId = Exclude<SpecialId, 'rivals' | 'lovers'>;

export interface SpecialDef {
  id: SpecialId;
  name: string;
  emoji: string;
  batch: 1 | 2 | 3;
  /** Rivals and Lovers are dealt to two players at once. */
  pair: boolean;
}

export const SPECIALS: readonly SpecialDef[] = [
  { id: 'clown', name: 'The Joy Fool', emoji: '🤡', batch: 1, pair: false },
  { id: 'returnTicket', name: 'The Boomerang', emoji: '🪃', batch: 2, pair: false },
  { id: 'tripLeader', name: 'Goddess of Justice', emoji: '⚖️', batch: 2, pair: false },
  { id: 'backseatRider', name: 'The Ghost', emoji: '👻', batch: 2, pair: false },
  { id: 'lovers', name: 'The Lovers', emoji: '💕', batch: 3, pair: true },
  { id: 'luckyDip', name: 'The Falafel Vendor', emoji: '🧆', batch: 3, pair: false },
  { id: 'payback', name: 'The Revenger', emoji: '🦸', batch: 3, pair: false },
  { id: 'rivals', name: 'The Duelists', emoji: '🤠', batch: 1, pair: true },
];

/** Smallest group each special can appear in. Anything not listed has no minimum. */
export const MIN_PLAYERS: Partial<Record<SpecialId, number>> = {
  luckyDip: 4,
  payback: 5,
  rivals: 5,
  lovers: 5,
};

/** One-line "what is it for" for each special, for the host's picker (not per player). */
export const SPECIAL_BLURB: Record<SpecialId, string> = {
  clown: 'The Joy Fool earns 4 bonus points if they are the first player voted out of the game.',
  returnTicket: 'The first time the Boomerang receives the majority of votes, they are not eliminated. Instead, all votes against the Boomerang are redirected back to the players who cast them!',
  tripLeader: 'If a vote ends in a tie, the Goddess of Justice decides which player will be eliminated. She can make this decision even if she has already been eliminated. Everyone is told who she is once the words are dealt.',
  backseatRider: 'Even after being eliminated, the Ghost retains the power to vote during future voting rounds.',
  lovers: 'Two players are secretly in love. If one lover is eliminated, the other is automatically eliminated too. This role is available when playing with 5 or more players.',
  luckyDip: 'At the start of each game, the Falafel Vendor receives a random special ability. Use it wisely and discover what surprises await! Available with 4 or more players.',
  payback: 'When the Revenger is eliminated, she can immediately eliminate one other player of her choice. Available with 5 or more players.',
  rivals: 'Two players are secretly paired in a duel. When one duelist is eliminated, they lose 2 points, while the surviving duelist earns 2 bonus points. Available with 5 or more players.',
};

const DEF_BY_ID = new Map(SPECIALS.map(d => [d.id, d]));

export const specialName = (id: SpecialId): string => DEF_BY_ID.get(id)?.name ?? id;

/** At most one special role per 3 players: 5 players -> 1, 9 players -> 3. A pair counts as one role. */
export const maxSpecials = (players: number): number => Math.max(0, Math.floor(players / 3));

export interface SpecialAssignment {
  special: SpecialId;
  /** Lucky Dip only: the ability it turned into (Batch 1 or 2, never a pair). */
  dipAs?: SoloSpecialId;
  /** Rivals and Lovers only: the other player in the pair. */
  partner?: string;
}

/** Anything carrying the special fields (a SpecialAssignment, or a game seat). */
export interface SpecialLike { special?: SpecialId; dipAs?: SoloSpecialId; partner?: string }

/** The ability that actually applies: a Lucky Dip's drawn ability, else the special itself. */
export const activeSpecial = (a: SpecialLike): SpecialId | undefined => a.dipAs ?? a.special;

/** Display name for an ability id; `dip` marks one that came from a Lucky Dip. */
export const specialDisplayName = (id: SpecialId, dip = false): string =>
  (dip ? `${specialName('luckyDip')}: ${specialName(id)}` : specialName(id));

/** Display name of the ability that applies, or null when there is no special. */
export const specialLabel = (a: SpecialLike): string | null => {
  const id = activeSpecial(a);
  if (!id) return null;
  return a.dipAs ? `${specialName('luckyDip')}: ${specialName(id)}` : specialName(id);
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
 *   A pair (Duelists, Lovers) is one role dealt to two players. Omit for the cap.
 * - Specials with a minimum group size (MIN_PLAYERS) are skipped in smaller groups.
 * - One special per player, so pairs can never share a player.
 * - Specials land on any player, whatever their core role.
 * - Lucky Dip draws any solo ability that is enabled and not
 *   already dealt this round. If none is left, the Lucky Dip is dropped.
 * Returns only the players who got one.
 */
export function assignSpecials(
  names: readonly string[],
  enabledAll: readonly SpecialId[],
  count: number = Infinity,
  rng: () => number = Math.random,
): Map<string, SpecialAssignment> {
  const enabled = enabledAll.filter(id => names.length >= (MIN_PLAYERS[id] ?? 0));
  const out = new Map<string, SpecialAssignment>();
  let slots = Math.min(Math.max(0, Math.floor(count)), maxSpecials(names.length));
  if (slots === 0) return out;

  const chosen: SpecialDef[] = [];
  for (const id of shuffled([...new Set(enabled)], rng)) {
    const def = DEF_BY_ID.get(id);
    if (!def) continue;
    const cost = 1;
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
      !d.pair && d.id !== 'luckyDip' && enabled.includes(d.id) && !dealt.has(d.id));
    if (pool.length === 0) { out.delete(name); continue; }
    const pick = pool[Math.floor(rng() * pool.length)].id as SoloSpecialId;
    dealt.add(pick);
    out.set(name, { ...a, dipAs: pick });
  }
  return out;
}

// ── What the specials do ──
// Tune the numbers here; the game and the tests both read these.

/** The Clown (Joy Fool) scores this if they are the first player voted out. */
export const CLOWN_POINTS = 4;
/** Duelists: the first one voted out loses this, the other gains it. */
export const RIVAL_POINTS = 2;

/** What a player sees on their boarding pass: exactly the words of the role list. */
export function describeSpecial(a: SpecialLike): string | null {
  const id = activeSpecial(a);
  if (!id) return null;
  const base = SPECIAL_BLURB[id].replace(/\s*(This role is available|Available) (when playing )?with \d+ or more players\.$/, '');
  if ((id === 'rivals' || id === 'lovers') && !a.partner) return null;
  return base;
}

/** Specials announced to everyone once the words are dealt: only the Goddess of Justice.
 *  Every other role stays secret. (A Falafel Vendor who draws her is announced too.) */
export const PUBLIC_SPECIALS: readonly SpecialId[] = ['tripLeader'];

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
}

/** Extra points from special roles, per player name. Added on top of team points. */
export function specialBonus(seats: readonly BonusSeat[]): Record<string, number> {
  const byName = new Map(seats.map(s => [s.name, s]));
  const out: Record<string, number> = {};
  for (const s of seats) {
    out[s.name] = 0;
    if (!s.special) continue;
    const sp = s.dipAs ?? s.special;
    if (sp === 'clown' && s.outOrder === 1) out[s.name] += CLOWN_POINTS;
    if (sp === 'rivals' && s.partner) {
      // Duel: the first one voted out loses points, the other wins them.
      const mine = s.outOrder ?? Infinity;
      const theirs = byName.get(s.partner)?.outOrder ?? Infinity;
      if (mine < theirs) out[s.name] -= RIVAL_POINTS;
      else if (theirs < mine) out[s.name] += RIVAL_POINTS;
    }
  }
  return out;
}
