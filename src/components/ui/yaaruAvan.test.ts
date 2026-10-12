import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, MIN_PLAYERS, POINTS, checkWinner, clampRoles, countsFor, dealRound, describeOrder, recommendedRoles, roundPoints, rolesValid, uniqueNames } from './yaaruAvanEngine';
import type { Seat } from './yaaruAvanEngine';
import { CLOWN_POINTS, ENABLED_SPECIALS, RIVAL_POINTS, SPECIALS, activeSpecial, assignSpecials, describeSpecial, maxSpecials, specialBonus, PUBLIC_SPECIALS, SPECIAL_BLURB } from './yaaruAvanSpecials';
import type { BonusSeat } from './yaaruAvanSpecials';
import type { SpecialId } from './yaaruAvanSpecials';

// Small seeded generator so every run deals the same way.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const ALL: SpecialId[] = SPECIALS.map(d => d.id);
const PAIR = new Set<SpecialId>(['rivals', 'lovers']);

describe('core roles', () => {
  it('validates splits', () => {
    expect(rolesValid(3, 1, 0)).toBe(true);
    expect(rolesValid(4, 2, 0)).toBe(false);
    expect(rolesValid(9, 1, 2)).toBe(false); // Pickpocket cap is 1 below 10 players
    expect(rolesValid(10, 2, 2)).toBe(true);
    expect(rolesValid(2, 1, 0)).toBe(false);
    expect(rolesValid(21, 2, 0)).toBe(false);
  });

  it('needs at least one Stranger or one Pickpocket, like Undercover', () => {
    expect(rolesValid(5, 0, 1)).toBe(true);   // Pickpocket only
    expect(rolesValid(5, 0, 0)).toBe(false);  // nobody faking it
    expect(clampRoles(5, 0, 0)).toEqual({ stowaways: 1, lost: 0 });
    expect(clampRoles(5, 0, 1)).toEqual({ stowaways: 0, lost: 1 });
  });

  it('recommends a valid split for every size', () => {
    for (let n = 3; n <= MAX_PLAYERS; n++) {
      const r = recommendedRoles(n);
      expect(rolesValid(n, r.stowaways, r.lost)).toBe(true);
    }
  });

  it('deals the requested counts', () => {
    const r = dealRound(names(8), countsFor(8, 2, 1), { id: 'x', category: 'places', level: 'easy', a: 'A', b: 'B' } as never);
    expect(r.seats.filter(s => s.role === 'explorer')).toHaveLength(5);
    expect(r.seats.filter(s => s.role === 'stowaway')).toHaveLength(2);
    expect(r.seats.filter(s => s.role === 'lost')).toHaveLength(1);
    expect(r.seats.every(s => s.special === undefined)).toBe(true); // no specials unless asked
  });

  it('checks the winner and scores', () => {
    const seat = (name: string, role: Seat['role'], alive = true): Seat => ({ name, role, word: null, seat: '1A', alive });
    const seats = [seat('a', 'explorer'), seat('b', 'explorer'), seat('c', 'stowaway'), seat('d', 'lost', false)];
    expect(checkWinner(seats)).toBeNull();
    // Undercover: the sneaky side wins when only one Tourist is left, not at parity.
    expect(checkWinner([seat('a', 'explorer'), seat('b', 'explorer'), seat('c', 'stowaway'), seat('d', 'stowaway')])).toBeNull();
    expect(checkWinner([seat('a', 'explorer'), seat('c', 'stowaway'), seat('d', 'stowaway')])).toBe('sneaky');
    expect(checkWinner([seat('a', 'explorer'), seat('c', 'stowaway')])).toBe('sneaky');
    expect(checkWinner([seat('a', 'explorer'), seat('c', 'stowaway', false)])).toBe('explorers');
    expect(roundPoints(seats, 'explorers')).toEqual({ a: 2, b: 2, c: 0, d: 0 });
    expect(roundPoints(seats, 'stowaways')).toEqual({ a: 0, b: 0, c: POINTS.stowawaySurvive, d: 0 });
  });

  it('scores like Undercover: Tourists 2, Stranger 10, Pickpocket 6', () => {
    const seat = (name: string, role: Seat['role'], alive = true): Seat => ({ name, role, word: null, seat: '1A', alive });
    const seats = [seat('a', 'explorer'), seat('b', 'stowaway'), seat('c', 'lost'), seat('d', 'lost', false)];
    expect(roundPoints(seats, 'stowaways')).toEqual({ a: 0, b: 10, c: 6, d: 0 });
    expect(roundPoints(seats, 'lost-steal')).toEqual({ a: 0, b: 0, c: 6, d: 0 });
    expect(roundPoints(seats, 'explorers')).toEqual({ a: 2, b: 0, c: 0, d: 0 });
  });

  it('describe order goes round the table from the starter, aboard players only', () => {
    const seat = (name: string, alive = true, extra: Partial<Seat> = {}): Seat => ({ name, role: 'explorer', word: null, seat: '1A', alive, ...extra });
    const seats = [seat('a'), seat('b', false), seat('c'), seat('d'), seat('e')];
    expect(describeOrder(seats, 2, 1)).toEqual([2, 3, 4, 0]);
    expect(describeOrder(seats, 4, 2)).toEqual([4, 0, 2, 3]);
    expect(describeOrder(seats, 1, 2)).toEqual([2, 3, 4, 0]);          // a gone seat is skipped
    expect(describeOrder(seats, 7, 2)).toEqual([2, 3, 4, 0]);          // wraps past the end
  });

  it('the description round goes round the table from the start seat, with nobody skipped', () => {
    const seat = (name: string, extra: Partial<Seat> = {}): Seat => ({ name, role: 'explorer', word: null, seat: '1A', alive: true, ...extra });
    const seats = [seat('a'), seat('b'), seat('c'), seat('d')];
    expect(describeOrder(seats, 0, 1)).toEqual([0, 1, 2, 3]);
    expect(describeOrder(seats, 2, 1)).toEqual([2, 3, 0, 1]);
  });

  it('numbers duplicate names', () => {
    expect(uniqueNames(['Priya', 'Priya', 'Priya 2'])).toEqual(['Priya', 'Priya 2', 'Priya 2 2']);
  });
});

