// Yaaru Avan? special roles: pure assignment logic (no React, no storage).
// A special role sits on top of a core role (Tourist, Stranger or Pickpocket)
// Retriever is Tourist-only; Joy Fool and Revenger skip Pickpockets.
// One special per player, never more.
// This file only decides WHO gets WHAT. What each special does in a round
// (points, vote rules, final guesses) is built on top of it in later phases.

export type SpecialId =
  | 'joyFool' | 'duelists'                           // Batch 1
  | 'boomerang' | 'goddess' | 'ghost' // Batch 2
  | 'revenger' | 'falafelVendor' | 'lovers' | 'retriever';           // Batch 3

/** Specials that sit on one player. The Duelists and Lovers need two. */
export type SoloSpecialId = Exclude<SpecialId, 'duelists' | 'lovers'>;

export interface SpecialDef {
  id: SpecialId;
  name: string;
  emoji: string;
  batch: 1 | 2 | 3;
  /** Duelists and Lovers are dealt to two players at once. */
  pair: boolean;
}

export const SPECIALS: readonly SpecialDef[] = [
  { id: 'retriever', name: 'The Retriever', emoji: '🛟', batch: 3, pair: false },
  { id: 'joyFool', name: 'The Joy Fool', emoji: '🤡', batch: 1, pair: false },
  { id: 'boomerang', name: 'The Boomerang', emoji: '🪃', batch: 2, pair: false },
  { id: 'goddess', name: 'Goddess of Justice', emoji: '⚖️', batch: 2, pair: false },
  { id: 'ghost', name: 'The Ghost', emoji: '👻', batch: 2, pair: false },
  { id: 'lovers', name: 'The Lovers', emoji: '💕', batch: 3, pair: true },
  { id: 'falafelVendor', name: 'The Falafel Vendor', emoji: '🧆', batch: 3, pair: false },
  { id: 'revenger', name: 'The Revenger', emoji: '🦸', batch: 3, pair: false },
  { id: 'duelists', name: 'The Duelists', emoji: '🤠', batch: 1, pair: true },
];

/** Never dealt to a Pickpocket (they get no word and already have a last guess). */
export const NOT_FOR_PICKPOCKET: readonly SpecialId[] = ['joyFool', 'revenger'];

/** Smallest group each special can appear in. Anything not listed has no minimum. */
export const MIN_PLAYERS: Partial<Record<SpecialId, number>> = {
  falafelVendor: 4,
  revenger: 5,
  duelists: 5,
  lovers: 5,
};

/** True when a role cannot be dealt yet: Retriever needs 2+ Strangers, others need a minimum group size. */
export const roleLocked = (id: SpecialId, players: number | undefined, strangers: number): boolean =>
  (id === 'retriever' && strangers < 2) || (players !== undefined && players < (MIN_PLAYERS[id] ?? 0));

/** One-line "what is it for" for each special, for the host's picker (not per player). */
export const SPECIAL_BLURB: Record<SpecialId, string> = {
  retriever: 'Once per round, the Retriever (always a Tourist) can privately bring back the Tourist just voted out. Available when the round starts with 2 or more Strangers.',
  joyFool: 'The Joy Fool earns 4 bonus points if they are the first player voted out of the game.',
  boomerang: 'The first time the Boomerang receives the majority of votes, they are not eliminated. Instead, all votes against the Boomerang are redirected back to the players who cast them!',
  goddess: 'If a vote ends in a tie, the Goddess of Justice decides which player will be eliminated. She can make this decision even if she has already been eliminated. Everyone is told who she is once the words are dealt.',
  ghost: 'Even after being eliminated, the Ghost retains the power to vote during future voting rounds.',
  lovers: 'Two players are secretly in love. If one lover is eliminated, the other is automatically eliminated too. This role is available when playing with 5 or more players.',
  falafelVendor: 'At the start of each game, the Falafel Vendor receives a random special ability. Use it wisely and discover what surprises await! Available with 4 or more players.',
  revenger: 'When the Revenger is eliminated, she can immediately eliminate one other player of her choice. Available with 5 or more players.',
  duelists: 'Two players are secretly paired in a duel. When one duelist is eliminated, they lose 2 points, while the surviving duelist earns 2 bonus points. Available with 5 or more players.',
};

const DEF_BY_ID = new Map(SPECIALS.map(d => [d.id, d]));

export const specialName = (id: SpecialId): string => DEF_BY_ID.get(id)?.name ?? id;

/** At most one special role per 3 players: 5 players -> 1, 9 players -> 3. A pair counts as one role. */
export const maxSpecials = (players: number): number => Math.max(0, Math.floor(players / 3));

export interface SpecialAssignment {
  special: SpecialId;
  /** Falafel Vendor only: the ability it turned into (Batch 1 or 2, never a pair). */
  dipAs?: SoloSpecialId;
  /** Duelists and Lovers only: the other player in the pair. */
  partner?: string;
}

/** Anything carrying the special fields (a SpecialAssignment, or a game seat). */
export interface SpecialLike { special?: SpecialId; dipAs?: SoloSpecialId; partner?: string }

