// Special-role scenario tests for Yaaru Avan? (pass and play).
//
// The vote/elimination rules live inside YaaruAvanGame.tsx (React state), so they cannot be
// imported. `Flow` below is a line-for-line port of the component's transitions
// (eliminate, confirmOffboard, afterReveal, afterGuess, judgeGuess, confirmRevenge, finishRound).
// If you change those functions in the component, change this port too.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWinner, countsFor, dealRound, roundPoints } from './yaaruAvanEngine';
import type { Outcome, Role, Seat } from './yaaruAvanEngine';
import { CLOWN_POINTS, RIVAL_POINTS, SPECIALS, activeSpecial, assignSpecials, specialBonus } from './yaaruAvanSpecials';
import type { SoloSpecialId, SpecialId } from './yaaruAvanSpecials';

type Phase = 'vote' | 'saved' | 'guess' | 'revenger' | 'roundEnd';

class Flow {
  seats: Seat[];
  stopNo = 1;
  bounce: number[] | null = null;
  tiedIdx: number[] | null = null;
  lastOut: number | null = null;
  guessQueue: number[] = [];
  guessAfter: number | null = null;
  phase: Phase = 'vote';
  outcome: Outcome | null = null;
  gained: Record<string, number> = {};
  log: string[] = [];

  constructor(seats: Seat[]) { this.seats = seats.map(s => ({ ...s })); }

  idx = (name: string) => this.seats.findIndex(s => s.name === name);
  get aliveIdx() { return this.seats.map((s, i) => (s.alive ? i : -1)).filter(i => i >= 0); }
  get voterIdx() {
    return this.seats.map((s, i) => (s.alive || (s.outOrder !== undefined && activeSpecial(s) === 'ghost') ? i : -1)).filter(i => i >= 0);
  }
  get candidateIdx() {
    return this.bounce ? this.aliveIdx.filter(i => this.bounce!.includes(i))
      : this.tiedIdx ? this.aliveIdx.filter(i => this.tiedIdx!.includes(i)) : this.aliveIdx;
  }

  private eliminate(list: Seat[], idx: number, stop: number): Seat[] {
    let n = list.filter(s => s.outOrder !== undefined).length;
    const next = list.map((s, i) => (i === idx ? { ...s, alive: false, outStop: stop, outOrder: ++n } : s));
    const me = next[idx];
    if (activeSpecial(me) === 'lovers' && me.partner) {
      const pi = next.findIndex(s => s.name === me.partner && s.alive);
      if (pi >= 0) next[pi] = { ...next[pi], alive: false, outStop: stop, outOrder: ++n };
    }
    return next;
  }

  /** Host taps a player and (optionally) who voted for them. */
  vote(name: string, voterNames: string[] = []) {
    expect(this.phase).toBe('vote');
    const selected = this.idx(name);
    expect(this.candidateIdx).toContain(selected);
    const voters = voterNames.map(this.idx);
    const out = this.seats[selected];
    if (activeSpecial(out) === 'boomerang' && !out.boomerangUsed) {
      const bounced = voters.filter(vi => vi !== selected && this.seats[vi]?.alive);
      // Undercover: the votes bounce onto the voters, so the voters must be known (button disabled otherwise).
      if (bounced.length === 0) throw new Error('boomerang needs voters');
      const marked = this.seats.map((s, i) => (i === selected ? { ...s, boomerangUsed: true } : s));
      this.seats = marked;
      this.log.push(`${name} bounced`);
      if (bounced.length === 1) {
        // One voter: the whole bounce lands on them, no second vote (same as the online rooms).
        const target = bounced[0];
        const updated = this.eliminate(marked, target, this.stopNo);
        this.bounce = null;
        this.tiedIdx = null;
        this.seats = updated;
        this.lastOut = target;
        this.afterReveal(updated, target);
        return 'bounced-out' as const;
      }
      // Several voters: the votes move onto them, so they are tied. The Goddess picks among them;
      // with no Goddess they describe once more and the others re-vote (tiedIdx), as for any tie.
      const tied = [...bounced].sort((a, b) => a - b);
      if (this.seats.some(x => activeSpecial(x) === 'goddess')) { this.bounce = tied; this.tiedIdx = null; }
      else { this.bounce = null; this.tiedIdx = tied; }
      this.lastOut = selected;
      this.phase = 'vote'; // goVote() / the tie-break describe round after the reveal delay
      return 'bounced' as const;
    }
    const updated = this.eliminate(this.seats, selected, this.stopNo);
    this.bounce = null;
    this.tiedIdx = null;
    this.seats = updated;
    this.lastOut = selected;
    this.log.push(`${name} out`);
    this.afterReveal(updated, selected);
    return 'out' as const;
  }

