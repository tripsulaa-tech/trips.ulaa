import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Hand-drawn-style topographic map for the 404 page: contour rings for two
// hills, a dotted trail from "you started here" that fades out just before a
// pin marked "?" on the summit — the "unseen" place the link was meant to
// reach. The trail draws itself once and the pin drops in after it (a single
// orchestrated moment); with reduced motion everything is simply shown.
//
// Colours come from the theme tokens (see styles/globals.css) via CSS vars so
// it stays on-brand if the palette is ever tuned.

const TRAIL_A = 'M70 340 C120 330 150 300 140 262 C130 224 80 220 96 182 C110 148 170 150 206 170 C244 192 252 232 292 228';
const TRAIL_B = 'M292 228 C318 226 336 214 348 196 C358 180 366 164 372 142';

const CONTOURS = [
  'M372 36 C440 32 494 78 498 138 C502 200 450 240 388 246 C318 252 256 218 252 148 C248 84 304 40 372 36 Z',
  'M370 60 C420 58 462 88 466 132 C470 178 430 206 384 210 C334 214 286 188 282 140 C278 96 322 62 370 60 Z',
  'M372 90 C400 88 426 106 428 132 C430 158 408 176 382 178 C352 180 326 164 324 136 C322 108 346 92 372 90 Z',
  'M374 112 C388 111 400 120 401 133 C402 146 392 154 379 155 C364 156 352 148 351 135 C350 122 360 113 374 112 Z',
  'M430 290 C470 288 500 312 502 340 C504 372 474 392 438 394 C398 396 366 374 364 342 C362 312 392 292 430 290 Z',
  'M432 316 C452 315 468 327 469 342 C470 358 456 368 438 369 C418 370 402 360 401 344 C400 328 412 317 432 316 Z',
];

export default function LostTrailIllustration({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const maskId = `trail-mask-${useId().replace(/:/g, '')}`;

  // Timeline (seconds): trail A, then trail B, then the pin.
  const draw = (delay: number, duration: number) =>
    reduce
      ? { initial: { pathLength: 1 }, animate: { pathLength: 1 }, transition: { duration: 0 } }
      : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { delay, duration, ease: 'easeInOut' as const } };

  return (
    <svg
      viewBox="0 0 520 420"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Contour rings */}
      <g fill="none" stroke="var(--color-primary)" strokeLinejoin="round">
        {CONTOURS.map((d, i) => (
          <path key={i} d={d} strokeWidth={1.5} strokeOpacity={i === 0 || i === 4 ? 0.14 : i === 3 || i === 5 ? 0.3 : 0.2} />
        ))}
      </g>

      {/* The trail is drawn by revealing the dotted lines through a mask
          that a solid stroke paints along, so the dots "walk" the route. */}
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="420">
        <motion.path d={TRAIL_A} fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" {...draw(0.3, 1.5)} />
        <motion.path d={TRAIL_B} fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" {...draw(1.8, 0.8)} />
      </mask>
      <g mask={`url(#${maskId})`} fill="none" strokeLinecap="round">
        <path d={TRAIL_A} stroke="var(--color-primary)" strokeWidth={3.5} strokeDasharray="0.5 9" />
        <path d={TRAIL_B} stroke="var(--color-primary)" strokeOpacity={0.4} strokeWidth={3.5} strokeDasharray="0.5 9" />
      </g>

      {/* Start: "you started here" */}
      <circle cx="70" cy="340" r="12" fill="var(--color-primary)" fillOpacity="0.15" />
      <circle cx="70" cy="340" r="6" fill="var(--color-primary)" />
      <text x="88" y="374" className="font-script" fontSize="24" fill="var(--color-dark-muted)">you started here</text>

      {/* Where the trail goes cold */}
      <circle cx="292" cy="228" r="5" fill="var(--color-background)" stroke="var(--color-primary)" strokeWidth="2" />

      {/* Pin on the summit */}
      <ellipse cx="372" cy="143" rx="11" ry="3.5" fill="var(--color-dark)" fillOpacity="0.14" />
      <motion.g
        initial={reduce ? false : { y: -18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { delay: 2.5, type: 'spring', damping: 11, stiffness: 190 }}
      >
        <path
          d="M372 142 C372 142 352 120 352 105 C352 93 361 85 372 85 C383 85 392 93 392 105 C392 120 372 142 372 142 Z"
          fill="var(--color-primary)"
        />
        <circle cx="372" cy="105" r="10" fill="#fff" />
        <text x="372" y="110.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--color-primary)" style={{ fontFamily: 'var(--font-display)' }}>?</text>
      </motion.g>
    </svg>
  );
}
