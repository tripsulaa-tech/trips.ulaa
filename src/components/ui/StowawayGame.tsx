import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, ArrowCounterClockwise, ShareNetwork, SpeakerHigh, SpeakerSlash, Trophy, Plus, Minus, X,
  UsersThree, Ticket, Airplane, Eye, EyeSlash, Sparkle, Lightning, Crown, Skull, CheckCircle,
  XCircle, MagicWand, Gift, Question, ArrowRight, DeviceMobile,
} from '@phosphor-icons/react';
import Modal from './Modal';
import { SITE_HOST, SITE_ORIGIN } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { hapticsEnabled } from './haptics';
import { Confetti, GameTile, TimerRing, BrandMark } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, shareCardImage, cleanName } from './gameUi';
import StowawayOnline from './StowawayOnline';
import { loadOnlineSession } from './stowawayRoomApi';
import { LEVELS, CATEGORY_LABEL } from './stowawayWords';
import type { Level, Challenge } from './stowawayWords';
import {
  MIN_PLAYERS, MAX_PLAYERS, POINTS, maxLost, countsFor, rolesValid, recommendedRoles, clampRoles,
  dealRound, drawPair, drawChallenge, drawDare, checkWinner, speakingOrder, roundPoints,
  computeAwards, emptyStats, loadSetup, saveSetup, uniqueNames, shuffle,
} from './stowawayEngine';
import type { Seat, Role, Outcome, PlayerStats, RoundSetup } from './stowawayEngine';

// "Stowaway": a group bluffing game for Coming Soon trips. Two ways to play:
// pass-and-play on one phone (this file), or online with a room code where
// everyone uses their own phone (StowawayOnline.tsx, backed by Supabase).
// The rest of this comment describes the pass-and-play mode.
// Everyone is on the same trip, but a Stowaway sneaked aboard with the wrong
// plan. Explorers get one word, Stowaways a similar one, and the Lost Soul
// none at all. Each stop everyone gives one clue, then the group offboards
// someone. Front-end only: one phone is passed around, nothing is sent
// anywhere. Only the word bag, names and settings live in localStorage
// (see stowawayEngine.ts), sounds are synthesised (gameAudio.ts), and the
// share button makes a result-card image (packBagScoreCard.ts).

const MUTE_KEY = 'ulaa:packbag:muted'; // shared with the other games: one sound setting
const SPEAK_SECONDS = 15;
const REVEAL_MS = 1900;

type Phase =
  | 'idle' | 'online' | 'setup' | 'pass' | 'ticket' | 'round' | 'vote' | 'offboard' | 'guess' | 'roundEnd' | 'final';

const ROLE_LABEL: Record<Role, string> = { explorer: 'Explorer', stowaway: 'Stowaway', lost: 'Lost Soul' };
const ROLE_TONE: Record<Role, string> = {
  explorer: 'from-emerald-300 to-emerald-500 text-emerald-950',
  stowaway: 'from-[#F0CE7A] to-gold text-dark',
  lost: 'from-rose-300 to-rose-500 text-rose-950',
};

interface StowawayGameProps {
  tripId: string;
  tripSlug: string;
  tripTitle: string;
  className?: string;
  compact?: boolean;
  thumb?: boolean;
}