  private afterReveal(list: Seat[], outIdx: number) {
    const out = list[outIdx];
    // Undercover: Mr. White always gets a last guess when eliminated, including as a Lover's partner.
    const queue: number[] = [];
    if (out.role === 'pickpocket') queue.push(outIdx);
    if (activeSpecial(out) === 'lovers' && out.partner) {
      const pi = list.findIndex(s => s.name === out.partner && s.outStop === out.outStop && (s.outOrder ?? 0) === (out.outOrder ?? 0) + 1);
      if (pi >= 0 && list[pi].role === 'pickpocket') queue.push(pi);
    }
    if (queue.length === 0) { this.afterGuess(list, outIdx); return; }
    this.guessAfter = outIdx;
    this.guessQueue = queue.slice(1);
    this.lastOut = queue[0];
    this.phase = 'guess';
  }

  private afterGuess(list: Seat[], outIdx: number) {
    const w = checkWinner(list);
    if (w) { this.finish(list, w === 'tourists' ? 'tourists' : 'strangers'); return; }
    const out = list[outIdx];
    if (activeSpecial(out) === 'revenger' && !out.revengeDone && list.some(s => s.alive)) { this.phase = 'revenger'; return; }
    this.stopNo += 1;
    this.phase = 'vote';
  }

  judgeGuess(correct: boolean) {
    expect(this.phase).toBe('guess');
    if (correct) {
      const list = this.seats.map((s, i) => (i === this.lastOut ? { ...s, alive: true } : s));
      this.seats = list;
      this.finish(list, 'pickpocket-steal');
      return;
    }
    if (this.guessQueue.length > 0) {
      this.lastOut = this.guessQueue[0];
      this.guessQueue = this.guessQueue.slice(1);
      return;
    }
    const after = this.guessAfter ?? this.lastOut!;
    this.lastOut = after;
    this.afterGuess(this.seats, after);
  }

  revenge(victimName: string) {
    expect(this.phase).toBe('revenger');
    const victim = this.idx(victimName);
    expect(this.aliveIdx).toContain(victim);
    const marked = this.seats.map((s, i) => (i === this.lastOut ? { ...s, revengeDone: true } : s));
    const updated = this.eliminate(marked, victim, this.stopNo);
    this.seats = updated;
    this.lastOut = victim;
    this.afterReveal(updated, victim);
  }

  private finish(list: Seat[], result: Outcome) {
    const pts = roundPoints(list, result);
    const bonus = specialBonus(list);
    Object.keys(bonus).forEach(n => { pts[n] = (pts[n] ?? 0) + bonus[n]; });
    this.gained = pts;
    this.outcome = result;
    this.phase = 'roundEnd';
  }

  get(name: string) { return this.seats[this.idx(name)]; }
}

// ── helpers ──
const seat = (name: string, role: Role, extra: Partial<Seat> = {}): Seat => ({
  name, role, word: role === 'pickpocket' ? null : 'w', seat: '1A', alive: true, ...extra,
});
/** n players: T1..T? tourists, then strangers S1.., pickpockets L1.. */
function table(tourists: number, strangers: number, pickpockets = 0, specials: Record<string, Partial<Seat>> = {}) {
  const seats: Seat[] = [];
  for (let i = 1; i <= tourists; i++) seats.push(seat(`T${i}`, 'tourist', specials[`T${i}`]));
  for (let i = 1; i <= strangers; i++) seats.push(seat(`S${i}`, 'stranger', specials[`S${i}`]));
  for (let i = 1; i <= pickpockets; i++) seats.push(seat(`L${i}`, 'pickpocket', specials[`L${i}`]));
  return new Flow(seats);
}

// ═════════════════════════════════════════════════════════════
describe('Joy Fool (joyFool)', () => {
  it('earns +4 when voted out first, whatever their core role', () => {
    for (const who of ['T1', 'S1', 'L1']) {
      const f = table(4, 1, 1, { [who]: { special: 'joyFool' } });
      f.vote(who);
      if ((f.phase as Phase) === 'guess') f.judgeGuess(false);
      // finish the round: kick the remaining sneaky players
      for (const n of ['S1', 'L1']) {
        if (f.phase !== 'vote') break;
        if (f.get(n).alive) { f.vote(n); if ((f.phase as Phase) === 'guess') f.judgeGuess(false); }
      }
      expect(f.phase).toBe('roundEnd');
      expect(f.gained[who] - roundPoints(f.seats, f.outcome!)[who]).toBe(CLOWN_POINTS);
    }
  });

  it('earns nothing when voted out second', () => {
    const f = table(4, 1, 0, { T1: { special: 'joyFool' } });
    f.vote('T2');
    f.vote('T1');
    expect(specialBonus(f.seats).T1).toBe(0);
  });

  it('earns nothing if never voted out, and a Falafel Vendor who drew joyFool behaves the same', () => {
    const f = table(4, 1, 0, { T1: { special: 'falafelVendor', dipAs: 'joyFool' } });
    f.vote('T1');
    expect(specialBonus(f.seats).T1).toBe(CLOWN_POINTS);
  });

  it('is spared a bonus when a Lover partner dies first (order 1 belongs to the lover)', () => {
    const f = table(5, 1, 0, { T1: { special: 'lovers', partner: 'T2' }, T2: { special: 'lovers', partner: 'T1' }, T3: { special: 'joyFool' } });
    f.vote('T1');                       // T1 order 1, T2 order 2
    f.vote('T3');
    expect(specialBonus(f.seats).T3).toBe(0);
  });
});

