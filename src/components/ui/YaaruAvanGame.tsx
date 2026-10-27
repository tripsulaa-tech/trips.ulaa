import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, ArrowCounterClockwise, ShareNetwork, SpeakerHigh, SpeakerSlash, Vibrate, Trophy, Plus, Minus, X,
  Ticket, Airplane, Eye, EyeSlash, Crown, Skull, CheckCircle,
  XCircle, MagicWand, Gift, Question, ArrowRight, DeviceMobile, ChatCircleDots, Sliders,
} from '@phosphor-icons/react';
import Modal from './Modal';
import yaaruAvanCat from '../../assets/yaaru-avan-cat.png';
import { SITE_HOST, SITE_ORIGIN } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { haptic, hapticsEnabled, setHapticsEnabled } from './haptics';
import { Confetti, GameTile } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn as basePrimaryBtn, ghostBtn as baseGhostBtn, glass as baseGlass, eyebrow, shareCardImage, cleanName } from './gameUi';
import YaaruAvanOnline from './YaaruAvanOnline';
import SpecialList from './YaaruAvanSpecialList';
import YaaruAvanRules from './YaaruAvanRules';
import { loadOnlineSession } from './yaaruAvanRoomApi';
import { LEVELS, CATEGORY_LABEL } from './yaaruAvanWords';
import type { Level } from './yaaruAvanWords';
import {
  MIN_PLAYERS, MAX_PLAYERS, POINTS, maxPickpockets, countsFor, rolesValid, recommendedRoles, clampRoles, describeOrder,
  dealRound, drawPair, drawDare, afterElimination, roundPoints, outcomeTitle, eligibleRetriever, retrieveTourist,
  computeAwards, emptyStats, loadSetup, saveSetup, uniqueNames, shuffle,
} from './yaaruAvanEngine';
import type { Seat, Role, Outcome, PlayerStats, RoundSetup } from './yaaruAvanEngine';
import { ENABLED_SPECIALS, describeSpecial, activeSpecial, specialBonus, specialLabel } from './yaaruAvanSpecials';
import type { SpecialId } from './yaaruAvanSpecials';
import { useYaaruAvanContentSync } from './useGameContentSync';

// Same corner radius as the buttons on the admin pages (rounded-md). Local to this game, so other games keep theirs.
const primaryBtn = basePrimaryBtn.replace('rounded-2xl', 'rounded-md');
const ghostBtn = baseGhostBtn.replace('rounded-2xl', 'rounded-md');
const glass = baseGlass.replace('rounded-2xl', 'rounded-lg');

// "Yaaru Avan?": a group bluffing game for Coming Soon trips. Two ways to play:
// pass-and-play on one phone (this file), or online with a room code where
// everyone uses their own phone (YaaruAvanOnline.tsx, backed by Supabase).
// The rest of this comment describes the pass-and-play mode.
// Everyone is on the same trip, but a Stranger sneaked aboard with the wrong
// plan. Tourists get one word, Strangers a similar one, and the Pickpocket
// none at all. Each stop the group talks it out and offboards
// someone. Front-end only: one phone is passed around, nothing is sent
// anywhere. Only the word bag, names and settings live in localStorage
// (see yaaruAvanEngine.ts), sounds are synthesised (gameAudio.ts), and the
// share button makes a result-card image (packBagScoreCard.ts).

const MUTE_KEY = 'ulaa:packbag:muted'; // shared with the other games: one sound setting
const REVEAL_MS = 1900;

type Phase =
  | 'idle' | 'online' | 'rules' | 'setup' | 'pass' | 'ticket' | 'describe' | 'vote' | 'offboard' | 'guess' | 'saved' | 'retrieve' | 'retrieved' | 'revenger' | 'sniper' | 'roundEnd' | 'tweak' | 'final';

const ROLE_LABEL: Record<Role, string> = { tourist: 'Tourist', stranger: 'Stranger', pickpocket: 'Pickpocket' };
const ROLE_TONE: Record<Role, string> = {
  tourist: 'from-emerald-300 to-emerald-500 text-emerald-950',
  stranger: 'from-gold-300 to-gold text-dark',
  pickpocket: 'from-rose-300 to-rose-500 text-rose-950',
};

interface YaaruAvanGameProps {
  tripId?: string;
  tripSlug?: string;
  tripTitle?: string;
  className?: string;
  compact?: boolean;
  thumb?: boolean;
  /** Slim one-line tile (admin Games page). */
  row?: boolean;
  /** Names to pre-fill the setup screen with (e.g. the travellers present on a trip). */
  players?: string[];
  /** Open straight on the pass-and-play setup screen (used by the admin tile). */
  defaultOpen?: boolean;
}

/** Preset names, cleaned and capped. Empty when none were given. */
const presetNames = (preset?: string[]): string[] =>
  (preset ?? []).map(cleanName).filter(Boolean).slice(0, MAX_PLAYERS);

/** The name rows for the setup screen: the preset list, else the saved one. */
const rowsFor = (preset: string[] | undefined, saved: string[]): string[] => {
  const list = presetNames(preset);
  if (!list.length) return saved;
  const rows = list.slice();
  while (rows.length < MIN_PLAYERS) rows.push('');
  return rows;
};

/** Pickpocket's typed guess: one box per word of the Tourists' word (1 word = 1 box, 2 words = 2 boxes). */
const normGuess = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Spelling does not matter much: a word that is one letter off (4+ letters) still counts. */
const guessMatches = (typed: string[], answer: string): boolean => {
  const want = answer.split(/\s+/).filter(Boolean);
  if (typed.length !== want.length) return false;
  return want.every((w, i) => {
    const a = normGuess(typed[i]); const b = normGuess(w);
    return a.length > 0 && (a === b || (b.length >= 4 && editDistance(a, b) <= 1));
  });
};
function GuessBoxes({ answer, onSubmit }: { answer: string; onSubmit: (correct: boolean) => void }) {
  const count = Math.max(1, answer.split(/\s+/).filter(Boolean).length);
  const [vals, setVals] = useState<string[]>(() => Array(count).fill(''));
  const filled = vals.every(v => v.trim().length > 0);
  return (
    <form className="mb-4" onSubmit={e => { e.preventDefault(); if (filled) onSubmit(guessMatches(vals, answer)); }}>
      <div className="space-y-2 mb-3">
        {vals.map((v, i) => (
          <input key={i} type="text" value={v} autoComplete="off" autoCapitalize="none" spellCheck={false}
            onChange={e => setVals(prev => prev.map((x, k) => (k === i ? e.target.value : x)))}
            placeholder={count > 1 ? `Word ${i + 1}` : 'Type your guess'} aria-label={count > 1 ? `Word ${i + 1} of ${count}` : 'Your guess'}
            className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-center text-lg font-bold text-white placeholder:text-cream/40 focus:outline-none focus:border-gold-300" />
        ))}
      </div>
      <button type="submit" disabled={!filled} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>Submit guess</button>
    </form>
  );
}