/** The ability that actually applies: a Falafel Vendor's drawn ability, else the special itself. */
export const activeSpecial = (a: SpecialLike): SpecialId | undefined => a.dipAs ?? a.special;

/** Display name for an ability id; `dip` marks one that came from a Falafel Vendor. */
export const specialDisplayName = (id: SpecialId, dip = false): string =>
  (dip ? `${specialName('falafelVendor')}: ${specialName(id)}` : specialName(id));

/** Display name of the ability that applies, or null when there is no special. */
export const specialLabel = (a: SpecialLike): string | null => {
  const id = activeSpecial(a);
  if (!id) return null;
  return a.dipAs ? `${specialName('falafelVendor')}: ${specialName(id)}` : specialName(id);
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
 * - Joy Fool and Revenger are never dealt to a Pickpocket (see NOT_FOR_PICKPOCKET),
 *   and a Falafel Vendor who is a Pickpocket cannot draw them either.
 * - Retriever needs 2+ Strangers at the deal and can only land on a Tourist, including via a Vendor.
 * - Falafel Vendor draws any solo ability that is enabled and not
 *   already dealt this round. If none is left, the Falafel Vendor is dropped.
 * Returns only the players who got one.
 */
export function assignSpecials(
  names: readonly string[],
  enabledAll: readonly SpecialId[],
  count: number = Infinity,
  rng: () => number = Math.random,
  /** Core role of each player, so the Joy Fool and Revenger can skip Pickpockets. */
  isPickpocket: (name: string) => boolean = () => false,
  isStranger: (name: string) => boolean = () => false,
): Map<string, SpecialAssignment> {
  const strangerCount = names.filter(isStranger).length;
  const enabled = enabledAll.filter(id => names.length >= (MIN_PLAYERS[id] ?? 0)
    && (id !== 'retriever' || strangerCount >= 2));
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

  // Joy Fool and Revenger never land on a Pickpocket. Deal those first so they
  // always get a pick of the non-Pickpockets; everything else takes who is left.
  const pool = shuffled(names, rng);
  const take = (ok: (n: string) => boolean): string | undefined => {
    const i = pool.findIndex(ok);
    return i < 0 ? undefined : pool.splice(i, 1)[0];
  };
  const restricted = (id: SpecialId) => id === 'retriever' || NOT_FOR_PICKPOCKET.includes(id);
  const eligible = (id: SpecialId, name: string) => id === 'retriever'
    ? !isPickpocket(name) && !isStranger(name)
    : !NOT_FOR_PICKPOCKET.includes(id) || !isPickpocket(name);
  const dealOrder = [...chosen.filter(d => restricted(d.id)), ...chosen.filter(d => !restricted(d.id))];
  for (const def of dealOrder) {
    if (def.pair) {
      const a = take(() => true);
      const b = take(() => true);
      if (a === undefined || b === undefined) continue;
      out.set(a, { special: def.id, partner: b });
      out.set(b, { special: def.id, partner: a });
    } else {
      const who = take(n => eligible(def.id, n));
      if (who !== undefined) out.set(who, { special: def.id });
    }
  }

  const dealt = new Set<SpecialId>(chosen.map(d => d.id));
  for (const [name, a] of out) {
    if (a.special !== 'falafelVendor') continue;
    const abilities = SPECIALS.filter(d =>
      !d.pair && d.id !== 'falafelVendor' && enabled.includes(d.id) && !dealt.has(d.id)
      && eligible(d.id, name));
    if (abilities.length === 0) { out.delete(name); continue; }
    const pick = abilities[Math.floor(rng() * abilities.length)].id as SoloSpecialId;
    dealt.add(pick);
    out.set(name, { ...a, dipAs: pick });
  }
  return out;
}

// ── What the specials do ──
// Tune the numbers here; the game and the tests both read these.

/** The Joy Fool scores this if they are the first player voted out. */
export const CLOWN_POINTS = 4;
/** Duelists: the first one voted out loses this, the other gains it. */
export const RIVAL_POINTS = 2;

/** What a player sees on their boarding pass: exactly the words of the role list. */
export function describeSpecial(a: SpecialLike): string | null {
  const id = activeSpecial(a);
  if (!id) return null;
  const base = SPECIAL_BLURB[id].replace(/\s*(This role is available|Available) (when playing )?with \d+ or more players\.$/, '');
  if ((id === 'duelists' || id === 'lovers') && !a.partner) return null;
  return base;
}

/** Specials announced to everyone once the words are dealt: only the Goddess of Justice.
 *  Every other role stays secret. (A Falafel Vendor who draws her is announced too.) */
export const PUBLIC_SPECIALS: readonly SpecialId[] = ['goddess'];

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
    if (sp === 'joyFool' && s.outOrder === 1) out[s.name] += CLOWN_POINTS;
    if (sp === 'duelists' && s.partner) {
      // Duel: the first one voted out loses points, the other wins them.
      const mine = s.outOrder ?? Infinity;
      const theirs = byName.get(s.partner)?.outOrder ?? Infinity;
      if (mine < theirs) out[s.name] -= RIVAL_POINTS;
      else if (theirs < mine) out[s.name] += RIVAL_POINTS;
    }
  }
  return out;
}
