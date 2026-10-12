import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, ArrowCounterClockwise, ShareNetwork, SpeakerHigh, SpeakerSlash, Trophy, Plus, Minus, X,
  Ticket, Airplane, Eye, EyeSlash, Crown, Skull, CheckCircle,
  XCircle, MagicWand, Gift, Question, ArrowRight, DeviceMobile, ChatCircleDots,
} from '@phosphor-icons/react';
import Modal from './Modal';
import stowawayCat from '../../assets/stowaway-cat.png';
import { SITE_HOST, SITE_ORIGIN } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { hapticsEnabled } from './haptics';
import { Confetti, GameTile } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn, ghostBtn, glass, eyebrow, shareCardImage, cleanName } from './gameUi';
import StowawayOnline from './StowawayOnline';
import { loadOnlineSession } from './stowawayRoomApi';
import { LEVELS, CATEGORY_LABEL } from './stowawayWords';
import type { Level } from './stowawayWords';
import {
  MIN_PLAYERS, MAX_PLAYERS, POINTS, maxLost, countsFor, rolesValid, recommendedRoles, clampRoles, describeOrder,
  dealRound, drawPair, drawDare, checkWinner, roundPoints,
  computeAwards, emptyStats, loadSetup, saveSetup, uniqueNames, shuffle,
} from './stowawayEngine';
import type { Seat, Role, Outcome, PlayerStats, RoundSetup } from './stowawayEngine';
import { ENABLED_SPECIALS, PUBLIC_SPECIALS, describeSpecial, activeSpecial, maxSpecials, specialBonus, specialLabel } from './stowawaySpecials';
import { useStowawayContentSync } from './useGameContentSync';

// "Stowaway": a group bluffing game for Coming Soon trips. Two ways to play:
// pass-and-play on one phone (this file), or online with a room code where
// everyone uses their own phone (StowawayOnline.tsx, backed by Supabase).
// The rest of this comment describes the pass-and-play mode.
// Everyone is on the same trip, but a Stowaway sneaked aboard with the wrong
// plan. Explorers get one word, Stowaways a similar one, and the Lost Soul
// none at all. Each stop the group talks it out and offboards
// someone. Front-end only: one phone is passed around, nothing is sent
// anywhere. Only the word bag, names and settings live in localStorage
// (see stowawayEngine.ts), sounds are synthesised (gameAudio.ts), and the
// share button makes a result-card image (packBagScoreCard.ts).

const MUTE_KEY = 'ulaa:packbag:muted'; // shared with the other games: one sound setting
const REVEAL_MS = 1900;

type Phase =
  | 'idle' | 'online' | 'setup' | 'pass' | 'ticket' | 'describe' | 'vote' | 'offboard' | 'guess' | 'saved' | 'rider' | 'payback' | 'roundEnd' | 'final';

const ROLE_LABEL: Record<Role, string> = { explorer: 'Traveller', stowaway: 'Pickpocket', lost: 'Stranger' };
const ROLE_TONE: Record<Role, string> = {
  explorer: 'from-emerald-300 to-emerald-500 text-emerald-950',
  stowaway: 'from-[#F0CE7A] to-gold text-dark',
  lost: 'from-rose-300 to-rose-500 text-rose-950',
};

