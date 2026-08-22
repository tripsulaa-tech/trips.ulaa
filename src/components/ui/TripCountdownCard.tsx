import { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Flame } from '@phosphor-icons/react';

// Lazy — pulls in three.js (a real chunk of KB) only once someone actually
// lands on a trip page with an active countdown, and never blocks the
// countdown numbers/CTA themselves from rendering and being tappable.
const TripOrbitScene = lazy(() => import('./TripOrbitScene'));

interface TripCountdownCardProps {
  startDate: string | null | undefined;
  destination: string;
  dateRangeLabel: string;
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

// How many hours out the "final stretch" window starts — feeds the bottom
// flight-path line so it visibly fills in as departure nears rather than
// sitting static the whole time.
const JOURNEY_WINDOW_HOURS = 30 * 24;

/**
 * Premium "trip starts in" countdown card shown near the top of a trip
 * detail page. Owns its own live tick, so callers just hand it a start
 * date and a couple of seat-scarcity flags.
 */
export default function TripCountdownCard({
  startDate,
  destination,
  dateRangeLabel,
  ctaLabel,
  onCtaClick,
  isAlmostFull,
  isFull,
  remainingSeats,
}: TripCountdownCardProps) {
  const [remaining, setRemaining] = useState<RemainingTime | null>(null);

  useEffect(() => {
    if (!startDate) {
      setRemaining(null);
      return;
    }
    const target = new Date(`${startDate}T00:00:00`).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        return;
      }
      setRemaining({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startDate]);

  if (!remaining) return null;

  // Urgency — inside the final 48 hours the card switches to a warmer
  // orange/coral palette and the Min/Sec tiles appear (see `units` below).
  const hoursLeft = remaining.days * 24 + remaining.hours;
  const urgent = hoursLeft < 48;
  const progress = Math.min(1, Math.max(0, 1 - hoursLeft / JOURNEY_WINDOW_HOURS));

  // Only show Min/Sec once we're inside the final 48 hours. Outside that
  // window they have no functional value to the user, and rendering a
  // ticking-every-second tile at long range was both unnecessary motion
  // and — once dimmed to compensate — a contrast risk (opacity stacked on
  // an already-translucent gradient fill). Simpler and more accessible to
  // just not show them yet.
  const units: { v: number; l: string }[] = urgent
    ? [
        { v: remaining.days, l: 'Days' },
        { v: remaining.hours, l: 'Hrs' },
        { v: remaining.minutes, l: 'Min' },
        { v: remaining.seconds, l: 'Sec' },
      ]
    : [
        { v: remaining.days, l: 'Days' },
        { v: remaining.hours, l: 'Hrs' },
      ];

  return (
    <div>
      <div
        className={`relative rounded-lg p-px shadow-[0_28px_60px_-20px_rgba(9,7,20,0.55)] ${
          urgent
            ? 'bg-gradient-to-br from-orange-400/50 via-white/10 to-red-600/40'
            : 'bg-gradient-to-br from-gold/50 via-white/10 to-primary-dark/40'
        }`}
      >
        <motion.button
          type="button"
          onClick={onCtaClick}
          aria-label={
            urgent
              ? `Only hours left — tap to ${ctaLabel}`
              : `Trip starts soon — tap to ${ctaLabel}`
          }
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.985 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`tc-grain group/btn relative overflow-hidden block w-full text-left tc-gradient rounded-lg px-6 py-7 sm:px-10 sm:py-10 lg:px-14 lg:py-11 ${
            urgent
              ? 'bg-gradient-to-br from-[#210A07] via-[#3A130C] to-[#1A0705]'
              : 'bg-gradient-to-br from-[#1A130A] via-[#2E1D10] to-[#140D07]'
          }`}
        >
          {/* Soft radial spotlight + ambient glows for depth */}
          <div className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 lg:w-[36rem] rounded-full blur-[90px] ${urgent ? 'bg-orange-400/20' : 'bg-gold/20'}`} />
          <div className={`pointer-events-none absolute -bottom-16 -left-10 w-40 h-40 rounded-full blur-3xl ${urgent ? 'bg-red-500/15' : 'bg-primary-dark/15'}`} />
          <div className={`pointer-events-none absolute -bottom-16 -right-10 w-40 h-40 rounded-full blur-3xl hidden lg:block ${urgent ? 'bg-red-500/15' : 'bg-primary-dark/15'}`} />

          {/* Ambient scene — drifting embers in the margins plus a slim
              flight-path line filling in along the bottom edge, spanning
              the full card so the wide banner reads as designed instead of
              empty, and staying clear of the digit tiles above it. Lazy +
              Suspense-gated: the countdown numbers above render and are
              tappable immediately regardless of whether/when this finishes
              loading. */}
          <Suspense fallback={null}>
            <TripOrbitScene progress={progress} urgent={urgent} />
          </Suspense>

          {(isAlmostFull || isFull) && (
            <span className="absolute top-4 right-4 sm:top-5 sm:right-5 z-10 inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400/15 to-amber-300/10 backdrop-blur-sm border border-amber-300/25 text-amber-200 text-[10px] font-button font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
              <Flame size={11} className="text-amber-300" />
              {isFull ? 'Sold out' : `${remainingSeats} seats left`}
            </span>
          )}

          <div className="relative flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
            <div className="flex flex-col items-center lg:items-start gap-1.5 lg:w-56 lg:shrink-0">
              <p
                className={`flex items-center gap-2 text-[11px] lg:text-xs font-button font-bold uppercase tracking-[0.25em] whitespace-nowrap bg-clip-text text-transparent ${
                  urgent ? 'bg-gradient-to-r from-orange-300 to-amber-200' : 'bg-gradient-to-r from-primary-light to-gold'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${urgent ? 'bg-orange-400' : 'bg-gold'}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${urgent ? 'bg-orange-400' : 'bg-gold'}`} />
                </span>
                {urgent ? 'Final countdown' : 'Trip starts in'}
              </p>
              <p className="hidden lg:block text-white/65 text-xs font-medium">
                {destination} &middot; {dateRangeLabel}
              </p>
            </div>

            {/* Screen-reader summary — coarse (days/hours, or days/hrs/min
                once urgent) so the text only actually changes once an hour
                (or once a minute when urgent) instead of re-announcing on
                every second-tick of the decorative digits below. */}
            <p className="sr-only" aria-live="polite">
              {urgent
                ? `${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes until this trip starts`
                : `${remaining.days} days, ${remaining.hours} hours until this trip starts`}
            </p>

            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4" aria-hidden="true">
              {units.map(({ v, l }, i) => (
                <div key={l} className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                  <div className="text-center">
                    <div
                      className={`relative w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] lg:w-24 lg:h-24 overflow-hidden rounded-2xl bg-white/[0.06] backdrop-blur-md border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_28px_-10px_rgba(0,0,0,0.65)] ${l === 'Sec' ? 'tc-tick' : ''}`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
                      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.06] -translate-y-px z-10" />
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                          key={v}
                          initial={{ y: 16, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -16, opacity: 0 }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          className={`absolute inset-0 flex items-center justify-center font-display text-3xl sm:text-4xl lg:text-5xl font-bold bg-clip-text text-transparent tabular-nums ${
                            urgent ? 'bg-gradient-to-b from-white to-orange-300/90' : 'bg-gradient-to-b from-white to-primary-light/90'
                          }`}
                        >
                          {String(v).padStart(2, '0')}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <div className="text-white/65 text-[10px] lg:text-xs font-medium uppercase tracking-[0.2em] text-center mt-2">{l}</div>
                  </div>
                  {i < units.length - 1 && (
                    <span className={`font-display text-xl sm:text-2xl lg:text-3xl font-bold pb-4 sm:pb-5 lg:pb-6 select-none ${urgent ? 'text-orange-300/40' : 'text-primary-light/40'}`}>:</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center lg:items-end gap-2 lg:w-56 lg:shrink-0">
              <span
                className={`hidden lg:inline-flex items-center gap-2 font-button font-bold text-sm px-5 py-2.5 rounded-full transition-colors ${
                  urgent
                    ? 'bg-gradient-to-r from-orange-400/20 to-amber-300/10 border border-orange-300/30 text-orange-200 group-hover/btn:from-orange-400/30 group-hover/btn:to-amber-300/20'
                    : 'bg-gradient-to-r from-primary-light/20 to-gold/10 border border-primary-light/30 text-primary-light group-hover/btn:from-primary-light/30 group-hover/btn:to-gold/20'
                }`}
              >
                {ctaLabel}
                <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
              </span>
              <p className="flex items-center gap-1.5 text-white/70 text-[11px] font-medium lg:hidden">
                Don't miss out — tap to {ctaLabel}
                <ArrowRight size={12} className={`transition-transform group-hover/btn:translate-x-1 ${urgent ? 'text-orange-300' : 'text-primary-light'}`} />
              </p>
              <p className="hidden lg:block text-white/65 text-xs">
                Don't miss out — tap to {ctaLabel}
              </p>
            </div>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