describe('Duelists (duelists)', () => {
  const duel = { T1: { special: 'duelists' as const, partner: 'T2' }, T2: { special: 'duelists' as const, partner: 'T1' } };

  it('first duelist out loses 2, the survivor gains 2', () => {
    const f = table(5, 1, 0, duel);
    f.vote('T1');
    const b = specialBonus(f.seats);
    expect(b.T1).toBe(-RIVAL_POINTS);
    expect(b.T2).toBe(RIVAL_POINTS);
  });

  it('survivor still gets +2 when the other duelist leaves and the survivor is later also out', () => {
    const f = table(5, 1, 0, duel);
    f.vote('T1');
    f.vote('T2');
    const b = specialBonus(f.seats);
    expect(b.T1).toBe(-2);
    expect(b.T2).toBe(2);
  });

  it('nobody scores if neither duelist leaves', () => {
    const f = table(5, 1, 0, duel);
    f.vote('S1');
    expect(f.phase).toBe('roundEnd');
    expect(f.gained.T1).toBe(2);   // tourist win points only
    expect(f.gained.T2).toBe(2);
  });

  it('duelist killed by a Revenger counts as out', () => {
    const f = table(6, 1, 0, { ...duel, T3: { special: 'revenger' } });
    f.vote('T3');
    f.revenge('T2');
    const b = specialBonus(f.seats);
    expect(b.T2).toBe(-2);
    expect(b.T1).toBe(2);
  });
});

describe('Boomerang (boomerang)', () => {
  it('first majority: stays aboard, ticket used, votes bounce to the voters', () => {
    const f = table(5, 1, 0, { T1: { special: 'boomerang' } });
    expect(f.vote('T1', ['T2', 'T3', 'S1'])).toBe('bounced');
    expect(f.get('T1').alive).toBe(true);
    expect(f.get('T1').boomerangUsed).toBe(true);
    expect(f.candidateIdx.map(i => f.seats[i].name).sort()).toEqual(['S1', 'T2', 'T3']);
    expect(f.stopNo).toBe(1);
  });

  it('several voters are tied: no Goddess means a tie-break re-vote, with a Goddess she picks', () => {
    const f = table(6, 1, 0, { T1: { special: 'boomerang' } });
    f.vote('T1', ['T2', 'T3']);
    expect(f.tiedIdx!.map(i => f.seats[i].name)).toEqual(['T2', 'T3']);
    expect(f.bounce).toBeNull();
    const g = table(6, 1, 0, { T1: { special: 'boomerang' }, T4: { special: 'goddess' } });
    g.vote('T1', ['T2', 'T3']);
    expect(g.bounce!.map(i => g.seats[i].name)).toEqual(['T2', 'T3']);
    expect(g.tiedIdx).toBeNull();
  });

  it('the bounced vote eliminates a bounced player, then the bounce clears', () => {
    const f = table(5, 1, 0, { T1: { special: 'boomerang' } });
    f.vote('T1', ['T2', 'T3']);
    f.vote('T2');
    expect(f.get('T2').alive).toBe(false);
    expect(f.bounce).toBeNull();
    expect(f.candidateIdx).toContain(f.idx('T1'));
  });

  it('second majority against the Boomerang eliminates them for real', () => {
    const f = table(6, 1, 0, { T1: { special: 'boomerang' } });
    f.vote('T1', ['T2', 'T3']);
    f.vote('T2');
    expect(f.vote('T1', ['T3', 'T4'])).toBe('out');
    expect(f.get('T1').alive).toBe(false);
  });

  it('a Boomerang saved at the first stop is not saved again at a later stop', () => {
    const f = table(7, 2, 0, { T1: { special: 'boomerang' } });
    expect(f.vote('T1', ['T2'])).toBe('bounced-out');   // single voter: T2 goes straight off
    expect(f.get('T2').alive).toBe(false);
    f.vote('S1');               // someone else out
    expect(f.vote('T1', ['T3'])).toBe('out');
  });

  it('works for a Falafel Vendor who drew boomerang', () => {
    const f = table(5, 1, 0, { T1: { special: 'falafelVendor', dipAs: 'boomerang' } });
    expect(f.vote('T1', ['T2', 'T3'])).toBe('bounced');
  });

  it('a dead Ghost who voted against the Boomerang is not bounced (not alive)', () => {
    const f = table(6, 1, 0, { T1: { special: 'boomerang' }, T2: { special: 'ghost' } });
    f.vote('T2');
    f.vote('T1', ['T2', 'T3', 'T4']);
    expect(f.tiedIdx!.map(i => f.seats[i].name).sort()).toEqual(['T3', 'T4']);
  });

  it('Ghost + one living voter: only the living voter is bounced onto, and goes straight off', () => {
    const f = table(6, 1, 0, { T1: { special: 'boomerang' }, T2: { special: 'ghost' } });
    f.vote('T2');
    expect(f.vote('T1', ['T2', 'T3'])).toBe('bounced-out');
    expect(f.get('T3').alive).toBe(false);
    expect(f.get('T1').alive).toBe(true);
  });

  it('the Boomerang cannot be confirmed without ticking who voted (Undercover: votes bounce onto the voters)', () => {
    const f = table(5, 1, 0, { T1: { special: 'boomerang' } });
    expect(() => f.vote('T1', [])).toThrow('boomerang needs voters');
    expect(f.get('T1').boomerangUsed).toBeUndefined();   // ticket not wasted
    expect(f.get('T1').alive).toBe(true);
  });

  it('a Boomerang whose only voter is a dead Ghost cannot bounce, so it is not confirmable either', () => {
    const f = table(6, 1, 0, { T1: { special: 'boomerang' }, T2: { special: 'ghost' } });
    f.vote('T2');
    expect(() => f.vote('T1', ['T2'])).toThrow('boomerang needs voters');
  });

  it('a single bounced voter who is a Pickpocket still gets the last-chance guess', () => {
    const f = table(5, 1, 1, { T1: { special: 'boomerang' } });
    expect(f.vote('T1', ['L1'])).toBe('bounced-out');
    expect(f.phase).toBe('guess');
  });

  it('a single bounced voter can end the game', () => {
    const f = table(4, 1, 0, { T1: { special: 'boomerang' } });
    f.vote('T1', ['S1']);
    expect(f.outcome).toBe('tourists');
  });

  it('bouncing onto a Pickpocket leads to her last-chance guess', () => {
    const f = table(5, 1, 1, { T1: { special: 'boomerang' } });
    f.vote('T1', ['L1', 'T2']);
    f.vote('L1');
    expect(f.phase).toBe('guess');
  });
});

