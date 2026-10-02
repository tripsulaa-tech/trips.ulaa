import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AirplaneTilt, ArrowRight, Seat } from '@phosphor-icons/react';

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

const DODGES_BEFORE_CATCH = 3;

/**
 * "Catch the plane if you can": the plane that flies the route on load is
 * also a toy. It dodges to another stop when a mouse gets close or when it
 * is tapped, three times, then lets itself be caught and nudges the visitor
 * toward the booking button.
 */
function usePlaneGame(stops: string[], reduceMotion: boolean | null) {
  const last = Math.max(0, stops.length - 1);
  const [introDone, setIntroDone] = useState(false);
  const [stopIdx, setStopIdx] = useState(last);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [dodges, setDodges] = useState(0);
  const [caught, setCaught] = useState(false);
  const [catches, setCatches] = useState(0);
  const [nudge, setNudge] = useState(false);

  // The intro flight (see transition below) takes ~2.8s including its delay.
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), reduceMotion ? 0 : 2900);
    return () => clearTimeout(t);
  }, [reduceMotion]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(false), 3200);
    return () => clearTimeout(t);
  }, [nudge]);

  const dodge = () => {
    if (stops.length < 2) return;
    const far = stops.map((_, i) => i).filter((i) => Math.abs(i - stopIdx) >= 2);
    const pool = far.length ? far : stops.map((_, i) => i).filter((i) => i !== stopIdx);
    const next = pool[Math.floor(Math.random() * pool.length)];
    setFacing(next >= stopIdx ? 1 : -1);
    setStopIdx(next);
    setDodges((d) => d + 1);
  };

  // Mouse only: getting close makes it bolt. Touch has no "close", so a tap
  // is the attempt (handled in onClick).
  const onPointerEnter = (e: React.PointerEvent) => {
    if (!introDone || e.pointerType !== 'mouse' || caught) return;
    if (dodges < DODGES_BEFORE_CATCH) dodge();
  };

  const onClick = () => {
    if (!introDone) return;
    if (caught) {
      setCaught(false);
      setDodges(0);
      dodge();
      return;
    }
    if (dodges < DODGES_BEFORE_CATCH) {
      dodge();
      return;
    }
    setCaught(true);
    setCatches((c) => c + 1);
    setNudge(true);
  };

  const here = stops[stopIdx] ?? '';
  let hint = 'Catch the plane if you can';
  if (caught) hint = 'Caught it! Now catch your seat too';
  else if (dodges === 1) hint = `Too slow! Now over ${here}`;
  else if (dodges === 2) hint = `Nope, ${here} now`;
  else if (dodges >= DODGES_BEFORE_CATCH) hint = 'Okay, you win. Catch me';

  return {
    introDone,
    stopIdx,
    facing,
    dodges,
    caught,
    spin: catches * 360,
    catches,
    nudge,
    hint,
    onPointerEnter,
    onClick,
  };
}

const BURST = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { x: Math.cos(a) * 38, y: Math.sin(a) * 38 };
});

/**
 * "Trip starts in" boarding pass.
 *
 * One idea, executed once: the countdown is a boarding pass at golden hour.
 *   - Main section: how many sleeps are left (the emotional number), the
 *     live hours/minutes as a quiet detail, and the route with a small
 *     plane that flies it once on load.
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
  const game = usePlaneGame(stops, reduceMotion);

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
              <p
                aria-live="polite"
                className={`font-script text-xl sm:text-2xl transition-colors ${game.caught ? 'text-amber-300' : 'text-amber-100/90'}`}
              >
                {game.hint}
              </p>
            )}
          </div>

          {/* The route. The plane flies it once on load, then it's a toy. */}
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
                onPointerEnter={game.onPointerEnter}
                onClick={game.onClick}
                className="group/plane absolute top-[5px] -ml-[22px] -mt-[22px] flex h-11 w-11 items-center justify-center rounded-full text-amber-200 touch-manipulation cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                initial={reduceMotion ? false : { left: '0%' }}
                animate={{ left: `${(game.stopIdx / (stops.length - 1)) * 100}%` }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : game.introDone
                      ? { type: 'spring', stiffness: 220, damping: 16 }
                      : { duration: 2.4, ease: 'easeInOut', delay: 0.4 }
                }
              >
                {/* Invitation: a soft ping until the first attempt */}
                {game.introDone && game.dodges === 0 && !game.caught && (
                  <span aria-hidden="true" className="absolute inset-1 rounded-full bg-amber-300/30 animate-ping" />
                )}
                <motion.span
                  className="relative flex"
                  animate={{ scaleX: game.facing, rotate: game.spin }}
                  transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
                >
                  <AirplaneTilt size={26} weight="fill" />
                </motion.span>

                {/* Caught: a little burst of gold */}
                {game.caught && !reduceMotion &&
                  BURST.map((d, i) => (
                    <motion.span
                      key={`${game.catches}-${i}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-300"
                      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                      animate={{ x: d.x, y: d.y, opacity: 0, scale: 0.4 }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
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
            <ul className="mt-3 flex flex-wrap gap-1" aria-hidden="true">
              {Array.from({ length: totalSeats }, (_, i) => {
                const taken = i < takenSeats;
                return (
                  <li key={i} className="relative">
                    <Seat
                      size={22}
                      weight="fill"
                      className={taken ? 'text-dark/15' : 'text-primary'}
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
          className={`group/btn inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 font-button font-semibold text-white shadow-warm transition-all hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${game.nudge ? 'ring-4 ring-primary/35 scale-[1.03]' : ''}`}
        >
          {ctaLabel}
          {!isFull && <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />}
        </button>
      </div>
    </section>
  );
}