export default function StowawayGame({ tripSlug, tripTitle, className = '', compact = false, thumb = false }: StowawayGameProps) {
  const reduce = useReducedMotion();

  // ── Setup (saved on this device) ──
  const [initial] = useState(loadSetup);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [savedRoom, setSavedRoom] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>(initial.names);
  const [stowaways, setStowaways] = useState(initial.stowaways);
  const [lost, setLost] = useState(initial.lost);
  const [hideCounts, setHideCounts] = useState(initial.hideCounts);
  const [level, setLevel] = useState<Level>(initial.level);
  const [useChallenges, setUseChallenges] = useState(initial.challenges);
  const [useDares, setUseDares] = useState(initial.dares);
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
  const [order, setOrder] = useState<number[]>([]); // seat indexes, speaking order
  const [speakPos, setSpeakPos] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(SPEAK_SECONDS);
  const [selected, setSelected] = useState<number | null>(null);
  const [voters, setVoters] = useState<number[]>([]);
  const [lastOut, setLastOut] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [gained, setGained] = useState<Record<string, number>>({});
  const [dare, setDare] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const secondsRef = useRef(SPEAK_SECONDS);
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

  // Persist setup as it changes.
  useEffect(() => {
    saveSetup({ names, stowaways, lost, hideCounts, level, challenges: useChallenges, dares: useDares });
  }, [names, stowaways, lost, hideCounts, level, useChallenges, useDares]);

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
    const challenge: Challenge = drawChallenge();
    const r = dealRound(list, countsFor(list.length, stowaways, lost), pair, challenge);
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

  const startStop = (list: Seat[], stop: number, from: number) => {
    const ord = speakingOrder(list, from);
    setOrder(ord);
    setSpeakPos(0);
    secondsRef.current = SPEAK_SECONDS; setSecondsLeft(SPEAK_SECONDS);
    setStopNo(stop);
    setSelected(null);
    setVoters([]);
    setPhase('round');
    play('go');
  };

  // Per-player speaking timer: starts when the speaker taps "Start".
  const [timing, setTiming] = useState(false);
  useEffect(() => {
    if (phase !== 'round' || !timing) return;
    const id = window.setInterval(() => {
      secondsRef.current -= 1;
      setSecondsLeft(secondsRef.current);
      if (secondsRef.current > 0 && secondsRef.current <= 5) play('tick');
      if (secondsRef.current <= 0) {
        window.clearInterval(id);
        setTiming(false);
        play('miss');
        try { navigator.vibrate?.(120); } catch { /* no haptics */ }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, timing, play]);

  const nextSpeaker = () => {
    setTiming(false);
    secondsRef.current = SPEAK_SECONDS; setSecondsLeft(SPEAK_SECONDS);
    if (speakPos + 1 >= order.length) { setPhase('vote'); play('go'); return; }
    setSpeakPos(p => p + 1);
    play('flip');
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
      if (round) startStop(seats, 1, round.startIdx);
      return;
    }
    setPassIdx(i => i + 1);
    setPhase('pass');
  };

  // ── Voting and offboarding ──
  const aliveIdx = seats.map((s, i) => (s.alive ? i : -1)).filter(i => i >= 0);
  const toggleVoter = (i: number) => setVoters(v => (v.includes(i) ? v.filter(x => x !== i) : [...v, i]));

  const confirmOffboard = () => {
    if (selected === null) return;
    ensure();
    const out = seats[selected];
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
    const updated = seats.map((s, i) => (i === selected ? { ...s, alive: false } : s));
    setSeats(updated);
    setLastOut(selected);
    setPhase('offboard');
    play('power');
    buzz([30, 40, 30]);
    later(REVEAL_MS, () => afterReveal(updated, selected));
  };

  const finishRound = (list: Seat[], result: Outcome) => {
    const pts = roundPoints(list, result);
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
    const w = checkWinner(list);
    if (w) { finishRound(list, w === 'explorers' ? 'explorers' : 'stowaways'); return; }
    startStop(list, stopNo + 1, outIdx + 1);
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
    const w = checkWinner(seats);
    if (w) { finishRound(seats, w === 'explorers' ? 'explorers' : 'stowaways'); return; }
    startStop(seats, stopNo + 1, lastOut + 1);
  };

  const nextRound = () => { ensure(); beginRound(players, roundNo + 1); };

  const endSession = () => { clearTimers(); setPhase('final'); play('win'); };

  const close = () => { clearTimers(); setOpen(false); setPhase('idle'); setTiming(false); setHolding(false); };

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
    title: champion ? `${shortName(champion, 14)} takes the trip` : 'Stowaway',
    tripTitle,
    host: SITE_HOST,
    best: topScore,
    isNewBest: false,
    eyebrow: 'STOWAWAY  ·  GROUP GAME',
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
  const shareText = `${champion ?? 'We'} won our game of Stowaway on Ulaa after ${roundNo} round${roundNo === 1 ? '' : 's'}! Play with your travel gang: ${shareUrl}`;
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    let blob = cardBlobRef.current;
    if (!blob) { try { blob = await buildScoreCard(cardOpts); } catch { blob = null; } }
    setSharing(false);
    await shareCardImage(blob, {
      filename: 'ulaa-stowaway.png',
      title: 'Stowaway',
      text: shareText,
      fallbackLink: getWhatsAppLink('', shareText),
    });
  };

  // ── Derived for rendering ──
  const passSeat = seats[passIdx];
  const speaker = seats[order[speakPos]];
  const out = lastOut !== null ? seats[lastOut] : null;
  const stepBtn = 'w-9 h-9 rounded-full bg-white/10 border border-white/15 text-cream flex items-center justify-center hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition';

  const countLine = hideCounts
    ? `${seats.length} travellers aboard. Roles are secret.`
    : `${counts.explorers} Explorers, ${counts.stowaways} Stowaway${counts.stowaways === 1 ? '' : 's'}${counts.lost ? `, ${counts.lost} Lost Soul${counts.lost === 1 ? '' : 's'}` : ''}`;

  return (
    <div className={className}>
      <GameTile
        onClick={() => { setSavedRoom(loadOnlineSession()?.code ?? null); setOpen(true); setPhase('idle'); }}
        compact={compact}
        thumb={thumb}
        Icon={UsersThree}
        accent="gold"
        title="Stowaway"
        subtitle="Who sneaked aboard?"
        chip="New · Group game"
      />

      <Modal isOpen={open} onClose={close} ariaLabel="Stowaway group game" size="sm" flush fullScreen>
        <div onPointerDownCapture={onPressCapture} className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center">
          <div className="relative w-full max-w-md">
          <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
          <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

          {/* ── Intro ── */}
          {phase === 'idle' && (
            <div className="relative text-center pt-3">
              <BrandMark />
              <motion.div
                className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-[0_14px_36px_rgba(168,90,42,0.5)]"
                animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              >
                <UsersThree size={46} weight="duotone" />
              </motion.div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Group game · 3 to 12 players</span>
              <h2 className="font-display text-4xl font-extrabold text-white leading-tight">Stowaway</h2>
              <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Play on one phone, or online with a room code. Someone sneaked aboard with the wrong plan. Can you spot them?</p>

              <ul className={`${glass} text-left divide-y divide-white/10 mb-4`}>
                {[
                  { I: Ticket, c: 'bg-primary/25 text-[#F4B183]', t: <>Each traveller holds to see a <strong className="text-white">secret boarding pass</strong>.</> },
                  { I: Eye, c: 'bg-gold/20 text-[#F0CE7A]', t: <>Give <strong className="text-white">one clue</strong> about your word, without saying it.</> },
                  { I: Airplane, c: 'bg-secondary/25 text-[#F4B183]', t: <>Vote someone <strong className="text-white">offboard</strong>. Find every Stowaway to win.</> },
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
                    <p className="text-sm font-bold text-white leading-tight">Explorers</p>
                    <p className="text-[11px] text-cream/50">Same word. Always the majority.</p>
                  </div>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-8 text-center">{playerCount >= MIN_PLAYERS ? counts.explorers : '-'}</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-gold/20 text-[#F0CE7A] flex items-center justify-center"><Ticket size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Stowaways</p>
                    <p className="text-[11px] text-cream/50">A similar but different word.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Stowaways" disabled={playerCount < MIN_PLAYERS || stowaways <= 1} onClick={() => setStowaways(s => s - 1)}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{stowaways}</span>
                  <button type="button" className={stepBtn} aria-label="More Stowaways" disabled={playerCount < MIN_PLAYERS || !rolesValid(playerCount, stowaways + 1, lost)} onClick={() => setStowaways(s => s + 1)}><Plus size={14} weight="bold" /></button>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-rose-400/20 text-rose-300 flex items-center justify-center"><Question size={16} weight="duotone" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight">Lost Soul</p>
                    <p className="text-[11px] text-cream/50">No word at all. Blends in.</p>
                  </div>
                  <button type="button" className={stepBtn} aria-label="Fewer Lost Souls" disabled={playerCount < MIN_PLAYERS || lost <= 0} onClick={() => setLost(l => l - 1)}><Minus size={14} weight="bold" /></button>
                  <span className="font-display text-xl font-extrabold text-white tabular-nums w-6 text-center">{lost}</span>
                  <button type="button" className={stepBtn} aria-label="More Lost Souls" disabled={playerCount < MIN_PLAYERS || lost >= maxLost(playerCount) || !rolesValid(playerCount, stowaways, lost + 1)} onClick={() => setLost(l => l + 1)}><Plus size={14} weight="bold" /></button>
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
                  { k: 'hide', on: hideCounts, set: setHideCounts, t: 'Hide the counts', d: 'Nobody knows if a Lost Soul exists. Much more tense.' },
                  { k: 'chal', on: useChallenges, set: setUseChallenges, t: 'Clue challenge cards', d: 'A twist on how everyone gives a clue each round.' },
                  { k: 'dare', on: useDares, set: setUseDares, t: 'Trip dares', d: 'The losing side draws a silly dare.' },
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

          {/* ── Round: clues ── */}
          {phase === 'round' && speaker && round && (
            <div className="relative">
              <div className="flex items-center gap-3 mb-3 pr-12">
                <div className={`${glass} flex-1 px-3.5 py-2`}>
                  <p className={eyebrow}>Round {roundNo} · Stop {stopNo}</p>
                  <p className="text-xs text-cream/70 leading-snug mt-0.5">{countLine}</p>
                </div>
                <TimerRing secondsLeft={secondsLeft} progress={1 - secondsLeft / SPEAK_SECONDS} lowAt={5} />
              </div>

              {useChallenges && (
                <div className="rounded-2xl bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-2.5 mb-3">
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]"><Sparkle size={11} weight="fill" /> Clue challenge</p>
                  <p className="font-display text-base font-extrabold text-white leading-tight">{round.challenge.title}</p>
                  <p className="text-xs text-cream/70">{round.challenge.text}</p>
                </div>
              )}

              <motion.div key={speakPos} initial={reduce ? false : { scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`${glass} text-center py-5 mb-3`}>
                <p className={eyebrow}>{speakPos === 0 ? 'Starts the round' : 'Now speaking'}</p>
                <p className={`font-display text-3xl font-extrabold leading-tight ${GOLD_GRAD_TEXT}`}>{speaker.name}</p>
                <p className="text-xs text-cream/50 mt-1">One clue. Do not say your word.</p>
              </motion.div>

              <div className="flex flex-wrap gap-1.5 mb-4" aria-label="Speaking order">
                {order.map((si, k) => (
                  <span key={si} className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${k === speakPos ? 'bg-gold/25 border-gold/60 text-[#F0CE7A]' : k < speakPos ? 'bg-white/[0.04] border-white/10 text-cream/35 line-through' : 'bg-white/[0.07] border-white/15 text-cream/70'}`}>{seats[si].name}</span>
                ))}
              </div>

              <div className="flex gap-2">
                {!timing
                  ? <button type="button" onClick={() => { setTiming(true); play('go'); }} className={`${ghostBtn} !w-auto px-5`}><Lightning size={16} weight="fill" /> Timer</button>
                  : <button type="button" onClick={() => { setTiming(false); secondsRef.current = SPEAK_SECONDS; setSecondsLeft(SPEAK_SECONDS); }} className={`${ghostBtn} !w-auto px-5`}>Reset</button>}
                <button type="button" onClick={nextSpeaker} className={primaryBtn}>
                  {speakPos + 1 >= order.length ? 'Time to vote' : 'Next speaker'} <ArrowRight size={16} weight="bold" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-3">
                {speakPos + 1 < order.length
                  ? <button type="button" onClick={() => { setTiming(false); setPhase('vote'); }} className="text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Skip to the vote</button>
                  : <span />}
                <button type="button" onClick={toggleMute} className={iconBtn} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
                  {muted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* ── Vote ── */}
          {phase === 'vote' && (
            <div className="relative">
              <div className="pr-12 mb-3">
                <p className={eyebrow}>Round {roundNo} · Stop {stopNo}</p>
                <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Who goes offboard?</h2>
                <p className="text-xs text-cream/60">Talk it out, then tap the person the group picked.</p>
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
                    {aliveIdx.filter(i => i !== selected).map(i => (
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
              <h2 className="font-display text-3xl font-extrabold text-white leading-tight">{out.name} was the Lost Soul</h2>
              <p className="text-sm text-cream/65 mt-2 mb-5 px-4">{out.name}, say your guess for the Explorers' word out loud. The group decides if it is right.</p>
              <p className="text-xs text-cream/45 mb-5 px-4">Close enough counts. Spelling does not matter.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => judgeGuess(false)} className={`${ghostBtn} !py-4`}><XCircle size={20} weight="fill" className="text-rose-300" /> Wrong</button>
                <button type="button" onClick={() => judgeGuess(true)} className={`${primaryBtn} !py-4`}><CheckCircle size={20} weight="fill" /> Correct</button>
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
                {outcome === 'explorers' ? 'Explorers win!' : outcome === 'stowaways' ? 'The Stowaways got away!' : 'The Lost Soul stole it!'}
              </h2>
              <p className="text-sm text-cream/60 mt-1 mb-3">
                {outcome === 'explorers' ? 'Every sneaky traveller was offboarded.' : outcome === 'stowaways' ? 'They blended in until the end.' : 'One lucky guess flipped the whole round.'}
              </p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className={`${glass} py-2.5`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Explorers had</p>
                  <p className="font-display text-lg font-extrabold text-white leading-tight px-2">{round.explorerWord}</p>
                </div>
                <div className={`${glass} py-2.5`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">Stowaways had</p>
                  <p className="font-display text-lg font-extrabold text-[#F0CE7A] leading-tight px-2">{round.stowawayWord}</p>
                </div>
              </div>
              <p className="text-[11px] text-cream/40 mb-3">{CATEGORY_LABEL[round.pair.category]} · {seats.filter(s => s.role === 'lost').length > 0 ? `${seats.filter(s => s.role === 'lost').map(s => s.name).join(' & ')} ${seats.filter(s => s.role === 'lost').length > 1 ? 'were' : 'was'} the Lost Soul` : 'No Lost Soul this round'}</p>

              <ul className={`${glass} text-left divide-y divide-white/10 mb-3`}>
                {[...seats].sort((x, y) => (gained[y.name] ?? 0) - (gained[x.name] ?? 0)).map(s => (
                  <li key={s.name} className="flex items-center gap-2.5 px-3 py-2">
                    <span className={`w-6 h-6 shrink-0 rounded-full bg-gradient-to-br ${ROLE_TONE[s.role]} flex items-center justify-center`} aria-hidden="true">
                      {s.role === 'explorer' ? <Eye size={13} weight="bold" /> : s.role === 'stowaway' ? <Ticket size={13} weight="bold" /> : <Skull size={13} weight="bold" />}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{s.name}</span>
                    <span className="text-[11px] text-cream/50">{ROLE_LABEL[s.role]}</span>
                    <span className={`w-9 text-right font-display font-extrabold tabular-nums ${(gained[s.name] ?? 0) > 0 ? 'text-emerald-300' : 'text-cream/30'}`}>+{gained[s.name] ?? 0}</span>
                  </li>
                ))}
              </ul>

              {dare && (
                <div className="rounded-2xl bg-gradient-to-br from-primary/40 to-secondary/25 border border-gold/30 px-3.5 py-3 mb-3 text-left">
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F0CE7A]"><Gift size={11} weight="fill" /> Trip dare for the {outcome === 'explorers' ? 'Stowaways' : 'Explorers'}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{dare}</p>
                </div>
              )}

              <p className="text-[11px] text-cream/45 mb-3">Points: Explorers +{POINTS.explorerWin}, a surviving Stowaway +{POINTS.stowawaySurvive}, a Lost Soul steal +{POINTS.lostSteal}.</p>

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