describe('Goddess of Justice (goddess)', () => {
  it('is findable even when eliminated, so she can still decide ties', () => {
    const f = table(6, 1, 0, { T1: { special: 'goddess' } });
    f.vote('T1');
    const goddess = f.seats.find(s => activeSpecial(s) === 'goddess');
    expect(goddess?.name).toBe('T1');
    expect(goddess?.alive).toBe(false);
  });

  it('a Falafel Vendor who drew goddess is the Goddess too', () => {
    const f = table(5, 1, 0, { T2: { special: 'falafelVendor', dipAs: 'goddess' } });
    expect(f.seats.find(s => activeSpecial(s) === 'goddess')?.name).toBe('T2');
  });

  it('gives no points', () => {
    const f = table(5, 1, 0, { T1: { special: 'goddess' } });
    f.vote('T1');
    expect(specialBonus(f.seats).T1).toBe(0);
  });
});

describe('Ghost (ghost)', () => {
  it('keeps voting after being eliminated, but cannot be voted for', () => {
    const f = table(6, 1, 0, { T1: { special: 'ghost' } });
    f.vote('T1');
    expect(f.voterIdx).toContain(f.idx('T1'));
    expect(f.candidateIdx).not.toContain(f.idx('T1'));
  });

  it('other eliminated players do not vote', () => {
    const f = table(6, 1, 0, { T1: { special: 'ghost' } });
    f.vote('T2');
    expect(f.voterIdx).not.toContain(f.idx('T2'));
  });

  it('does not count towards the win check', () => {
    const f = table(3, 1, 0, { T1: { special: 'ghost' } });
    f.vote('T1');                    // 2 tourists + 1 stranger alive
    f.vote('T2');                    // 1 tourist left -> sneaky win
    expect(f.outcome).toBe('strangers');
  });

  it('a Falafel Vendor who drew Ghost still votes after leaving', () => {
    const f = table(6, 1, 0, { T1: { special: 'falafelVendor', dipAs: 'ghost' } });
    f.vote('T1');
    expect(f.voterIdx).toContain(f.idx('T1'));
  });

  it('a Ghost who is a Pickpocket still gets her guess', () => {
    const f = table(5, 1, 1, { L1: { special: 'ghost' } });
    f.vote('L1');
    expect(f.phase).toBe('guess');
    f.judgeGuess(false);
    expect(f.voterIdx).toContain(f.idx('L1'));
  });
});

