import { useEffect, useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { Play, User } from '@phosphor-icons/react';
import { GOLD_GRAD_TEXT, MAX_NAME } from './gameUi';
import { haptic } from './haptics';

// Counts up to `to` (the final number is what screen readers get).
export function CountUp({ to, reduce }: { to: number; reduce: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce]);
  return <>{reduce ? to : v}</>;
}

// Big score dial for the result screen; mirrors the shareable card.
export function ScoreRing({ score, reduce, max = 180 }: { score: number; reduce: boolean; max?: number }) {
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const R = 74;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0.04, Math.min(1, score / max));
  return (
    <div className="relative w-48 h-48 mx-auto">
      <span className="absolute inset-4 rounded-full bg-primary/35 blur-2xl" aria-hidden="true" />
      <svg viewBox="0 0 190 190" className="relative w-full h-full -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#D98A3A" />
            <stop offset="0.5" stopColor="#F0CE7A" />
            <stop offset="1" stopColor="#C8962A" />
          </linearGradient>
        </defs>
        <circle cx="95" cy="95" r={R} fill="rgba(250,247,242,0.04)" stroke="rgba(250,247,242,0.1)" strokeWidth="13" />
        <motion.circle
          cx="95" cy="95" r={R} fill="none" strokeWidth="13" strokeLinecap="round"
          stroke={`url(#${gid})`} strokeDasharray={C}
          initial={{ strokeDashoffset: reduce ? C * (1 - frac) : C }}
          animate={{ strokeDashoffset: C * (1 - frac) }}
          transition={{ duration: reduce ? 0 : 1.1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-label={`${score} points`}>
        <span className={`font-display ${score >= 1000 ? 'text-5xl' : 'text-6xl'} font-extrabold leading-none tabular-nums ${GOLD_GRAD_TEXT}`}><CountUp to={score} reduce={reduce} /></span>
        <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-cream/50">Points</span>
      </div>
    </div>
  );
}

// ── Confetti (deterministic, render-pure) ──
const CONFETTI_COLORS = ['#C8962A', '#E9C25A', '#A85A2A', '#D98A3A', '#8A6508', '#4CAF50'];
const seeded = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function Confetti() {
  const bits = useMemo(
    () => Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: seeded(i, 1) * 100,
      delay: seeded(i, 2) * 0.5,
      dur: 1.6 + seeded(i, 3) * 1.4,
      rot: (seeded(i, 4) - 0.5) * 720,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + seeded(i, 5) * 6,
    })),
    [],
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {bits.map(b => (
        <motion.span
          key={b.id}
          className="absolute top-0 rounded-sm"
          style={{ left: `${b.x}%`, width: b.size, height: b.size * 1.6, background: b.color }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: 520, opacity: [1, 1, 0], rotate: b.rot }}
          transition={{ duration: b.dur, delay: b.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

// Circular countdown used in the HUD.
export function TimerRing({ secondsLeft, progress, lowAt = 5 }: { secondsLeft: number; progress: number; lowAt?: number }) {
  const R = 22;
  const C = 2 * Math.PI * R;
  const low = secondsLeft <= lowAt;
  return (
    <div className={`relative w-14 h-14 shrink-0 ${low ? 'animate-pulse' : ''}`} role="timer" aria-label={`${secondsLeft} seconds left`}>
      <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r={R} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={R} fill="none" strokeWidth="4" strokeLinecap="round"
          stroke={low ? '#F87171' : '#E9C25A'}
          strokeDasharray={C} strokeDashoffset={C * progress}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-extrabold tabular-nums text-white">{secondsLeft}</span>
    </div>
  );
}

// Entry tile used on Coming Soon cards and trip pages. `compact` is the
// small vertical version for the two-up grid on trip cards.
export function GameTile({ onClick, compact, thumb, Icon, iconSrc, title, subtitle, chip, accent }: {
  onClick: () => void;
  compact?: boolean;
  /** App-icon style: big icon thumbnail with the name underneath. */
  thumb?: boolean;
  Icon?: PhosphorIcon;
  /** Custom artwork (image URL) shown instead of `Icon`, on a dark tile. */
  iconSrc?: string;
  title: string;
  subtitle: string;
  chip: string;
  accent: 'gold' | 'primary';
}) {
  const reduce = useReducedMotion();
  const press = () => haptic('tap');
  const tapAnim = reduce ? undefined : { scale: 0.96 };
  const hoverAnim = reduce ? undefined : { y: -2 };
  const medallion = accent === 'gold'
    ? 'from-[#F0CE7A] to-gold text-dark shadow-[0_6px_18px_rgba(200,150,42,0.45)]'
    : 'from-secondary to-primary text-white shadow-[0_6px_18px_rgba(168,90,42,0.5)]';
  const shell = 'group relative w-full rounded-2xl overflow-hidden text-left text-cream bg-gradient-to-br from-dark to-footer border border-gold/30 shadow-[0_8px_24px_rgba(39,30,24,0.35)] hover:shadow-[0_12px_32px_rgba(39,30,24,0.5)] transition-shadow';
  const glows = (
    <>
      <span className="absolute -right-8 -top-10 w-36 h-36 rounded-full bg-primary/45 blur-2xl pointer-events-none" aria-hidden="true" />
      <span className="absolute -left-10 -bottom-12 w-32 h-32 rounded-full bg-gold/20 blur-2xl pointer-events-none" aria-hidden="true" />
    </>
  );

  if (thumb) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        onPointerDown={press}
        whileTap={reduce ? undefined : { scale: 0.93 }}
        whileHover={reduce ? undefined : { y: -4 }}
        aria-label={`${title}. ${subtitle}`}
        className="group relative flex flex-col items-center gap-1.5 sm:gap-3 w-full touch-manipulation [-webkit-tap-highlight-color:transparent] outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-2xl sm:rounded-3xl p-0 sm:p-1"
      >
        <span className={`relative w-full aspect-square max-w-[3.5rem] sm:max-w-[9.5rem] rounded-[26%] bg-gradient-to-br ${medallion} flex items-center justify-center overflow-hidden border border-white/25 shadow-[0_6px_14px_rgba(39,30,24,0.25)] sm:shadow-[0_14px_30px_rgba(39,30,24,0.28)] group-hover:shadow-[0_18px_38px_rgba(39,30,24,0.38)] transition-shadow`}>
          <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" aria-hidden="true" />
          {iconSrc
            ? <img src={iconSrc} alt="" className="relative w-[62%] h-[62%] object-contain" draggable={false} />
            : Icon && <Icon className="relative w-[54%] h-[54%]" weight="duotone" aria-hidden="true" />}
        </span>
        <span className="block text-center">
          <span className="block font-display text-[11px] sm:text-lg font-extrabold leading-tight text-dark">{title}</span>
          <span className="block text-[9px] leading-tight sm:text-xs text-dark-muted mt-0.5">{subtitle}</span>
        </span>
      </motion.button>
    );
  }

  if (compact) {
    return (
      <motion.button type="button" onClick={onClick} onPointerDown={press} whileTap={tapAnim} whileHover={hoverAnim} className={`${shell} h-28 p-3 flex flex-col justify-between touch-manipulation [-webkit-tap-highlight-color:transparent]`}>
        {glows}
        <motion.span
          className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${medallion} flex items-center justify-center`}
          animate={reduce ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          {iconSrc ? <img src={iconSrc} alt="" className="w-6 h-6 object-contain" draggable={false} /> : Icon && <Icon size={24} weight="duotone" />}
        </motion.span>
        <span className="relative block min-w-0">
          <span className="block font-display text-sm font-extrabold leading-tight text-white">{title}</span>
          <span className="block text-[11px] text-cream/60 truncate">{subtitle}</span>
        </span>
      </motion.button>
    );
  }

  return (
    <motion.button type="button" onClick={onClick} onPointerDown={press} whileTap={tapAnim} whileHover={hoverAnim} className={`${shell} h-24 px-4 flex items-center gap-3 touch-manipulation [-webkit-tap-highlight-color:transparent]`}>
      {glows}
      <motion.span
        className={`relative w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br ${medallion} flex items-center justify-center`}
        animate={reduce ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        {iconSrc ? <img src={iconSrc} alt="" className="w-7 h-7 object-contain" draggable={false} /> : Icon && <Icon size={28} weight="duotone" />}
      </motion.span>
      <span className="relative flex-1 min-w-0">
        <span className="inline-flex items-center whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em] bg-gold/20 text-[#F0CE7A] border border-gold/40 rounded-full px-2 py-0.5 mb-1">{chip}</span>
        <span className="block font-display text-lg font-extrabold leading-tight text-white">{title}</span>
        <span className="block text-xs text-cream/60 truncate">{subtitle}</span>
      </span>
      <span className="relative w-10 h-10 shrink-0 rounded-full bg-gradient-to-b from-primary-light to-primary text-white flex items-center justify-center shadow-[0_6px_16px_rgba(168,90,42,0.5)] group-hover:scale-105 transition-transform" aria-hidden="true">
        <Play size={18} weight="fill" />
      </span>
    </motion.button>
  );
}

// Optional name field on the start screen; the name appears on the shared score card.
export function NameField({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  const id = useId();
  return (
    <div className="text-left mb-3">
      <label htmlFor={id} className="block text-[10px] font-bold uppercase tracking-[0.18em] text-cream/50 mb-1.5">Your name <span className="normal-case tracking-normal font-medium text-cream/40">(optional)</span></label>
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.07] border border-white/15 focus-within:border-[#F0CE7A]/70 focus-within:bg-white/10 px-3.5 transition-colors">
        <User size={18} weight="duotone" className="text-[#F0CE7A] shrink-0" aria-hidden="true" />
        <input
          id={id}
          type="text"
          value={value}
          maxLength={MAX_NAME}
          autoComplete="nickname"
          enterKeyHint="go"
          placeholder="e.g. Priya"
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onEnter(); }}
          className="w-full bg-transparent py-3 text-[15px] font-semibold text-white placeholder:text-cream/30 outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-cream/40">Shown on the score card you share. Stays on this device.</p>
    </div>
  );
}