describe('special roles', () => {
  it('caps at one special per 3 players', () => {
    expect([3, 5, 6, 9, 15, 20].map(maxSpecials)).toEqual([1, 1, 2, 3, 5, 6]);
    for (let seed = 1; seed <= 50; seed++) {
      for (const n of [3, 5, 9, 15, 20]) {
        // A pair (Duelists, Lovers) is one role dealt to two players, so count roles, not players.
        const out = assignSpecials(names(n), ALL, Infinity, seeded(seed));
        const pairSeats = [...out.values()].filter(a => PAIR.has(a.special)).length;
        const roles = out.size - pairSeats / 2;
        expect(roles).toBeLessThanOrEqual(maxSpecials(n));
      }
    }
  });

  it('honours a lower requested count, and zero', () => {
    expect(assignSpecials(names(15), ['clown', 'returnTicket', 'tripLeader'], 2, seeded(1)).size).toBe(2);
    expect(assignSpecials(names(15), ALL, 0).size).toBe(0);
    expect(assignSpecials(names(15), []).size).toBe(0);
    expect(assignSpecials(names(2), ALL).size).toBe(0);
  });

  it('gives each player at most one special and each special at most once', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const out = assignSpecials(names(15), ALL, Infinity, seeded(seed));
      const solo = [...out.values()].filter(a => !PAIR.has(a.special)).map(a => a.special);
      expect(new Set(solo).size).toBe(solo.length);
      // Map keys are players, so one special per player holds by construction;
      // Duelists and Lovers can therefore never land on the same two players.
      const pairs = [...out.entries()].filter(([, a]) => PAIR.has(a.special));
      for (const [n, a] of pairs) expect(out.get(a.partner!)?.partner).toBe(n);
    }
  });

  it('deals a pair to two different players, as one role', () => {
    const out = assignSpecials(names(6), ['rivals'], Infinity, seeded(3));
    expect(out.size).toBe(2);
    const [[a, x], [b, y]] = [...out.entries()];
    expect(a).not.toBe(b);
    expect(x.partner).toBe(b);
    expect(y.partner).toBe(a);
    // A pair is one role, so 5 players (cap 1) can have one; 4 players are too few.
    expect(assignSpecials(names(5), ['rivals'], Infinity, seeded(3)).size).toBe(2);
    expect(assignSpecials(names(4), ['rivals'], Infinity, seeded(3)).size).toBe(0);
    expect(assignSpecials(names(4), ['lovers'], Infinity, seeded(3)).size).toBe(0);
    expect(assignSpecials(names(5), ['lovers'], Infinity, seeded(3)).size).toBe(2);
    expect(assignSpecials(names(3), ['luckyDip'], Infinity, seeded(3)).size).toBe(0);
  });

  it('can land on any core role, Clown included', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = dealRound(names(9), countsFor(9, 2, 1),
        { id: 'x', category: 'places', level: 'easy', a: 'A', b: 'B' } as never, { enabled: ['clown'], count: 1 });
      const s = r.seats.find(x => x.special === 'clown');
      if (s) seen.add(s.role);
      if (seen.size === 3) break;
    }
    expect(seen).toEqual(new Set(['explorer', 'stowaway', 'lost']));
  });

  it('Lucky Dip becomes a solo ability, never Duelists or Lovers', () => {
    const allowed = new Set<SpecialId>(['clown', 'returnTicket', 'tripLeader', 'backseatRider', 'payback']);
    for (let seed = 1; seed <= 200; seed++) {
      const out = assignSpecials(names(12), ALL, Infinity, seeded(seed));
      for (const a of out.values()) {
        if (a.special !== 'luckyDip') { expect(a.dipAs).toBeUndefined(); continue; }
        expect(allowed.has(a.dipAs!)).toBe(true);
        expect(activeSpecial(a)).toBe(a.dipAs);
        const dealtSolo = [...out.values()].filter(x => x.special === a.dipAs);
        expect(dealtSolo).toHaveLength(0); // no duplicate of an ability already dealt
      }
    }
  });

  it('drops a Lucky Dip when nothing is left to draw', () => {
    expect(assignSpecials(names(9), ['luckyDip', 'payback'], 1, seeded(5)).size).toBeLessThanOrEqual(1);
    const only = assignSpecials(names(9), ['luckyDip'], Infinity, seeded(5));
    expect(only.size).toBe(0);
  });

  it('is deterministic for a given generator', () => {
    const a = [...assignSpecials(names(12), ALL, Infinity, seeded(42)).entries()];
    const b = [...assignSpecials(names(12), ALL, Infinity, seeded(42)).entries()];
    expect(a).toEqual(b);
  });
});