describe('Lovers', () => {
  const love = (a: string, b: string) => ({ [a]: { special: 'lovers' as const, partner: b }, [b]: { special: 'lovers' as const, partner: a } });

  it('partner leaves right after, with consecutive out orders', () => {
    const f = table(6, 1, 0, love('T1', 'T2'));
    f.vote('T1');
    expect(f.get('T2').alive).toBe(false);
    expect(f.get('T2').outOrder).toBe(f.get('T1').outOrder! + 1);
    expect(f.get('T2').outStop).toBe(f.get('T1').outStop);
  });

  it('works whichever lover is voted out', () => {
    const f = table(6, 1, 0, love('T1', 'T2'));
    f.vote('T2');
    expect(f.get('T1').alive).toBe(false);
  });

  it('can end the game: both lovers were the last Tourists but one', () => {
    const f = table(3, 1, 0, love('T1', 'T2'));
    f.vote('T1');          // T1 + T2 gone, 1 tourist left
    expect(f.outcome).toBe('strangers');
  });

  it('Stranger + Tourist as Lovers: voting out the Stranger takes the Tourist too', () => {
    const f = table(4, 1, 0, love('S1', 'T1'));
    f.vote('S1');
    expect(f.get('T1').alive).toBe(false);
    expect(f.outcome).toBe('tourists');   // no sneaky left
  });

  it('a Pickpocket who leaves as the Lover partner still gets her last-chance guess (Undercover: Mr. White always guesses)', () => {
    const f = table(5, 1, 1, love('T1', 'L1'));
    f.vote('T1');
    expect(f.get('L1').alive).toBe(false);
    expect(f.phase).toBe('guess');
    expect(f.get(f.seats[f.lastOut!].name).name).toBe('L1');
  });

  it('that partner guessing right steals the round', () => {
    const f = table(5, 1, 1, love('T1', 'L1'));
    f.vote('T1');
    f.judgeGuess(true);
    expect(f.outcome).toBe('pickpocket-steal');
    expect(f.get('L1').alive).toBe(true);
    expect(f.gained.L1).toBe(6);
  });

  it('that partner guessing wrong lets the game go on', () => {
    const f = table(6, 1, 1, love('T1', 'L1'));
    f.vote('T1');
    f.judgeGuess(false);
    expect(f.phase).toBe('vote');
    expect(f.stopNo).toBe(2);
  });

  it('wrong guess that leaves only the Tourists ends the game for them', () => {
    const f = table(4, 1, 1, love('S1', 'T1'));   // S1 voted out, T1 leaves too, L1 still aboard
    f.vote('S1');
    expect(f.phase).toBe('vote');
    f.vote('L1');
    f.judgeGuess(false);
    expect(f.outcome).toBe('tourists');
  });

  it('two Pickpocket Lovers (10+ players): the voted one guesses first, then her partner', () => {
    const f = table(8, 2, 2, love('L1', 'L2'));
    f.vote('L1');
    expect(f.phase).toBe('guess');
    expect(f.seats[f.lastOut!].name).toBe('L1');
    f.judgeGuess(false);
    expect(f.phase).toBe('guess');
    expect(f.seats[f.lastOut!].name).toBe('L2');
    f.judgeGuess(false);
    expect(f.phase).toBe('vote');
  });

  it('two Pickpocket Lovers: the partner can still steal after the first guess was wrong', () => {
    const f = table(8, 2, 2, love('L1', 'L2'));
    f.vote('L1');
    f.judgeGuess(false);
    f.judgeGuess(true);
    expect(f.outcome).toBe('pickpocket-steal');
    expect(f.get('L2').alive).toBe(true);
  });

  it('a Pickpocket Lover whose partner left earlier is not asked twice', () => {
    const f = table(8, 2, 2, love('T1', 'T2'));
    f.vote('T1');                       // T1 + T2 gone, no Pickpocket involved: no guess
    expect(f.phase).toBe('vote');
  });

  it('a Revenger who picks a Lover takes the partner; a Pickpocket partner then guesses', () => {
    const f = table(7, 1, 1, { ...love('T1', 'L1'), T3: { special: 'revenger' } });
    f.vote('T3');
    f.revenge('T1');
    expect(f.get('L1').alive).toBe(false);
    expect(f.phase).toBe('guess');
    expect(f.seats[f.lastOut!].name).toBe('L1');
  });

  it('the Revenger check still follows the player who was voted out, not the guesser', () => {
    // Pickpocket Revenger voted out: guess first, then revenge, with her as the one who takes revenge.
    const f = table(6, 1, 1, { L1: { special: 'revenger' } });
    f.vote('L1');
    f.judgeGuess(false);
    expect(f.phase).toBe('revenger');
    expect(f.seats[f.lastOut!].name).toBe('L1');
  });

  it('voted Pickpocket lover gets her guess; partner is already gone', () => {
    const f = table(6, 1, 1, love('L1', 'T1'));
    f.vote('L1');
    expect(f.phase).toBe('guess');
    expect(f.get('T1').alive).toBe(false);
  });

  it('Revenger pointing at a Lover takes the partner too', () => {
    const f = table(7, 1, 0, { ...love('T1', 'T2'), T3: { special: 'revenger' } });
    f.vote('T3');
    f.revenge('T1');
    expect(f.get('T1').alive).toBe(false);
    expect(f.get('T2').alive).toBe(false);
  });

  it('a lover whose partner is already gone leaves alone (no crash)', () => {
    const f = table(7, 1, 0, love('T1', 'T2'));
    f.vote('T1');
    expect(f.seats.filter(s => !s.alive)).toHaveLength(2);
    expect(f.phase).toBe('vote');
  });

  it('Boomerang spared once; Lovers in the bounce still go together', () => {
    const f = table(7, 1, 0, { ...love('T1', 'T2'), T3: { special: 'boomerang' } });
    f.vote('T3', ['T1', 'T4']);
    f.vote('T1');
    expect(f.get('T2').alive).toBe(false);
  });
});

