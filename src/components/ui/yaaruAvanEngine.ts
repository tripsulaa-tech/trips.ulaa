// Yaaru Avan engine: pure game logic (roles, the no-repeat word bag, win checks,
// points and awards). No React here, so it stays easy to reason about.
// Only the word bag, player names and settings are saved on the device.

import { DARES, WORD_PAIRS } from './yaaruAvanWords';
import type { Category, Level, WordPair } from './yaaruAvanWords';
import { assignSpecials } from './yaaruAvanSpecials';
import type { SoloSpecialId, SpecialId } from './yaaruAvanSpecials';

export type Role = 'tourist' | 'stranger' | 'pickpocket';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

/** Undercover's scores: Tourists 2 each, a winning Stranger 10, a winning Pickpocket 6
 *  (a Pickpocket wins by lasting to the end or by guessing the Tourists' word). */
export const POINTS = { touristWin: 2, strangerSurvive: 10, pickpocketSurvive: 6, pickpocketSteal: 6 } as const;

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Roles ──

export interface RoleCounts { tourists: number; strangers: number; pickpockets: number }

export const maxPickpockets = (players: number) => (players >= 10 ? 2 : 1);

/** Tourists must outnumber the sneaky side (Strangers + Pickpockets) at the start. */
export function countsFor(players: number, strangers: number, pickpockets: number): RoleCounts {
  return { tourists: players - strangers - pickpockets, strangers, pickpockets };
}

export function rolesValid(players: number, strangers: number, pickpockets: number): boolean {
  if (players < MIN_PLAYERS || players > MAX_PLAYERS) return false;
  if (strangers < 0 || pickpockets < 0 || pickpockets > maxPickpockets(players)) return false;
  if (strangers + pickpockets < 1) return false; // at least one Stranger or one Pickpocket
  return players - strangers - pickpockets > strangers + pickpockets;
}

export function recommendedRoles(players: number): { strangers: number; pickpockets: number } {
  const strangers = players >= 11 ? 3 : players >= 8 ? 2 : 1;
  const pickpockets = players >= 5 ? 1 : 0;
  // Safety net: shrink until valid (only matters for odd future tweaks).
  let s = strangers;
  let l = pickpockets;
  while (!rolesValid(players, s, l) && l > 0) l -= 1;
  while (!rolesValid(players, s, l) && s > 1) s -= 1;
  return { strangers: s, pickpockets: l };
}

/** Clamps role counts into a valid split after the player count changes. */
export function clampRoles(players: number, strangers: number, pickpockets: number): { strangers: number; pickpockets: number } {
  let l = Math.min(pickpockets, maxPickpockets(players));
  let s = Math.max(0, strangers);
  if (s + l < 1) s = 1;
  while (!rolesValid(players, s, l) && l > 0) { l -= 1; if (s + l < 1) s = 1; }
  while (!rolesValid(players, s, l) && s > 1) s -= 1;
  return { strangers: s, pickpockets: l };
}

export interface Seat {
  name: string;
  role: Role;
  word: string | null;   // null for the Pickpocket
  seat: string;          // ticket seat number, e.g. 14C
  alive: boolean;
  special?: SpecialId;       // optional special role on top of the core role
  dipAs?: SoloSpecialId;     // Falafel Vendor only: the ability it turned into
  partner?: string;          // Duelists / Lovers only: the other player
  outStop?: number;          // stop at which they were voted out (unset while aboard)
  outOrder?: number;         // 1 = first voted out this round, 2 = next, ...
  boomerangUsed?: boolean;      // Return Ticket already used this round
  revengeDone?: boolean;     // Revenge already taken this round
}

function seatNumbers(n: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  while (out.length < n) {
    const s = `${1 + Math.floor(Math.random() * 28)}${'ABCDEF'[Math.floor(Math.random() * 6)]}`;
    if (!used.has(s)) { used.add(s); out.push(s); }
  }
  return out;
}

export interface RoundSetup {
  seats: Seat[];            // in reveal order (shuffled)
  touristWord: string;
  strangerWord: string;
  pair: WordPair;
}

export interface SpecialsOptions { enabled: readonly SpecialId[]; count?: number }

/** `specials` is optional: leave it out and the deal is exactly as before. */
export function dealRound(names: string[], c: RoleCounts, pair: WordPair, specials?: SpecialsOptions): RoundSetup {
  // Random word sides: the app decides which word the Tourists get.
  const flip = Math.random() < 0.5;
  const touristWord = flip ? pair.a : pair.b;
  const strangerWord = flip ? pair.b : pair.a;
  const roles: Role[] = shuffle([
    ...Array<Role>(c.tourists).fill('tourist'),
    ...Array<Role>(c.strangers).fill('stranger'),
    ...Array<Role>(c.pickpockets).fill('pickpocket'),
  ]);
  const order = shuffle(names);
  const seatNos = seatNumbers(order.length);
  const extra = specials ? assignSpecials(order, specials.enabled, specials.count) : null;
  const seats: Seat[] = order.map((name, i) => ({
    name,
    role: roles[i],
    word: roles[i] === 'tourist' ? touristWord : roles[i] === 'stranger' ? strangerWord : null,
    seat: seatNos[i],
    alive: true,
    ...(extra?.get(name) ?? {}),
  }));
  return { seats, touristWord, strangerWord, pair };
}

