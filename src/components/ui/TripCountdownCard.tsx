import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from '@phosphor-icons/react';

interface TripCountdownCardProps {
  startDate: string | null | undefined;
  ctaLabel: string;
  onCtaClick: () => void;
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

const HOUR = 3600000;
const DAY = 24 * HOUR;

// Seconds only appear once departure is this close. Further out they are
// pure noise: a ticking number that tells nobody anything useful.
const SHOW_SECONDS_WITHIN_MS = 3 * DAY;
// Inside the final 48 hours the card shifts to a warmer, more urgent accent.
const URGENT_WITHIN_MS = 2 * DAY;

/**
 * "Trip starts in" countdown shown at the top of a trip detail page.
 *
 * It answers three questions, in this order:
 *   1. How long until we leave?  (the numbers, days first and largest)
 *   2. When exactly is that?     (weekday + date, left)
 *   3. What do I do about it?    (seat note + one booking button, right)
 *
 * Destination, trip length and the full date range already live in the
 * hero directly above, so they are intentionally not repeated here.
 */
export default function TripCountdownCard({
  startDate,
  ctaLabel,
  onCtaClick,
  isAlmostFull,
  isFull,
  remainingSeats,
}: TripCountdownCardProps) {
  const [remaining, setRemaining] = useState<RemainingTime | null>(null);
  const reduceMotion = useReducedMotion();

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
        minutes: Math.floor((diff % HOUR) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
      // Tick every second only while seconds are visible; otherwise
      // twice a minute is plenty and saves needless re-renders.
      timer = setTimeout(tick, diff <= SHOW_SECONDS_WITHIN_MS ? 1000 : 30000);
    };

    tick();
    return () => clearTimeout(timer);
  }, [startDate]);

  if (!remaining || !startDate) return null;

  const msLeft =
    remaining.days * DAY + remaining.hours * HOUR + remaining.minutes * 60000 + remaining.seconds * 1000;
  const urgent = msLeft < URGENT_WITHIN_MS;
  const showSeconds = msLeft <= SHOW_SECONDS_WITHIN_MS;

  const departureLabel = new Date(`${startDate}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const units: { v: number; one: string; many: string; lead?: boolean }[] = [
    { v: remaining.days, one: 'day', many: 'days', lead: true },
    { v: remaining.hours, one: 'hour', many: 'hours' },
    { v: remaining.minutes, one: 'minute', many: 'minutes' },
    ...(showSeconds ? [{ v: remaining.seconds, one: 'second', many: 'seconds' }] : []),
  ];

  const accentText = urgent ? 'text-red-600' : 'text-primary';
  const seatNote = isFull
    ? 'Sold out. Join the waitlist.'
    : isAlmostFull
      ? `Only ${remainingSeats} seat${remainingSeats === 1 ? '' : 's'} left`
      : null;

  return (
    <section
      aria-label="Time until this trip starts"
      className={`rounded-2xl border bg-white shadow-card px-5 py-6 sm:px-8 sm:py-7 lg:px-10 ${
        urgent ? 'border-red-200' : 'border-primary/15'
      }`}
    >
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-10">
        {/* When */}
        <div className="text-center lg:text-left">
          <p className={`flex items-center justify-center lg:justify-start gap-2 text-sm font-semibold ${accentText}`}>
            {urgent && (
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            )}
            {urgent ? 'Leaving soon' : 'Trip starts in'}
          </p>
          <p className="mt-1 text-dark-muted text-sm sm:text-base">{departureLabel}</p>
        </div>

        {/* Screen-reader summary. Coarse on purpose so it doesn't re-announce
            on every visual tick. */}
        <p className="sr-only" aria-live="polite">
          {urgent
            ? `${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes until this trip starts`
            : `${remaining.days} days, ${remaining.hours} hours until this trip starts`}
        </p>

        {/* How long: days are the headline, the rest is supporting detail */}
        <div
          className="flex items-end justify-center divide-x divide-dark/10"
          aria-hidden="true"
        >
          {units.map(({ v, one, many, lead }) => (
            <div key={one} className="px-3 sm:px-5 lg:px-6 first:pl-0 last:pr-0 text-center">
              <div
                className={`relative overflow-hidden font-display font-semibold tabular-nums leading-none ${
                  lead
                    ? `${accentText} text-5xl sm:text-6xl lg:text-7xl`
                    : 'text-dark text-3xl sm:text-4xl lg:text-5xl'
                }`}
              >
                <motion.span
                  key={v}
                  className="inline-block"
                  initial={reduceMotion ? false : { y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  {String(v).padStart(2, '0')}
                </motion.span>
              </div>
              <div className="mt-2 text-xs sm:text-sm text-dark-muted">{v === 1 ? one : many}</div>
            </div>
          ))}
        </div>

        {/* What to do */}
        <div className="flex flex-col items-center lg:items-end gap-2.5">
          {seatNote && (
            <p className={`text-sm font-semibold ${isFull ? 'text-dark-muted' : 'text-red-600'}`}>{seatNote}</p>
          )}
          <button
            type="button"
            onClick={onCtaClick}
            className="group/btn inline-flex w-full lg:w-auto items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-button font-semibold text-white shadow-warm transition-colors hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {ctaLabel}
            {!isFull && <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />}
          </button>
        </div>
      </div>
    </section>
  );
}