export default function YaaruAvanGame({ tripSlug = '', tripTitle = 'Ulaa', className = '', compact = false, thumb = false, row = false, players: presetPlayers, defaultOpen = false }: YaaruAvanGameProps) {
  useYaaruAvanContentSync();
  const reduce = useReducedMotion();

  // ── Setup (saved on this device) ──
  const [initial] = useState(loadSetup);
  const hasPreset = presetNames(presetPlayers).length > 0;
  const [open, setOpen] = useState(defaultOpen);
  const [phase, setPhase] = useState<Phase>(defaultOpen ? 'setup' : 'idle');
  const [savedRoom, setSavedRoom] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>(() => rowsFor(presetPlayers, initial.names));
  const [strangers, setStrangers] = useState(() => (hasPreset ? clampRoles(Math.max(MIN_PLAYERS, presetNames(presetPlayers).length), initial.strangers, initial.pickpockets).strangers : initial.strangers));
  const [pickpockets, setPickpockets] = useState(() => (hasPreset ? clampRoles(Math.max(MIN_PLAYERS, presetNames(presetPlayers).length), initial.strangers, initial.pickpockets).pickpockets : initial.pickpockets));
  const [hideCounts, setHideCounts] = useState(initial.hideCounts);
  const [level, setLevel] = useState<Level>(initial.level);
  const [useDares, setUseDares] = useState(initial.dares);
  const [useSpecials, setUseSpecials] = useState(initial.specials);
  // Mr. Meme (one phone only): each description round a random player describes by gestures.
  const [useMeme, setUseMeme] = useState(initial.meme);
  // On: a Pickpocket can randomly speak first. Off: a Pickpocket never speaks first.
  const [pickpocketCanStart, setPickpocketCanStart] = useState(initial.pickpocketCanStart);
  // Which special roles are ticked in the role list (all of them to start with).
  const [specialIds, setSpecialIds] = useState<SpecialId[]>([...ENABLED_SPECIALS]);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  const { ensure, play, onPressCapture } = useSynth(mutedRef);

  // ── Session ──
  const [players, setPlayers] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, PlayerStats>>({});
  const [roundNo, setRoundNo] = useState(0);
  const [round, setRound] = useState<RoundSetup | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [passIdx, setPassIdx] = useState(0);        // whose boarding pass is next
  const [stopNo, setStopNo] = useState(1);          // stop within the round
  const [descOrder, setDescOrder] = useState<number[]>([]); // speaking order for the description round (seat indexes)
  const [descPos, setDescPos] = useState(0);
  // Seat index of this stop's Mr. Meme (null when Mr. Meme is off).
  const [memeIdx, setMemeIdx] = useState<number | null>(null);
  // The Sniper's solo shot: who is shooting (null while still choosing), a warning, and the line shown at the offboarding.
  const [sniperShooter, setSniperShooter] = useState<number | null>(null);
  const [sniperErr, setSniperErr] = useState<string | null>(null);
  const [sniperNote, setSniperNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [voters, setVoters] = useState<number[]>([]);
  const [lastOut, setLastOut] = useState<number | null>(null);
  // Mr. White (Pickpocket) always guesses when eliminated, even as a Lover who leaves with their
  // partner. `guessQueue` holds the Pickpockets still waiting for their guess; `guessAfter` is the
  // player whose elimination started it (the one a Revenger revenge or the next stop follows).
  const [guessQueue, setGuessQueue] = useState<number[]>([]);
  const voteExitRef = useRef(true);
  const retrievalLock = useRef(false);
  const [retrievePos, setRetrievePos] = useState(0);
  const [retrieveOpen, setRetrieveOpen] = useState(false);
  const [retrieveYes, setRetrieveYes] = useState(false);
  const [guessAfter, setGuessAfter] = useState<number | null>(null);
  // Boomerang: after the votes bounce, only the players who cast them can be voted out.
  const [bounce, setBounce] = useState<number[] | null>(null);
  // Boomerang secrecy: only once the host tries to offboard the Boomerang with nobody ticked as a voter
  // do we ask for the voters (the seat index it was asked for). Never shown before that.
  const [boomerangAskFor, setBoomerangAskFor] = useState<number | null>(null);
  // Vote tied: the Goddess of Justice (if one was dealt) decides, even if she is already out.
  const [tieOpen, setTieOpen] = useState(false);
  // Tie with no Goddess (Undercover FAQ): the tied players describe once more, then the others vote
  // again among them. `tiedIdx` is set for that re-vote; `tickTied` is the host's pick of who is tied.
  const [tiedIdx, setTiedIdx] = useState<number[] | null>(null);
  const [tickTied, setTickTied] = useState<number[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [gained, setGained] = useState<Record<string, number>>({});
  const [dare, setDare] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const timersRef = useRef<number[]>([]);
  const cardBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    timersRef.current = [];
  }, []);
  const later = (ms: number, fn: () => void) => { timersRef.current.push(window.setTimeout(fn, ms)); };

  const filled = names.map(cleanName).filter(Boolean);
  const playerCount = filled.length;
  const counts = countsFor(Math.max(playerCount, MIN_PLAYERS), strangers, pickpockets);
  const valid = playerCount >= MIN_PLAYERS && rolesValid(playerCount, strangers, pickpockets);

  // The roster changed (another trip picked, someone ticked present/absent):
  // refill the setup list and keep the role counts valid. Only the setup
  // fields change, so a running game is never disturbed.
  const presetKey = presetNames(presetPlayers).join('\u0001');
  const [seenPresetKey, setSeenPresetKey] = useState(presetKey);
  if (seenPresetKey !== presetKey) {
    setSeenPresetKey(presetKey);
    if (presetKey) {
      const list = presetNames(presetPlayers);
      setNames(rowsFor(presetPlayers, []));
      if (list.length >= MIN_PLAYERS) {
        const r = clampRoles(list.length, strangers, pickpockets);
        setStrangers(r.strangers);
        setPickpockets(r.pickpockets);
      }
    }
  }

  // Persist setup as it changes. A roster handed in by the host is not
  // remembered as this device's own list of names.
  useEffect(() => {
    saveSetup({ names: hasPreset ? initial.names : names, strangers, pickpockets, hideCounts, level, dares: useDares, specials: useSpecials, meme: useMeme, pickpocketCanStart });
  }, [names, strangers, pickpockets, hideCounts, level, useDares, useSpecials, useMeme, pickpocketCanStart, hasPreset, initial.names]);

  useEffect(() => () => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const [hapticsOn, setHapticsOn] = useState<boolean>(() => hapticsEnabled());
  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsEnabled(next);
    const effective = hapticsEnabled();
    setHapticsOn(effective);
    if (effective) haptic('success');
  };
  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  };

  // Keep role counts valid when players are added or removed.
  const adjustRoles = (n: number, s: number, l: number) => {
    if (n < MIN_PLAYERS) return;
    const r = clampRoles(n, s, l);
    setStrangers(r.strangers);
    setPickpockets(r.pickpockets);
  };
  const setName = (i: number, v: string) => setNames(ns => ns.map((n, k) => (k === i ? v.slice(0, 18) : n)));
  const addPlayer = () => {
    if (names.length >= MAX_PLAYERS) return;
    setNames(ns => [...ns, '']);
  };
  const removePlayer = (i: number) => {
    if (names.length <= MIN_PLAYERS) { setName(i, ''); return; }
    const next = names.filter((_, k) => k !== i);
    setNames(next);
    adjustRoles(next.map(cleanName).filter(Boolean).length, strangers, pickpockets);
  };
  const onNameBlur = () => adjustRoles(playerCount, strangers, pickpockets);

  const useRecommended = () => {
    const r = recommendedRoles(playerCount);
    setStrangers(r.strangers);
    setPickpockets(r.pickpockets);
    play('flip');
  };

  // ── Starting a session / a round ──
  const startSession = () => {
    ensure();
    const cleaned = uniqueNames(filled);
    setPlayers(cleaned);
    const fresh: Record<string, PlayerStats> = {};
    cleaned.forEach(n => { fresh[n] = emptyStats(); });
    setStats(fresh);
    setRoundNo(0);
    setPreviewUrl(null);
    cardBlobRef.current = null;
    beginRound(cleaned, 1);
  };

  const beginRound = (list: string[], no: number) => {
    clearTimers();
    const pair = drawPair(level, { tripTitle: no === 1 ? tripTitle : undefined });
    const r = dealRound(list, countsFor(list.length, strangers, pickpockets), pair,
      useSpecials && specialIds.length > 0 ? { enabled: specialIds } : undefined);
    setGuessQueue([]);
    setGuessAfter(null);
    setRetrieveOpen(false);
    setRetrieveYes(false);
    retrievalLock.current = false;
    setRound(r);
    setSeats(r.seats);
    setRoundNo(no);
    setStopNo(1);
    setPassIdx(0);
    setSelected(null);
    setVoters([]);
    setLastOut(null);
    setBounce(null);
    setOutcome(null);
    setGained({});
    setDare(null);
    setPhase('pass');
  };

  // A new stop, as in Undercover: everyone describes their word in turn, then the group
  // talks it out and votes. The speaking order is shuffled fresh every stop.
  const startStop = (stop: number, from: number, list: Seat[] = seats) => {
    const order = describeOrder(list, from, stop, pickpocketCanStart);
    setBounce(null);
    setTiedIdx(null);
    setTickTied([]);
    setStopNo(stop);
    setSelected(null);
    setVoters([]);
    setDescOrder(order);
    setDescPos(0);
    // Mr. Meme: a random speaker this stop describes with gestures instead of words.
    setMemeIdx(useSpecials && useMeme && order.length > 0 ? shuffle(order)[0] : null);
    setPhase(order.length > 0 ? 'describe' : 'vote');
    play('go');
  };

  // The vote again at the same stop (Return Ticket): no new description round.
  const goVote = () => {
    setSelected(null);
    setVoters([]);
    setTieOpen(false);
    setPhase('vote');
    play('go');
  };

  // No Goddess and the vote is tied: the tied players each describe once more, then the other
  // players vote again, and only the tied players can be voted out.
  const startTieBreak = () => {
    const order = shuffle(tickTied);
    if (order.length < 2) return;
    setTiedIdx(order);
    setTickTied([]);
    setBounce(null);
    setMemeIdx(null);
    setSelected(null);
    setVoters([]);
    setTieOpen(false);
    setDescOrder(order);
    setDescPos(0);
    setPhase('describe');
    play('go');
  };

  const describeNext = () => {
    play('flip');
    if (descPos + 1 >= descOrder.length) { setTieOpen(false); setPhase('vote'); play('go'); return; }
    setDescPos(i => i + 1);
  };

  // ── Boarding passes: hold to reveal ──
  const [holding, setHolding] = useState(false);
  const [seen, setSeen] = useState(false);
  const holdStart = () => { setHolding(true); setSeen(true); play('flip'); };
  const holdEnd = () => setHolding(false);

  const showTicket = () => { setHolding(false); setSeen(false); setPhase('ticket'); };
  const passOn = () => {
    setHolding(false);
    if (passIdx + 1 >= seats.length) {
      if (round) startStop(1, Math.floor(Math.random() * seats.length));
      return;
    }
    setPassIdx(i => i + 1);
    setPhase('pass');
  };

  // ── Voting and offboarding ──
  const aliveIdx = seats.map((s, i) => (s.alive ? i : -1)).filter(i => i >= 0);
  // A Ghost who is out still votes from the back seat.
  const voterIdx = seats.map((s, i) => (s.alive || (s.outOrder !== undefined && activeSpecial(s) === 'ghost') ? i : -1)).filter(i => i >= 0);
  // After a Boomerang bounce only the players who voted against it are up for the vote.
  const candidateIdx = bounce ? aliveIdx.filter(i => bounce.includes(i)) : tiedIdx ? aliveIdx.filter(i => tiedIdx.includes(i)) : aliveIdx;
  // The Goddess of Justice is announced to everyone once the words are dealt (every other role stays secret).
  const goddessSeat = useSpecials && specialIds.includes('goddess') ? seats.find(s => activeSpecial(s) === 'goddess') : undefined;
  const goddessLine = goddessSeat
    ? `⚖️ ${goddessSeat.name} is the Goddess of Justice. ${goddessSeat.alive ? 'She' : 'She is out, but she still'} decides any tied vote.`
    : null;
  // Undercover rule: a Boomerang's first majority bounces the votes back onto the voters, so at least one
  // player still aboard must be ticked as a voter. We only say so AFTER the host tried to offboard the
  // Boomerang without any (so the role is never given away beforehand).
  const boomerangNeedsVoters = selected !== null && boomerangAskFor === selected
    && !voters.some(vi => vi !== selected && seats[vi]?.alive);
  const toggleVoter = (i: number) => setVoters(v => (v.includes(i) ? v.filter(x => x !== i) : [...v, i]));

  // Takes a player offboard. Lovers go together: their partner leaves right after them.
  const eliminate = (list: Seat[], idx: number, stop: number): Seat[] => {
    let n = Math.max(0, ...list.map(s => s.lastOutOrder ?? s.outOrder ?? 0));
    const next = list.map((s, i) => (i === idx ? { ...s, alive: false, outStop: stop, outOrder: ++n, lastOutOrder: n } : s));
    const me = next[idx];
    if (activeSpecial(me) === 'lovers' && me.partner) {
      const pi = next.findIndex(s => s.name === me.partner && s.alive);
      if (pi >= 0) next[pi] = { ...next[pi], alive: false, outStop: stop, outOrder: ++n, lastOutOrder: n };
    }
    return next;
  };

  const confirmOffboard = () => {
    if (selected === null) return;
    ensure();
    setTieOpen(false);
    setSniperNote(null);
    const out = seats[selected];
    // Boomerang (Return Ticket): the first majority against them is not an elimination.
    // The votes bounce back onto the players who cast them, who are voted on instead.
    if (activeSpecial(out) === 'boomerang' && !out.boomerangUsed) {
      const bounced = voters.filter(vi => vi !== selected && seats[vi]?.alive);
      // Like Undercover, the votes bounce back onto the voters, so the voters must be known.
      // If none are ticked yet we ask for them now (not before, so the role stays secret).
      if (bounced.length === 0) { setBoomerangAskFor(selected); return; }
      const marked = seats.map((s, i) => (i === selected ? { ...s, boomerangUsed: true } : s));
      setSeats(marked);
      setLastOut(selected);
      setSelected(null);
      setVoters([]);
      setPhase('saved');
      play('gold');
      haptic('end');
      if (bounced.length === 1) {
        // One voter: the whole bounce lands on them, no second vote (same as the online rooms).
        const target = bounced[0];
        later(REVEAL_MS, () => {
          const updated = eliminate(marked, target, stopNo);
          setBounce(null);
          setSeats(updated);
          setLastOut(target);
          setPhase('offboard');
          play('power');
          haptic('end');
          later(REVEAL_MS, () => afterReveal(updated, target));
        });
        return;
      }
      // Several voters: the votes move onto them, one each, so they are tied.
      // The tie rules take over: the Goddess picks, or they describe once more and the others re-vote.
      const tied = [...bounced].sort((a, b) => a - b);
      later(REVEAL_MS, () => {
        if (goddessSeat) {
          setBounce(tied);
          setTiedIdx(null);
          goVote();
          return;
        }
        setBounce(null);
        setTiedIdx(tied);
        setTickTied([]);
        setMemeIdx(null);
        setDescOrder(tied);
        setDescPos(0);
        setTieOpen(false);
        setPhase('describe');
        play('go');
      });
      return;
    }
    // Votes: anyone who pointed at a sneaky player was right; at an Tourist, wrong.
    setStats(st => {
      const next = { ...st };
      voters.forEach(vi => {
        const who = seats[vi]?.name;
        if (!who || vi === selected) return;
        const cur = { ...(next[who] ?? emptyStats()) };
        if (out.role === 'tourist') cur.wrongVotes += 1; else cur.correctVotes += 1;
        next[who] = cur;
      });
      return next;
    });
    const updated = eliminate(seats, selected, stopNo);
    setBounce(null);
    setSeats(updated);
    setLastOut(selected);
    setPhase('offboard');
    play('power');
    haptic('end');
    later(REVEAL_MS, () => afterReveal(updated, selected));
  };

  const finishRound = (list: Seat[], result: Outcome, guessingPlayer?: string) => {
    const pts = roundPoints(list, result, guessingPlayer);
    const bonus = specialBonus(list);
    Object.keys(bonus).forEach(n => { pts[n] = (pts[n] ?? 0) + bonus[n]; });
    setGained(pts);
    setOutcome(result);
    setStats(st => {
      const next = { ...st };
      list.forEach(s => {
        const cur = { ...(next[s.name] ?? emptyStats()) };
        cur.points += pts[s.name] ?? 0;
        if (result === 'strangers' && s.role === 'stranger' && s.alive) cur.survivedAsStranger += 1;
        if (result === 'pickpocket-steal' && s.name === guessingPlayer) cur.pickpocketWins += 1;
        next[s.name] = cur;
      });
      return next;
    });
    // The losing side draws a dare, if the group opted in.
    setDare(useDares ? drawDare() : null);
    setPhase('roundEnd');
    play(result === 'tourists' ? 'win' : 'gold');
    haptic('win');
  };

  const afterReveal = (list: Seat[], outIdx: number, votedOut = true) => {
    voteExitRef.current = votedOut;
    const out = list[outIdx];
    // Undercover: Mr. White always gets a last guess when eliminated. That includes a Pickpocket
    // who leaves right after their Lover. The player who was voted out guesses first.
    const queue: number[] = [];
    if (out.role === 'pickpocket') queue.push(outIdx);
    if (activeSpecial(out) === 'lovers' && out.partner) {
      const pi = list.findIndex(s => s.name === out.partner && s.outStop === out.outStop && (s.outOrder ?? 0) === (out.outOrder ?? 0) + 1);
      if (pi >= 0 && list[pi].role === 'pickpocket') queue.push(pi);
    }
    if (queue.length === 0) { afterGuess(list, outIdx); return; }
    setGuessAfter(outIdx);
    setGuessQueue(queue.slice(1));
    setLastOut(queue[0]);
    setPhase('guess');
  };

  // Everything that can follow someone leaving: a win, a Revenge, or the next stop.
  const afterGuess = (list: Seat[], outIdx: number, retrievalResolved = false) => {
    const action = afterElimination(list, outIdx, voteExitRef.current, retrievalResolved);
    if (action === 'retrieve') {
      setLastOut(outIdx);
      setRetrievePos(0);
      setRetrieveOpen(false);
      setRetrieveYes(false);
      retrievalLock.current = false;
      setPhase('retrieve');
      return;
    }
    if (action === 'revenger') {
      setLastOut(outIdx);
      setPhase('revenger');
      return;
    }
    if (action === 'tourists' || action === 'sneaky') {
      finishRound(list, action === 'tourists' ? 'tourists' : 'strangers');
      return;
    }
    startStop(stopNo + 1, outIdx + 1, list);
  };

  // Every survivor gets the same private handoff, so the Retriever is not named publicly.
  const retrievalNext = (usePower: boolean) => {
    if (lastOut === null || !retrieveOpen || retrievalLock.current) return;
    retrievalLock.current = true;
    const actor = aliveIdx[retrievePos];
    const use = retrieveYes || (usePower && actor === eligibleRetriever(seats, lastOut, voteExitRef.current));
    setRetrieveYes(use);
    setRetrieveOpen(false);
    if (retrievePos + 1 < aliveIdx.length) {
      setRetrievePos(p => p + 1);
      return;
    }
    const restored = use ? retrieveTourist(seats, lastOut, voteExitRef.current) : null;
    if (restored) {
      setSeats(restored);
      setPhase('retrieved');
      play('gold');
    } else afterGuess(seats, lastOut, true);
  };

  // Pickpocket's last chance: the group judges the spoken guess.
  const judgeGuess = (correct: boolean) => {
    if (lastOut === null) return;
    ensure();
    if (correct) {
      // She stays "aboard" for scoring purposes: she stole the round.
      const list = seats.map((s, i) => (i === lastOut ? { ...s, alive: true } : s));
      setSeats(list);
      finishRound(list, 'pickpocket-steal', seats[lastOut].name);
      return;
    }
    play('bad');
    // Another Pickpocket left with them (two Lovers who are both Pickpockets): their turn to guess.
    if (guessQueue.length > 0) {
      setLastOut(guessQueue[0]);
      setGuessQueue(guessQueue.slice(1));
      return;
    }
    const after = guessAfter ?? lastOut;
    setLastOut(after);
    afterGuess(seats, after);
  };

  // Revenge: the player who just left takes one more with them.
  const confirmRevenge = (victim: number) => {
    if (lastOut === null) return;
    ensure();
    setSniperNote(null);
    const marked = seats.map((s, i) => (i === lastOut ? { ...s, revengeDone: true } : s));
    const updated = eliminate(marked, victim, stopNo);
    setSeats(updated);
    setLastOut(victim);
    setPhase('offboard');
    play('power');
    haptic('end');
    later(REVEAL_MS, () => afterReveal(updated, victim, false));
  };

  // The Sniper (one shot per round, during a vote): the group says who is shooting, the host checks it,
  // then the shooter names a target. A Stranger or Pickpocket goes offboard at once; a Tourist makes it
  // backfire and the Sniper goes offboard instead. It is not a vote, so the Retriever cannot undo it.
  const pickShooter = (i: number) => {
    const s = seats[i];
    if (activeSpecial(s) !== 'sniper' || s.sniperUsed) {
      setSniperErr(`${s.name} cannot take the shot (not the Sniper, or the shot is already spent this round). Nobody goes offboard.`);
      play('bad');
      return;
    }
    setSniperErr(null);
    setSniperShooter(i);
    play('flip');
  };

  const confirmShot = (target: number) => {
    if (sniperShooter === null) return;
    ensure();
    const shooter = sniperShooter;
    const marked = seats.map((s, i) => (i === shooter ? { ...s, sniperUsed: true } : s));
    const hit = marked[target].role !== 'tourist';
    const victim = hit ? target : shooter;
    const who = marked[shooter].name;
    setStats(st => {
      const cur = { ...(st[who] ?? emptyStats()) };
      if (hit) cur.correctVotes += 1; else cur.wrongVotes += 1;
      return { ...st, [who]: cur };
    });
    const updated = eliminate(marked, victim, stopNo);
    setSniperNote(hit
      ? `${who} took the shot at ${marked[target].name} and hit.`
      : `${who} shot ${marked[target].name}, a Tourist. The shot backfired and ${who} goes offboard instead.`);
    setSniperShooter(null);
    setSniperErr(null);
    setSelected(null);
    setVoters([]);
    setBounce(null);
    setSeats(updated);
    setLastOut(victim);
    setPhase('offboard');
    play('power');
    haptic('end');
    later(REVEAL_MS, () => afterReveal(updated, victim, false));
  };

  const nextRound = () => { ensure(); beginRound(players, roundNo + 1); };

  // Between rounds: change who is playing or any setting, and keep the scores.
  // A removed player sits out: they leave the scoreboard but their points are kept, so adding
  // the same name back in a later round (any capital letters) brings them back with their score.
  const openTweak = () => { setNames([...players]); setPhase('tweak'); };
  const continueSession = () => {
    ensure();
    const known = Object.keys(stats);
    const cleaned = uniqueNames(filled.map(n => known.find(k => k.toLowerCase() === n.toLowerCase()) ?? n));
    setPlayers(cleaned);
    setStats(prev => {
      const next = { ...prev };
      cleaned.forEach(n => { if (!next[n]) next[n] = emptyStats(); });
      return next;
    });
    beginRound(cleaned, roundNo + 1);
  };

  const endSession = () => { clearTimers(); setPhase('final'); play('win'); };

  const close = () => { clearTimers(); setOpen(false); setPhase('idle'); setHolding(false); };

  // ── Result card ──
  const ranking = useMemo(
    () => [...players].sort((a, b) => (stats[b]?.points ?? 0) - (stats[a]?.points ?? 0)),
    [players, stats],
  );
  const awards = useMemo(() => computeAwards(players, stats), [players, stats]);
  const champion = ranking[0];
  const topScore = champion ? stats[champion]?.points ?? 0 : 0;
  const shortName = (n: string, max = 8) => (n.length > max ? `${n.slice(0, max - 1)}…` : n);
  const bluffer = awards.find(a => a.id === 'bluffer');

  const cardOpts = useMemo(() => ({
    score: topScore,
    stars: Math.min(3, roundNo),
    title: champion ? `${shortName(champion, 14)} takes the trip` : 'Yaaru Avan?',
    tripTitle,
    host: SITE_HOST,
    best: topScore,
    isNewBest: false,
    eyebrow: 'YAARU AVAN?  ·  GROUP GAME',
    unit: 'TOP SCORE',
    ringMax: Math.max(12, roundNo * 4),
    playerName: champion,
    tiles: [
      { v: String(roundNo), l: 'ROUNDS' },
      { v: String(players.length), l: 'TRAVELLERS' },
      { v: bluffer ? shortName(bluffer.winner.split(' & ')[0]) : '-', l: 'BEST BLUFFER' },
    ],
  }), [topScore, roundNo, champion, tripTitle, players.length, bluffer]);

  useEffect(() => {
    if (phase !== 'final') return;
    let cancelled = false;
    void buildScoreCard(cardOpts).then(blob => {
      if (cancelled || !blob) return;
      cardBlobRef.current = blob;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      setPreviewUrl(previewUrlRef.current);
    }).catch(() => { /* share falls back to text */ });
    return () => { cancelled = true; };
  }, [phase, cardOpts]);

  const shareUrl = tripSlug ? `${SITE_ORIGIN}/trips/${tripSlug}` : `${SITE_ORIGIN}/games`;
  const shareText = `${champion ?? 'We'} won our game of Yaaru Avan? on Ulaa after ${roundNo} round${roundNo === 1 ? '' : 's'}! Play with your travel gang: ${shareUrl}`;
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    let blob = cardBlobRef.current;
    if (!blob) { try { blob = await buildScoreCard(cardOpts); } catch { blob = null; } }
    setSharing(false);
    await shareCardImage(blob, {
      filename: 'ulaa-yaaru-avan.png',
      title: 'Yaaru Avan?',
      text: shareText,
      fallbackLink: getWhatsAppLink('', shareText),
    });
  };

  // ── Derived for rendering ──
  const passSeat = seats[passIdx];
  const out = lastOut !== null ? seats[lastOut] : null;
  // Lovers: the partner who left right after them.
  const lover = out && activeSpecial(out) === 'lovers' && out.partner
    ? seats.find(s => s.name === out.partner && s.outStop === out.outStop && (s.outOrder ?? 0) === (out.outOrder ?? 0) + 1)
    : undefined;
  const stepBtn = 'w-9 h-9 rounded-md bg-white/10 border border-white/15 text-cream flex items-center justify-center hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition';

  const countLine = hideCounts
    ? `${seats.length} players. Roles are secret.`
    : `${counts.tourists} Tourists, ${counts.strangers} Stranger${counts.strangers === 1 ? '' : 's'}${counts.pickpockets ? `, ${counts.pickpockets} Pickpocket${counts.pickpockets === 1 ? '' : 's'}` : ''}`;

  return (
    <div className={className}>
      <GameTile
        onClick={() => { setSavedRoom(loadOnlineSession()?.code ?? null); setOpen(true); setPhase('idle'); }}
        compact={compact}
        thumb={thumb}
        row={row}
        iconSrc={yaaruAvanCat}
        accent="gold"
        title="Yaaru Avan?"
        subtitle="Who sneaked aboard?"
        chip="New · Group game"
      />

      <Modal isOpen={open} onClose={close} ariaLabel="Yaaru Avan? group game" size="sm" flush fullScreen>
        <div onPointerDownCapture={onPressCapture} className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-neutral-900 text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center items-center md:py-10">
          <div className="relative w-full max-w-md md:max-w-2xl lg:max-w-3xl flex flex-col">
          <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
          <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

          {/* ── Intro ── */}
          {phase === 'idle' && (
            <div className="relative text-center pt-3 md:pt-0 md:grid md:grid-cols-[1fr_1.15fr] md:gap-12 lg:gap-16 md:items-center">
              <div>
              <motion.div
                className="w-20 h-20 md:w-28 md:h-28 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-gold-300 to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              >
                <img src={yaaruAvanCat} alt="" className="w-12 h-12 object-contain" draggable={false} />
              </motion.div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-gold-300 bg-gold/15 border border-gold/30 rounded-md px-3 py-1 mb-2">Group game · {MIN_PLAYERS} to {MAX_PLAYERS} players</span>
              <h2 className="font-display text-4xl md:text-5xl font-extrabold text-white leading-tight">Yaaru Avan?</h2>
              <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Play on one phone, or online with a room code. Someone is faking it. Can you spot them?</p>
              </div>
              <div className="min-w-0">

              <ul className={`${glass} text-left divide-y divide-white/10 mb-4`}>
                {[
                  { I: Ticket, c: 'bg-primary/25 text-peach', t: <>Each traveller holds to see a <strong className="text-white">secret boarding pass</strong>.</> },
                  { I: ChatCircleDots, c: 'bg-gold/20 text-gold-300', t: <>Take turns saying <strong className="text-white">one word or a short phrase</strong> about your word.</> },
                  { I: Eye, c: 'bg-secondary/25 text-peach', t: <>Talk it out and work out <strong className="text-white">who is bluffing</strong>.</> },
                  { I: Airplane, c: 'bg-primary/25 text-peach', t: <>Vote someone <strong className="text-white">offboard</strong>. Find every Stranger and Pickpocket to win.</> },
                ].map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                    <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${r.c}`}><r.I size={16} weight="duotone" /></span>
                    <span>{r.t}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-2.5">
                {savedRoom && (
                  <button type="button" onClick={() => { ensure(); setPhase('online'); }} className={primaryBtn}><Play size={18} weight="fill" /> Rejoin room {savedRoom}</button>
                )}
                <button type="button" onClick={() => { ensure(); setPhase('online'); }} className={savedRoom ? ghostBtn : primaryBtn}><DeviceMobile size={18} weight="duotone" /> Play online with friends</button>
                <button type="button" onClick={() => { ensure(); setPhase('setup'); }} className={ghostBtn}><Play size={18} weight="fill" /> Play on this phone</button>
              </div>
              <button type="button" onClick={toggleMute} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
              </button>
              <button type="button" onClick={toggleHaptics} aria-pressed={hapticsOn} className="mt-3 ml-4 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                <Vibrate size={14} weight={hapticsOn ? 'fill' : 'regular'} /> Haptics {hapticsOn ? 'on' : 'off'}
              </button>
              <button type="button" onClick={() => { ensure(); setPhase('rules'); }} className="mt-3 ml-4 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                <Question size={14} /> How to play
              </button>
              </div>
            </div>
          )}

          {/* ── Online: every player on their own phone ── */}
          {phase === 'online' && (
            <YaaruAvanOnline tripTitle={tripTitle} onExit={() => { setSavedRoom(loadOnlineSession()?.code ?? null); setPhase('idle'); }} />
          )}

          {/* ── Rules ── */}
          {phase === 'rules' && <YaaruAvanRules onBack={() => setPhase('idle')} />}

          {/* ── Setup ── */}
          {(phase === 'setup' || phase === 'tweak') && (
            <div className="relative">
              <div className="pr-12 mb-3">
                <p className={eyebrow}>{phase === 'tweak' ? `Before round ${roundNo + 1}` : 'Step 1'}</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">{phase === 'tweak' ? 'Who is still playing?' : 'Who is travelling?'}</h2>
                {phase === 'tweak' && <p className="text-xs text-cream/55 mt-1">Remove a traveller to sit them out, or add them back later with the same name to bring their points back. You can also change roles, level and specials.</p>}
              </div>
              <div className="space-y-1.5 mb-2">
                {names.map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-bold text-cream/55 tabular-nums">{i + 1}</span>
                    <input
                      type="text"
                      value={n}
                      maxLength={18}
                      placeholder={`Traveller ${i + 1}`}
                      aria-label={`Traveller ${i + 1} name`}
                      onChange={e => setName(i, e.target.value)}
                      onBlur={onNameBlur}
                      className="flex-1 min-w-0 rounded-lg bg-white/[0.07] border border-white/15 focus:border-gold-300/70 focus:bg-white/10 px-3 py-2.5 text-[15px] font-semibold text-white placeholder:text-cream/55 outline-none transition-colors"
                    />
                    <button type="button" onClick={() => removePlayer(i)} className="w-8 h-8 shrink-0 rounded-md text-cream/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors" aria-label={`Remove traveller ${i + 1}`}>
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={addPlayer} disabled={names.length >= MAX_PLAYERS} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-300 hover:text-white disabled:opacity-40 transition-colors">
                  <Plus size={14} weight="bold" /> Add traveller
                </button>
                <span className="text-xs text-cream/50 tabular-nums">{playerCount} of {MIN_PLAYERS}–{MAX_PLAYERS}</span>
              </div>

              <p className={eyebrow}>Step 2</p>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-lg font-extrabold text-white">Pick the roles</h3>
                <button type="button" onClick={useRecommended} disabled={playerCount < MIN_PLAYERS} className="inline-flex items-center gap-1 rounded-md bg-gold/15 border border-gold/30 text-gold-300 text-[11px] font-bold px-2.5 py-1 hover:bg-gold/25 disabled:opacity-40 transition-colors">
                  <MagicWand size={12} weight="fill" /> Recommended
                </button>
              </div>
              <div className={`${glass} divide-y divide-white/10 mb-2`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-emerald-400/20 text-emerald-300 flex items-center justify-center"><Eye size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Tourists</p>
                    <p className="text-[11px] text-cream/50">Same word. Always the majority.</p>
                  </div>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-8 text-center">{playerCount >= MIN_PLAYERS ? counts.tourists : '-'}</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-gold/20 text-gold-300 flex items-center justify-center"><Ticket size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Strangers</p>
                    <p className="text-[11px] text-cream/50">A similar but different word.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Strangers" disabled={playerCount < MIN_PLAYERS || strangers <= (pickpockets > 0 ? 0 : 1)} onClick={() => setStrangers(s => s - 1)}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{strangers}</span>
                  <button type="button" className={stepBtn} aria-label="More Strangers" disabled={playerCount < MIN_PLAYERS || !rolesValid(playerCount, strangers + 1, pickpockets)} onClick={() => setStrangers(s => s + 1)}><Plus size={14} weight="bold" /></button>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-rose-400/20 text-rose-300 flex items-center justify-center"><Question size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Pickpocket</p>
                    <p className="text-[11px] text-cream/50">No word at all. Blends in.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Pickpockets" disabled={playerCount < MIN_PLAYERS || pickpockets <= (strangers > 0 ? 0 : 1)} onClick={() => setPickpockets(l => l - 1)}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{pickpockets}</span>
                  <button type="button" className={stepBtn} aria-label="More Pickpockets" disabled={playerCount < MIN_PLAYERS || pickpockets >= maxPickpockets(playerCount) || !rolesValid(playerCount, strangers, pickpockets + 1)} onClick={() => setPickpockets(l => l + 1)}><Plus size={14} weight="bold" /></button>
                </div>
              </div>
              {playerCount < MIN_PLAYERS && <p className="text-xs text-gold-300 mb-2">Add at least {MIN_PLAYERS} travellers to pick roles.</p>}

              <p className={`${eyebrow} mt-4`}>Step 3</p>
              <h3 className="font-display text-lg font-extrabold text-white mb-2">How tricky?</h3>
              <div className="grid grid-cols-3 gap-1.5 mb-1" role="radiogroup" aria-label="Difficulty">
                {LEVELS.map(l => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={level === l.id}
                    onClick={() => setLevel(l.id)}
                    className={`rounded-md border py-2 text-sm font-bold transition-colors ${level === l.id ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white' : 'bg-white/[0.06] border-white/10 text-cream/70 hover:bg-white/10'}`}
                  >{l.label}</button>
                ))}
              </div>
              <p className="text-[11px] text-cream/50 mb-4">{LEVELS.find(l => l.id === level)?.hint}.</p>

              <div className={`${glass} divide-y divide-white/10 mb-4`}>
                {[
                  { k: 'hide', on: hideCounts, set: setHideCounts, t: 'Hide the counts', d: 'Nobody knows if a Pickpocket exists. Much more tense.' },
                  { k: 'dare', on: useDares, set: setUseDares, t: 'Trip dares', d: 'The losing side draws a silly dare.' },
                  { k: 'special', on: useSpecials, set: setUseSpecials, t: 'Special roles', d: 'The Joy Fool, Boomerang, Revenger, Lovers and more. Every role you tick is dealt, if there is room (up to half the players).' },
                  { k: 'first', on: pickpocketCanStart, set: setPickpocketCanStart, t: 'Pickpocket can speak first', d: 'On: a Pickpocket may randomly start the description round. Off: a Pickpocket never starts first.' },
                ].map(o => (
                  <button key={o.k} type="button" role="switch" aria-checked={o.on} onClick={() => o.set(!o.on)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-white leading-tight">{o.t}</span>
                      <span className="block text-[11px] text-cream/50">{o.d}</span>
                    </span>
                    <span className={`relative w-10 h-6 rounded-full transition-colors ${o.on ? 'bg-primary' : 'bg-white/15'}`} aria-hidden="true">
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${o.on ? 'left-[1.15rem]' : 'left-0.5'}`} />
                    </span>
                  </button>
                ))}
              </div>

              {useSpecials && (
                <SpecialList
                  on={new Set(specialIds)}
                  players={playerCount}
                  strangers={strangers}
                  meme={useMeme}
                  onMemeToggle={() => setUseMeme(v => !v)}
                  onSetAll={ids => setSpecialIds(ENABLED_SPECIALS.filter(x => ids.includes(x)))}
                  onToggle={id => setSpecialIds(ids => ENABLED_SPECIALS.filter(x => (x === id ? !ids.includes(x) : ids.includes(x))))}
                />
              )}

              <button type="button" onClick={phase === 'tweak' ? continueSession : startSession} disabled={!valid} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>
                <Play size={18} weight="fill" /> {phase === 'tweak' ? `Deal round ${roundNo + 1}` : 'Deal boarding passes'}
              </button>
              <button type="button" onClick={() => setPhase(phase === 'tweak' ? 'roundEnd' : 'idle')} className="mt-3 w-full text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Back</button>
            </div>
          )}

          {/* ── Pass the phone ── */}
          {phase === 'pass' && passSeat && (
            <div className="relative text-center pt-6">
              <p className={eyebrow}>Round {roundNo} · Boarding {passIdx + 1} of {seats.length}</p>
              <motion.div
                key={passIdx}
                initial={reduce ? false : { y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-6 mb-6"
              >
                <div className="w-24 h-24 mx-auto mb-4 rounded-[30px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-[0_14px_36px_rgba(168,90,42,0.5)]" aria-hidden="true">
                  <Ticket size={52} weight="duotone" />
                </div>
                <p className="text-sm text-cream/60">Pass the phone to</p>
                <p className={`font-display text-4xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>{passSeat.name}</p>
                <p className="text-xs text-cream/50 mt-2 px-8">Everyone else, look away. Only {passSeat.name} should see the next screen.</p>
              </motion.div>
              <button type="button" onClick={showTicket} className={primaryBtn}>I am {passSeat.name}. Show my pass</button>
            </div>
          )}

          {/* ── Boarding pass (hold to reveal) ── */}
          {phase === 'ticket' && passSeat && (
            <div className="relative pt-4">
              <p className={`${eyebrow} text-center`}>Boarding pass · {passSeat.name}</p>
              <div className="mt-4 mx-auto max-w-[19rem] select-none">
                <div className="rounded-lg bg-gradient-to-br from-[#FFF6DD] to-gold-300 text-dark shadow-[0_18px_40px_rgba(0,0,0,0.45)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <span className="font-display text-sm font-extrabold tracking-wider text-primary-dark">ULAA AIR</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-dark/70">{tripTitle.length > 20 ? `${tripTitle.slice(0, 19)}…` : tripTitle}</span>
                  </div>
                  <div className="px-4 pb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">Passenger</p>
                    <p className="font-display text-xl font-extrabold leading-tight">{passSeat.name}</p>
                  </div>
                  <div className="relative border-t-2 border-dashed border-dark/25 px-4 py-4 bg-white/40 text-center min-h-[7.5rem] flex flex-col items-center justify-center">
                    <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
                    <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
                    <AnimatePresence mode="wait">
                      {holding ? (
                        <motion.div key="word" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">Your destination</p>
                          {passSeat.word
                            ? <p className="font-display text-3xl font-extrabold text-primary-dark leading-tight break-words">{passSeat.word}</p>
                            : <>
                                <p className="font-display text-3xl font-extrabold text-rose-700 leading-tight">No destination</p>
                                <p className="text-sm font-bold text-dark/70 mt-1">Blend in.</p>
                              </>}
                          {passSeat.special && describeSpecial(passSeat) && (
                            <div className="mt-3 pt-3 border-t border-dark/15">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">Special role</p>
                              <p className="font-display text-lg font-extrabold text-primary-dark leading-tight">{specialLabel(passSeat)}{passSeat.partner ? ` · with ${passSeat.partner}` : ''}</p>
                              <p className="text-xs font-semibold text-dark/70 leading-snug mt-0.5">{describeSpecial(passSeat)}</p>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div key="hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-1 text-dark/70">
                          <EyeSlash size={28} weight="duotone" />
                          <p className="text-sm font-bold">Hidden</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark/90 text-cream">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-cream/60">Seat</span>
                    <span className="font-display text-lg font-extrabold text-gold-300 tabular-nums">{passSeat.seat}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                data-nofx
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); holdStart(); }}
                onPointerUp={holdEnd}
                onPointerCancel={holdEnd}
                onContextMenu={e => e.preventDefault()}
                onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) holdStart(); }}
                onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') holdEnd(); }}
                className={`${ghostBtn} mt-5 touch-none select-none ${holding ? '!bg-white/25' : ''}`}
              >
                <Eye size={18} weight="duotone" /> {holding ? 'Release to hide' : 'Hold to reveal'}
              </button>
              <button type="button" onClick={passOn} disabled={!seen || holding} className={`${primaryBtn} mt-3 disabled:opacity-40 disabled:pointer-events-none`}>
                {passIdx + 1 >= seats.length ? 'Everyone has boarded. Start' : 'Hidden. Pass it on'} <ArrowRight size={16} weight="bold" />
              </button>
              <p className="mt-2 text-center text-[11px] text-cream/55">Remember it. You cannot look again.</p>
            </div>
          )}

          {/* ── Description round ── */}
          {phase === 'describe' && descOrder.length > 0 && (
            <div className="relative text-center">
              <div className="pr-12 mb-3 text-left">
                <p className={eyebrow}>Round {roundNo} · Stop {stopNo}</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Describe your word</h2>
                <p className="text-xs text-cream/60">Say one word or a short phrase about your word. Be truthful, but do not give it away.</p>
                <p className="text-xs text-cream/70 leading-snug mt-1">{countLine}</p>
              </div>
              <motion.div key={descPos} initial={reduce ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="rounded-lg bg-gradient-to-br from-[#FFF6DD] to-gold-300 text-dark px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
                <span className="mx-auto w-11 h-11 rounded-lg bg-dark/90 text-gold-300 flex items-center justify-center mb-2" aria-hidden="true"><ChatCircleDots size={24} weight="duotone" /></span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dark/70">{descPos === 0 ? 'Starts' : `Speaker ${descPos + 1} of ${descOrder.length}`}</p>
                <p className="font-display text-3xl font-extrabold leading-tight break-words">{seats[descOrder[descPos]].name}</p>
                <p className="text-xs font-bold text-dark/70 mt-1">Seat {seats[descOrder[descPos]].seat}</p>
                {memeIdx !== null && descOrder[descPos] === memeIdx && (
                  <p className="mt-2 inline-block rounded-md bg-dark/90 text-gold-300 text-xs font-bold px-3 py-1">🎭 Mr. Meme: gestures only, no talking</p>
                )}
              </motion.div>
              {tiedIdx && (
                <p className="text-xs font-bold text-gold-300 leading-snug mt-3">Tie-break: {tiedIdx.map(i => seats[i].name).join(' and ')} each describe once more. Then the other players vote again.</p>
              )}
              {goddessLine && <p className="text-xs text-gold-300 leading-snug mt-3">{goddessLine}</p>}
              {memeIdx !== null && (
                <p className="text-xs text-gold-300 leading-snug mt-2">🎭 Mr. Meme this round: {seats[memeIdx].name} describes their word with gestures instead of speaking.</p>
              )}
              <ol className="flex flex-wrap justify-center gap-1.5 mt-4" aria-label="Speaking order">
                {descOrder.map((i, k) => (
                  <li key={i} className={`rounded-md px-2.5 py-1 text-[11px] font-bold border ${k === descPos ? 'bg-gold/25 border-gold/60 text-gold-300' : k < descPos ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'}`}>
                    {k < descPos && <CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />}{seats[i].name}
                  </li>
                ))}
              </ol>
              <button type="button" onClick={describeNext} className={`${primaryBtn} mt-5`}>
                {descPos + 1 >= descOrder.length ? 'Done. Start the discussion' : 'Done. Next speaker'} <ArrowRight size={16} weight="bold" />
              </button>
            </div>
          )}

          {/* ── Vote ── */}
          {phase === 'vote' && (
            <div className="relative">
              <div className="pr-12 mb-3">
                <p className={eyebrow}>Round {roundNo} · Stop {stopNo}</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Who goes offboard?</h2>
                <p className="text-xs text-cream/60">Discuss who is bluffing, then tap the person the group picked.</p>
                <p className="text-xs text-cream/70 leading-snug mt-1">{countLine}</p>
                {goddessLine && <p className="text-xs text-gold-300 leading-snug mt-1">{goddessLine}</p>}
              </div>
              {tiedIdx && !bounce && <p className="text-xs font-bold text-gold-300 leading-snug mb-3">Tie-break re-vote: only {tiedIdx.map(i => seats[i].name).join(' and ')} can be voted out. They sit this vote out, so the other players decide.</p>}
              {bounce && <p className="text-xs font-bold text-gold-300 leading-snug mb-3">The votes bounced back onto {bounce.map(i => seats[i].name).join(' and ')}, so they are tied. {goddessSeat?.name ?? 'The Goddess'} picks who goes offboard.</p>}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {candidateIdx.map(i => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setSelected(i); setVoters(v => v.filter(x => x !== i)); play('flip'); }}
                    aria-pressed={selected === i}
                    className={`rounded-md border px-3 py-3 text-left transition ${selected === i ? 'bg-gradient-to-br from-primary-light to-primary border-transparent text-white shadow-[0_8px_20px_rgba(168,90,42,0.5)]' : 'bg-white/[0.06] border-white/10 text-cream hover:bg-white/10'}`}
                  >
                    <span className="block font-display text-base font-extrabold leading-tight truncate">{seats[i].name}</span>
                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {seats[i].seat}</span>
                  </button>
                ))}
              </div>

              {selected !== null && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-cream/70 mb-1.5">Who voted for {seats[selected].name}? <span className="text-cream/55">(optional, for the awards)</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {voterIdx.filter(i => i !== selected && !(tiedIdx && !bounce && tiedIdx.includes(i))).map(i => (
                      <button key={i} type="button" onClick={() => toggleVoter(i)} aria-pressed={voters.includes(i)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-bold border transition-colors ${voters.includes(i) ? 'bg-gold/25 border-gold/60 text-gold-300' : 'bg-white/[0.06] border-white/15 text-cream/70'}`}>
                        {seats[i].name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {useSpecials && specialIds.includes('sniper') && !tiedIdx && !bounce && (
                <div className="mb-3">
                  <button type="button" onClick={() => { setSniperShooter(null); setSniperErr(null); setPhase('sniper'); play('flip'); }}
                    className="text-xs font-bold text-gold-300 underline underline-offset-2">
                    Sniper taking a shot?
                  </button>
                </div>
              )}
              <div className="mb-4">
                <button type="button" onClick={() => setTieOpen(o => !o)} aria-expanded={tieOpen}
                  className="text-xs font-bold text-gold-300 underline underline-offset-2">
                  {tieOpen ? 'Hide tie-break' : 'Vote tied?'}
                </button>
                {tieOpen && (
                  <div className="text-xs text-cream/80 leading-snug mt-1.5 rounded-lg bg-white/[0.06] border border-white/10 px-3 py-2">
                    {goddessSeat ? (
                      <p>{goddessSeat.name} is the Goddess of Justice{goddessSeat.alive ? '' : ' (already out, but she still decides)'}. She picks who goes offboard from the tied players. Tap that person above.</p>
                    ) : tiedIdx || bounce ? (
                      <p>Still tied? Then the group decides. Tap the person above.</p>
                    ) : (
                      <>
                        <p>Tick the players who are tied. They each describe once more, then the others vote again among them.</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {candidateIdx.map(i => (
                            <button key={i} type="button" aria-pressed={tickTied.includes(i)}
                              onClick={() => setTickTied(t => (t.includes(i) ? t.filter(x => x !== i) : [...t, i]))}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-bold border transition-colors ${tickTied.includes(i) ? 'bg-gold/25 border-gold/60 text-gold-300' : 'bg-white/[0.06] border-white/15 text-cream/70'}`}>
                              {seats[i].name}
                            </button>
                          ))}
                        </div>
                        <button type="button" onClick={startTieBreak} disabled={tickTied.length < 2}
                          className={`${ghostBtn} mt-2 disabled:opacity-40 disabled:pointer-events-none`}>
                          Tied players describe once more <ArrowRight size={14} weight="bold" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {boomerangNeedsVoters && (
                <p className="text-xs font-bold text-gold-300 leading-snug mb-3">
                  {seats[selected as number].name} is the Boomerang. Tick everyone who voted for them above, so their votes can bounce back.
                </p>
              )}
              <button type="button" onClick={confirmOffboard} disabled={selected === null} className={`${primaryBtn} disabled:opacity-40 disabled:pointer-events-none`}>
                <Airplane size={18} weight="fill" /> {selected === null ? 'Pick someone' : `Offboard ${seats[selected].name}`}
              </button>
            </div>
          )}

          {/* ── Sniper: solo shot ── */}
          {phase === 'sniper' && (
            <div className="relative">
              <div className="pr-12 mb-3">
                <p className={eyebrow}>Round {roundNo} · Stop {stopNo}</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">{sniperShooter === null ? 'Who is the Sniper?' : `${seats[sniperShooter].name}, pick your target`}</h2>
                <p className="text-xs text-cream/60">{sniperShooter === null
                  ? 'The Sniper says so out loud, then taps their own name. One shot per round, no vote needed.'
                  : 'A Stranger or Pickpocket goes offboard at once. A Tourist makes the shot backfire, and you go offboard instead.'}</p>
              </div>
              {sniperErr && <p className="text-xs font-bold text-gold-300 leading-snug mb-3">{sniperErr}</p>}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {aliveIdx.filter(i => sniperShooter === null || i !== sniperShooter).map(i => (
                  <button key={i} type="button" onClick={() => (sniperShooter === null ? pickShooter(i) : confirmShot(i))}
                    className="rounded-md border px-3 py-3 text-left transition bg-white/[0.06] border-white/10 text-cream hover:bg-white/10 active:scale-[0.98]">
                    <span className="block font-display text-base font-extrabold leading-tight truncate">{seats[i].name}</span>
                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {seats[i].seat}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setSniperShooter(null); setSniperErr(null); setPhase('vote'); }} className={ghostBtn}>Back to the vote</button>
            </div>
          )}

          {/* ── Offboard animation + role reveal ── */}
          {phase === 'offboard' && out && (
            <div className="relative text-center pt-10 min-h-[22rem]">
              <p className={eyebrow}>Offboarding</p>
              <p className="font-display text-3xl font-extrabold text-white mt-1">{out.name}</p>
              <div className="relative h-28 mt-6 overflow-hidden" aria-hidden="true">
                <motion.div
                  className="absolute top-1/2 -translate-y-1/2 text-gold-300"
                  initial={{ x: reduce ? 120 : -80, rotate: -10 }}
                  animate={{ x: reduce ? 120 : 360, rotate: -10 }}
                  transition={{ duration: reduce ? 0 : REVEAL_MS / 1000 * 0.8, ease: 'easeIn' }}
                >
                  <Airplane size={56} weight="fill" />
                </motion.div>
              </div>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: reduce ? 0 : REVEAL_MS / 1000 * 0.55, type: 'spring', stiffness: 240, damping: 14 }}
                className={`inline-block rounded-lg bg-gradient-to-br ${ROLE_TONE[out.role]} px-6 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.4)]`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Was a</p>
                <p className="font-display text-3xl font-extrabold leading-tight">{ROLE_LABEL[out.role]}</p>
                {out.special && describeSpecial(out) && <p className="text-xs font-bold mt-1 opacity-80">and {specialLabel(out)}</p>}
              </motion.div>
              {sniperNote && <p className="text-sm font-bold text-gold-300 mt-4">{sniperNote}</p>}
              {activeSpecial(out) === 'retriever' && <p className="text-sm font-bold text-gold-300 mt-4">The Retriever’s power is lost.</p>}
              {lover && <p className="text-sm font-bold text-gold-300 mt-4">{lover.name} was in love with {out.name} and leaves too.</p>}
            </div>
          )}

          {phase === 'retrieve' && out && lastOut !== null && (
            <div className="text-center pt-6">
              <p className={eyebrow}>Private role check</p>
              {!retrieveOpen ? <>
                <h2 className="font-display text-2xl font-extrabold text-white mt-2">Pass to {seats[aliveIdx[retrievePos]]?.name}</h2>
                <p className="text-sm text-cream/65 my-4">Everyone still aboard gets a private check. Keep the screen to yourself.</p>
                <button type="button" className={primaryBtn} onClick={() => { retrievalLock.current = false; setRetrieveOpen(true); }}>I have the phone</button>
              </> : aliveIdx[retrievePos] === eligibleRetriever(seats, lastOut) ? <>
                <h2 className="font-display text-2xl font-extrabold text-white mt-2">Bring {out.name} back?</h2>
                <p className="text-sm text-cream/65 my-4">You are the Retriever. Use your one return this round, or save it for a later vote.</p>
                <button type="button" className={`${primaryBtn} mb-3`} onClick={() => retrievalNext(true)}>Retrieve {out.name}</button>
                <button type="button" className={ghostBtn} onClick={() => retrievalNext(false)}>Skip this vote</button>
              </> : <>
                <p className="text-sm text-cream/65 my-4">No action for you this time. Hide the screen before passing it on.</p>
                <button type="button" className={primaryBtn} onClick={() => retrievalNext(false)}>Hide and continue</button>
              </>}
            </div>
          )}
          {phase === 'retrieved' && out && (
            <div className="text-center pt-6">
              <p className={eyebrow}>The Retriever</p>
              <h2 className="font-display text-3xl font-extrabold text-white mt-2">{out.name} is back!</h2>
              <p className="text-sm text-cream/65 my-4">Same word, back in the vote.</p>
              <p className="text-sm font-bold text-gold-300 mb-4">{seats.find(x => activeSpecial(x) === 'retriever' && x.retrievalUsed)?.name ?? 'Someone'} was the Retriever. The power is now used.</p>
              <button type="button" className={primaryBtn} onClick={() => { if (lastOut !== null) afterGuess(seats, lastOut, true); }}>Continue</button>
            </div>
          )}

          {/* ── Pickpocket's last chance ── */}
          {phase === 'guess' && out && (
            <div className="relative text-center pt-6">
              <motion.div
                initial={reduce ? false : { scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 12 }}
                className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-rose-300 to-rose-500 text-rose-950 flex items-center justify-center shadow-[0_14px_36px_rgba(244,63,94,0.4)]"
                aria-hidden="true"
              >
                <Question size={46} weight="bold" />
              </motion.div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-rose-200 bg-rose-400/15 border border-rose-300/30 rounded-md px-3 py-1 mb-2">Last chance</span>
              <h2 className="font-display text-3xl font-extrabold text-white leading-tight">{out.name} was the Pickpocket</h2>
              {activeSpecial(out) === 'lovers' && <p className="text-xs font-bold text-gold-300 mt-1">They left with their Lover, and still get a last guess.</p>}
              <p className="text-sm text-cream/65 mt-2 mb-4 px-4">{out.name}, type your guess for the Tourists' word. One box per word.</p>
              <GuessBoxes key={`${out.name}-${lastOut}`} answer={round?.touristWord ?? ''} onSubmit={judgeGuess} />
              <p className="text-xs text-cream/55 mb-3 px-4">Prefer to say it out loud? Let the group decide:</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => judgeGuess(false)} className={`${ghostBtn} !py-4`}><XCircle size={20} weight="fill" className="text-rose-300" /> Wrong</button>
                <button type="button" onClick={() => judgeGuess(true)} className={`${primaryBtn} !py-4`}><CheckCircle size={20} weight="fill" /> Correct</button>
              </div>
            </div>
          )}

          {/* ── Return Ticket: the vote is cancelled ── */}
          {phase === 'saved' && out && (
            <div className="relative text-center pt-10 min-h-[18rem]">
              <p className={eyebrow}>The Boomerang</p>
              <motion.div
                initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 14 }}
                className="w-24 h-24 mx-auto my-6 rounded-[30px] bg-gradient-to-br from-gold-300 to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                aria-hidden="true"
              >
                <Ticket size={52} weight="duotone" />
              </motion.div>
              <p className="font-display text-3xl font-extrabold text-white leading-tight">{out.name} stays aboard!</p>
              <p className="text-sm text-cream/60 mt-2 px-6">The Boomerang bounces the votes back onto the players who cast them. Each of them now has a vote against them, so they are tied.</p>
            </div>
          )}

          {/* ── Revenge: pick who goes with them ── */}
          {phase === 'revenger' && out && (
            <div className="relative">
              <div className="pr-12 mb-3">
                <p className={eyebrow}>The Revenger</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">{out.name} takes someone with them</h2>
                <p className="text-xs text-cream/60">{out.name}, pick one player to go offboard too.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {aliveIdx.map(i => (
                  <button key={i} type="button" onClick={() => confirmRevenge(i)}
                    className="rounded-md border px-3 py-3 text-left transition bg-white/[0.06] border-white/10 text-cream hover:bg-white/10 active:scale-[0.98]">
                    <span className="block font-display text-base font-extrabold leading-tight truncate">{seats[i].name}</span>
                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {seats[i].seat}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Round end ── */}
          {phase === 'roundEnd' && round && outcome && (
            <div className="relative text-center pt-2">
              {!reduce && outcome !== 'tourists' && <Confetti />}
              {!reduce && outcome === 'tourists' && <Confetti />}
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-gold-300 bg-gold/15 border border-gold/30 rounded-md px-3 py-1 mb-2">Round {roundNo} over</span>
              <h2 className={`font-display text-3xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>
                {outcomeTitle(outcome, seats.filter(s => s.alive).map(s => s.role))}
              </h2>
              <p className="text-sm text-cream/60 mt-1 mb-3">
                {outcome === 'tourists' ? 'Every Stranger and Pickpocket was caught.' : outcome === 'strangers' ? 'Only one Tourist was left.' : 'One lucky guess flipped the whole round.'}
              </p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className={`${glass} py-2.5`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Tourists had</p>
                  <p className="font-display text-lg font-extrabold text-white leading-tight px-2">{round.touristWord}</p>
                </div>
                <div className={`${glass} py-2.5`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Strangers had</p>
                  <p className="font-display text-lg font-extrabold text-gold-300 leading-tight px-2">{round.strangerWord}</p>
                </div>
              </div>
              <p className="text-[11px] text-cream/55 mb-3">{CATEGORY_LABEL[round.pair.category]} · {seats.filter(s => s.role === 'pickpocket').length > 0 ? `${seats.filter(s => s.role === 'pickpocket').map(s => s.name).join(' & ')} ${seats.filter(s => s.role === 'pickpocket').length > 1 ? 'were' : 'was'} the Pickpocket` : 'No Pickpocket this round'}</p>

              <ul className={`${glass} text-left divide-y divide-white/10 mb-3`}>
                {[...seats].sort((x, y) => (gained[y.name] ?? 0) - (gained[x.name] ?? 0)).map(s => (
                  <li key={s.name} className="flex items-center gap-2.5 px-3 py-2">
                    <span className={`w-6 h-6 shrink-0 rounded-md bg-gradient-to-br ${ROLE_TONE[s.role]} flex items-center justify-center`} aria-hidden="true">
                      {s.role === 'tourist' ? <Eye size={13} weight="bold" /> : s.role === 'stranger' ? <Ticket size={13} weight="bold" /> : <Skull size={13} weight="bold" />}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{s.name}</span>
                    <span className="text-[11px] text-cream/50">{ROLE_LABEL[s.role]}{s.special && describeSpecial(s) ? ` · ${specialLabel(s)}` : ''}</span>
                    <span className={`w-9 text-right font-display font-extrabold tabular-nums ${(gained[s.name] ?? 0) > 0 ? 'text-emerald-300' : 'text-cream/50'}`}>{(gained[s.name] ?? 0) >= 0 ? '+' : ''}{gained[s.name] ?? 0}</span>
                  </li>
                ))}
              </ul>

              {dare && (
                <div className="rounded-lg bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-3 mb-3 text-left">
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300"><Gift size={11} weight="fill" /> Trip dare for the {outcome === 'tourists' ? 'Strangers' : 'Tourists'}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{dare}</p>
                </div>
              )}

              <p className="text-[11px] text-cream/55 mb-3">Points: Tourists +{POINTS.touristWin}, a winning Stranger +{POINTS.strangerSurvive}, a winning Pickpocket +{POINTS.pickpocketSurvive} (lasting to the end or guessing the Tourists' word).{seats.some(s => s.special) ? ' Special-role bonuses are added on top.' : ''}</p>

              <button type="button" onClick={nextRound} className={`${primaryBtn} mb-2.5`}><Play size={18} weight="fill" /> Play next round</button>
              <button type="button" onClick={openTweak} className={`${ghostBtn} mb-2.5`}><Sliders size={16} weight="bold" /> Change players or settings</button>
              <button type="button" onClick={endSession} className={ghostBtn}><Trophy size={16} weight="fill" /> End game and see awards</button>
            </div>
          )}

          {/* ── Final scoreboard ── */}
          {phase === 'final' && (
            <div className="relative text-center pt-1">
              {!reduce && <Confetti />}
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-gold-300 bg-gold/15 border border-gold/30 rounded-md px-3 py-1 mb-2">{roundNo} round{roundNo === 1 ? '' : 's'} played</span>
              <div className="w-16 h-16 mx-auto mb-2 rounded-[22px] bg-gradient-to-br from-gold-300 to-gold text-dark flex items-center justify-center shadow-[0_12px_30px_rgba(200,150,42,0.45)]" aria-hidden="true">
                <Crown size={36} weight="fill" />
              </div>
              <p className={eyebrow}>Champion</p>
              <p className={`font-display text-4xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>{champion}</p>
              <p className="text-sm text-cream/60 mb-3">{topScore} point{topScore === 1 ? '' : 's'}</p>

              <ol className={`${glass} text-left divide-y divide-white/10 mb-3`}>
                {ranking.map((n, i) => (
                  <li key={n} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-5 text-center font-display font-extrabold text-cream/50 tabular-nums">{i + 1}</span>
                    <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{n}</span>
                    <span className="font-display text-lg font-extrabold text-gold-300 tabular-nums">{stats[n]?.points ?? 0}</span>
                  </li>
                ))}
              </ol>

              {awards.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {awards.map(aw => (
                    <div key={aw.id} className={`${glass} px-2.5 py-2.5`}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gold-300">{aw.title}</p>
                      <p className="font-display text-base font-extrabold text-white leading-tight truncate">{aw.winner}</p>
                      <p className="text-[10px] text-cream/50 leading-snug">{aw.blurb}</p>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => void share()}
                disabled={sharing}
                className={`${glass} group w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/10 transition-colors disabled:opacity-70 mb-3`}
              >
                <span className="relative w-14 shrink-0 aspect-[4/5] rounded-lg overflow-hidden bg-white/10 border border-white/15">
                  {previewUrl
                    ? <img src={previewUrl} alt="Your result card" className="absolute inset-0 w-full h-full object-cover" />
                    : <span className="absolute inset-0 animate-pulse bg-white/10" aria-hidden="true" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white">{sharing ? 'Preparing…' : 'Share the result card'}</span>
                  <span className="block text-xs text-cream/55">Post it in the group chat.</span>
                </span>
                <span className="w-10 h-10 shrink-0 rounded-md bg-gradient-to-b from-primary-light to-primary text-white flex items-center justify-center group-hover:scale-105 transition-transform" aria-hidden="true">
                  <ShareNetwork size={18} weight="bold" />
                </span>
              </button>

              <button type="button" onClick={() => { const list = shuffle(players); setStats(Object.fromEntries(list.map(n => [n, emptyStats()]))); setPreviewUrl(null); cardBlobRef.current = null; beginRound(list, 1); }} className={`${primaryBtn} mb-2.5`}>
                <ArrowCounterClockwise size={18} weight="bold" /> Play again, same group
              </button>
              <button type="button" onClick={() => setPhase('setup')} className={ghostBtn}>Change players or roles</button>
            </div>
          )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
