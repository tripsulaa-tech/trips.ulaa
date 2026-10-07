import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Fire, Seat, User } from '@phosphor-icons/react';

interface TripCountdownCardProps {
  startDate: string | null | undefined;
  /** Comma-separated stops, e.g. "Mirissa, Galle, Ella, Colombo" */
  destination: string;
  ctaLabel: string;
  onCtaClick: () => void;
  totalSeats: number;
  isAlmostFull: boolean;
  isFull: boolean;
  remainingSeats: number;
  /** Seat-limited early bird still on. Omit/null when there is no early bird
   *  to show. Prices arrive already formatted (e.g. "₹1,799"). */
  earlyBird?: {
    price: string;
    /** Crossed-out "was" price, when there is one. */
    regularPrice?: string;
    /** "₹700" — what the early bird saves against the crossed-out price. */
    saving?: string;
    totalSeats: number;
    seatsLeft: number;
    /** Advance to pay to lock the seat, and what remains after it. */
    advance?: string;
    balance?: string;
  } | null;
}

interface RemainingTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Final 48 hours: the sky goes from golden hour to dusk-red.
const URGENT_WITHIN_MS = 2 * DAY;
// Above this many seats the seat map stops being readable, so we skip it.
const MAX_SEAT_ICONS = 20;

const pad = (n: number) => String(n).padStart(2, '0');

const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/* ───────────────────────── Plane ───────────────────────── */

/**
 * Top-down airliner in brushed gold, nose pointing right, with a contrail
 * that fades out behind it. Drawn as one half-silhouette mirrored on the
 * centre line so the two wings are always perfectly symmetrical.
 */
