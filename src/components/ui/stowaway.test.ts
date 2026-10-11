import { describe, expect, it } from 'vitest';
import { checkWinner, countsFor, dealRound, recommendedRoles, roundPoints, rolesValid, uniqueNames } from './stowawayEngine';
import type { Seat } from './stowawayEngine';
import { BACKSEAT_POINTS, BUDDY_POINTS, PAYBACK_POINTS, CLOWN_EARLY_STOPS, CLOWN_POINTS, ENABLED_SPECIALS, RIVAL_POINTS, SLEEPY_POINTS, SPECIALS, activeSpecial, assignSpecials, describeSpecial, maxSpecials, specialBonus } from './stowawaySpecials';
import type { BonusSeat } from './stowawaySpecials';
import type { SpecialId } from './stowawaySpecials';

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
const PAIR = new Set<SpecialId>(['rivals', 'buddies']);

describe('core roles', () => {
  it('validates splits', () => {
    expect(rolesValid(3, 1, 0)).toBe(true);
    expect(rolesValid(4, 2, 0)).toBe(false);
    expect(rolesValid(9, 1, 2)).toBe(false); // Stranger cap is 1 below 10 players
    expect(rolesValid(10, 2, 2)).toBe(true);
    expect(rolesValid(2, 1, 0)).toBe(false);
    expect(rolesValid(16, 2, 0)).toBe(false);
  });

  it('recommends a valid split for every size', () => {
    for (let n = 3; n <= 15; n++) {
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
    expect(checkWinner([seat('a', 'explorer'), seat('c', 'stowaway')])).toBe('sneaky');
    expect(checkWinner([seat('a', 'explorer'), seat('c', 'stowaway', false)])).toBe('explorers');
    expect(roundPoints(seats, 'explorers')).toEqual({ a: 2, b: 2, c: 0, d: 0 });
    expect(roundPoints(seats, 'stowaways')).toEqual({ a: 0, b: 0, c: 3, d: 0 });
  });

  it('numbers duplicate names', () => {
    expect(uniqueNames(['Priya', 'Priya', 'Priya 2'])).toEqual(['Priya', 'Priya 2', 'Priya 2 2']);
  });
});

describe('special roles', () => {
  it('caps at one special per 3 players', () => {
    expect([3, 5, 6, 9, 15].map(maxSpecials)).toEqual([1, 1, 2, 3, 5]);
    for (let seed = 1; seed <= 50; seed++) {
      for (const n of [3, 5, 9, 15]) {
        expect(assignSpecials(names(n), ALL, Infinity, seeded(seed)).size).toBeLessThanOrEqual(maxSpecials(n));
      }
    }
  });

  it('honours a lower requested count, and zero', () => {
    expect(assignSpecials(names(15), ['clown', 'sleepyhead', 'driver'], 2, seeded(1)).size).toBe(2);
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
      // Rivals and Buddies can therefore never land on the same two players.
      const pairs = [...out.entries()].filter(([, a]) => PAIR.has(a.special));
      for (const [n, a] of pairs) expect(out.get(a.partner!)?.partner).toBe(n);
    }
  });

  it('deals pairs to two different players, using two slots', () => {
    const out = assignSpecials(names(6), ['rivals'], Infinity, seeded(3));
    expect(out.size).toBe(2);
    const [[a, x], [b, y]] = [...out.entries()];
    expect(a).not.toBe(b);
    expect(x.partner).toBe(b);
    expect(y.partner).toBe(a);
    // 5 players -> cap 1 -> a pair does not fit, so nothing is dealt.
    expect(assignSpecials(names(5), ['rivals'], Infinity, seeded(3)).size).toBe(0);
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

  it('Lucky Dip becomes a solo Batch 1 or 2 ability, never Buddies, Payback or Rivals', () => {
    const allowed = new Set<SpecialId>(['clown', 'sleepyhead', 'returnTicket', 'tripLeader', 'backseatRider', 'driver']);
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
    expect(assignSpecials(names(9), ['luckyDip', 'buddies', 'payback'], 1, seeded(5)).size).toBeLessThanOrEqual(1);
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
  it('all ten specials are switched on', () => {
    expect(ENABLED_SPECIALS).toHaveLength(10);
  });

  it('Clown scores only when voted out early, on any role', () => {
    const seats: BonusSeat[] = [
      { name: 'a', special: 'clown', outStop: 1, outOrder: 1 },
      { name: 'b', special: 'clown', outStop: CLOWN_EARLY_STOPS, outOrder: 2 },
      { name: 'c', special: 'clown', outStop: CLOWN_EARLY_STOPS + 1, outOrder: 3 },
      { name: 'd', special: 'clown' },
    ];
    expect(specialBonus(seats)).toEqual({ a: CLOWN_POINTS, b: CLOWN_POINTS, c: 0, d: 0 });
  });

  it('a Lucky Dip that became Clown scores like a Clown', () => {
    const seats: BonusSeat[] = [{ name: 'a', special: 'luckyDip', dipAs: 'clown', outStop: 1, outOrder: 1 }];
    expect(specialBonus(seats).a).toBe(CLOWN_POINTS);
  });

  it('Rivals: the one whose rival goes first scores', () => {
    const seats: BonusSeat[] = [
      { name: 'a', special: 'rivals', partner: 'b', outStop: 3, outOrder: 2 },
      { name: 'b', special: 'rivals', partner: 'a', outStop: 1, outOrder: 1 },
    ];
    expect(specialBonus(seats)).toEqual({ a: RIVAL_POINTS, b: 0 });
    // Rival voted out while I am still aboard.
    expect(specialBonus([
      { name: 'a', special: 'rivals', partner: 'b' },
      { name: 'b', special: 'rivals', partner: 'a', outStop: 2, outOrder: 1 },
    ])).toEqual({ a: RIVAL_POINTS, b: 0 });
    // Neither voted out: nobody scores.
    expect(specialBonus([
      { name: 'a', special: 'rivals', partner: 'b' },
      { name: 'b', special: 'rivals', partner: 'a' },
    ])).toEqual({ a: 0, b: 0 });
  });

  it('Sleepyhead scores when never voted out', () => {
    expect(specialBonus([
      { name: 'a', special: 'sleepyhead' },
      { name: 'b', special: 'sleepyhead', outStop: 2, outOrder: 1 },
    ])).toEqual({ a: SLEEPY_POINTS, b: 0 });
  });

  it('players without a special get nothing', () => {
    expect(specialBonus([{ name: 'a', outStop: 1, outOrder: 1 }, { name: 'b' }])).toEqual({ a: 0, b: 0 });
  });

  it('Backseat Rider scores only on a correct guess', () => {
    expect(specialBonus([{ name: 'a', special: 'backseatRider', riderHit: true, outStop: 1, outOrder: 1 }]).a).toBe(BACKSEAT_POINTS);
    expect(specialBonus([{ name: 'a', special: 'backseatRider', riderHit: false, outStop: 1, outOrder: 1 }]).a).toBe(0);
  });

  it('Payback scores only when it hit the other side', () => {
    expect(specialBonus([{ name: 'a', special: 'payback', paybackHit: true, outStop: 1, outOrder: 1 }]).a).toBe(PAYBACK_POINTS);
    expect(specialBonus([{ name: 'a', special: 'payback', paybackHit: false, outStop: 1, outOrder: 1 }]).a).toBe(0);
  });

  it('Buddies score only while both are still aboard', () => {
    expect(specialBonus([
      { name: 'a', special: 'buddies', partner: 'b' },
      { name: 'b', special: 'buddies', partner: 'a' },
    ])).toEqual({ a: BUDDY_POINTS, b: BUDDY_POINTS });
    expect(specialBonus([
      { name: 'a', special: 'buddies', partner: 'b' },
      { name: 'b', special: 'buddies', partner: 'a', outStop: 2, outOrder: 1 },
    ])).toEqual({ a: 0, b: 0 });
  });

  it('every dealt special has a pass description', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const a of assignSpecials(names(15), ENABLED_SPECIALS, Infinity, seeded(seed)).values()) {
        expect(describeSpecial(a)).toBeTruthy();
      }
    }
    expect(describeSpecial({ special: 'rivals', partner: 'Meena' })).toContain('Meena');
  });
});
