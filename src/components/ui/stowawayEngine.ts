// Stowaway engine: pure game logic (roles, the no-repeat word bag, win checks,
// points and awards). No React here, so it stays easy to reason about.
// Only the word bag, player names and settings are saved on the device.

import { CHALLENGES, DARES, WORD_PAIRS } from './stowawayWords';
import type { Category, Challenge, Level, WordPair } from './stowawayWords';

export type Role = 'explorer' | 'stowaway' | 'lost';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export const POINTS = { explorerWin: 2, stowawaySurvive: 3, lostSteal: 4 } as const;

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Roles ──

export interface RoleCounts { explorers: number; stowaways: number; lost: number }

export const maxLost = (players: number) => (players >= 10 ? 2 : 1);

/** Explorers must always outnumber the sneaky side (Stowaways + Lost Souls). */
export function countsFor(players: number, stowaways: number, lost: number): RoleCounts {
  return { explorers: players - stowaways - lost, stowaways, lost };
}

export function rolesValid(players: number, stowaways: number, lost: number): boolean {
  if (players < MIN_PLAYERS || players > MAX_PLAYERS) return false;
  if (stowaways < 1 || lost < 0 || lost > maxLost(players)) return false;
  return players - stowaways - lost > stowaways + lost;
}

export function recommendedRoles(players: number): { stowaways: number; lost: number } {
  const stowaways = players >= 11 ? 3 : players >= 8 ? 2 : 1;
  const lost = players >= 5 ? 1 : 0;
  // Safety net: shrink until valid (only matters for odd future tweaks).
  let s = stowaways;
  let l = lost;
  while (!rolesValid(players, s, l) && l > 0) l -= 1;
  while (!rolesValid(players, s, l) && s > 1) s -= 1;
  return { stowaways: s, lost: l };
}

/** Clamps role counts into a valid split after the player count changes. */
export function clampRoles(players: number, stowaways: number, lost: number): { stowaways: number; lost: number } {
  let l = Math.min(lost, maxLost(players));
  let s = Math.max(1, stowaways);
  while (!rolesValid(players, s, l) && l > 0) l -= 1;
  while (!rolesValid(players, s, l) && s > 1) s -= 1;
  return { stowaways: s, lost: l };
}

export interface Seat {
  name: string;
  role: Role;
  word: string | null;   // null for the Lost Soul
  seat: string;          // ticket seat number, e.g. 14C
  alive: boolean;
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
  explorerWord: string;
  stowawayWord: string;
  pair: WordPair;
  challenge: Challenge;
  startIdx: number;         // index into seats of the first speaker
}

export function dealRound(names: string[], c: RoleCounts, pair: WordPair, challenge: Challenge): RoundSetup {
  // Random word sides: the app decides which word the Explorers get.
  const flip = Math.random() < 0.5;
  const explorerWord = flip ? pair.a : pair.b;
  const stowawayWord = flip ? pair.b : pair.a;
  const roles: Role[] = shuffle([
    ...Array<Role>(c.explorers).fill('explorer'),
    ...Array<Role>(c.stowaways).fill('stowaway'),
    ...Array<Role>(c.lost).fill('lost'),
  ]);
  const order = shuffle(names);
  const seatNos = seatNumbers(order.length);
  const seats: Seat[] = order.map((name, i) => ({
    name,
    role: roles[i],
    word: roles[i] === 'explorer' ? explorerWord : roles[i] === 'stowaway' ? stowawayWord : null,
    seat: seatNos[i],
    alive: true,
  }));
  return { seats, explorerWord, stowawayWord, pair, challenge, startIdx: Math.floor(Math.random() * seats.length) };
}

// ── Winning ──

export type Side = 'explorers' | 'sneaky';

export function aliveCounts(seats: Seat[]) {
  const alive = seats.filter(s => s.alive);
  return {
    explorers: alive.filter(s => s.role === 'explorer').length,
    stowaways: alive.filter(s => s.role === 'stowaway').length,
    lost: alive.filter(s => s.role === 'lost').length,
  };
}

/** Explorers win when every Stowaway and Lost Soul is offboarded. The sneaky
 *  side wins when their number equals the remaining Explorers. */