// ── Winning ──

export type Side = 'tourists' | 'sneaky';

function aliveCounts(seats: Seat[]) {
  const alive = seats.filter(s => s.alive);
  return {
    tourists: alive.filter(s => s.role === 'tourist').length,
    strangers: alive.filter(s => s.role === 'stranger').length,
    pickpockets: alive.filter(s => s.role === 'pickpocket').length,
  };
}

/** Undercover's rules: Tourists win when every Stranger and Pickpocket is
 *  offboarded. The sneaky side wins when only one Tourist is left. */
export function checkWinner(seats: Seat[]): Side | null {
  const a = aliveCounts(seats);
  const sneaky = a.strangers + a.pickpockets;
  if (sneaky === 0) return 'tourists';
  if (a.tourists <= 1) return 'sneaky';
  return null;
}

/** Speaking order for the description round: the players still aboard, going round
 *  the table from seat `from`. Returns indexes into `seats`. */
export function describeOrder(seats: Seat[], from: number, _stopNo: number): number[] {
  const n = seats.length;
  if (n === 0) return [];
  const start = ((from % n) + n) % n;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const s = seats[i];
    if (!s.alive) continue;
    out.push(i);
  }
  return out;
}

// ── Scoring ──

export type Outcome = 'tourists' | 'strangers' | 'pickpocket-steal';

export function roundPoints(seats: Seat[], outcome: Outcome): Record<string, number> {
  const pts: Record<string, number> = {};
  seats.forEach(s => { pts[s.name] = 0; });
  if (outcome === 'tourists') {
    seats.filter(s => s.role === 'tourist').forEach(s => { pts[s.name] = POINTS.touristWin; });
  } else if (outcome === 'strangers') {
    seats.filter(s => s.alive && s.role === 'stranger').forEach(s => { pts[s.name] = POINTS.strangerSurvive; });
    seats.filter(s => s.alive && s.role === 'pickpocket').forEach(s => { pts[s.name] = POINTS.pickpocketSurvive; });
  } else {
    seats.filter(s => s.role === 'pickpocket' && s.alive).forEach(s => { pts[s.name] = POINTS.pickpocketSteal; });
  }
  return pts;
}

// ── Session stats and awards ──

export interface PlayerStats {
  points: number;
  survivedAsStranger: number;
  correctVotes: number;
  wrongVotes: number;
  pickpocketWins: number;
}

export const emptyStats = (): PlayerStats => ({ points: 0, survivedAsStranger: 0, correctVotes: 0, wrongVotes: 0, pickpocketWins: 0 });

export interface Award { id: string; title: string; blurb: string; winner: string; score: number }

function top(names: string[], stats: Record<string, PlayerStats>, pick: (s: PlayerStats) => number) {
  let best = 0;
  let who: string[] = [];
  names.forEach(n => {
    const v = pick(stats[n] ?? emptyStats());
    if (v > best) { best = v; who = [n]; } else if (v === best && v > 0) who.push(n);
  });
  return best > 0 ? { who, best } : null;
}

export function computeAwards(names: string[], stats: Record<string, PlayerStats>): Award[] {
  const defs: Array<[string, string, string, (s: PlayerStats) => number]> = [
    ['bluffer', 'Best Bluffer', 'Survived the most rounds as a Stranger', s => s.survivedAsStranger],
    ['detective', 'Sharpest Detective', 'Most correct votes', s => s.correctVotes],
    ['assassin', 'Silent Assassin', 'Stole a win as the Pickpocket', s => s.pickpocketWins],
    ['pickpocket', 'Lost in Translation', 'Most wrong votes', s => s.wrongVotes],
  ];
  const out: Award[] = [];
  defs.forEach(([id, title, blurb, pick]) => {
    const t = top(names, stats, pick);
    if (t) out.push({ id, title, blurb, winner: t.who.join(' & '), score: t.best });
  });
  return out;
}

// ── Word bag: a shuffled deck, saved on this device ──
// Dealt one at a time, so a pair cannot come back until the whole bag has
// been used. Never two rounds in a row from the same category.