interface StowawayGameProps {
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
  /** Open straight on the pass-and-play setup screen (used by the shared /play/stowaway/game link). */
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

export default function StowawayGame({ tripSlug = '', tripTitle = 'Ulaa', className = '', compact = false, thumb = false, row = false, players: presetPlayers, defaultOpen = false }: StowawayGameProps) {
  useStowawayContentSync();
  const reduce = useReducedMotion();

  // ── Setup (saved on this device) ──
  const [initial] = useState(loadSetup);
  const hasPreset = presetNames(presetPlayers).length > 0;
  const [open, setOpen] = useState(defaultOpen);
  const [phase, setPhase] = useState<Phase>(defaultOpen ? 'setup' : 'idle');
  const [savedRoom, setSavedRoom] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>(() => rowsFor(presetPlayers, initial.names));
  const [stowaways, setStowaways] = useState(() => (hasPreset ? clampRoles(Math.max(MIN_PLAYERS, presetNames(presetPlayers).length), initial.stowaways, initial.lost).stowaways : initial.stowaways));
  const [lost, setLost] = useState(() => (hasPreset ? clampRoles(Math.max(MIN_PLAYERS, presetNames(presetPlayers).length), initial.stowaways, initial.lost).lost : initial.lost));
  const [hideCounts, setHideCounts] = useState(initial.hideCounts);
  const [level, setLevel] = useState<Level>(initial.level);
  const [useDares, setUseDares] = useState(initial.dares);
  const [useSpecials, setUseSpecials] = useState(initial.specials);
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
  const [selected, setSelected] = useState<number | null>(null);
  const [voters, setVoters] = useState<number[]>([]);
  const [lastOut, setLastOut] = useState<number | null>(null);
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
  const counts = countsFor(Math.max(playerCount, MIN_PLAYERS), stowaways, lost);
  const valid = playerCount >= MIN_PLAYERS && rolesValid(playerCount, stowaways, lost);

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
        const r = clampRoles(list.length, stowaways, lost);
        setStowaways(r.stowaways);
        setLost(r.lost);
      }
    }
  }

  // Persist setup as it changes. A roster handed in by the host is not
  // remembered as this device's own list of names.
  useEffect(() => {
    saveSetup({ names: hasPreset ? initial.names : names, stowaways, lost, hideCounts, level, dares: useDares, specials: useSpecials });
  }, [names, stowaways, lost, hideCounts, level, useDares, useSpecials, hasPreset, initial.names]);

  useEffect(() => () => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  };
  const buzz = (ms: number | number[]) => { if (!hapticsEnabled()) return; try { navigator.vibrate?.(ms); } catch { /* no haptics */ } };

  // Keep role counts valid when players are added or removed.
  const adjustRoles = (n: number, s: number, l: number) => {
    if (n < MIN_PLAYERS) return;
    const r = clampRoles(n, s, l);
    setStowaways(r.stowaways);
    setLost(r.lost);
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
    adjustRoles(next.map(cleanName).filter(Boolean).length, stowaways, lost);
  };
  const onNameBlur = () => adjustRoles(playerCount, stowaways, lost);

  const useRecommended = () => {
    const r = recommendedRoles(playerCount);
    setStowaways(r.stowaways);
    setLost(r.lost);
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
    const r = dealRound(list, countsFor(list.length, stowaways, lost), pair,
      useSpecials ? { enabled: ENABLED_SPECIALS, count: maxSpecials(list.length) } : undefined);
    setRound(r);
    setSeats(r.seats);
    setRoundNo(no);
    setStopNo(1);
    setPassIdx(0);
    setSelected(null);
    setVoters([]);
    setLastOut(null);
    setOutcome(null);
    setGained({});
    setDare(null);
    setPhase('pass');
  };

  // A new stop, as in Undercover: everyone describes their word in turn, then the group
  // talks it out and votes. The round starts at a random seat; after that, at the seat
  // after the player who just left.
  const startStop = (stop: number, from: number, list: Seat[] = seats) => {
    const order = describeOrder(list, from, stop);
    setStopNo(stop);
    setSelected(null);
    setVoters([]);
    setDescOrder(order);
    setDescPos(0);
    setPhase(order.length > 0 ? 'describe' : 'vote');
    play('go');
  };

  // The vote again at the same stop (Return Ticket): no new description round.
  const goVote = () => {
    setSelected(null);
    setVoters([]);
    setPhase('vote');
    play('go');
  };

  const describeNext = () => {
    play('flip');
    if (descPos + 1 >= descOrder.length) { setPhase('vote'); play('go'); return; }
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
  // A Backseat Rider who is out still votes from the back seat.
  const voterIdx = seats.map((s, i) => (s.alive || (s.outOrder !== undefined && activeSpecial(s) === 'backseatRider') ? i : -1)).filter(i => i >= 0);
  const publicRoles = aliveIdx.filter(i => { const sp = activeSpecial(seats[i]); return sp !== undefined && PUBLIC_SPECIALS.includes(sp); });
  const toggleVoter = (i: number) => setVoters(v => (v.includes(i) ? v.filter(x => x !== i) : [...v, i]));

  const confirmOffboard = () => {
    if (selected === null) return;
    ensure();
    const out = seats[selected];
    // Return Ticket: the first vote against them is cancelled and the group votes again.
    if (activeSpecial(out) === 'returnTicket' && !out.ticketUsed) {
      setSeats(seats.map((s, i) => (i === selected ? { ...s, ticketUsed: true } : s)));
      setLastOut(selected);
      setSelected(null);
      setVoters([]);
      setPhase('saved');
      play('gold');
      buzz([30, 40, 30]);
      later(REVEAL_MS, () => goVote());
      return;
    }
    // Votes: anyone who pointed at a sneaky player was right; at an Explorer, wrong.
    setStats(st => {
      const next = { ...st };
      voters.forEach(vi => {
        const who = seats[vi]?.name;
        if (!who || vi === selected) return;
        const cur = { ...(next[who] ?? emptyStats()) };
        if (out.role === 'explorer') cur.wrongVotes += 1; else cur.correctVotes += 1;
        next[who] = cur;
      });
      return next;
    });
    const outSoFar = seats.filter(s => s.outOrder !== undefined).length;
    const updated = seats.map((s, i) => (i === selected ? { ...s, alive: false, outStop: stopNo, outOrder: outSoFar + 1 } : s));
    setSeats(updated);
    setLastOut(selected);
    setPhase('offboard');
    play('power');
    buzz([30, 40, 30]);
    later(REVEAL_MS, () => afterReveal(updated, selected));
  };

  const finishRound = (list: Seat[], result: Outcome) => {
    const pts = roundPoints(list, result);
    const bonus = specialBonus(list);
    Object.keys(bonus).forEach(n => { pts[n] = (pts[n] ?? 0) + bonus[n]; });
    setGained(pts);
    setOutcome(result);
    setStats(st => {
      const next = { ...st };
      list.forEach(s => {
        const cur = { ...(next[s.name] ?? emptyStats()) };
        cur.points += pts[s.name] ?? 0;
        if (result === 'stowaways' && s.role === 'stowaway' && s.alive) cur.survivedAsStowaway += 1;
        if (result === 'lost-steal' && s.role === 'lost' && s.alive) cur.lostWins += 1;
        next[s.name] = cur;
      });
      return next;
    });
    // The losing side draws a dare, if the group opted in.
    setDare(useDares ? drawDare() : null);
    setPhase('roundEnd');
    play(result === 'explorers' ? 'win' : 'gold');
    buzz([40, 60, 40]);
  };

  const afterReveal = (list: Seat[], outIdx: number) => {
    const out = list[outIdx];
    if (out.role === 'lost') { setPhase('guess'); return; }
    if (activeSpecial(out) === 'backseatRider') { setPhase('rider'); return; }
    afterGuess(list, outIdx);
  };

  // Everything that can follow someone leaving: a win, a Payback, or the next stop.
  const afterGuess = (list: Seat[], outIdx: number) => {
    const w = checkWinner(list);
    if (w) { finishRound(list, w === 'explorers' ? 'explorers' : 'stowaways'); return; }
    const out = list[outIdx];
    if (activeSpecial(out) === 'payback' && !out.paybackDone && list.some(s => s.alive)) {
      setPhase('payback');
      return;
    }
    startStop(stopNo + 1, outIdx + 1, list);
  };

  // Lost Soul's last chance: the group judges the spoken guess.
  const judgeGuess = (correct: boolean) => {
    if (lastOut === null) return;
    ensure();
    if (correct) {
      // She stays "aboard" for scoring purposes: she stole the round.
      const list = seats.map((s, i) => (i === lastOut ? { ...s, alive: true } : s));
      setSeats(list);
      finishRound(list, 'lost-steal');
      return;
    }
    play('bad');
    afterGuess(seats, lastOut);
  };

  // Backseat Rider's guess at the other side's word.
  const judgeRider = (correct: boolean) => {
    if (lastOut === null) return;
    ensure();
    const list = seats.map((s, i) => (i === lastOut ? { ...s, riderHit: correct } : s));
    setSeats(list);
    play(correct ? 'good' : 'bad');
    afterGuess(list, lastOut);
  };

  // Payback: the player who just left takes one more with them.
  const confirmPayback = (victim: number) => {
    if (lastOut === null) return;
    ensure();
    const payer = seats[lastOut];
    const outSoFar = seats.filter(s => s.outOrder !== undefined).length;
    const opposite = (seats[victim].role === 'explorer') !== (payer.role === 'explorer');
    const updated = seats.map((s, i) => {
      if (i === lastOut) return { ...s, paybackDone: true, paybackHit: opposite };
      if (i === victim) return { ...s, alive: false, outStop: stopNo, outOrder: outSoFar + 1 };
      return s;
    });
    setSeats(updated);
    setLastOut(victim);
    setPhase('offboard');
    play('power');
    buzz([30, 40, 30]);
    later(REVEAL_MS, () => afterReveal(updated, victim));
  };

  const nextRound = () => { ensure(); beginRound(players, roundNo + 1); };

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
    title: champion ? `${shortName(champion, 14)} takes the trip` : 'Yaaru Fake?',
    tripTitle,
    host: SITE_HOST,
    best: topScore,
    isNewBest: false,
    eyebrow: 'YAARU FAKE?  ·  GROUP GAME',
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
  const shareText = `${champion ?? 'We'} won our game of Yaaru Fake? on Ulaa after ${roundNo} round${roundNo === 1 ? '' : 's'}! Play with your travel gang: ${shareUrl}`;
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    let blob = cardBlobRef.current;
    if (!blob) { try { blob = await buildScoreCard(cardOpts); } catch { blob = null; } }
    setSharing(false);
    await shareCardImage(blob, {
      filename: 'ulaa-yaaru-fake.png',
      title: 'Yaaru Fake?',
      text: shareText,
      fallbackLink: getWhatsAppLink('', shareText),
    });
  };

  // ── Derived for rendering ──
  const passSeat = seats[passIdx];
  const out = lastOut !== null ? seats[lastOut] : null;
  const stepBtn = 'w-9 h-9 rounded-full bg-white/10 border border-white/15 text-cream flex items-center justify-center hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition';

  const countLine = hideCounts
    ? `${seats.length} players. Roles are secret.`
    : `${counts.explorers} Travellers, ${counts.stowaways} Pickpocket${counts.stowaways === 1 ? '' : 's'}${counts.lost ? `, ${counts.lost} Stranger${counts.lost === 1 ? '' : 's'}` : ''}`;

  return (
    <div className={className}>
      <GameTile
        onClick={() => { setSavedRoom(loadOnlineSession()?.code ?? null); setOpen(true); setPhase('idle'); }}
        compact={compact}
        thumb={thumb}
        row={row}
        iconSrc={stowawayCat}
        accent="gold"
        title="Yaaru Fake?"
        subtitle="Who sneaked aboard?"
        chip="New · Group game"
      />

      <Modal isOpen={open} onClose={close} ariaLabel="Yaaru Fake? group game" size="sm" flush fullScreen>
        <div onPointerDownCapture={onPressCapture} className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center items-center md:py-10">
          <div className="relative w-full max-w-md md:max-w-2xl lg:max-w-3xl flex flex-col">
          <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
          <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

          {/* ── Intro ── */}
          {phase === 'idle' && (
            <div className="relative text-center pt-3 md:pt-0 md:grid md:grid-cols-[1fr_1.15fr] md:gap-12 lg:gap-16 md:items-center">
              <div>
              <motion.div
                className="w-20 h-20 md:w-28 md:h-28 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              >
                <img src={stowawayCat} alt="" className="w-12 h-12 object-contain" draggable={false} />
              </motion.div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Group game · {MIN_PLAYERS} to {MAX_PLAYERS} players</span>
              <h2 className="font-display text-4xl md:text-5xl font-extrabold text-white leading-tight">Yaaru Fake?</h2>
              <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Play on one phone, or online with a room code. Someone is faking it. Can you spot them?</p>
              </div>
              <div className="min-w-0">

              <ul className={`${glass} text-left divide-y divide-white/10 mb-4`}>
                {[
                  { I: Ticket, c: 'bg-primary/25 text-[#F4B183]', t: <>Each traveller holds to see a <strong className="text-white">secret boarding pass</strong>.</> },
                  { I: ChatCircleDots, c: 'bg-gold/20 text-[#F0CE7A]', t: <>Take turns saying <strong className="text-white">one word or a short phrase</strong> about your word.</> },
                  { I: Eye, c: 'bg-secondary/25 text-[#F4B183]', t: <>Talk it out and work out <strong className="text-white">who is bluffing</strong>.</> },
                  { I: Airplane, c: 'bg-primary/25 text-[#F4B183]', t: <>Vote someone <strong className="text-white">offboard</strong>. Find every Pickpocket and Stranger to win.</> },
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
              </div>
            </div>
          )}

          {/* ── Online: every player on their own phone ── */}
          {phase === 'online' && (
            <StowawayOnline tripTitle={tripTitle} onExit={() => { setSavedRoom(loadOnlineSession()?.code ?? null); setPhase('idle'); }} />
          )}

          {/* ── Setup ── */}
          {phase === 'setup' && (
            <div className="relative">
              <div className="pr-12 mb-3">
                <p className={eyebrow}>Step 1</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Who is travelling?</h2>
              </div>
              <div className="space-y-1.5 mb-2">
                {names.map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-bold text-cream/40 tabular-nums">{i + 1}</span>
                    <input
                      type="text"
                      value={n}
                      maxLength={18}
                      placeholder={`Traveller ${i + 1}`}
                      aria-label={`Traveller ${i + 1} name`}
                      onChange={e => setName(i, e.target.value)}
                      onBlur={onNameBlur}
                      className="flex-1 min-w-0 rounded-xl bg-white/[0.07] border border-white/15 focus:border-[#F0CE7A]/70 focus:bg-white/10 px-3 py-2.5 text-[15px] font-semibold text-white placeholder:text-cream/30 outline-none transition-colors"
                    />
                    <button type="button" onClick={() => removePlayer(i)} className="w-8 h-8 shrink-0 rounded-full text-cream/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors" aria-label={`Remove traveller ${i + 1}`}>
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={addPlayer} disabled={names.length >= MAX_PLAYERS} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F0CE7A] hover:text-white disabled:opacity-40 transition-colors">
                  <Plus size={14} weight="bold" /> Add traveller
                </button>
                <span className="text-xs text-cream/50 tabular-nums">{playerCount} of {MIN_PLAYERS}–{MAX_PLAYERS}</span>
              </div>

              <p className={eyebrow}>Step 2</p>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-lg font-extrabold text-white">Pick the roles</h3>
                <button type="button" onClick={useRecommended} disabled={playerCount < MIN_PLAYERS} className="inline-flex items-center gap-1 rounded-full bg-gold/15 border border-gold/30 text-[#F0CE7A] text-[11px] font-bold px-2.5 py-1 hover:bg-gold/25 disabled:opacity-40 transition-colors">
                  <MagicWand size={12} weight="fill" /> Recommended
                </button>
              </div>
              <div className={`${glass} divide-y divide-white/10 mb-2`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-emerald-400/20 text-emerald-300 flex items-center justify-center"><Eye size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Travellers</p>
                    <p className="text-[11px] text-cream/50">Same word. Always the majority.</p>
                  </div>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-8 text-center">{playerCount >= MIN_PLAYERS ? counts.explorers : '-'}</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-gold/20 text-[#F0CE7A] flex items-center justify-center"><Ticket size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Pickpockets</p>
                    <p className="text-[11px] text-cream/50">A similar but different word.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Pickpockets" disabled={playerCount < MIN_PLAYERS || stowaways <= (lost > 0 ? 0 : 1)} onClick={() => setStowaways(s => s - 1)}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{stowaways}</span>
                  <button type="button" className={stepBtn} aria-label="More Pickpockets" disabled={playerCount < MIN_PLAYERS || !rolesValid(playerCount, stowaways + 1, lost)} onClick={() => setStowaways(s => s + 1)}><Plus size={14} weight="bold" /></button>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-rose-400/20 text-rose-300 flex items-center justify-center"><Question size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Stranger</p>
                    <p className="text-[11px] text-cream/50">No word at all. Blends in.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Strangers" disabled={playerCount < MIN_PLAYERS || lost <= (stowaways > 0 ? 0 : 1)} onClick={() => setLost(l => l - 1)}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{lost}</span>
                  <button type="button" className={stepBtn} aria-label="More Strangers" disabled={playerCount < MIN_PLAYERS || lost >= maxLost(playerCount) || !rolesValid(playerCount, stowaways, lost + 1)} onClick={() => setLost(l => l + 1)}><Plus size={14} weight="bold" /></button>
                </div>
              </div>
              {playerCount < MIN_PLAYERS && <p className="text-xs text-[#F0CE7A] mb-2">Add at least {MIN_PLAYERS} travellers to pick roles.</p>}

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
                    className={`rounded-xl border py-2 text-sm font-bold transition-colors ${level === l.id ? 'bg-gradient-to-b from-primary-light to-primary border-transparent text-white' : 'bg-white/[0.06] border-white/10 text-cream/70 hover:bg-white/10'}`}
                  >{l.label}</button>
                ))}
              </div>
              <p className="text-[11px] text-cream/50 mb-4">{LEVELS.find(l => l.id === level)?.hint}.</p>

              <div className={`${glass} divide-y divide-white/10 mb-4`}>
                {[
                  { k: 'hide', on: hideCounts, set: setHideCounts, t: 'Hide the counts', d: 'Nobody knows if a Stranger exists. Much more tense.' },
                  { k: 'dare', on: useDares, set: setUseDares, t: 'Trip dares', d: 'The losing side draws a silly dare.' },
                  { k: 'special', on: useSpecials, set: setUseSpecials, t: 'Special roles', d: 'Clown, Rivals, Payback, Return Ticket and more. Up to one per 3 players.' },
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

              <button type="button" onClick={startSession} disabled={!valid} className={`${primaryBtn} disabled:opacity-50 disabled:pointer-events-none`}>
                <Play size={18} weight="fill" /> Deal boarding passes
              </button>
              <button type="button" onClick={() => setPhase('idle')} className="mt-3 w-full text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Back</button>
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
                <div className="rounded-3xl bg-gradient-to-br from-[#FFF6DD] to-[#F0CE7A] text-dark shadow-[0_18px_40px_rgba(0,0,0,0.45)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <span className="font-display text-sm font-extrabold tracking-wider text-primary-dark">ULAA AIR</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-dark/60">{tripTitle.length > 20 ? `${tripTitle.slice(0, 19)}…` : tripTitle}</span>
                  </div>
                  <div className="px-4 pb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-dark/50">Passenger</p>
                    <p className="font-display text-xl font-extrabold leading-tight">{passSeat.name}</p>
                  </div>
                  <div className="relative border-t-2 border-dashed border-dark/25 px-4 py-4 bg-white/40 text-center min-h-[7.5rem] flex flex-col items-center justify-center">
                    <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
                    <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-footer" aria-hidden="true" />
                    <AnimatePresence mode="wait">
                      {holding ? (
                        <motion.div key="word" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-dark/50">Your destination</p>
                          {passSeat.word
                            ? <p className="font-display text-3xl font-extrabold text-primary-dark leading-tight break-words">{passSeat.word}</p>
                            : <>
                                <p className="font-display text-3xl font-extrabold text-rose-700 leading-tight">No destination</p>
                                <p className="text-sm font-bold text-dark/70 mt-1">Blend in.</p>
                              </>}
                          {passSeat.special && describeSpecial(passSeat) && (
                            <div className="mt-3 pt-3 border-t border-dark/15">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-dark/50">Special role</p>
                              <p className="font-display text-lg font-extrabold text-primary-dark leading-tight">{specialLabel(passSeat)}</p>
                              <p className="text-xs font-semibold text-dark/70 leading-snug mt-0.5">{describeSpecial(passSeat)}</p>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div key="hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-1 text-dark/60">
                          <EyeSlash size={28} weight="duotone" />
                          <p className="text-sm font-bold">Hidden</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark/90 text-cream">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-cream/60">Seat</span>
                    <span className="font-display text-lg font-extrabold text-[#F0CE7A] tabular-nums">{passSeat.seat}</span>
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
              <p className="mt-2 text-center text-[11px] text-cream/40">Remember it. You cannot look again.</p>
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
                className="rounded-3xl bg-gradient-to-br from-[#FFF6DD] to-[#F0CE7A] text-dark px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
                <span className="mx-auto w-11 h-11 rounded-2xl bg-dark/90 text-[#F0CE7A] flex items-center justify-center mb-2" aria-hidden="true"><ChatCircleDots size={24} weight="duotone" /></span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dark/50">{descPos === 0 ? 'Starts' : `Speaker ${descPos + 1} of ${descOrder.length}`}</p>
                <p className="font-display text-3xl font-extrabold leading-tight break-words">{seats[descOrder[descPos]].name}</p>
                <p className="text-xs font-bold text-dark/60 mt-1">Seat {seats[descOrder[descPos]].seat}</p>
              </motion.div>
              <ol className="flex flex-wrap justify-center gap-1.5 mt-4" aria-label="Speaking order">
                {descOrder.map((i, k) => (
                  <li key={i} className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${k === descPos ? 'bg-gold/25 border-gold/60 text-[#F0CE7A]' : k < descPos ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-200' : 'bg-white/[0.06] border-white/15 text-cream/60'}`}>
                    {k < descPos && <CheckCircle size={11} weight="fill" className="inline -mt-0.5 mr-1" />}{seats[i].name}
                  </li>
                ))}
              </ol>
              {publicRoles.length > 0 && publicRoles.map(i => (
                <p key={i} className="text-xs text-[#F0CE7A] leading-snug mt-2">
                  {activeSpecial(seats[i]) === 'tripLeader' ? `Trip Leader ${seats[i].name} breaks any tie.` : `Driver ${seats[i].name} starts every description round.`}
                </p>
              ))}
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
                {publicRoles.map(i => (
                  <p key={i} className="text-xs text-[#F0CE7A] leading-snug mt-1">
                    {activeSpecial(seats[i]) === 'tripLeader' ? `Trip Leader ${seats[i].name} breaks any tie.` : `Driver ${seats[i].name} starts every description round.`}
                  </p>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {aliveIdx.map(i => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setSelected(i); setVoters(v => v.filter(x => x !== i)); play('flip'); }}
                    aria-pressed={selected === i}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${selected === i ? 'bg-gradient-to-br from-primary-light to-primary border-transparent text-white shadow-[0_8px_20px_rgba(168,90,42,0.5)]' : 'bg-white/[0.06] border-white/10 text-cream hover:bg-white/10'}`}
                  >
                    <span className="block font-display text-base font-extrabold leading-tight truncate">{seats[i].name}</span>
                    <span className="block text-[10px] uppercase tracking-wider opacity-60">Seat {seats[i].seat}</span>
                  </button>
                ))}
              </div>

              {selected !== null && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-cream/70 mb-1.5">Who voted for {seats[selected].name}? <span className="text-cream/40">(optional, for the awards)</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {voterIdx.filter(i => i !== selected).map(i => (
                      <button key={i} type="button" onClick={() => toggleVoter(i)} aria-pressed={voters.includes(i)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${voters.includes(i) ? 'bg-gold/25 border-gold/60 text-[#F0CE7A]' : 'bg-white/[0.06] border-white/15 text-cream/70'}`}>
                        {seats[i].name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button type="button" onClick={confirmOffboard} disabled={selected === null} className={`${primaryBtn} disabled:opacity-40 disabled:pointer-events-none`}>
                <Airplane size={18} weight="fill" /> {selected === null ? 'Pick someone' : `Offboard ${seats[selected].name}`}
              </button>
            </div>
          )}

          {/* ── Offboard animation + role reveal ── */}
          {phase === 'offboard' && out && (
            <div className="relative text-center pt-10 min-h-[22rem]">
              <p className={eyebrow}>Offboarding</p>
              <p className="font-display text-3xl font-extrabold text-white mt-1">{out.name}</p>
              <div className="relative h-28 mt-6 overflow-hidden" aria-hidden="true">
                <motion.div
                  className="absolute top-1/2 -translate-y-1/2 text-[#F0CE7A]"
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
                className={`inline-block rounded-2xl bg-gradient-to-br ${ROLE_TONE[out.role]} px-6 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.4)]`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Was a</p>
                <p className="font-display text-3xl font-extrabold leading-tight">{ROLE_LABEL[out.role]}</p>
                {out.special && describeSpecial(out) && <p className="text-xs font-bold mt-1 opacity-80">and the {specialLabel(out)}</p>}
              </motion.div>
            </div>
          )}

          {/* ── Lost Soul's last chance ── */}
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
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-rose-200 bg-rose-400/15 border border-rose-300/30 rounded-full px-3 py-1 mb-2">Last chance</span>
              <h2 className="font-display text-3xl font-extrabold text-white leading-tight">{out.name} was the Stranger</h2>
              <p className="text-sm text-cream/65 mt-2 mb-5 px-4">{out.name}, say your guess for the Travellers' word out loud. The group decides if it is right.</p>
              <p className="text-xs text-cream/45 mb-5 px-4">Close enough counts. Spelling does not matter.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => judgeGuess(false)} className={`${ghostBtn} !py-4`}><XCircle size={20} weight="fill" className="text-rose-300" /> Wrong</button>
                <button type="button" onClick={() => judgeGuess(true)} className={`${primaryBtn} !py-4`}><CheckCircle size={20} weight="fill" /> Correct</button>
              </div>
            </div>
          )}

          {/* ── Return Ticket: the vote is cancelled ── */}
          {phase === 'saved' && out && (
            <div className="relative text-center pt-10 min-h-[18rem]">
              <p className={eyebrow}>Return Ticket</p>
              <motion.div
                initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 14 }}
                className="w-24 h-24 mx-auto my-6 rounded-[30px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                aria-hidden="true"
              >
                <Ticket size={52} weight="duotone" />
              </motion.div>
              <p className="font-display text-3xl font-extrabold text-white leading-tight">{out.name} stays aboard!</p>
              <p className="text-sm text-cream/60 mt-2 px-6">Their Return Ticket cancels this vote. The group votes again.</p>
            </div>
          )}

          {/* ── Backseat Rider's guess ── */}
          {phase === 'rider' && out && (
            <div className="relative text-center pt-6">
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Backseat Rider</span>
              <h2 className="font-display text-3xl font-extrabold text-white leading-tight">{out.name}, take a guess</h2>
              <p className="text-sm text-cream/65 mt-2 mb-5 px-4">
                Say your guess for the {out.role === 'explorer' ? "Pickpockets'" : "Travellers'"} word out loud. The group decides if it is right.
              </p>
              <p className="text-xs text-cream/45 mb-5 px-4">Close enough counts. You keep voting from the back seat either way.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => judgeRider(false)} className={`${ghostBtn} !py-4`}><XCircle size={20} weight="fill" className="text-rose-300" /> Wrong</button>
                <button type="button" onClick={() => judgeRider(true)} className={`${primaryBtn} !py-4`}><CheckCircle size={20} weight="fill" /> Correct</button>
              </div>
            </div>
          )}

          {/* ── Payback: pick who goes with them ── */}
          {phase === 'payback' && out && (
            <div className="relative">
              <div className="pr-12 mb-3">
                <p className={eyebrow}>Payback</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">{out.name} takes someone with them</h2>
                <p className="text-xs text-cream/60">{out.name}, pick one player to go offboard too.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {aliveIdx.map(i => (
                  <button key={i} type="button" onClick={() => confirmPayback(i)}
                    className="rounded-2xl border px-3 py-3 text-left transition bg-white/[0.06] border-white/10 text-cream hover:bg-white/10 active:scale-[0.98]">
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
              {!reduce && outcome !== 'explorers' && <Confetti />}
              {!reduce && outcome === 'explorers' && <Confetti />}
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Round {roundNo} over</span>
              <h2 className={`font-display text-3xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>
                {outcome === 'explorers' ? 'Travellers win!' : outcome === 'stowaways' ? 'The Pickpockets got away!' : 'The Stranger stole it!'}
              </h2>
              <p className="text-sm text-cream/60 mt-1 mb-3">
                {outcome === 'explorers' ? 'Every Pickpocket and Stranger was caught.' : outcome === 'stowaways' ? 'Only one Traveller was left.' : 'One lucky guess flipped the whole round.'}
              </p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className={`${glass} py-2.5`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Travellers had</p>
                  <p className="font-display text-lg font-extrabold text-white leading-tight px-2">{round.explorerWord}</p>
                </div>
                <div className={`${glass} py-2.5`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Pickpockets had</p>
                  <p className="font-display text-lg font-extrabold text-[#F0CE7A] leading-tight px-2">{round.stowawayWord}</p>
                </div>
              </div>
              <p className="text-[11px] text-cream/40 mb-3">{CATEGORY_LABEL[round.pair.category]} · {seats.filter(s => s.role === 'lost').length > 0 ? `${seats.filter(s => s.role === 'lost').map(s => s.name).join(' & ')} ${seats.filter(s => s.role === 'lost').length > 1 ? 'were' : 'was'} the Stranger` : 'No Stranger this round'}</p>

              <ul className={`${glass} text-left divide-y divide-white/10 mb-3`}>
                {[...seats].sort((x, y) => (gained[y.name] ?? 0) - (gained[x.name] ?? 0)).map(s => (
                  <li key={s.name} className="flex items-center gap-2.5 px-3 py-2">
                    <span className={`w-6 h-6 shrink-0 rounded-full bg-gradient-to-br ${ROLE_TONE[s.role]} flex items-center justify-center`} aria-hidden="true">
                      {s.role === 'explorer' ? <Eye size={13} weight="bold" /> : s.role === 'stowaway' ? <Ticket size={13} weight="bold" /> : <Skull size={13} weight="bold" />}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{s.name}</span>
                    <span className="text-[11px] text-cream/50">{ROLE_LABEL[s.role]}{s.special && describeSpecial(s) ? ` · ${specialLabel(s)}` : ''}</span>
                    <span className={`w-9 text-right font-display font-extrabold tabular-nums ${(gained[s.name] ?? 0) > 0 ? 'text-emerald-300' : 'text-cream/30'}`}>+{gained[s.name] ?? 0}</span>
                  </li>
                ))}
              </ul>

              {dare && (
                <div className="rounded-2xl bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-3 mb-3 text-left">
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]"><Gift size={11} weight="fill" /> Trip dare for the {outcome === 'explorers' ? 'Pickpockets' : 'Travellers'}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{dare}</p>
                </div>
              )}

              <p className="text-[11px] text-cream/45 mb-3">Points: Travellers +{POINTS.explorerWin}, a winning Pickpocket +{POINTS.stowawaySurvive}, a winning Stranger +{POINTS.lostSurvive} (lasting to the end or guessing the Travellers' word).{seats.some(s => s.special) ? ' Special-role bonuses are added on top.' : ''}</p>

              <button type="button" onClick={nextRound} className={`${primaryBtn} mb-2.5`}><Play size={18} weight="fill" /> Play next round</button>
              <button type="button" onClick={endSession} className={ghostBtn}><Trophy size={16} weight="fill" /> End game and see awards</button>
            </div>
          )}

          {/* ── Final scoreboard ── */}
          {phase === 'final' && (
            <div className="relative text-center pt-1">
              {!reduce && <Confetti />}
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">{roundNo} round{roundNo === 1 ? '' : 's'} played</span>
              <div className="w-16 h-16 mx-auto mb-2 rounded-[22px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_12px_30px_rgba(200,150,42,0.45)]" aria-hidden="true">
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
                    <span className="font-display text-lg font-extrabold text-[#F0CE7A] tabular-nums">{stats[n]?.points ?? 0}</span>
                  </li>
                ))}
              </ol>

              {awards.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {awards.map(aw => (
                    <div key={aw.id} className={`${glass} px-2.5 py-2.5`}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#F0CE7A]">{aw.title}</p>
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
                <span className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-b from-primary-light to-primary text-white flex items-center justify-center group-hover:scale-105 transition-transform" aria-hidden="true">
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