describe('special role scoring', () => {
  it('all eight specials are switched on', () => {
    expect(ENABLED_SPECIALS).toHaveLength(8);
  });

  it('Joy Fool scores only when voted out first, on any role', () => {
    const seats: BonusSeat[] = [
      { name: 'a', special: 'clown', outStop: 1, outOrder: 1 },
      { name: 'b', special: 'clown', outStop: 1, outOrder: 2 },
      { name: 'c', special: 'clown', outStop: 3, outOrder: 3 },
      { name: 'd', special: 'clown' },
    ];
    expect(specialBonus(seats)).toEqual({ a: CLOWN_POINTS, b: 0, c: 0, d: 0 });
  });

  it('a Lucky Dip that became Clown scores like a Clown', () => {
    const seats: BonusSeat[] = [{ name: 'a', special: 'luckyDip', dipAs: 'clown', outStop: 1, outOrder: 1 }];
    expect(specialBonus(seats).a).toBe(CLOWN_POINTS);
  });

  it('Duelists: the first one out loses 2, the other wins 2', () => {
    expect(specialBonus([
      { name: 'a', special: 'rivals', partner: 'b', outStop: 3, outOrder: 2 },
      { name: 'b', special: 'rivals', partner: 'a', outStop: 1, outOrder: 1 },
    ])).toEqual({ a: RIVAL_POINTS, b: -RIVAL_POINTS });
    // One duelist is voted out while the other is still aboard.
    expect(specialBonus([
      { name: 'a', special: 'rivals', partner: 'b' },
      { name: 'b', special: 'rivals', partner: 'a', outStop: 2, outOrder: 1 },
    ])).toEqual({ a: RIVAL_POINTS, b: -RIVAL_POINTS });
    // Neither voted out: nobody scores.
    expect(specialBonus([
      { name: 'a', special: 'rivals', partner: 'b' },
      { name: 'b', special: 'rivals', partner: 'a' },
    ])).toEqual({ a: 0, b: 0 });
  });

  it('players without a special get nothing', () => {
    expect(specialBonus([{ name: 'a', outStop: 1, outOrder: 1 }, { name: 'b' }])).toEqual({ a: 0, b: 0 });
  });

  it('Ghost, Revenger, Boomerang, Goddess of Justice and Lovers give no points', () => {
    for (const special of ['backseatRider', 'payback', 'returnTicket', 'tripLeader'] as const) {
      expect(specialBonus([{ name: 'a', special, outStop: 1, outOrder: 1 }]).a).toBe(0);
    }
    expect(specialBonus([
      { name: 'a', special: 'lovers', partner: 'b', outStop: 1, outOrder: 1 },
      { name: 'b', special: 'lovers', partner: 'a', outStop: 1, outOrder: 2 },
    ])).toEqual({ a: 0, b: 0 });
  });

  it('every dealt special has a pass description', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const a of assignSpecials(names(15), ENABLED_SPECIALS, Infinity, seeded(seed)).values()) {
        expect(describeSpecial(a)).toBeTruthy();
      }
    }
    expect(describeSpecial({ special: 'rivals', partner: 'Meena' })).toBeTruthy();
    expect(describeSpecial({ special: 'lovers' })).toBeNull();
  });
});

