// Length units the admin can type sizes in. Everything is stored and validated
// in millimetres; the unit only changes what is shown and typed.
import { useSyncExternalStore } from 'react';

export type LengthUnit = 'mm' | 'cm' | 'in' | 'ft' | 'px';

// px is the CSS pixel (96 per inch).
const MM_PER_UNIT: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4, ft: 304.8, px: 25.4 / 96 };
const DECIMALS: Record<LengthUnit, number> = { mm: 2, cm: 3, in: 3, ft: 4, px: 1 };

export const LENGTH_UNIT_OPTIONS: { value: LengthUnit; label: string }[] = [
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'in', label: 'in' },
  { value: 'ft', label: 'ft' },
  { value: 'px', label: 'px' },
];

export function isLengthUnit(v: unknown): v is LengthUnit {
  return typeof v === 'string' && v in MM_PER_UNIT;
}

/** Text typed in `unit` → millimetres as a string ('' when empty / not a number). */
export function toMmString(text: string, unit: LengthUnit): string {
  if (text.trim() === '') return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * MM_PER_UNIT[unit] * 10000) / 10000);
}

/** A number of millimetres → the unit, trimmed of trailing zeros. */
export function formatLength(mm: number, unit: LengthUnit): string {
  if (!Number.isFinite(mm)) return '';
  const f = 10 ** DECIMALS[unit];
  return String(Math.round((mm / MM_PER_UNIT[unit]) * f) / f);
}

/** A millimetre string (as stored) → text for the unit. */
export function mmStringToText(mm: string, unit: LengthUnit): string {
  return mm.trim() === '' ? '' : formatLength(Number(mm), unit);
}

// One unit choice shared by every size field, remembered in this browser.
const UNIT_KEY = 'ulaa-length-unit-v1';
const listeners = new Set<() => void>();
let current: LengthUnit = 'mm';
try {
  const saved = window.localStorage.getItem(UNIT_KEY);
  if (isLengthUnit(saved)) current = saved;
} catch { /* storage unavailable */ }

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useLengthUnit(): [LengthUnit, (u: LengthUnit) => void] {
  const unit = useSyncExternalStore(subscribe, () => current, () => 'mm' as LengthUnit);
  const set = (u: LengthUnit) => {
    current = u;
    try { window.localStorage.setItem(UNIT_KEY, u); } catch { /* storage unavailable */ }
    listeners.forEach(l => l());
  };
  return [unit, set];
}