describe('Falafel Vendor (falafelVendor)', () => {
  it('needs 4+ players; with 4, gets one of the solo abilities', () => {
    for (let i = 0; i < 100; i++) {
      // 3 players: Falafel Vendor is gated out, so only the Joy Fool can be dealt.
      for (const a of assignSpecials(['a', 'b', 'c'], ['falafelVendor', 'joyFool'], Infinity).values()) expect(a.special).toBe('joyFool');
    }
    expect(assignSpecials(['a', 'b', 'c'], ['falafelVendor'], Infinity).size).toBe(0);
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      // 4 players -> 1 slot, so 'falafelVendor' + 'joyFool' can only deal one of them
      const out = assignSpecials(['a', 'b', 'c', 'd'], ['falafelVendor', 'joyFool', 'boomerang'], Infinity);
      expect(out.size).toBeLessThanOrEqual(1);
      for (const a of out.values()) if (a.special === 'falafelVendor') { hits++; expect(['joyFool', 'boomerang']).toContain(a.dipAs); }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('never draws Revenger below 5 players, never a pair role', () => {
    for (let i = 0; i < 500; i++) {
      const out = assignSpecials(['a', 'b', 'c', 'd'], SPECIALS.map(s => s.id), Infinity);
      for (const a of out.values()) {
        expect(a.dipAs).not.toBe('revenger');
        expect(a.dipAs).not.toBe('duelists');
        expect(a.dipAs).not.toBe('lovers');
        expect(a.special).not.toBe('revenger');
      }
    }
  });

  it('the drawn ability is a different role from every other role dealt', () => {
    for (let i = 0; i < 500; i++) {
      const out = assignSpecials(Array.from({ length: 12 }, (_, k) => `P${k}`), SPECIALS.map(s => s.id), Infinity);
      const eff = [...out.values()].filter(a => a.special !== 'duelists' && a.special !== 'lovers').map(a => activeSpecial(a));
      expect(new Set(eff).size).toBe(eff.length);
    }
  });

  it('a Vendor who drew Revenger can take someone with her', () => {
    const f = table(6, 1, 0, { T1: { special: 'falafelVendor', dipAs: 'revenger' } });
    f.vote('T1');
    expect(f.phase).toBe('revenger');
  });
});

describe('Revenger (revenge)', () => {
  it('after being voted out she picks one more player to go', () => {
    const f = table(7, 2, 0, { T1: { special: 'revenger' } });
    f.vote('T1');
    expect(f.phase).toBe('revenger');
    f.revenge('S1');
    expect(f.get('S1').alive).toBe(false);
    expect(f.phase).toBe('vote');
  });

  it('only once: the victim cannot trigger another revenge', () => {
    const f = table(7, 2, 0, { T1: { special: 'revenger' } });
    f.vote('T1');
    f.revenge('T2');
    expect(f.get('T1').revengeDone).toBe(true);
    expect(f.phase).toBe('vote');
  });

  it('is skipped when her elimination already ends the game', () => {
    const f = table(3, 1, 0, { S1: { special: 'revenger' } });
    f.vote('S1');
    expect(f.outcome).toBe('tourists');
  });

  it('her victim can end the game', () => {
    const f = table(3, 1, 0, { T1: { special: 'revenger' } });
    f.vote('T1');              // 2 tourists, 1 stranger alive: continue
    expect(f.phase).toBe('revenger');
    f.revenge('T2');           // 1 tourist left
    expect(f.outcome).toBe('strangers');
  });

  it('her victim can be the last Stranger -> Tourists win', () => {
    const f = table(4, 1, 0, { T1: { special: 'revenger' } });
    f.vote('T1');
    f.revenge('S1');
    expect(f.outcome).toBe('tourists');
  });

  it('a Pickpocket victim still gets her last-chance guess', () => {
    const f = table(6, 1, 1, { T1: { special: 'revenger' } });
    f.vote('T1');
    f.revenge('L1');
    expect(f.phase).toBe('guess');
    f.judgeGuess(true);
    expect(f.outcome).toBe('pickpocket-steal');
  });

  it('a Pickpocket Revenger: guess first, then (if wrong) revenge', () => {
    const f = table(6, 1, 1, { L1: { special: 'revenger' } });
    f.vote('L1');
    expect(f.phase).toBe('guess');
    f.judgeGuess(false);
    expect(f.phase).toBe('revenger');
  });

  it('a Pickpocket Revenger who guesses right steals the round, no revenge', () => {
    const f = table(6, 1, 1, { L1: { special: 'revenger' } });
    f.vote('L1');
    f.judgeGuess(true);
    expect(f.outcome).toBe('pickpocket-steal');
  });

  it('gives no points', () => {
    const f = table(7, 2, 0, { T1: { special: 'revenger' } });
    f.vote('T1');
    expect(specialBonus(f.seats).T1).toBe(0);
  });

  it('Revenger takes a Boomerang: the ticket does not protect them from revenge', () => {
    const f = table(7, 2, 0, { T1: { special: 'revenger' }, T2: { special: 'boomerang' } });
    f.vote('T1');
    f.revenge('T2');
    expect(f.get('T2').alive).toBe(false);   // revenge is not a vote, no bounce
  });
});

// ═════════════════════════════════════════════════════════════
describe('dealing: counts and limits', () => {
  it('specials never exceed one role per 3 players across the whole 3..20 range', () => {
    for (let n = 3; n <= 20; n++) {
      for (let i = 0; i < 200; i++) {
        const out = assignSpecials(Array.from({ length: n }, (_, k) => `P${k}`), SPECIALS.map(s => s.id));
        const pairs = [...out.values()].filter(a => a.special === 'duelists' || a.special === 'lovers').length / 2;
        expect(out.size - pairs).toBeLessThanOrEqual(Math.floor(n / 3));
      }
    }
  });

  it('every special can actually appear in a big enough room (nothing is dead code)', () => {
    const seen = new Set<SpecialId>();
    for (let i = 0; i < 3000; i++) {
      for (const a of assignSpecials(Array.from({ length: 20 }, (_, k) => `P${k}`), SPECIALS.map(s => s.id)).values()) {
        seen.add(a.special);
        if (a.dipAs) seen.add(a.dipAs);
      }
    }
    expect([...seen].sort()).toEqual(SPECIALS.map(s => s.id).sort());
  });

  it('a room with 3 players gets at most one non-pair, non-gated special', () => {
    for (let i = 0; i < 300; i++) {
      const out = assignSpecials(['a', 'b', 'c'], SPECIALS.map(s => s.id));
      expect(out.size).toBeLessThanOrEqual(1);
      for (const a of out.values()) expect(['joyFool', 'boomerang', 'goddess', 'ghost']).toContain(a.special);
    }
  });

  it('only host-ticked specials are dealt', () => {
    for (let i = 0; i < 300; i++) {
      for (const a of assignSpecials(Array.from({ length: 9 }, (_, k) => `P${k}`), ['joyFool', 'lovers']).values()) {
        expect(['joyFool', 'lovers']).toContain(a.special);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════
// Fuzz: thousands of random full games with every special on.
describe('fuzz: random full games with all specials', () => {
  afterEach(() => vi.restoreAllMocks());

  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('always terminates, never double-eliminates, keeps invariants', () => {
    let games = 0;
    const outcomes: Record<string, number> = {};
    const roleHits: Record<string, number> = {};
    for (let seed = 1; seed <= 4000; seed++) {
      const r = rng(seed);
      vi.spyOn(Math, 'random').mockImplementation(r);
      const n = 3 + Math.floor(r() * 18);                          // 3..20
      const sneaky = Math.max(1, Math.min(Math.floor((n - 1) / 2), 1 + Math.floor(r() * 3)));
      const pickpockets = n >= 5 && r() < 0.5 ? 1 : 0;
      const strangers = Math.min(sneaky, Math.max(0, Math.floor((n - 1) / 2) - pickpockets));
      const s = Math.max(strangers, pickpockets ? 0 : 1);
      const names = Array.from({ length: n }, (_, k) => `P${k + 1}`);
      const counts = countsFor(n, s, pickpockets);
      if (counts.tourists <= s + pickpockets) continue;                  // invalid split, skip
      const setup = dealRound(names, counts, { id: 'x', category: 'places', level: 'easy', a: 'A', b: 'B' } as never,
        { enabled: SPECIALS.map(d => d.id) });
      const f = new Flow(setup.seats);
      games++;

      let guard = 0;
      const guessed = new Set<string>();
      while (f.phase !== 'roundEnd') {
        if (++guard > 200) throw new Error(`seed ${seed}: no end. log=${f.log.join(',')}`);
        if (f.phase === 'vote') {
          const cands = f.candidateIdx;
          expect(cands.length).toBeGreaterThan(0);
          const pick = cands[Math.floor(r() * cands.length)];
          const voterPool = f.voterIdx.filter(i => i !== pick);
          let voters = voterPool.filter(() => r() < 0.7).map(i => f.seats[i].name);
          const needs = activeSpecial(f.seats[pick]) === 'boomerang' && !f.seats[pick].boomerangUsed;
          if (needs && !voters.some(v => f.get(v).alive)) {
            const alive = voterPool.filter(i => f.seats[i].alive);
            voters = [...voters, f.seats[alive[Math.floor(r() * alive.length)]].name];
          }
          f.vote(f.seats[pick].name, voters);
        } else if (f.phase === 'guess') {
          guessed.add(f.seats[f.lastOut!].name);
          f.judgeGuess(r() < 0.25);
        } else if (f.phase === 'revenger') {
          const cands = f.aliveIdx;
          f.revenge(f.seats[cands[Math.floor(r() * cands.length)]].name);
        } else {
          throw new Error(`unexpected phase ${f.phase}`);
        }
        // ── invariants after every step ──
        const orders = f.seats.filter(x => x.outOrder !== undefined).map(x => x.outOrder!).sort((a, b) => a - b);
        expect(orders).toEqual(orders.map((_, i) => i + 1));                       // 1..k, no gaps/dupes
        for (const x of f.seats) if (x.outOrder === undefined) expect(x.alive).toBe(true);
        for (const x of f.seats) {
          if (activeSpecial(x) === 'lovers' && x.partner) {
            const p = f.get(x.partner);
            expect(activeSpecial(p)).toBe('lovers');
            if (!x.alive && x.outOrder !== undefined && p.outOrder !== undefined) {
              expect(Math.abs(x.outOrder - p.outOrder)).toBe(1);                   // lovers leave together
            }
          }
        }
      }
      // ── final invariants ──
      // Undercover: every Pickpocket who was eliminated got her guess, unless the round ended before
      // her turn (a steal by an earlier guess, or the game being over is checked only after guesses).
      if (f.outcome !== 'pickpocket-steal') {
        for (const x of f.seats) {
          if (x.role === 'pickpocket' && x.outOrder !== undefined) expect(guessed.has(x.name)).toBe(true);
        }
      }
      outcomes[f.outcome!] = (outcomes[f.outcome!] ?? 0) + 1;
      for (const x of f.seats) { const sp = activeSpecial(x); if (sp) roleHits[sp] = (roleHits[sp] ?? 0) + 1; }
      for (const [name, pts] of Object.entries(f.gained)) {
        expect(Number.isFinite(pts)).toBe(true);
        expect(pts).toBeGreaterThanOrEqual(-RIVAL_POINTS);
        expect(pts).toBeLessThanOrEqual(10 + CLOWN_POINTS + RIVAL_POINTS);
        void name;
      }
      const bonus = specialBonus(f.seats);
      const duelists = f.seats.filter(x => activeSpecial(x) === 'duelists');
      if (duelists.length === 2) {
        const sum = bonus[duelists[0].name] + bonus[duelists[1].name];
        expect(sum).toBe(0);                                                       // a duel is zero-sum
      }
      expect(f.seats.filter(x => activeSpecial(x) === 'joyFool' && x.outOrder === 1).length)
        .toBeLessThanOrEqual(1);
      const solo = f.seats.filter(x => x.special && x.special !== 'duelists' && x.special !== 'lovers').map(x => activeSpecial(x));
      expect(new Set(solo).size).toBe(solo.length);
      vi.restoreAllMocks();
    }
    expect(games).toBeGreaterThan(2500);
    // Every role and every outcome was exercised.
    expect(Object.keys(outcomes).sort()).toEqual(['pickpocket-steal', 'strangers', 'tourists']);
    for (const id of ['joyFool', 'duelists', 'boomerang', 'goddess', 'ghost', 'revenger', 'lovers']) {
      expect(roleHits[id] ?? 0).toBeGreaterThan(0);
    }
    console.log('fuzz games', games, 'outcomes', outcomes, 'role seats', roleHits);
  }, 60000);

  // keep type imports used
  it('types', () => { const x: SoloSpecialId = 'joyFool'; expect(x).toBe('joyFool'); });
});