describe('player limits (Undercover allows 3 to 20)', () => {
  it('takes 3 to 20 players', () => {
    expect([MIN_PLAYERS, MAX_PLAYERS]).toEqual([3, 20]);
    expect(rolesValid(20, 3, 1)).toBe(true);
    expect(rolesValid(21, 3, 1)).toBe(false);
    expect(rolesValid(2, 1, 0)).toBe(false);
  });

  it('deals a full 20-player table with unique seats and the right role counts', () => {
    const ns = Array.from({ length: 20 }, (_, i) => `P${i}`);
    const c = recommendedRoles(20);
    const r = dealRound(ns, countsFor(20, c.stowaways, c.lost), { id: 'x', category: 'places', level: 'easy', a: 'A', b: 'B' } as never);
    expect(r.seats).toHaveLength(20);
    expect(new Set(r.seats.map(x => x.seat)).size).toBe(20);
    expect(r.seats.filter(x => x.role === 'stowaway')).toHaveLength(c.stowaways);
    expect(r.seats.filter(x => x.role === 'lost')).toHaveLength(c.lost);
  });
});

describe('Goddess of Justice announcement', () => {
  it('is the only role announced to everyone', () => {
    expect([...PUBLIC_SPECIALS]).toEqual(['tripLeader']);
  });

  it('is described to the players as announced', () => {
    expect(SPECIAL_BLURB.tripLeader).toMatch(/told who she is/i);
  });
});
