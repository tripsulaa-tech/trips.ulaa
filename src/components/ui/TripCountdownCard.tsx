import { useEffect, useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Seat } from '@phosphor-icons/react';

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
        className="absolute right-[88%] top-1/2 h-[2px] w-12 -translate-y-1/2 rounded-full bg-gradient-to-l from-amber-100/80 via-amber-200/30 to-transparent"
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden="true"
        className="relative drop-shadow-[0_2px_8px_rgba(242,181,68,0.65)]"
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF8DE" />
            <stop offset="0.55" stopColor="#F6CF76" />
            <stop offset="1" stopColor="#D9932E" />
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

const GOAL = 5; // catches to win a round
const ROUND_LIMIT_MS = 15000; // after this the plane "gets away"

type Phase = 'idle' | 'playing' | 'won' | 'escaped';
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
 * "Catch the plane if you can": the plane that flies the route on load is
 * also a game. Tap it to start, then catch it five times. It hops between
 * stops by itself, a little faster after every catch, and it gets away if
 * you take longer than 15 seconds. Before the final catch it stops hopping
 * and waits, so the last tap is always catchable. Win and you get your time,
 * a burst of gold, and a nudge to catch the real flight: the booking button.
 *
 * With reduced motion on it never hops by itself (nothing chases the
 * visitor), so five taps still wins.
 */
function usePlaneGame(stopCount: number, reduceMotion: boolean | null) {
  const last = Math.max(0, stopCount - 1);
  const [introDone, setIntroDone] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pos, setPos] = useState<PlanePos>({ idx: last, facing: 1 });
  const [runCatches, setRunCatches] = useState(0);
  const [spin, setSpin] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [lastMs, setLastMs] = useState(0);
  const [nudge, setNudge] = useState(false);

  // The intro flight takes ~2.8s including its delay.
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), reduceMotion ? 0 : 2900);
    return () => clearTimeout(t);
  }, [reduceMotion]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(false), 7000);
    return () => clearTimeout(t);
  }, [nudge]);

  // The plane hops on its own, a little quicker with every catch. It stops
  // before the last one so the final tap is always catchable.
  useEffect(() => {
    if (phase !== 'playing' || reduceMotion || runCatches >= GOAL - 1) return;
    const dwell = Math.max(900, 1500 - (runCatches - 1) * 200);
    const t = setTimeout(() => setPos((p) => nextPos(p, stopCount)), dwell);
    return () => clearTimeout(t);
  }, [phase, runCatches, pos.idx, stopCount, reduceMotion]);

  // Too slow: it flies home to the last stop.
  useEffect(() => {
    if (phase !== 'playing' || reduceMotion) return;
    const t = setTimeout(() => {
      setPhase('escaped');
      setRunCatches(0);
      setPos({ idx: last, facing: 1 });
    }, ROUND_LIMIT_MS);
    return () => clearTimeout(t);
  }, [phase, startedAt, last, reduceMotion]);

  const onClick = () => {
    if (!introDone || stopCount < 2) return;
    const fresh = phase !== 'playing';
    const now = Date.now();
    const begin = fresh ? now : startedAt;
    const n = fresh ? 1 : runCatches + 1;
    setSpin((s) => s + 360);
    if (fresh) setStartedAt(now);

    if (n >= GOAL) {
      const ms = now - begin;
      setLastMs(ms);
      setPhase('won');
      setRunCatches(GOAL);
      setPos({ idx: last, facing: 1 });
      setNudge(true);
      return;
    }
    setPhase('playing');
    setRunCatches(n);
    setPos((p) => nextPos(p, stopCount));
  };

  const secs = (ms: number) => (ms / 1000).toFixed(1);
  let hint = 'Catch the plane if you can';
  if (phase === 'playing') {
    hint = ['', 'Got one! 1 of 5', 'Faster now. 2 of 5', 'Halfway there. 3 of 5', 'Last one, it\'s resting. Catch it!'][runCatches] ?? '';
  } else if (phase === 'won') {
    hint = `Caught in ${secs(lastMs)}s! Now catch the flight with us`;
  } else if (phase === 'escaped') {
    hint = 'It got away! Tap to try again';
  }

  return { introDone, phase, pos, runCatches, spin, nudge, hint, onClick };
}