function PremiumPlane({ size = 40 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  const half =
    'M47 24 C45 22.4 41 21.6 34 21.4 L28 21.4 L15.4 3.6 L11.8 3.6 L19.6 21.4 L10 21.3 L5.2 13.8 L2.8 13.8 L5.4 21.6 C3.4 22.2 2.4 23 2 24 Z';
  return (
    <span className="relative flex items-center">
      {/* Contrail */}
      <span
        aria-hidden="true"
        className="absolute right-[88%] top-1/2 h-[2px] w-12 -translate-y-1/2 rounded-full bg-gradient-to-l from-[#FBEFD3]/80 via-[#E9C77B]/30 to-transparent"
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden="true"
        className="relative drop-shadow-[0_2px_8px_rgba(233,199,123,0.6)]"
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FBEFD3" />
            <stop offset="0.55" stopColor="#E9C77B" />
            <stop offset="1" stopColor="#C8962A" />
          </linearGradient>
        </defs>
        <path d={half} fill={`url(#${uid}-body)`} />
        <path d={half} fill={`url(#${uid}-body)`} transform="translate(0 48) scale(1 -1)" />
        {/* Wing-mounted engines */}
        <rect x="19.5" y="10" width="5.2" height="2.2" rx="1.1" fill="#B8741E" opacity="0.55" transform="rotate(-8 22 11)" />
        <rect x="19.5" y="35.8" width="5.2" height="2.2" rx="1.1" fill="#B8741E" opacity="0.55" transform="rotate(8 22 37)" />
        {/* Cockpit glass and a light centre-line highlight */}
        <path d="M42 22.9 C43.6 23.2 44.4 23.6 45 24 C44.4 24.4 43.6 24.8 42 25.1 Z" fill="#6B3A12" opacity="0.55" />
        <path d="M8 24 L38 24" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="0.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/* ───────────────────────── Game ───────────────────────── */

const GOAL = 4; // catches the visitor can actually make
const ROUND_LIMIT_MS = 15000; // too slow and it takes off without them
const TEASE_MS = 5000; // the fifth "catch": it darts about, untouchable, this long
const TEASE_DWELL_MS = 650; // how long it sits at each stop while teasing

// idle: waiting for the first tap
// playing: tap it, it hops, it speeds up
// teasing: the "fifth" catch. Not tappable, the plane is already leaving
// departed: it took off. The booking message takes over.
type Phase = 'idle' | 'playing' | 'teasing' | 'departed';
interface PlanePos {
  idx: number;
  facing: 1 | -1;
}

// Pick a stop at least two away when possible, so each hop reads as a jump.
function nextPos(prev: PlanePos, count: number): PlanePos {
  if (count < 2) return prev;
  const all = Array.from({ length: count }, (_, i) => i);
  const far = all.filter((i) => Math.abs(i - prev.idx) >= 2);
  const pool = far.length ? far : all.filter((i) => i !== prev.idx);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  return { idx, facing: idx >= prev.idx ? 1 : -1 };
}

/**
 * "Catch the plane if you can", with a punchline.
 *
 * Tap the plane to start. It hops between stops, a little faster after every
 * catch. You can catch it four times. On the fifth it is already taking
 * off, so it cannot be tapped, and the card turns the joke into the pitch:
 * you can't catch this flight by chasing it, you catch it by booking.
 * The booking button then glows until the visitor acts (or chases again).
 *
 * Taking longer than 15 seconds ends the same way. With reduced motion on,
 * the plane never hops by itself (nothing chases the visitor).
 */
function usePlaneGame(stopCount: number, reduceMotion: boolean | null) {
  const last = Math.max(0, stopCount - 1);
  const [introDone, setIntroDone] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pos, setPos] = useState<PlanePos>({ idx: last, facing: 1 });
  const [runCatches, setRunCatches] = useState(0);
  const [spin, setSpin] = useState(0);
  const [startedAt, setStartedAt] = useState(0);

  // The intro flight takes ~2.8s including its delay.
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), reduceMotion ? 0 : 2900);
    return () => clearTimeout(t);
  }, [reduceMotion]);

  // The plane hops on its own, a little quicker with every catch. In the
  // final "teasing" beat it darts about much faster, and can't be tapped.
  useEffect(() => {
    if ((phase !== 'playing' && phase !== 'teasing') || reduceMotion) return;
    const dwell = phase === 'teasing' ? TEASE_DWELL_MS : Math.max(900, 1500 - (runCatches - 1) * 250);
    const t = setTimeout(() => setPos((p) => nextPos(p, stopCount)), dwell);
    return () => clearTimeout(t);
  }, [phase, runCatches, pos.idx, stopCount, reduceMotion]);

  // Too slow: it takes off without them.
  useEffect(() => {
    if (phase !== 'playing' || reduceMotion) return;
    const t = setTimeout(() => setPhase('departed'), ROUND_LIMIT_MS);
    return () => clearTimeout(t);
  }, [phase, startedAt, reduceMotion]);

  // The tease: the plane darts around for a few seconds, untouchable, and
  // then it's gone. (With reduced motion it doesn't dart, so just a short beat.)
  useEffect(() => {
    if (phase !== 'teasing') return;
    const t = setTimeout(() => setPhase('departed'), reduceMotion ? 1300 : TEASE_MS);
    return () => clearTimeout(t);
  }, [phase, reduceMotion]);

  const onClick = () => {
    if (!introDone || stopCount < 2) return;
    if (phase === 'teasing' || phase === 'departed') return;
    const fresh = phase !== 'playing';
    const n = fresh ? 1 : runCatches + 1;
    setSpin((s) => s + 1); // only keys the burst of gold dots; the plane doesn't spin
    if (fresh) setStartedAt(Date.now());
    setRunCatches(n);
    setPos((p) => nextPos(p, stopCount));
    setPhase(n >= GOAL ? 'teasing' : 'playing');
  };

  const chaseAgain = () => {
    setPhase('idle');
    setRunCatches(0);
    setPos({ idx: last, facing: 1 });
  };

  let hint = 'Catch the plane if you can';
  if (phase === 'playing') {
    hint = ['', 'Got one! 1 of 4', 'Faster now. 2 of 4', 'Three down. 3 of 4'][runCatches] ?? '';
  } else if (phase === 'teasing') {
    hint = 'Too fast! It\'s getting away…';
  }

  return { introDone, phase, pos, runCatches, spin, hint, onClick, chaseAgain };
}

const BURST = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { x: Math.cos(a) * 38, y: Math.sin(a) * 38 };
});

// Matches the card's own lg breakpoint, where it flips from stacked to side-by-side.
const DESKTOP_QUERY = '(min-width: 1024px)';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

