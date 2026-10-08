// Tiny haptics helper for the mini-games.
//
// Android / Chrome: navigator.vibrate with short, distinct patterns.
// iOS Safari (17.4+): vibrate() doesn't exist, but toggling a native
// <input type="checkbox" switch> from inside a user gesture produces a real
// system tick, so a hidden one is used as a fallback (single light tick only).
// Everything is a silent no-op where unsupported, and skipped entirely when
// the user prefers reduced motion or has switched haptics off.

export type Haptic = 'tap' | 'select' | 'success' | 'error' | 'gold' | 'power' | 'tick' | 'win' | 'end' | 'heavy';

const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 8,
  select: 12,
  tick: 10,
  success: [14, 28, 18],
  gold: [12, 24, 12, 24, 30],
  power: [10, 20, 26],
  error: [38, 44, 38],
  heavy: 45,
  win: [18, 40, 18, 40, 18, 40, 60],
  end: [30, 50, 20],
};

const OFF_KEY = 'ulaa:games:haptics-off';

let iosSwitch: HTMLInputElement | null = null;

function iosTick() {
  if (typeof document === 'undefined') return;
  try {
    if (!iosSwitch) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = input;
    }
    iosSwitch.parentElement?.click();
  } catch { /* no haptics */ }
}

export function hapticsEnabled(): boolean {
  try {
    if (localStorage.getItem(OFF_KEY) === '1') return false;
  } catch { /* default on */ }
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  } catch { /* default on */ }
  return true;
}

export function setHapticsEnabled(on: boolean) {
  try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* not remembered */ }
}

export function haptic(kind: Haptic) {
  if (!hapticsEnabled()) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind]);
      return;
    }
  } catch { /* fall through */ }
  iosTick();
}