const BAG_KEY = (level: Level) => `ulaa:yaaru-avan:bag:${level}`;
const LAST_CAT_KEY = 'ulaa:yaaru-avan:lastcat';
const DARE_KEY = 'ulaa:yaaru-avan:dares';

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
function writeList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* not remembered */ }
}

/** Deals from a saved shuffled deck of ids; refills (reshuffled) once empty. */
function drawFrom<T extends { id: string }>(
  all: readonly T[], key: string, accept: (item: T) => boolean = () => true,
): T {
  const byId = new Map(all.map(x => [x.id, x]));
  let bag = readList(key).filter(id => byId.has(id));
  if (bag.length === 0) bag = shuffle(all.map(x => x.id));
  let idx = bag.findIndex(id => accept(byId.get(id)!));
  // Only unacceptable cards (e.g. the same category as last round) are left:
  // deal one anyway. A repeated category is better than a repeated pair, and
  // it is the same choice the online rooms make (yaaru_avan_start_round).
  if (idx < 0) idx = 0;
  const [id] = bag.splice(idx, 1);
  writeList(key, bag);
  return byId.get(id)!;
}

export function drawPair(level: Level, opts: { tripTitle?: string } = {}): WordPair {
  const pool = WORD_PAIRS.filter(p => p.level === level);
  let lastCat: string | null = null;
  try { lastCat = localStorage.getItem(LAST_CAT_KEY); } catch { /* ignore */ }

  // Trip-aware: when the trip's name matches a destination in the bank
  // (e.g. a Coorg trip), that destination's pair is dealt once, first.
  const title = (opts.tripTitle ?? '').toLowerCase();
  if (title) {
    const seenKey = 'ulaa:yaaru-avan:tripdealt';
    const dealt = readList(seenKey);
    const hit = WORD_PAIRS.find(p => p.category === 'places' && !dealt.includes(p.id)
      && [p.a, p.b].some(w => new RegExp(`\\b${w.toLowerCase().replace(/[^a-z0-9 ]/g, '')}\\b`).test(title)));
    if (hit) {
      writeList(seenKey, [...dealt, hit.id]);
      try { localStorage.setItem(LAST_CAT_KEY, hit.category); } catch { /* ignore */ }
      return hit;
    }
  }

  const pair = drawFrom(pool, BAG_KEY(level), p => p.category !== lastCat);
  try { localStorage.setItem(LAST_CAT_KEY, pair.category as Category); } catch { /* ignore */ }
  return pair;
}

export function drawDare(): string {
  const items = DARES.map((text, i) => ({ id: String(i), text }));
  return drawFrom(items, DARE_KEY).text;
}

// ── Saved setup (names + options) ──
const SETUP_KEY = 'ulaa:yaaru-avan:setup';

export interface SavedSetup {
  names: string[];
  strangers: number;
  pickpockets: number;
  hideCounts: boolean;
  level: Level;
  dares: boolean;
  specials: boolean;
  /** One-phone only: each description round a random player describes by gestures. */
  meme: boolean;
}

const DEFAULT_SETUP: SavedSetup = {
  names: ['', '', ''],
  strangers: 1,
  pickpockets: 0,
  hideCounts: false,
  level: 'medium',
  dares: false,
  specials: false,
  meme: false,
};

export function loadSetup(): SavedSetup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return DEFAULT_SETUP;
    const v = JSON.parse(raw) as Partial<SavedSetup>;
    const names = Array.isArray(v.names)
      ? v.names.filter((x): x is string => typeof x === 'string').slice(0, MAX_PLAYERS)
      : DEFAULT_SETUP.names;
    while (names.length < MIN_PLAYERS) names.push('');
    const level: Level = v.level === 'easy' || v.level === 'hard' ? v.level : 'medium';
    const filled = names.filter(n => n.trim()).length || names.length;
    const r = clampRoles(Math.max(MIN_PLAYERS, filled), Number(v.strangers) || 1, Number(v.pickpockets) || 0);
    return {
      names, level, strangers: r.strangers, pickpockets: r.pickpockets,
      hideCounts: !!v.hideCounts,
      dares: !!v.dares,
      specials: !!v.specials,
      meme: !!v.meme,
    };
  } catch { return DEFAULT_SETUP; }
}

export function saveSetup(s: SavedSetup) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* not remembered */ }
}

/** Blocks duplicates by numbering them: Priya, Priya → Priya, Priya 2. A numbered
 *  name that is already taken (Priya, Priya, Priya 2) is numbered again, so every
 *  name that comes out is unique (names key the scores). */
export function uniqueNames(raw: string[]): string[] {
  const taken = new Set<string>();
  return raw.map(base => {
    let name = base;
    let k = 1;
    while (taken.has(name.toLowerCase())) { k += 1; name = `${base} ${k}`; }
    taken.add(name.toLowerCase());
    return name;
  });
}