export function checkWinner(seats: Seat[]): Side | null {
  const a = aliveCounts(seats);
  const sneaky = a.stowaways + a.lost;
  if (sneaky === 0) return 'explorers';
  if (sneaky >= a.explorers) return 'sneaky';
  return null;
}

/** Speaking order for a stop: alive players, starting from `from` (an index into all seats). */
export function speakingOrder(seats: Seat[], from: number): number[] {
  const n = seats.length;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (seats[i].alive) out.push(i);
  }
  return out;
}

// ── Scoring ──

export type Outcome = 'explorers' | 'stowaways' | 'lost-steal';

export function roundPoints(seats: Seat[], outcome: Outcome): Record<string, number> {
  const pts: Record<string, number> = {};
  seats.forEach(s => { pts[s.name] = 0; });
  if (outcome === 'explorers') {
    seats.filter(s => s.role === 'explorer').forEach(s => { pts[s.name] = POINTS.explorerWin; });
  } else if (outcome === 'stowaways') {
    seats.filter(s => s.alive && s.role !== 'explorer').forEach(s => { pts[s.name] = POINTS.stowawaySurvive; });
  } else {
    seats.filter(s => s.role === 'lost' && s.alive).forEach(s => { pts[s.name] = POINTS.lostSteal; });
  }
  return pts;
}

// ── Session stats and awards ──

export interface PlayerStats {
  points: number;
  survivedAsStowaway: number;
  correctVotes: number;
  wrongVotes: number;
  lostWins: number;
}

export const emptyStats = (): PlayerStats => ({ points: 0, survivedAsStowaway: 0, correctVotes: 0, wrongVotes: 0, lostWins: 0 });

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
    ['bluffer', 'Best Bluffer', 'Stayed aboard the longest as a Stowaway', s => s.survivedAsStowaway],
    ['detective', 'Sharpest Detective', 'Most correct votes', s => s.correctVotes],
    ['assassin', 'Silent Assassin', 'Stole a win as the Lost Soul', s => s.lostWins],
    ['lost', 'Lost in Translation', 'Most wrong votes', s => s.wrongVotes],
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

const BAG_KEY = (level: Level) => `ulaa:stowaway:bag:${level}`;
const LAST_CAT_KEY = 'ulaa:stowaway:lastcat';
const CHALLENGE_KEY = 'ulaa:stowaway:challenges';
const DARE_KEY = 'ulaa:stowaway:dares';

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
  if (idx < 0) {
    // Nothing acceptable left: top up with a fresh shuffle behind the rest.
    const fresh = shuffle(all.map(x => x.id)).filter(id => !bag.includes(id));
    bag = [...bag, ...fresh];
    idx = bag.findIndex(id => accept(byId.get(id)!));
    if (idx < 0) idx = 0;
  }
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
    const seenKey = 'ulaa:stowaway:tripdealt';
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

export function drawChallenge(): Challenge {
  return drawFrom(CHALLENGES, CHALLENGE_KEY);
}

export function drawDare(): string {
  const items = DARES.map((text, i) => ({ id: String(i), text }));
  return drawFrom(items, DARE_KEY).text;
}

// ── Saved setup (names + options) ──
const SETUP_KEY = 'ulaa:stowaway:setup';

export interface SavedSetup {
  names: string[];
  stowaways: number;
  lost: number;
  hideCounts: boolean;
  level: Level;
  challenges: boolean;
  dares: boolean;
}

export const DEFAULT_SETUP: SavedSetup = {
  names: ['', '', ''],
  stowaways: 1,
  lost: 0,
  hideCounts: false,
  level: 'medium',
  challenges: true,
  dares: false,
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
    const r = clampRoles(Math.max(MIN_PLAYERS, filled), Number(v.stowaways) || 1, Number(v.lost) || 0);
    return {
      names, level, stowaways: r.stowaways, lost: r.lost,
      hideCounts: !!v.hideCounts,
      challenges: v.challenges !== false,
      dares: !!v.dares,
    };
  } catch { return DEFAULT_SETUP; }
}

export function saveSetup(s: SavedSetup) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* not remembered */ }
}

/** Blocks duplicates by numbering them: Priya, Priya → Priya, Priya 2. */
export function uniqueNames(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map(n => {
    const base = n;
    const key = base.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}