const BURST = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { x: Math.cos(a) * 38, y: Math.sin(a) * 38 };
});

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
  const seatHeadline = isFull
    ? 'Sold out'
    : isAlmostFull
      ? `Only ${remainingSeats} seat${remainingSeats === 1 ? '' : 's'} left`
      : `${remainingSeats} seat${remainingSeats === 1 ? '' : 's'} still open`;

  const playing = game.phase === 'playing';
  const won = game.phase === 'won';

  return (
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
          className={`pointer-events-none absolute -bottom-40 -right-16 h-96 w-96 rounded-full blur-2xl ${
            urgent
              ? 'bg-[radial-gradient(circle,#F26B3A_0%,#B8301C_38%,transparent_70%)] opacity-70'
              : 'bg-[radial-gradient(circle,#F2B544_0%,#D98A3A_35%,transparent_70%)] opacity-60'
          }`}
        />

        <div className="relative">
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
                urgent ? 'from-white to-orange-300' : 'from-white to-amber-200'
              }`}
            >
              {bigNumber}
            </motion.span>
            <span className="font-script text-3xl sm:text-4xl lg:text-5xl text-amber-100">{bigWord}</span>
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
            {stops.length >= 2 && (
              <div className="flex items-center gap-2.5">
                {(playing || won) && (
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: GOAL }, (_, i) => (
                      <span
                        key={i}
                        className={`h-2 w-2 rounded-full transition-colors duration-200 ${
                          i < game.runCatches ? 'bg-amber-300' : 'bg-white/25'
                        }`}
                      />
                    ))}
                  </span>
                )}
                <p
                  aria-live="polite"
                  className={`font-script text-xl sm:text-2xl transition-colors ${won ? 'text-amber-300' : 'text-amber-100/90'}`}
                >
                  {game.hint}
                </p>
              </div>
            )}
          </div>

          {/* The route. The plane flies it once on load, then it's a game. */}
          {stops.length >= 2 && (
            <div className="mt-6 relative flex items-start justify-between">
              <div aria-hidden="true" className="absolute left-1.5 right-1.5 top-[5px] border-t-2 border-dashed border-white/30" />
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
                        edge ? 'border-amber-300 bg-amber-300' : 'border-white/60 bg-[#47291A]'
                      }`}
                    />
                    <span className={`text-xs sm:text-sm whitespace-nowrap ${edge ? 'text-white font-semibold' : 'text-white/70'}`}>
                      {stop}
                    </span>
                  </div>
                );
              })}

              <motion.button
                type="button"
                aria-label="Catch the plane"
                onClick={game.onClick}
                className="absolute top-[5px] -ml-[24px] -mt-[24px] z-10 flex h-12 w-12 items-center justify-center rounded-full touch-manipulation cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                initial={reduceMotion ? false : { left: '0%' }}
                animate={{ left: `${(game.pos.idx / (stops.length - 1)) * 100}%` }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : game.introDone
                      ? { type: 'spring', stiffness: 300, damping: 20 }
                      : { duration: 2.4, ease: 'easeInOut', delay: 0.4 }
                }
              >
                {/* Invitation: a soft ping until the first tap */}
                {game.introDone && game.phase === 'idle' && (
                  <span aria-hidden="true" className="absolute inset-1.5 rounded-full bg-amber-300/25 animate-ping" />
                )}
                <motion.span
                  className="relative flex"
                  animate={{ scaleX: game.pos.facing, rotate: game.spin }}
                  transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' }}
                >
                  <PremiumPlane size={40} />
                </motion.span>

                {/* Every catch throws a little burst of gold */}
                {game.spin > 0 && !reduceMotion &&
                  BURST.map((d, i) => (
                    <motion.span
                      key={`${game.spin}-${i}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-300"
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
          <p className={`font-semibold text-lg ${isAlmostFull && !isFull ? 'text-red-600' : 'text-dark'}`}>{seatHeadline}</p>

          {showSeatMap && (
            /* Phone: every seat shares one row, however many there are.
               Desktop: fixed-size seats that wrap inside the narrow stub. */
            <ul
              className="mt-3 grid gap-1 lg:flex lg:flex-wrap"
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
                      className={`h-auto w-full max-w-[26px] lg:h-[22px] lg:w-[22px] ${taken ? 'text-dark/15' : 'text-primary'}`}
                    />
                    {!taken && isAlmostFull && !isFull && (
                      <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={onCtaClick}
          className={`group/btn inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 font-button font-semibold text-white shadow-warm transition-all hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${game.nudge ? 'ring-4 ring-primary/40 scale-[1.03] animate-pulse' : ''}`}
        >
          {ctaLabel}
          {!isFull && <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />}
        </button>
      </div>
    </section>
  );
}
