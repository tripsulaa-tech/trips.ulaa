import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import {
  Play, Pause, ArrowCounterClockwise, ShareNetwork, WhatsappLogo, Star, Fire, Backpack,
  BatteryCharging, Drop, FirstAid, Sun, Sneaker, Boot, CloudRain, Footprints, Flashlight,
  Sunglasses, Waves, BaseballCap, Hand, Snowflake, Thermometer, Camera, Wind, HighHeel,
  SuitcaseRolling, Television, Guitar, Hamburger, Laptop, Hourglass, Magnet, SpeakerHigh,
  SpeakerSlash, HandTap, Trophy,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import Modal from './Modal';
import { WHATSAPP_NUMBER, SITE_HOST, SITE_ORIGIN } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';
import { buildScoreCard } from './packBagScoreCard';
import { useSynth } from './gameAudio';
import { ScoreRing, Confetti, GameTile, TimerRing, NameField } from './gameParts';
import { GOLD_GRAD_TEXT, primaryBtn, ghostBtn, iconBtn, glass, eyebrow, cleanName, loadPlayerName, savePlayerName } from './gameUi';

// "Pack the bag": a 30-second tap game for Coming Soon trips. Things fall;
// tap what you'd really pack for THIS trip, skip the rest. Chain correct taps
// for a combo, grab the golden star, use the hourglass (slow-mo) and magnet
// (packs everything useful on screen) power-ups, and beat your best.
// Front-end only: best score and settings live in localStorage, sounds are
// synthesised with the Web Audio API (no audio files), the share button makes
// a score-card image (see packBagScoreCard.ts), and "notify me" is a
// prefilled WhatsApp message.
// No backend, no discounts promised.

interface PackItem { Icon: PhosphorIcon; label: string }
interface Profile { good: PackItem[]; bad: PackItem[] }

// Refined line icons (Phosphor duotone). Good and bad items share exactly the
// same look, so the game stays a real "spot the right one".
const BAD: PackItem[] = [
  { Icon: HighHeel, label: 'High heels' },
  { Icon: SuitcaseRolling, label: 'Giant suitcase' },
  { Icon: Television, label: 'Television' },
  { Icon: Guitar, label: 'Guitar' },
  { Icon: Hamburger, label: 'Fast food' },
  { Icon: Laptop, label: 'Work laptop' },
];

const COMMON: PackItem[] = [
  { Icon: BatteryCharging, label: 'Power bank' },
  { Icon: Drop, label: 'Water bottle' },
  { Icon: FirstAid, label: 'First-aid kit' },
  { Icon: Sun, label: 'Sunscreen' },
];

// Pick a themed set from the trip title; falls back to a general one.
function profileFor(title: string): Profile {
  const t = title.toLowerCase();
  if (/waterfall|trek|forest|wild|jungle|falls|hike|trail/.test(t)) {
    return { good: [...COMMON, { Icon: Sneaker, label: 'Trek shoes' }, { Icon: CloudRain, label: 'Rain jacket' }, { Icon: Footprints, label: 'Quick-dry socks' }, { Icon: Flashlight, label: 'Torch' }], bad: BAD };
  }
  if (/beach|island|lanka|goa|coast|sea/.test(t)) {
    return { good: [...COMMON, { Icon: Sunglasses, label: 'Sunglasses' }, { Icon: Waves, label: 'Swimwear' }, { Icon: BaseballCap, label: 'Sun cap' }, { Icon: Footprints, label: 'Flip-flops' }], bad: BAD };
  }
  if (/snow|himalaya|ladakh|spiti|kashmir|winter|mountain|camp/.test(t)) {
    return { good: [...COMMON, { Icon: Hand, label: 'Gloves' }, { Icon: Snowflake, label: 'Warm scarf' }, { Icon: Thermometer, label: 'Thermal jacket' }, { Icon: Boot, label: 'Boots' }], bad: BAD };
  }
  return { good: [...COMMON, { Icon: Backpack, label: 'Day backpack' }, { Icon: Camera, label: 'Camera' }, { Icon: Wind, label: 'Light jacket' }, { Icon: Sneaker, label: 'Walking shoes' }], bad: BAD };
}

const DURATION = 30;      // seconds
const BASE_H = 320;       // px, reference height that fall speeds are tuned for
const ITEM = 64;          // px, hit box of a falling item
const GOOD_POINTS = 10;
const GOLD_POINTS = 30;
const BAD_POINTS = -5;
const COMBO_STEP = 3;     // correct taps in a row per extra multiplier
const MAX_MULT = 3;
const SLOW_SECONDS = 5;
const SLOW_FACTOR = 0.45;

const MUTE_KEY = 'ulaa:packbag:muted';
const SEEN_KEY = 'ulaa:packbag:seen';

function rating(score: number): { title: string; blurb: string; stars: number } {
  if (score >= 130) return { title: 'Ulaa Pro Packer', blurb: 'Nothing forgotten, nothing extra. Trip-ready!', stars: 3 };
  if (score >= 70) return { title: 'Trail-ready traveller', blurb: 'Solid packing. A couple of tweaks and you are perfect.', stars: 2 };
  return { title: 'Beginner backpacker', blurb: 'Every great trip starts with a lighter bag. Try again!', stars: 1 };
}

type Kind = 'normal' | 'golden' | 'slow' | 'magnet';
interface Falling extends PackItem { id: number; good: boolean; kind: Kind; x: number; y: number; speed: number }
interface Pop { id: number; x: number; y: number; text: string; good: boolean }
interface Flying { id: number; Icon: PhosphorIcon; golden: boolean; x: number; y: number }

const isPowerUp = (k: Kind) => k === 'slow' || k === 'magnet';

// ── Small presentational pieces ──

interface PackBagGameProps {
  tripId: string;
  tripSlug: string;
  tripTitle: string;
  coverImage?: string | null;
  className?: string;
  compact?: boolean;
  thumb?: boolean;
}

export default function PackBagGame({ tripId, tripSlug, tripTitle, coverImage, className = '', compact = false, thumb = false }: PackBagGameProps) {
  const bestKey = `ulaa:packbag:${tripId}`;
  // Memoised: the game loop effect depends on it, and a fresh object each
  // render would restart the loop every frame.
  const profile = useMemo(() => profileFor(tripTitle), [tripTitle]);
  const reduce = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'countdown' | 'playing' | 'done'>('idle');
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(3);
  const [items, setItems] = useState<Falling[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [packed, setPacked] = useState(0);
  const [bestCombo, setBestCombo] = useState(1);
  const [progress, setProgress] = useState(0);
  const [slowActive, setSlowActive] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const [best, setBest] = useState<number>(() => {
    try { return Number(localStorage.getItem(bestKey)) || 0; } catch { return 0; }
  });
  const [prevBest, setPrevBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [name, setName] = useState(loadPlayerName);
  const playerName = cleanName(name);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const itemsRef = useRef<Falling[]>([]);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const packedRef = useRef(0);
  const comboRef = useRef(1);
  const elapsedRef = useRef(0);
  const accRef = useRef(0);
  const slowLeftRef = useRef(0);
  const firstPlayRef = useRef(false);
  const firstSpawnRef = useRef(false);
  const nextId = useRef(1);
  const mutedRef = useRef(muted);
  const cardBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const stage = useAnimationControls();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const areaHRef = useRef(BASE_H);
  const [areaH, setAreaH] = useState(BASE_H);
  const bag = useAnimationControls();
  const { ensure, play, onPressCapture } = useSynth(mutedRef);

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
    if (!next) { ensure(); play('tick'); }
  };

  const reset = useCallback(() => {
    scoreRef.current = 0; streakRef.current = 0; packedRef.current = 0; comboRef.current = 1;
    elapsedRef.current = 0; accRef.current = 0; slowLeftRef.current = 0; itemsRef.current = [];
    setScore(0); setStreak(0); setPacked(0); setBestCombo(1); setProgress(0);
    setItems([]); setPops([]); setFlying([]); setFlash(null); setIsNewBest(false);
    setSlowActive(false); setPaused(false);
    setPreviewUrl(null); cardBlobRef.current = null;
  }, []);

  const begin = useCallback(() => {
    ensure(); // creating/resuming audio must happen inside this click
    savePlayerName(name);
    reset();
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* treat as first play */ }
    firstPlayRef.current = !seen;
    firstSpawnRef.current = !seen;
    setShowHint(!seen);
    if (!seen) { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* not remembered */ } }
    setCount(3);
    setPhase('countdown');
  }, [ensure, reset, name]);

  // 3 · 2 · 1 · GO, then the real game starts.
  useEffect(() => {
    if (phase !== 'countdown') return;
    play('tick');
    const ids = [
      window.setTimeout(() => { setCount(2); play('tick'); }, 800),
      window.setTimeout(() => { setCount(1); play('tick'); }, 1600),
      window.setTimeout(() => { setCount(0); play('go'); }, 2400),
      window.setTimeout(() => setPhase('playing'), 3000),
    ];
    return () => ids.forEach(clearTimeout);
  }, [phase, play]);

  // The play area fills the screen: measure it so physics match what is drawn.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || (phase !== 'countdown' && phase !== 'playing')) return;
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height) || BASE_H;
      areaHRef.current = h;
      setAreaH(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  // The first-play tip disappears on its own.
  useEffect(() => {
    if (!showHint || phase !== 'playing') return;
    const id = window.setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(id);
  }, [showHint, phase]);

  // Pause automatically if the tab/app goes to the background.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onHide = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [phase]);

  const finish = useCallback(() => {
    itemsRef.current = [];
    setItems([]);
    const final = scoreRef.current;
    setPrevBest(best);
    if (final > best) {
      setIsNewBest(best > 0);
      setBest(final);
      try { localStorage.setItem(bestKey, String(final)); } catch { /* not remembered */ }
    }
    play(rating(final).stars >= 2 ? 'win' : 'end');
    setPhase('done');
  }, [best, bestKey, play]);

  // Game loop: spawn, fall, and end after DURATION seconds of *played* time
  // (elapsed is accumulated, so pausing doesn't lose or gain time). Spawning
  // gets faster and items fall quicker as the clock runs down.
  useEffect(() => {
    if (phase !== 'playing' || paused) return;
    let raf = 0;
    let prev = performance.now();
    const spawn = (elapsed: number) => {
      let kind: Kind = 'normal';
      let good = Math.random() < 0.65;
      if (firstSpawnRef.current) {
        good = true; // first-ever item is always a right one
        firstSpawnRef.current = false;
      } else {
        const roll = Math.random();
        if (roll < 0.04) kind = 'slow';
        else if (roll < 0.08) kind = 'magnet';
        else if (good && Math.random() < 0.1) kind = 'golden';
      }
      let it: PackItem;
      if (kind === 'slow') { it = { Icon: Hourglass, label: 'Slow-mo' }; good = true; }
      else if (kind === 'magnet') { it = { Icon: Magnet, label: 'Magnet' }; good = true; }
      else if (kind === 'golden') it = { Icon: Star, label: 'Bonus' };
      else { const pool = good ? profile.good : profile.bad; it = pool[Math.floor(Math.random() * pool.length)]; }
      itemsRef.current.push({
        ...it,
        id: nextId.current++,
        good,
        kind,
        x: 3 + Math.random() * 75,
        y: -ITEM,
        speed: (120 + Math.random() * 60 + elapsed * 3.5) * (areaHRef.current / BASE_H),
      });
    };
    const tick = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      elapsedRef.current += dt;
      const elapsed = elapsedRef.current;
      if (elapsed >= DURATION) { setProgress(1); finish(); return; }
      setProgress(elapsed / DURATION);

      let mul = 1;
      if (slowLeftRef.current > 0) {
        slowLeftRef.current = Math.max(0, slowLeftRef.current - dt);
        mul = SLOW_FACTOR;
        if (slowLeftRef.current === 0) setSlowActive(false);
      }
      accRef.current += dt;
      if (accRef.current >= Math.max(0.4, 0.8 - elapsed * 0.012)) { accRef.current = 0; spawn(elapsed); }

      itemsRef.current = itemsRef.current
        .map(i => ({ ...i, y: i.y + i.speed * dt * mul }))
        .filter(i => i.y < areaHRef.current);
      setItems(itemsRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused, profile, finish]);

  // Build the score card as soon as the round ends, so the player sees
  // exactly what they are about to share (and sharing is instant).
  useEffect(() => {
    if (phase !== 'done') return;
    let cancelled = false;
    const rt = rating(score);
    void buildScoreCard({
      score, stars: rt.stars, title: rt.title, tripTitle, host: SITE_HOST,
      packed, combo: bestCombo, best, isNewBest, playerName,
    }).then(blob => {
      if (cancelled || !blob) return;
      cardBlobRef.current = blob;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      setPreviewUrl(previewUrlRef.current);
    }).catch(() => { /* share falls back to text */ });
    return () => { cancelled = true; };
  }, [phase, score, packed, bestCombo, best, isNewBest, tripTitle, playerName]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);


  const addPop = (x: number, y: number, text: string, good: boolean, id: number) => {
    setPops(p => [...p, { id, x, y, text, good }]);
    window.setTimeout(() => setPops(p => p.filter(q => q.id !== id)), 650);
  };

  // Awards one correct item (shared by a normal tap and the magnet).
  const award = (item: Falling): number => {
    streakRef.current += 1;
    const mult = Math.min(MAX_MULT, 1 + Math.floor(streakRef.current / COMBO_STEP));
    comboRef.current = Math.max(comboRef.current, mult);
    const pts = (item.kind === 'golden' ? GOLD_POINTS : GOOD_POINTS) * mult;
    packedRef.current += 1;
    scoreRef.current += pts;
    addPop(item.x, item.y, `+${pts}`, true, item.id);
    if (!reduce) {
      setFlying(f => [...f, { id: item.id, Icon: item.Icon, golden: item.kind === 'golden', x: item.x, y: item.y }]);
      window.setTimeout(() => setFlying(f => f.filter(q => q.id !== item.id)), 450);
    }
    return pts;
  };

  const tap = (item: Falling) => {
    if (phase !== 'playing' || paused) return;
    setShowHint(false);
    let flashKind: 'good' | 'bad' = 'good';

    if (item.kind === 'slow') {
      slowLeftRef.current = SLOW_SECONDS;
      setSlowActive(true);
      play('power');
      addPop(item.x, item.y, 'Slow-mo!', true, item.id);
      itemsRef.current = itemsRef.current.filter(i => i.id !== item.id);
    } else if (item.kind === 'magnet') {
      play('power');
      const pulled = itemsRef.current.filter(i => i.id !== item.id && !isPowerUp(i.kind) && i.good);
      pulled.forEach(award);
      addPop(item.x, item.y, pulled.length ? `Magnet! ×${pulled.length}` : 'Magnet!', true, item.id);
      const gone = new Set([item.id, ...pulled.map(i => i.id)]);
      itemsRef.current = itemsRef.current.filter(i => !gone.has(i.id));
      if (!reduce) void bag.start({ scale: [1, 1.3, 1], transition: { duration: 0.3 } });
    } else if (item.good) {
      award(item);
      play(item.kind === 'golden' ? 'gold' : 'good');
      if (!reduce) void bag.start({ scale: [1, 1.25, 1], transition: { duration: 0.25 } });
      itemsRef.current = itemsRef.current.filter(i => i.id !== item.id);
    } else {
      streakRef.current = 0;
      scoreRef.current = Math.max(0, scoreRef.current + BAD_POINTS);
      addPop(item.x, item.y, `${BAD_POINTS}`, false, item.id);
      play('bad');
      if (!reduce) void stage.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.3 } });
      itemsRef.current = itemsRef.current.filter(i => i.id !== item.id);
      flashKind = 'bad';
    }

    setScore(scoreRef.current);
    setStreak(streakRef.current);
    setPacked(packedRef.current);
    setBestCombo(comboRef.current);
    setItems(itemsRef.current);
    setFlash(flashKind);
    window.setTimeout(() => setFlash(null), 180);
  };

  const close = () => { setOpen(false); setPhase('idle'); setPaused(false); itemsRef.current = []; setItems([]); };

  const mult = Math.min(MAX_MULT, 1 + Math.floor(streak / COMBO_STEP));
  const secondsLeft = Math.max(0, Math.ceil(DURATION * (1 - progress)));
  const r = rating(score);
  const themed = Boolean(tripSlug);
  const forTrip = themed ? ` for ${tripTitle}` : '';
  const shareUrl = tripSlug ? `${SITE_ORIGIN}/trips/${tripSlug}` : `${SITE_ORIGIN}/games`;
  const shareText = playerName
    ? `${playerName} scored ${score} (${r.title}) in Ulaa's "Pack the bag" game${forTrip}! Think you can beat that? ${shareUrl}`
    : `I scored ${score} (${r.title}) in Ulaa's "Pack the bag" game${forTrip}! Think you can beat me? ${shareUrl}`;

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    let blob: Blob | null = cardBlobRef.current;
    if (!blob) {
      try {
        blob = await buildScoreCard({
          score, stars: r.stars, title: r.title, tripTitle, host: SITE_HOST,
          packed, combo: bestCombo, best, isNewBest, playerName,
        });
      } catch { blob = null; }
    }
    setSharing(false);

    if (blob) {
      const file = new File([blob], 'ulaa-pack-the-bag.png', { type: 'image/png' });
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Pack the bag', text: shareText });
          return;
        }
      } catch { return; /* user closed the share sheet */ }
      // No file sharing here (most desktops): save the card so it can be posted.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ulaa-pack-the-bag.png';
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    try {
      if (navigator.share) { await navigator.share({ title: 'Pack the bag', text: shareText }); return; }
    } catch { return; }
    window.open(getWhatsAppLink('', shareText), '_blank', 'noopener,noreferrer');
  };
  const notifyHref = getWhatsAppLink(WHATSAPP_NUMBER, tripSlug ? `Hi Ulaa! Please let me know when "${tripTitle}" opens for booking.` : 'Hi Ulaa! Please let me know when your next trip opens for booking.');

  // Dark, brand-matched game UI (footer brown + terracotta/gold), same
  // language as the shareable score card.
  const comboPips = mult >= MAX_MULT ? COMBO_STEP : streak % COMBO_STEP;

  return (
    <div className={className}>
      <GameTile
        onClick={() => setOpen(true)}
        compact={compact}
        thumb={thumb}
        Icon={Backpack}
        accent="gold"
        title="Pack the bag"
        subtitle={best > 0 ? `Your best: ${best}` : 'Beat the clock'}
        chip="New · 30 sec"
      />

      <Modal isOpen={open} onClose={close} ariaLabel="Pack the bag game" size="sm" flush fullScreen>
        <div onPointerDownCapture={onPressCapture} className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center">
          <div className="relative w-full max-w-md md:max-w-2xl lg:max-w-3xl flex flex-col">
          <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
          <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

          {/* ── Start screen ── */}
          {phase === 'idle' && (
            <div className="relative text-center pt-3">
              <motion.div
                className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              >
                <Backpack size={46} weight="duotone" />
              </motion.div>
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">30-second challenge</span>
              <h2 className="font-display text-4xl font-extrabold text-white leading-tight">Pack the bag</h2>
              <p className="text-sm text-cream/60 mt-1 mb-5 px-6 line-clamp-2">{themed ? `Packing for ${tripTitle}` : 'Pack what you would really take on a trip'}</p>

              <div className="grid grid-cols-2 gap-2 text-left mb-2">
                <div className="rounded-2xl bg-emerald-400/[0.08] border border-emerald-300/20 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-2">Tap these · +{GOOD_POINTS}</p>
                  <div className="flex gap-1.5">
                    {profile.good.slice(0, 4).map(g => (
                      <span key={g.label} className="w-8 h-8 rounded-xl bg-emerald-300/10 border border-emerald-300/20 text-emerald-200 flex items-center justify-center"><g.Icon size={20} weight="duotone" aria-label={g.label} /></span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-red-400/[0.08] border border-red-300/20 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-300 mb-2">Skip these · {BAD_POINTS}</p>
                  <div className="flex gap-1.5">
                    {profile.bad.slice(0, 4).map(g => (
                      <span key={g.label} className="w-8 h-8 rounded-xl bg-red-300/10 border border-red-300/20 text-red-200 flex items-center justify-center"><g.Icon size={20} weight="duotone" aria-label={g.label} /></span>
                    ))}
                  </div>
                </div>
              </div>

              <ul className={`${glass} text-left divide-y divide-white/10 mb-4`}>
                <li className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-primary/25 text-[#F4B183] flex items-center justify-center"><Fire size={16} weight="fill" /></span>
                  <span>Pack {COMBO_STEP} right in a row for <strong className="text-white">×2</strong>, and <strong className="text-white">×3</strong> after {COMBO_STEP * 2}.</span>
                </li>
                <li className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-gold/20 text-[#F0CE7A] flex items-center justify-center"><Star size={16} weight="fill" /></span>
                  <span>Golden star is worth <strong className="text-white">+{GOLD_POINTS}</strong>.</span>
                </li>
                <li className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                  <span className="w-7 h-7 shrink-0 rounded-lg bg-secondary/25 text-[#F4B183] flex items-center justify-center"><Hourglass size={16} weight="duotone" /></span>
                  <span>Hourglass slows time. Magnet packs everything useful on screen.</span>
                </li>
              </ul>

              {best > 0 && (
                <p className="inline-flex items-center gap-1.5 text-sm text-cream/70 mb-3">
                  <Trophy size={16} weight="fill" className="text-[#F0CE7A]" /> Your best <strong className="text-[#F0CE7A]">{best}</strong>. Can you beat it?
                </p>
              )}
              <NameField value={name} onChange={setName} onEnter={begin} />
              <button type="button" onClick={begin} className={primaryBtn}><Play size={18} weight="fill" /> Start packing</button>
              <button type="button" onClick={toggleMute} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
              </button>
            </div>
          )}

          {/* ── Countdown ── */}
          {phase === 'countdown' && (
            <div className="relative h-[24rem] flex flex-col items-center justify-center">
              <p className={`${eyebrow} mb-4`}>Get ready</p>
              <div className="relative w-40 h-40 flex items-center justify-center">
                {!reduce && (
                  <motion.span
                    key={`ring-${count}`}
                    className="absolute inset-0 rounded-full border-2 border-gold/60"
                    initial={{ scale: 0.6, opacity: 0.9 }}
                    animate={{ scale: 1.35, opacity: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    aria-hidden="true"
                  />
                )}
                <span className="absolute inset-2 rounded-full bg-white/[0.05] border border-white/10" aria-hidden="true" />
                <AnimatePresence mode="wait">
                  <motion.span
                    key={count}
                    className={`relative font-display text-8xl font-extrabold ${GOLD_GRAD_TEXT}`}
                    initial={reduce ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { scale: 1.6, opacity: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    {count === 0 ? 'GO!' : count}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* ── Playing ── */}
          {phase === 'playing' && (
            <div className="relative">
              {/* HUD (right padding keeps the timer clear of the modal's close button) */}
              <div className="flex items-center gap-3 mb-2.5 pr-12">
                <div className={`${glass} flex-1 px-3.5 py-2`}>
                  <p className={eyebrow}>Score</p>
                  <motion.p key={score} initial={reduce ? false : { scale: 1.25 }} animate={{ scale: 1 }} className="origin-left font-display text-3xl font-extrabold leading-none text-white tabular-nums">{score}</motion.p>
                </div>
                <TimerRing secondsLeft={secondsLeft} progress={progress} />
              </div>

              {/* Combo meter + active power-up */}
              <div className="flex items-center justify-between mb-2.5 h-7">
                <div className="flex items-center gap-2" aria-label={`Combo times ${mult}`}>
                  <span className={eyebrow}>Combo</span>
                  <motion.span
                    key={mult}
                    initial={reduce ? false : { scale: 1.5 }}
                    animate={{ scale: 1 }}
                    className={`font-display text-sm font-extrabold ${mult > 1 ? 'text-[#F0CE7A]' : 'text-cream/60'}`}
                  >
                    ×{mult}{mult >= MAX_MULT ? ' MAX' : ''}
                  </motion.span>
                  <div className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: COMBO_STEP }, (_, n) => (
                      <span key={n} className={`h-1.5 w-6 rounded-full transition-colors ${n < comboPips ? 'bg-gradient-to-r from-secondary to-[#F0CE7A]' : 'bg-white/10'}`} />
                    ))}
                  </div>
                </div>
                <AnimatePresence>
                  {slowActive && (
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-secondary to-primary text-white font-extrabold text-xs px-2.5 py-1 shadow-[0_0_14px_rgba(217,138,58,0.6)]"
                    >
                      <Hourglass size={12} weight="fill" /> Slow-mo
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Stage */}
              <motion.div
                ref={stageRef}
                animate={stage}
                className="relative h-[clamp(20rem,calc(100dvh-15rem),64rem)] rounded-3xl overflow-hidden select-none touch-none bg-gradient-to-b from-[#3A2A1F] to-[#1B130E] border border-white/10 shadow-[inset_0_0_60px_rgba(0,0,0,0.4)]"
              >
                {/* Trip-themed backdrop: the cover photo, darkened */}
                {coverImage && (
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 blur-[2px] scale-110 pointer-events-none"
                    style={{ backgroundImage: `url("${coverImage}")` }}
                    aria-hidden="true"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-footer/50 via-transparent to-footer/70 pointer-events-none" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-primary/40 to-transparent pointer-events-none" aria-hidden="true" />

                {items.map(i => {
                  const power = isPowerUp(i.kind);
                  const gold = i.kind === 'golden';
                  const tile = gold
                    ? 'bg-gradient-to-br from-[#FFF0B8] to-gold text-dark ring-2 ring-[#F0CE7A] shadow-[0_0_22px_rgba(240,206,122,0.8)]'
                    : power
                      ? 'bg-gradient-to-br from-secondary to-primary text-white ring-2 ring-white/50 shadow-[0_0_20px_rgba(217,138,58,0.75)]'
                      : 'bg-white/[0.13] text-[#F6E7C6] border border-white/20 shadow-[0_6px_12px_rgba(0,0,0,0.3)]';
                  return (
                    <button
                      key={i.id}
                      type="button"
                      data-nofx
                      onPointerDown={e => { e.preventDefault(); tap(i); }}
                      aria-label={i.label}
                      className="absolute flex flex-col items-center justify-center gap-1 leading-none will-change-transform"
                      style={{ width: ITEM, height: ITEM, left: `${i.x}%`, top: 0, transform: `translate3d(0, ${i.y}px, 0)` }}
                    >
                      <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tile}`}>
                        <i.Icon size={28} weight={gold ? 'fill' : 'duotone'} aria-hidden="true" />
                      </span>
                      <span className="whitespace-nowrap text-[10px] font-semibold text-cream/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{i.label}</span>
                    </button>
                  );
                })}

                {/* Items flying into the bag */}
                {flying.map(f => (
                  <motion.span
                    key={f.id}
                    className={`absolute pointer-events-none ${f.golden ? 'text-[#F0CE7A]' : 'text-[#F6E7C6]'}`}
                    initial={{ left: `${f.x}%`, top: f.y, scale: 1, opacity: 1 }}
                    animate={{ left: '44%', top: areaH - 64, scale: 0.3, opacity: 0 }}
                    transition={{ duration: 0.4, ease: 'easeIn' }}
                    aria-hidden="true"
                  >
                    <f.Icon size={36} weight={f.golden ? 'fill' : 'duotone'} />
                  </motion.span>
                ))}

                {pops.map(p => (
                  <motion.span
                    key={p.id}
                    className={`absolute pointer-events-none text-xl font-extrabold whitespace-nowrap [text-shadow:0_2px_6px_rgba(0,0,0,0.6)] ${p.good ? 'text-emerald-300' : 'text-red-400'}`}
                    style={{ left: `${p.x}%`, top: Math.max(p.y, 0) }}
                    initial={{ y: 0, opacity: 1, scale: 0.8 }}
                    animate={{ y: reduce ? 0 : -34, opacity: 0, scale: 1.2 }}
                    transition={{ duration: 0.6 }}
                  >
                    {p.text}
                  </motion.span>
                ))}

                {/* The bag dock */}
                <motion.div
                  animate={bag}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-md pl-2 pr-3.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)] pointer-events-none"
                  aria-hidden="true"
                >
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center">
                    <Backpack size={22} weight="duotone" />
                  </span>
                  <span className="font-display text-sm font-extrabold text-white tabular-nums">{packed}<span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-cream/60">packed</span></span>
                </motion.div>

                {flash && (
                  <div className={`absolute inset-0 pointer-events-none ${flash === 'bad' ? 'bg-red-500/25' : 'bg-emerald-400/10'}`} aria-hidden="true" />
                )}

                {/* First-play tip */}
                <AnimatePresence>
                  {showHint && !paused && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute top-3 inset-x-3 flex items-center justify-center gap-2 rounded-full bg-cream text-dark text-xs font-bold px-3 py-2 shadow-lg pointer-events-none"
                    >
                      <HandTap size={16} weight="fill" className="text-primary" /> Tap what you&apos;d really pack. Skip the rest!
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pause overlay */}
                {paused && (
                  <div className="absolute inset-0 bg-footer/85 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-6">
                    <p className="font-display text-2xl font-extrabold text-white">Paused</p>
                    <button type="button" onClick={() => setPaused(false)} className={primaryBtn}><Play size={18} weight="fill" /> Resume</button>
                    <button type="button" onClick={() => { setPaused(false); setPhase('idle'); itemsRef.current = []; setItems([]); }} className={ghostBtn}>Quit game</button>
                  </div>
                )}
              </motion.div>

              <div className="flex items-center justify-between mt-3">
                <button type="button" onClick={() => setPaused(true)} className={iconBtn} aria-label="Pause game"><Pause size={16} weight="fill" /></button>
                <p className="text-xs text-cream/50">Tap what you&apos;d pack · skip the rest</p>
                <button type="button" onClick={toggleMute} className={iconBtn} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
                  {muted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* ── Result ── */}
          {phase === 'done' && (
            <div className="relative text-center pt-1">
              {!reduce && (r.stars >= 2 || isNewBest) && <Confetti />}
              <span className={`inline-block text-[11px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1 mb-3 ${isNewBest ? 'bg-gradient-to-r from-[#F0CE7A] to-gold text-dark' : 'bg-white/10 text-cream/70 border border-white/15'}`}>
                {isNewBest ? 'New best!' : "Time's up"}
              </span>

              <ScoreRing score={score} reduce={!!reduce} />

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

              <p className="font-display text-2xl font-extrabold text-white">{r.title}</p>
              <p className="text-sm text-cream/60 mt-0.5">{r.blurb}</p>
              {!isNewBest && prevBest > 0 && (
                <p className="text-sm text-[#F0CE7A] font-medium mt-1">
                  {prevBest - score <= 20 ? `So close! Just ${prevBest - score + 1} more to beat your best.` : `Your best is ${prevBest}. Go get it!`}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 mt-4 mb-3">
                {[
                  { v: String(packed), l: 'Packed' },
                  { v: `×${bestCombo}`, l: 'Best combo' },
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

              <button type="button" onClick={begin} className={`${primaryBtn} mb-4`}><ArrowCounterClockwise size={18} weight="bold" /> Play again</button>

              <div className={`${glass} text-left p-3 mb-4`}>
                <p className={`${eyebrow} mb-2`}>Your real packing list</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.good.map(g => (
                    <span key={g.label} className="inline-flex items-center gap-1 text-xs text-cream/85 bg-white/[0.07] border border-white/10 rounded-full px-2.5 py-1">
                      <g.Icon size={14} weight="duotone" className="text-[#F0CE7A]" /> {g.label}
                    </span>
                  ))}
                </div>
              </div>

              {themed && (
                <a
                href={notifyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F0CE7A] hover:text-white transition-colors"
              >
                <WhatsappLogo size={16} weight="fill" aria-hidden="true" />
                Notify me when this trip opens
              </a>
              )}
            </div>
          )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