// Phones: the flight path as dense keyframes, in the section's own coordinates.
interface FlyPath {
  x: number[];
  y: number[];
  rotate: number[];
  times: number[];
}

const FLIGHT_MS = 3200;

/** Fired on window when the plane touches the sticky booking button (detail: true)
 *  and when it is reset (detail: false). TripStickyBookingBar listens for it. */
export const PLANE_LANDED_EVENT = 'ulaa:plane-landed';

type Pt = { x: number; y: number };

// Smooth a few waypoints into a curve (Catmull-Rom), then turn it into
// keyframes: position, a heading that follows the curve, and even pacing.
function buildFlight(waypoints: Pt[]): FlyPath {
  const pts = [waypoints[0], ...waypoints, waypoints[waypoints.length - 1]];
  const samples: Pt[] = [];
  const STEPS = 14;
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let k = 0; k < STEPS; k++) {
      const t = k / STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      samples.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  samples.push(waypoints[waypoints.length - 1]);

  const rotate: number[] = [];
  const dist: number[] = [0];
  let prev = 0;
  samples.forEach((p, i) => {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (i > 0) {
      while (ang - prev > 180) ang -= 360;
      while (ang - prev < -180) ang += 360;
    }
    prev = ang;
    rotate.push(ang);
    if (i > 0) dist.push(dist[i - 1] + Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y));
  });
  const total = dist[dist.length - 1] || 1;
  return {
    x: samples.map((p) => p.x),
    y: samples.map((p) => p.y),
    rotate,
    times: dist.map((d) => d / total),
  };
}

/* ───────────────────────── Card ───────────────────────── */

/**
 * "Trip starts in" boarding pass.
 *
 * One idea, executed once: the countdown is a boarding pass at golden hour.
 *   - Main section: how many sleeps are left (the emotional number), the
 *     live hours/minutes/seconds as a quiet detail, and the route with a
 *     gold plane you can try to catch.
 *   - Stub: a seat map that makes "1 seat left" visible rather than just
 *     readable, and the single booking button.
 *
 * Trip length, age range and full date range already live in the hero, so
 * they are not repeated here.
 */
