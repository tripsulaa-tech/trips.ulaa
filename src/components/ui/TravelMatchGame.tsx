import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, ArrowCounterClockwise, ShareNetwork, WhatsappLogo, Star, Backpack, Tent, Compass,
  Camera, MapTrifold, Mountains, Campfire, Binoculars, Airplane, Boat, Island, Jeep,
  Lighthouse, Umbrella, Van, SpeakerHigh, SpeakerSlash, Trophy, Eye, Fire, Timer,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import Modal from './Modal';
import { WHATSAPP_NUMBER, SITE_HOST, SITE_ORIGIN } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { ScoreRing, Confetti, GameTile, TimerRing, NameField, BrandMark } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, shareCardImage, cleanName, loadPlayerName, savePlayerName } from './gameUi';

// "Travel match": a memory game for Coming Soon trips. Cards start face down;
// flip two at a time. A matching pair vanishes, a miss flips back. Clear four
// levels (16 → 30 cards) before each countdown ends. Chain matches for a
// streak bonus; spare seconds are bonus points.
// Front-end only: best score and the sound setting live in localStorage,
// sounds are synthesised (see gameAudio.ts), the share button makes a
// score-card image (see packBagScoreCard.ts).

interface Face { Icon: PhosphorIcon; label: string }
type CardState = 'down' | 'up' | 'matched' | 'gone';
interface DealtCard extends Face { uid: number; key: number; state: CardState }

const FACES: Face[] = [
  { Icon: Backpack, label: 'Backpack' },
  { Icon: Tent, label: 'Tent' },
  { Icon: Compass, label: 'Compass' },
  { Icon: Camera, label: 'Camera' },
  { Icon: MapTrifold, label: 'Map' },
  { Icon: Mountains, label: 'Mountains' },
  { Icon: Campfire, label: 'Campfire' },
  { Icon: Binoculars, label: 'Binoculars' },
  { Icon: Airplane, label: 'Airplane' },
  { Icon: Boat, label: 'Boat' },
  { Icon: Island, label: 'Island' },
  { Icon: Jeep, label: 'Jeep' },
  { Icon: Lighthouse, label: 'Lighthouse' },
  { Icon: Umbrella, label: 'Umbrella' },
  { Icon: Van, label: 'Van' },
];