export default function TripCountdownCard({
  startDate,
  destination,
  ctaLabel,
  onCtaClick,
  totalSeats,
  isAlmostFull,
  isFull,
  remainingSeats,
  earlyBird,
}: TripCountdownCardProps) {
  const [remaining, setRemaining] = useState<RemainingTime | null>(null);
  const reduceMotion = useReducedMotion();
  const stops = useMemo(
    () =>
      destination
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    [destination],
  );
  const game = usePlaneGame(stops.length, reduceMotion);
  const isDesktop = useIsDesktop();
  const planeRef = useRef<HTMLButtonElement>(null);
  const [fly, setFly] = useState<FlyPath | null>(null);
  // Phones already have the sticky booking bar. If it is somehow missing,
  // the card falls back to showing its own button.
  const [noStickyBar, setNoStickyBar] = useState(false);

  const departedNow = game.phase === 'departed';
  const facing = game.pos.facing;

  // Phones: once the plane takes off, it loops down the screen and lands on
  // the sticky booking bar. Everything here is in viewport coordinates.
  useLayoutEffect(() => {
    if (!departedNow || isDesktop || reduceMotion) return;
    const plane = planeRef.current;
    const btn = document.querySelector<HTMLElement>('[data-sticky-booking-bar] button');
    if (!plane || !btn) {
      setNoStickyBar(true);
      return;
    }
    const pr = plane.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const W = window.innerWidth;
    const start = { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 };
    const btnY = br.top + br.height / 2;
    const dy = btnY - start.y;
    const endX = br.right - 18;

    // Out past the right edge, a long diagonal sweep to the left, down the
    // middle-left of the screen, then curving into the button and along it. If the card is already low on the
    // screen there is no room for the loop, so it just drops in.
    const waypoints: Pt[] =
      dy > 200
        ? [
            start,
            { x: W - 14, y: start.y + dy * 0.1 },
            { x: W * 0.8, y: start.y + dy * 0.22 },
            { x: W * 0.55, y: start.y + dy * 0.32 },
            { x: W * 0.4, y: start.y + dy * 0.5 },
            { x: W * 0.37, y: start.y + dy * 0.72 },
            { x: W * 0.47, y: btnY },
            { x: br.left + 20, y: btnY },
            { x: endX, y: btnY },
          ]
        : [start, { x: br.left - 20, y: btnY }, { x: br.left + 40, y: btnY }, { x: endX, y: btnY }];
    setFly(buildFlight(waypoints));
    // Leaving the departed state (chase again, resize) clears the flight.
    return () => {
      setFly(null);
      window.dispatchEvent(new CustomEvent(PLANE_LANDED_EVENT, { detail: false }));
    };
  }, [departedNow, isDesktop, reduceMotion, facing]);

  // The plane has landed: tell the sticky booking bar to start its animation.
  const onLanded = () => {
    window.dispatchEvent(new CustomEvent(PLANE_LANDED_EVENT, { detail: true }));
  };

  useEffect(() => {
    const target = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!target) {
        setRemaining(null);
        return;
      }
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        return;
      }
      setRemaining({
        days: Math.floor(diff / DAY),
        hours: Math.floor((diff % DAY) / HOUR),
        minutes: Math.floor((diff % HOUR) / MIN),
        seconds: Math.floor((diff % MIN) / 1000),
      });
      timer = setTimeout(tick, 1000);
    };

    tick();
    return () => clearTimeout(timer);
  }, [startDate]);

  if (!remaining || !startDate) return null;

  const msLeft =
    remaining.days * DAY + remaining.hours * HOUR + remaining.minutes * MIN + remaining.seconds * 1000;
  const urgent = msLeft < URGENT_WITHIN_MS;

  const departure = new Date(`${startDate}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Headline: sleeps while there are whole days left, hours on the last day.
  const inDays = remaining.days >= 1;
  const bigNumber = inDays ? remaining.days : remaining.hours;
  const bigWord = inDays
    ? `${bigNumber === 1 ? 'sleep' : 'sleeps'} to go`
    : `${bigNumber === 1 ? 'hour' : 'hours'} to go`;

  // The exact clock, as a quiet second line.
  const fine: string[] = [];
  if (inDays) fine.push(`${remaining.hours} hrs`);
  fine.push(`${remaining.minutes} min`);
  fine.push(`${pad(remaining.seconds)} sec`);

  const showSeatMap = totalSeats > 0 && totalSeats <= MAX_SEAT_ICONS;
  const takenSeats = Math.max(0, totalSeats - remainingSeats);
  // Scarcity first, social proof second: "Only 1 seat left" is the line that
  // makes people move, and "14 are already in" is why it feels worth moving for.
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const seatHeadline = isFull
    ? 'Sold out'
    : isAlmostFull
      ? `Only ${plural(remainingSeats, 'seat')} left`
      : `${plural(remainingSeats, 'seat')} still open`;
  let seatSub: string | null = null;
  if (totalSeats > 0 && takenSeats > 0) {
    if (isFull) seatSub = `All ${totalSeats} seats are taken`;
    else if (remainingSeats === 1) seatSub = `${takenSeats} travellers are already in. Be the ${ordinal(totalSeats)}.`;
    else if (isAlmostFull) seatSub = `${takenSeats} travellers are already in. Join them.`;
    else seatSub = `${takenSeats} traveller${takenSeats === 1 ? ' is' : 's are'} already in`;
  }

  const seatMap = showSeatMap ? (
            /* Phone: every seat shares one row, however many there are.
               Desktop: fixed-size seats that wrap inside the narrow stub. */
            <ul
              className="mt-3 grid gap-0.5 lg:gap-1 lg:flex lg:flex-wrap"
              style={{ gridTemplateColumns: `repeat(${totalSeats}, minmax(0, 1fr))` }}
              aria-hidden="true"
            >
              {Array.from({ length: totalSeats }, (_, i) => {
                const taken = i < takenSeats;
                return (
                  <li key={i} className="relative flex justify-center">
                    <Seat
                      size={22}
                      weight="fill"
                      className={`h-auto w-full max-w-[26px] lg:h-[22px] lg:w-[22px] ${taken ? 'text-dark/25' : 'text-primary'}`}
                    />
                    {!taken && isAlmostFull && !isFull && (
                      <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
                    )}
                  </li>
                );
              })}
            </ul>
  ) : null;

  const departed = game.phase === 'departed';
  const flyingDown = departed && !isDesktop && !reduceMotion && !noStickyBar;
  const showPips = game.phase === 'playing' || game.phase === 'teasing';

  return (
    <>
    <section
      aria-label="Time until this trip starts"
      className="relative overflow-hidden rounded-2xl shadow-[0_24px_50px_-24px_rgba(45,33,24,0.55)] flex flex-col lg:flex-row"
    >
      {/* ───────── Main: the countdown ───────── */}
      <div
        className={`relative flex-1 min-w-0 overflow-hidden px-6 py-6 sm:px-9 sm:py-7 text-white ${
          urgent
            ? 'bg-gradient-to-br from-[#2A0C08] via-[#4A160D] to-[#7A2412]'
            : 'bg-gradient-to-br from-[#2D2118] via-[#47291A] to-[#7A3E1E]'
        }`}
      >
        {/* Low sun on the horizon, the one piece of atmosphere */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -bottom-52 -right-24 h-96 w-96 rounded-full blur-2xl ${
            urgent
              ? 'bg-[radial-gradient(circle,#F26B3A_0%,#B8301C_38%,transparent_70%)] opacity-70'
              : 'bg-[radial-gradient(circle,#D98A3A_0%,#A85A2A_40%,transparent_70%)] opacity-70'
          }`}
        />

        <div className="relative">
          {/* Desktop: countdown on the left, the "catch the flight" message
              in the free space to its right. Mobile: they stack. */}
          <div className="xl:flex xl:items-center xl:gap-10">
          <div className={`min-w-0 ${departed && stops.length >= 2 ? 'xl:flex-none' : 'xl:flex-1'}`}>
          <p className="text-sm sm:text-base text-white/75">
            {urgent ? 'Wheels up' : 'Wheels up on'} <span className="text-white font-semibold">{departure}</span>
          </p>

          {/* The number people feel */}
          <h2 className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0 leading-none" aria-hidden="true">
            <motion.span
              key={bigNumber}
              initial={reduceMotion ? false : { y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={`font-display font-extrabold tabular-nums tracking-tight text-6xl sm:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b ${
                urgent ? 'from-cream to-orange-300' : 'from-cream to-[#E9C77B]'
              }`}
            >
              {bigNumber}
            </motion.span>
            <span className="font-script text-3xl sm:text-4xl lg:text-5xl text-[#F3E2BC]">{bigWord}</span>
          </h2>

          {/* Screen-reader summary, coarse so it doesn't re-announce every tick */}
          <p className="sr-only" aria-live="polite">
            {urgent
              ? `${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes until this trip starts`
              : `${remaining.days} days, ${remaining.hours} hours until this trip starts`}
          </p>

          {/* Exact clock on the left, the plane game's hint on the right */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:text-base text-white/70 tabular-nums" aria-hidden="true">
              <span>and</span>
              {fine.map((f) => (
                <span key={f.split(' ')[1]} className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white">
                  {f}
                </span>
              ))}
            </p>
            {stops.length >= 2 && game.phase === 'idle' && (
              /* The challenge: a speech bubble from the plane. It is a button
                 too, so tapping the words works as well as tapping the plane.
                 Space is reserved during the intro flight so nothing jumps. */
              <motion.button
                type="button"
                onClick={game.onClick}
                tabIndex={game.introDone ? 0 : -1}
                aria-hidden={!game.introDone}
                className="relative ml-auto mb-1.5 cursor-pointer touch-manipulation rounded-2xl bg-[#F3E2BC] px-4 py-2 text-sm sm:text-base font-semibold text-[#3A2316] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)]"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={
                  game.introDone
                    ? { opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -4, 0] }
                    : { opacity: 0, scale: 0.85, y: 0 }
                }
                transition={{
                  default: { type: 'spring', stiffness: 260, damping: 18 },
                  y: reduceMotion ? { duration: 0 } : { duration: 1.6, ease: 'easeInOut', repeat: Infinity, delay: 0.5 },
                }}
              >
                Think you can catch me? Tap the plane!
                <span aria-hidden="true" className="absolute -bottom-1 right-6 h-3 w-3 rotate-45 bg-[#F3E2BC]" />
              </motion.button>
            )}
            {stops.length >= 2 && game.phase !== 'idle' && !departed && (
              <div className="flex items-center gap-2.5">
                {showPips && (
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: GOAL }, (_, i) => (
                      <span
                        key={i}
                        className={`h-2 w-2 rounded-full transition-colors duration-200 ${
                          i < game.runCatches ? 'bg-[#E9C77B]' : 'bg-white/25'
                        }`}
                      />
                    ))}
                  </span>
                )}
                <p aria-live="polite" className="text-sm sm:text-base font-semibold text-[#F3E2BC]">
                  {game.hint}
                </p>
              </div>
            )}
          </div>

          </div>

          {/* The punchline: you can't chase this flight, you book it. */}
          {stops.length >= 2 && departed && (
            <motion.div
              className="mt-5 xl:mt-0 xl:min-w-0 xl:max-w-[26rem] xl:flex-1 xl:border-l xl:border-white/15 xl:pl-9"
              aria-live="polite"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
            >
              {/* Script carries the feeling, sans carries the instruction */}
              <p className="font-script text-2xl sm:text-3xl leading-tight text-[#E9C77B]">Want to catch the flight?</p>
              <p className="mt-1.5 max-w-xl text-base sm:text-lg leading-relaxed text-white/90">
                Pack your bags and catch it with <strong className="font-semibold text-white">Ulaa</strong>. Book your
                seats soon.
              </p>
              <button
                type="button"
                onClick={game.chaseAgain}
                className="mt-3 text-sm text-white/70 underline underline-offset-4 decoration-white/30 hover:text-white cursor-pointer"
              >
                Chase the plane again
              </button>
            </motion.div>
          )}
          </div>

          {/* The route. The plane flies it once on load, then it's a game. */}
          {stops.length >= 2 && (
            <div className="mt-6 relative flex items-start justify-between">
              <div aria-hidden="true" className="absolute left-1.5 right-1.5 top-[5px] border-t-2 border-dashed border-white/30" />
              {stops.length > 2 && (
                <span
                  aria-hidden="true"
                  className="md:hidden absolute left-1/2 top-[5px] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/15 bg-[#3A2316] px-2.5 py-0.5 text-xs text-white/75"
                >
                  {stops.length - 2} stops between
                </span>
              )}
              {stops.map((stop, i) => {
                const edge = i === 0 || i === stops.length - 1;
                return (
                  <div
                    key={`${stop}-${i}`}
                    aria-hidden="true"
                    className={`relative flex flex-col items-center gap-2 ${edge ? '' : 'hidden md:flex'}`}
                  >
                    <span
                      className={`h-3 w-3 rounded-full border-2 ${
                        edge ? 'border-[#E9C77B] bg-[#E9C77B]' : 'border-white/60 bg-[#47291A]'
                      }`}
                    />
                    <span className={`text-sm whitespace-nowrap ${edge ? 'text-white font-semibold' : 'text-white/70'}`}>
                      {stop}
                    </span>
                  </div>
                );
              })}

              <motion.button
                ref={planeRef}
                type="button"
                aria-label="Catch the plane"
                onClick={game.onClick}
                disabled={game.phase === 'teasing' || departed}
                className="absolute top-[5px] -ml-[24px] -mt-[24px] z-10 flex h-12 w-12 items-center justify-center rounded-full touch-manipulation cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E9C77B]"
                initial={reduceMotion ? false : { left: '0%' }}
                animate={
                  departed
                    ? flyingDown
                      ? // Phones: a copy of the plane takes over and dives to the button
                        { left: `${(game.pos.idx / (stops.length - 1)) * 100}%`, y: 0, opacity: 0 }
                      : // Desktop: it keeps flying off to the right
                        { left: '118%', y: -40, opacity: 0 }
                    : { left: `${(game.pos.idx / (stops.length - 1)) * 100}%`, y: 0, opacity: 1 }
                }
                transition={
                  reduceMotion || flyingDown
                    ? { duration: 0 }
                    : departed
                      ? { duration: 1.1, ease: 'easeIn' }
                      : game.introDone
                        ? { type: 'spring', stiffness: 300, damping: 20 }
                        : { duration: 2.4, ease: 'easeInOut', delay: 0.4 }
                }
              >
                {/* Invitation: a soft ping until the first tap */}
                {game.introDone && game.phase === 'idle' && (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[#E9C77B]/30 ring-2 ring-[#E9C77B]/50 animate-ping" />
                )}
                <motion.span
                  className="relative flex"
                  animate={{
                    scaleX: game.pos.facing,
                    y: game.introDone && game.phase === 'idle' && !reduceMotion ? [0, -4, 0] : 0,
                  }}
                  transition={{
                    default: { duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' },
                    y:
                      game.introDone && game.phase === 'idle' && !reduceMotion
                        ? { duration: 1.6, ease: 'easeInOut', repeat: Infinity, delay: 0.5 }
                        : { duration: 0.2 },
                  }}
                >
                  <PremiumPlane size={40} />
                </motion.span>

                {/* Every catch throws a little burst of gold */}
                {game.spin > 0 && !reduceMotion &&
                  BURST.map((d, i) => (
                    <motion.span
                      key={`${game.spin}-${i}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-[#E9C77B]"
                      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                      animate={{ x: d.x, y: d.y, opacity: 0, scale: 0.4 }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                    />
                  ))}
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* ───────── Stub: seats and the one button ───────── */}
      <div className="relative bg-cream px-6 py-6 sm:px-9 lg:w-[320px] lg:shrink-0 lg:px-7 border-t-2 border-dashed border-primary/25 lg:border-t-0 lg:border-l-2 flex flex-col justify-center gap-5">
        {/* Ticket notches */}
        <span aria-hidden="true" className="absolute -top-3 -left-3 h-6 w-6 rounded-full bg-background" />
        <span
          aria-hidden="true"
          className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-background lg:top-auto lg:right-auto lg:-bottom-3 lg:-left-3"
        />

        <div>
          {isAlmostFull && !isFull ? (
            <motion.p
              className="inline-block font-bold text-xl text-red-600 bg-clip-text"
              style={
                reduceMotion
                  ? undefined
                  : {
                      backgroundImage: 'linear-gradient(90deg,#C62828,#F0792B,#C62828)',
                      backgroundSize: '200% 100%',
                      WebkitTextFillColor: 'transparent',
                    }
              }
              animate={reduceMotion ? undefined : { backgroundPosition: ['0% 50%', '200% 50%'] }}
              transition={{ duration: 2.6, ease: 'linear', repeat: Infinity }}
            >
              {seatHeadline}
            </motion.p>
          ) : (
            <p className="font-semibold text-lg text-dark">{seatHeadline}</p>
          )}
          {seatSub && <p className="mt-0.5 text-sm text-dark-muted">{seatSub}</p>}
          {earlyBird && !isFull && (
            <div className="offer-gradient-shift mt-2.5 rounded-lg px-3 py-2.5 text-white shadow-warm ring-1 ring-inset ring-white/15">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-2xs font-button font-bold uppercase tracking-widest">
                  <motion.span
                    aria-hidden="true"
                    className="inline-flex origin-bottom text-yellow-300"
                    animate={reduceMotion ? undefined : { scale: [1, 1.18, 0.95, 1.12, 1], rotate: [0, -6, 5, -4, 0] }}
                    transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
                  >
                    <Fire size={13} weight="fill" />
                  </motion.span>
                  Early bird
                </p>
                <span className="text-2xs font-semibold text-white/90">First {earlyBird.totalSeats} to pay</span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-2xl font-bold leading-none">{earlyBird.price}</span>
                {earlyBird.regularPrice && (
                  <span className="text-xs text-white/80 line-through">{earlyBird.regularPrice}</span>
                )}
                {earlyBird.saving && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-2xs font-button font-bold text-red-700">
                    Save {earlyBird.saving}
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: Math.min(earlyBird.totalSeats, 12) }, (_, i) => {
                    const taken = i < Math.min(earlyBird.totalSeats - earlyBird.seatsLeft, 12);
                    return (
                      <span
                        key={i}
                        className={`flex h-5 w-5 items-center justify-center rounded ${taken ? 'bg-white/25 text-white/60' : 'bg-white text-red-600'}`}
                      >
                        <User size={11} weight="fill" />
                      </span>
                    );
                  })}
                </div>
                <span className="text-2xs font-semibold">
                  {earlyBird.seatsLeft === 1 ? 'Last seat!' : `${earlyBird.seatsLeft} of ${earlyBird.totalSeats} left`}
                </span>
              </div>

              {earlyBird.advance && (
                <p className="mt-1.5 text-2xs leading-snug text-white/90">
                  Pay {earlyBird.advance} to lock it{earlyBird.balance ? ` · ${earlyBird.balance} later` : ''}
                </p>
              )}
            </div>
          )}

          {!earlyBird && seatMap}
        </div>

        {/* Phones already have the sticky booking bar, so here the button
            only appears as the payoff once the plane has taken off. Desktop
            has no sticky bar, so it is always there. */}
        <motion.div
          key={String(departed)}
          initial={departed && !reduceMotion ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`relative ${departed && noStickyBar ? '' : 'hidden lg:block'}`}
        >
          <button
            type="button"
            onClick={onCtaClick}
            className="group/btn relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-md bg-primary px-6 py-3.5 font-button font-semibold text-white shadow-warm transition-colors hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {/* The payoff, all inside the button: the plane that just left the
                route sweeps across it and lands on the arrow, then the button
                keeps a slow shine going. Nothing spills outside the button. */}
            {departed && !reduceMotion && (
              <>
                {isDesktop && (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                    initial={{ left: '-14%', opacity: 0 }}
                    animate={{ left: '102%', opacity: [0, 1, 1, 1] }}
                    transition={{ duration: 0.9, delay: 0.7, ease: 'easeIn' }}
                  >
                    <PremiumPlane size={26} />
                  </motion.span>
                )}
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.35, 0] }}
                  transition={{ duration: 0.5, delay: 1.5 }}
                />
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  initial={{ left: '-30%' }}
                  animate={{ left: '130%' }}
                  transition={{ duration: 0.9, delay: 2.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2.4 }}
                />
              </>
            )}
            <span className="relative">{ctaLabel}</span>
            {!isFull && (
              <motion.span
                className="relative flex"
                animate={departed && !reduceMotion ? { x: [0, 5, 0] } : { x: 0 }}
                transition={{ duration: 0.8, delay: 2.4, repeat: Infinity, repeatDelay: 2.5 }}
              >
                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
              </motion.span>
            )}
          </button>
        </motion.div>

        {earlyBird && seatMap && <div className="-mt-2">{seatMap}</div>}
      </div>

    </section>

      {/* Phones only: the plane leaves the route, loops down the screen and
          flies along the sticky "Pack Your Bags" bar, then fades out. It is
          portalled to <body> so no ancestor can clip or offset it. */}
      {flyingDown &&
        fly &&
        createPortal(
          <motion.div
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-[60] -ml-6 -mt-6 flex h-12 w-12 items-center justify-center"
            initial={{ x: fly.x[0], y: fly.y[0], rotate: fly.rotate[0], opacity: 1 }}
            animate={{ x: fly.x, y: fly.y, rotate: fly.rotate, opacity: [1, 1, 0] }}
            transition={{
              x: { duration: FLIGHT_MS / 1000, ease: 'linear', times: fly.times },
              y: { duration: FLIGHT_MS / 1000, ease: 'linear', times: fly.times },
              rotate: { duration: FLIGHT_MS / 1000, ease: 'linear', times: fly.times },
              opacity: { duration: FLIGHT_MS / 1000, ease: 'linear', times: [0, 0.92, 1] },
            }}
            onAnimationComplete={onLanded}
          >
            <PremiumPlane size={40} />
          </motion.div>,
          document.body,
        )}
    </>
  );
}