type Cols = 4 | 5 | 6;
interface LevelDef { pairs: number; cols: Cols; seconds: number }
const LEVELS: LevelDef[] = [
  { pairs: 8, cols: 4, seconds: 60 },   // 16 cards
  { pairs: 10, cols: 5, seconds: 75 },  // 20 cards
  { pairs: 12, cols: 6, seconds: 90 },  // 24 cards
  { pairs: 15, cols: 6, seconds: 110 }, // 30 cards
];
const COLS_CLASS: Record<Cols, string> = { 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' };
const ICON_SIZE: Record<Cols, number> = { 4: 36, 5: 30, 6: 24 };

const MATCH_POINTS = 20;
const STREAK_STEP = 5;     // extra points per match already in the streak
const STREAK_CAP = 6;
const TIME_BONUS = 3;      // points per second left
const RING_MAX = 1200;     // score that fills the ring
const MUTE_KEY = 'ulaa:packbag:muted'; // shared with Pack the bag: one sound setting

const cardCount = (l: LevelDef) => l.pairs * 2;

function rating(cleared: number): { title: string; blurb: string; stars: number } {
  if (cleared >= LEVELS.length) return { title: 'Master Navigator', blurb: 'All four boards cleared. A memory like a map!', stars: 3 };
  if (cleared >= 2) return { title: 'Seasoned wanderer', blurb: 'Sharp eyes. One more level and you are a master.', stars: 2 };
  if (cleared >= 1) return { title: 'Fresh explorer', blurb: 'Every route gets easier the second time. Go again!', stars: 1 };
  return { title: 'Warming up', blurb: 'Beat the clock next time. You have got this!', stars: 0 };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(levelIdx: number): DealtCard[] {
  const faces = shuffle(FACES).slice(0, LEVELS[levelIdx].pairs);
  return shuffle(faces.flatMap((f, i) =>
    [0, 1].map(n => ({ ...f, uid: i * 2 + n, key: i, state: 'down' as const }))));
}

interface TravelMatchGameProps {
  tripId: string;
  tripSlug: string;
  tripTitle: string;
  className?: string;
  compact?: boolean;
}

export default function TravelMatchGame({ tripId, tripSlug, tripTitle, className = '', compact = false }: TravelMatchGameProps) {
  const bestKey = `ulaa:travelmatch:${tripId}`;
  const reduce = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'between' | 'done'>('idle');
  const [level, setLevel] = useState(0);
  const [cards, setCards] = useState<DealtCard[]>([]);
  const [timeLeft, setTimeLeft] = useState(LEVELS[0].seconds);
  const [found, setFound] = useState(0);
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [levelPoints, setLevelPoints] = useState(0);
  const [timeBonus, setTimeBonus] = useState(0);
  const [pop, setPop] = useState<{ id: number; text: string } | null>(null);
  const [best, setBest] = useState<number>(() => {
    try { return Number(localStorage.getItem(bestKey)) || 0; } catch { return 0; }
  });
  const [prevBest, setPrevBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [name, setName] = useState(loadPlayerName);
  const playerName = cleanName(name);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const mutedRef = useRef(muted);
  const lockRef = useRef(false);
  const firstRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const timeLeftRef = useRef(LEVELS[0].seconds);
  const foundRef = useRef(0);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const clearedRef = useRef(0);
  const levelPointsRef = useRef(0);
  const popIdRef = useRef(0);
  const bestRef = useRef(best);
  const timersRef = useRef<number[]>([]);
  const cardBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const { ensure, play } = useSynth(mutedRef);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    timersRef.current = [];
  }, []);
  const later = (ms: number, fn: () => void) => { timersRef.current.push(window.setTimeout(fn, ms)); };

  // Ends the run (time ran out, or all levels cleared) and records the best.
  const endRun = useCallback((won: boolean) => {
    clearTimers();
    const sc = scoreRef.current;
    const prev = bestRef.current;
    if (sc > prev) {
      bestRef.current = sc;
      setBest(sc);
      try { localStorage.setItem(bestKey, String(sc)); } catch { /* not remembered */ }
    }
    setPrevBest(prev);
    setIsNewBest(prev > 0 && sc > prev);
    setScore(sc);
    setStarted(false);
    setPhase('done');
    play(won ? 'win' : 'end');
  }, [bestKey, clearTimers, play]);

  // Countdown: starts on the first flip of each level.
  useEffect(() => {
    if (phase !== 'playing' || !started) return;
    const id = window.setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current > 0 && timeLeftRef.current <= 5) play('tick');
      if (timeLeftRef.current <= 0) endRun(false);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, started, endRun, play]);

  // Build the score card as soon as the run ends so sharing is instant.
  useEffect(() => {
    if (phase !== 'done') return;
    let cancelled = false;
    const rt = rating(cleared);
    void buildScoreCard({
      score, stars: rt.stars, title: rt.title, tripTitle, host: SITE_HOST, best, isNewBest,
      eyebrow: 'TRAVEL MATCH  ·  MEMORY CHALLENGE',
      ringMax: RING_MAX,
      playerName,
      tiles: [
        { v: `${cleared}/${LEVELS.length}`, l: 'LEVELS' },
        { v: `×${bestStreak}`, l: 'BEST STREAK' },
        { v: String(Math.max(best, score)), l: 'PERSONAL BEST' },
      ],
    }).then(blob => {
      if (cancelled || !blob) return;
      cardBlobRef.current = blob;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      setPreviewUrl(previewUrlRef.current);
    }).catch(() => { /* share falls back to text */ });
    return () => { cancelled = true; };
  }, [phase, score, cleared, bestStreak, best, isNewBest, tripTitle, playerName]);

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

  const startLevel = (lv: number) => {
    clearTimers();
    lockRef.current = false;
    firstRef.current = null;
    foundRef.current = 0;
    levelPointsRef.current = 0;
    levelRef.current = lv;
    timeLeftRef.current = LEVELS[lv].seconds;
    setLevel(lv);
    setFound(0);
    setLevelPoints(0);
    setTimeLeft(LEVELS[lv].seconds);
    setStarted(false);
    setPop(null);
    setCards(deal(lv));
    setPhase('playing');
  };

  const begin = () => {
    ensure();
    savePlayerName(name);
    scoreRef.current = 0; streakRef.current = 0; bestStreakRef.current = 0; clearedRef.current = 0;
    setScore(0); setStreak(0); setBestStreak(0); setCleared(0); setIsNewBest(false); setTimeBonus(0);
    setPreviewUrl(null); cardBlobRef.current = null;
    startLevel(0);
  };

  const close = () => { clearTimers(); setOpen(false); setPhase('idle'); setStarted(false); };

  // All pairs on the board found: bank the time bonus, then next level or finish.
  const completeLevel = () => {
    const bonus = Math.max(0, timeLeftRef.current) * TIME_BONUS;
    scoreRef.current += bonus;
    setScore(scoreRef.current);
    setTimeBonus(bonus);
    clearedRef.current += 1;
    setCleared(clearedRef.current);
    if (levelRef.current >= LEVELS.length - 1) { endRun(true); return; }
    play('win');
    setPhase('between');
  };

  const flip = (idx: number) => {
    if (phase !== 'playing' || lockRef.current) return;
    if (cards[idx].state !== 'down') return;
    if (!started) setStarted(true);
    play('flip');
    setCards(cs => cs.map((c, k) => (k === idx ? { ...c, state: 'up' } : c)));

    const first = firstRef.current;
    if (first === null) { firstRef.current = idx; return; }

    firstRef.current = null;
    lockRef.current = true;
    const setBoth = (state: CardState) =>
      setCards(cs => cs.map((c, k) => (k === first || k === idx ? { ...c, state } : c)));

    if (cards[first].key === cards[idx].key) {
      later(450, () => {
        play('good');
        setBoth('matched');
        foundRef.current += 1;
        setFound(foundRef.current);
        streakRef.current += 1;
        setStreak(streakRef.current);
        if (streakRef.current > bestStreakRef.current) {
          bestStreakRef.current = streakRef.current;
          setBestStreak(streakRef.current);
        }
        const pts = MATCH_POINTS + Math.min(streakRef.current - 1, STREAK_CAP) * STREAK_STEP;
        scoreRef.current += pts;
        levelPointsRef.current += pts;
        setScore(scoreRef.current);
        setLevelPoints(levelPointsRef.current);
        popIdRef.current += 1;
        setPop({ id: popIdRef.current, text: `+${pts}` });
        lockRef.current = false;
        if (foundRef.current === LEVELS[levelRef.current].pairs) {
          setStarted(false); // freeze the clock while the last pair vanishes
          later(1100, completeLevel);
        }
      });
      later(1000, () => setBoth('gone'));
    } else {
      streakRef.current = 0;
      setStreak(0);
      later(850, () => { play('miss'); setBoth('down'); lockRef.current = false; });
    }
  };

  const def = LEVELS[level];
  const r = rating(cleared);
  const allCleared = cleared >= LEVELS.length;
  const shareUrl = `${SITE_ORIGIN}/trips/${tripSlug}`;
  const shareText = playerName
    ? `${playerName} cleared ${cleared}/${LEVELS.length} levels of Ulaa's "Travel match" for ${tripTitle} and scored ${score}! Think you can beat that? ${shareUrl}`
    : `I cleared ${cleared}/${LEVELS.length} levels of Ulaa's "Travel match" for ${tripTitle} and scored ${score}! Think you can beat me? ${shareUrl}`;

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    let blob: Blob | null = cardBlobRef.current;
    if (!blob) {
      try {
        blob = await buildScoreCard({
          score, stars: r.stars, title: r.title, tripTitle, host: SITE_HOST, best, isNewBest,
          eyebrow: 'TRAVEL MATCH  ·  MEMORY CHALLENGE', ringMax: RING_MAX, playerName,
          tiles: [
            { v: `${cleared}/${LEVELS.length}`, l: 'LEVELS' },
            { v: `×${bestStreak}`, l: 'BEST STREAK' },
            { v: String(Math.max(best, score)), l: 'PERSONAL BEST' },
          ],
        });
      } catch { blob = null; }
    }
    setSharing(false);
    await shareCardImage(blob, {
      filename: 'ulaa-travel-match.png',
      title: 'Travel match',
      text: shareText,
      fallbackLink: getWhatsAppLink('', shareText),
    });
  };
  const notifyHref = getWhatsAppLink(WHATSAPP_NUMBER, `Hi Ulaa! Please let me know when "${tripTitle}" opens for booking.`);

  const flipTransition = { duration: reduce ? 0 : 0.42, ease: 'easeOut' as const };

  return (
    <div className={className}>
      <GameTile
        onClick={() => setOpen(true)}
        compact={compact}
        Icon={Compass}
        accent="gold"
        title="Travel match"
        subtitle={best > 0 ? `Your best: ${best}` : 'Flip, match, vanish'}
        chip="New · Memory"
      />

      <Modal isOpen={open} onClose={close} ariaLabel="Travel match game" size="sm" flush>
        <div className="relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream p-4 pt-5 min-h-[28rem]">
          <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
          <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

          {/* ── Start screen ── */}
          {phase === 'idle' && (
            <div className="relative text-center pt-3">
              <BrandMark />
              <motion.div
                className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              >
                <Compass size={46} weight="duotone" />
              </motion.div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Memory challenge</span>
              <h2 className="font-display text-4xl font-extrabold text-white leading-tight">Travel match</h2>
              <p className="text-sm text-cream/60 mt-1 mb-4 px-6 line-clamp-2">A memory game while {tripTitle} gets ready</p>

              <div className="flex items-center justify-center gap-1.5 mb-4" aria-label="Four levels, 16 to 30 cards">
                {LEVELS.map((l, i) => (
                  <span key={i} className="flex flex-col items-center rounded-xl bg-white/[0.06] border border-white/10 px-3 py-1.5 min-w-[3.4rem]">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-cream/50">Lv {i + 1}</span>
                    <span className="font-display text-sm font-extrabold text-[#F0CE7A] tabular-nums">{cardCount(l)}</span>
                  </span>
                ))}
              </div>

              <ul className={`${glass} text-left divide-y divide-white/10 mb-4`}>
                <li className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-primary/25 text-[#F4B183] flex items-center justify-center"><Eye size={16} weight="duotone" /></span>
                  <span>Cards start <strong className="text-white">face down</strong>. Tap two to peek. A match <strong className="text-white">vanishes</strong>.</span>
                </li>
                <li className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-gold/20 text-[#F0CE7A] flex items-center justify-center"><Fire size={16} weight="fill" /></span>
                  <span>Chain matches for a <strong className="text-white">streak bonus</strong>. One miss resets it.</span>
                </li>
                <li className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-secondary/25 text-[#F4B183] flex items-center justify-center"><Timer size={16} weight="duotone" /></span>
                  <span>Each level has a countdown. <strong className="text-white">Spare seconds</strong> are bonus points.</span>
                </li>
              </ul>

              {best > 0 && (
                <p className="inline-flex items-center gap-1.5 text-sm text-cream/70 mb-3">
                  <Trophy size={16} weight="fill" className="text-[#F0CE7A]" /> Your best <strong className="text-[#F0CE7A]">{best}</strong>. Can you beat it?
                </p>
              )}
              <NameField value={name} onChange={setName} onEnter={begin} />
              <button type="button" onClick={begin} className={primaryBtn}><Play size={18} weight="fill" /> Start matching</button>
              <button type="button" onClick={toggleMute} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
              </button>
            </div>
          )}

          {/* ── Playing ── */}
          {phase === 'playing' && (
            <div className="relative">
              {/* HUD (right padding keeps clear of the modal's close button) */}
              <div className="flex items-center gap-3 mb-2.5 pr-12">
                <div className={`${glass} flex-1 px-3.5 py-2`}>
                  <p className={eyebrow}>Score</p>
                  <motion.p key={score} initial={reduce ? false : { scale: 1.2 }} animate={{ scale: 1 }} className="origin-left font-display text-3xl font-extrabold leading-none text-white tabular-nums">{score}</motion.p>
                </div>
                <TimerRing secondsLeft={Math.max(0, timeLeft)} progress={1 - Math.max(0, timeLeft) / def.seconds} lowAt={10} />
              </div>

              {/* Level + streak */}
              <div className="flex items-center justify-between mb-2.5 h-7">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-gold/15 border border-gold/30 text-[#F0CE7A] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">Level {level + 1}/{LEVELS.length}</span>
                  <span className="text-xs font-bold text-cream/60 tabular-nums">{found}/{def.pairs} pairs</span>
                </div>
                <AnimatePresence>
                  {streak >= 2 && (
                    <motion.span
                      key="streak"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-secondary to-primary text-white font-extrabold text-xs px-2.5 py-1 shadow-[0_0_14px_rgba(217,138,58,0.6)]"
                    >
                      <Fire size={12} weight="fill" /> Streak ×{streak}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Board */}
              <div className="relative rounded-3xl bg-black/20 border border-white/10 p-2 shadow-[inset_0_0_40px_rgba(0,0,0,0.35)]">
                <div className={`grid ${COLS_CLASS[def.cols]} gap-1.5`}>
                  {cards.map((c, i) => {
                    const faceUp = c.state !== 'down';
                    return (
                      <button
                        key={c.uid}
                        type="button"
                        onClick={() => flip(i)}
                        disabled={c.state === 'gone'}
                        aria-label={faceUp ? c.label : `Card ${i + 1}, face down`}
                        className={`relative aspect-square ${c.state === 'gone' ? 'pointer-events-none' : ''}`}
                        style={{ perspective: 700 }}
                      >
                        <AnimatePresence>
                          {c.state !== 'gone' && (
                            <motion.div
                              key={c.uid}
                              className="absolute inset-0"
                              style={{ transformStyle: 'preserve-3d' }}
                              initial={false}
                              animate={{ rotateY: faceUp ? 180 : 0, scale: c.state === 'matched' ? 1.1 : 1 }}
                              exit={{ scale: 0, opacity: 0, rotate: reduce ? 0 : 12 }}
                              transition={flipTransition}
                            >
                              {/* Back (face down) */}
                              <div
                                className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.16] to-white/[0.05] border border-white/15 flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.3)] active:scale-95 transition-transform"
                                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                              >
                                <span className="font-display text-base font-extrabold text-[#F0CE7A]/50 select-none">U</span>
                              </div>
                              {/* Front (picture) */}
                              <div
                                className={`absolute inset-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#FFF6DD] to-[#F0CE7A] text-primary border ${c.state === 'matched' ? 'border-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.7)]' : 'border-[#F0CE7A]'}`}
                                style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                              >
                                <c.Icon size={ICON_SIZE[def.cols]} weight="duotone" aria-hidden="true" />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {pop && (
                    <motion.span
                      key={pop.id}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 pointer-events-none font-display text-3xl font-extrabold text-emerald-300 [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]"
                      initial={{ y: 10, opacity: 0, scale: 0.7 }}
                      animate={{ y: reduce ? 0 : -24, opacity: [0, 1, 0], scale: 1.1 }}
                      transition={{ duration: 0.9 }}
                    >
                      {pop.text}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-cream/50">{started ? 'Find every pair before time runs out.' : 'Tap any card to start the clock.'}</p>
                <button type="button" onClick={toggleMute} className={iconBtn} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
                  {muted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* ── Between levels ── */}
          {phase === 'between' && (
            <div className="relative text-center pt-4">
              {!reduce && <Confetti />}
              <motion.div
                initial={reduce ? false : { scale: 0.4, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 12 }}
                className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                aria-hidden="true"
              >
                <Star size={44} weight="fill" />
              </motion.div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Level {level + 1} cleared</span>
              <p className={`font-display text-5xl font-extrabold tabular-nums ${GOLD_GRAD_TEXT}`}>{score}</p>
              <p className={`${eyebrow} mt-1 mb-4`}>Total points</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { v: `+${levelPoints}`, l: 'Matches' },
                  { v: `+${timeBonus}`, l: 'Time bonus' },
                  { v: `×${bestStreak}`, l: 'Best streak' },
                ].map(s => (
                  <div key={s.l} className={`${glass} py-2.5`}>
                    <p className="font-display text-xl font-extrabold text-white tabular-nums">{s.v}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">{s.l}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-cream/70 mb-4">
                Next: <strong className="text-white">Level {level + 2}</strong> with <strong className="text-[#F0CE7A]">{cardCount(LEVELS[level + 1])} cards</strong> and {LEVELS[level + 1].seconds} seconds.
              </p>
              <button type="button" onClick={() => startLevel(level + 1)} className={primaryBtn}><Play size={18} weight="fill" /> Start level {level + 2}</button>
              <button type="button" onClick={() => endRun(false)} className="mt-3 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">Bank my score and stop</button>
            </div>
          )}

          {/* ── Result ── */}
          {phase === 'done' && (
            <div className="relative text-center pt-1">
              {!reduce && (r.stars >= 2 || isNewBest) && <Confetti />}
              <span className={`inline-block text-[11px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1 mb-3 ${isNewBest ? 'bg-gradient-to-r from-[#F0CE7A] to-gold text-dark' : 'bg-white/10 text-cream/70 border border-white/15'}`}>
                {isNewBest ? 'New best!' : allCleared ? 'All levels cleared' : timeLeft > 0 ? 'Score banked' : "Time's up"}
              </span>

              <ScoreRing score={score} reduce={!!reduce} max={RING_MAX} />

              <div className="flex justify-center gap-1.5 mt-2 mb-2" aria-label={`${r.stars} out of 3 stars`}>
                {[1, 2, 3].map(n => (
                  <motion.span
                    key={n}
                    initial={reduce ? false : { scale: 0, rotate: -40 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.5 + n * 0.18, type: 'spring', stiffness: 260, damping: 12 }}
                  >
                    <Star size={32} weight="fill" className={n <= r.stars ? 'text-[#F0CE7A] drop-shadow-[0_0_10px_rgba(240,206,122,0.6)]' : 'text-white/15'} />
                  </motion.span>
                ))}
              </div>

              <p className={`font-display text-2xl font-extrabold ${GOLD_GRAD_TEXT}`}>{r.title}</p>
              <p className="text-sm text-cream/60 mt-0.5">{r.blurb}</p>
              {!isNewBest && prevBest > 0 && (
                <p className="text-sm text-[#F0CE7A] font-medium mt-1">
                  {prevBest - score <= 60 ? `So close! Just ${prevBest - score + 1} more to beat your best.` : `Your best is ${prevBest}. Go get it!`}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 mt-4 mb-3">
                {[
                  { v: `${cleared}/${LEVELS.length}`, l: 'Levels' },
                  { v: `×${bestStreak}`, l: 'Best streak' },
                  { v: String(Math.max(best, score)), l: 'Your best' },
                ].map(s => (
                  <div key={s.l} className={`${glass} py-2.5`}>
                    <p className="font-display text-xl font-extrabold text-white tabular-nums">{s.v}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/50">{s.l}</p>
                  </div>
                ))}
              </div>

              {/* Score-card preview doubles as the share button */}
              <button
                type="button"
                onClick={() => void share()}
                disabled={sharing}
                className={`${glass} group w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/10 transition-colors disabled:opacity-70 mb-3`}
              >
                <span className="relative w-14 shrink-0 aspect-[4/5] rounded-lg overflow-hidden bg-white/10 border border-white/15">
                  {previewUrl
                    ? <img src={previewUrl} alt="Your score card" className="absolute inset-0 w-full h-full object-cover" />
                    : <span className="absolute inset-0 animate-pulse bg-white/10" aria-hidden="true" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white">{sharing ? 'Preparing…' : 'Share your score card'}</span>
                  <span className="block text-xs text-cream/55">Post it and dare your friends to beat you.</span>
                </span>
                <span className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-b from-primary-light to-primary text-white flex items-center justify-center group-hover:scale-105 transition-transform" aria-hidden="true">
                  <ShareNetwork size={18} weight="bold" />
                </span>
              </button>

              <button type="button" onClick={begin} className={`${primaryBtn} mb-3`}><ArrowCounterClockwise size={18} weight="bold" /> Play again</button>
              <button type="button" onClick={() => { clearTimers(); setPhase('idle'); }} className={`${ghostBtn} mb-4`}>Back to menu</button>

              <a
                href={notifyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F0CE7A] hover:text-white transition-colors"
              >
                <WhatsappLogo size={16} weight="fill" aria-hidden="true" />
                Notify me when this trip opens
              </a>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
