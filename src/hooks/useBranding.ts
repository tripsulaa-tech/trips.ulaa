import { useSyncExternalStore } from 'react';
import { getSiteContent } from '../services/api';
import { subscribeToTable } from '../services/realtime';

// Admin-editable brand images (header logo, footer logo, favicon, ...),
// stored as a single `site_content` row under BRANDING_KEY. Every slot is
// optional: an empty/missing value means "use the file bundled in /public",
// so the site looks exactly as before until an admin uploads something.
//
// Shared module-level store (rather than per-component state) so the Navbar,
// Footer, favicon swapper, install banner and admin chrome all read the same
// value from one fetch + one realtime subscription, and so an admin's save
// can be pushed into the store instantly (applyBranding) without waiting on
// the realtime round-trip.

export const BRANDING_KEY = 'branding';

export type BrandingSlot =
  | 'header_logo'
  | 'footer_logo'
  | 'favicon'
  | 'app_icon'
  | 'admin_logo'
  | 'admin_icon';

export type BrandingContent = Record<BrandingSlot, string>;

export const BRANDING_SLOTS: BrandingSlot[] = [
  'header_logo',
  'footer_logo',
  'favicon',
  'app_icon',
  'admin_logo',
  'admin_icon',
];

// Files bundled in /public that each slot falls back to.
export const BRANDING_DEFAULTS: BrandingContent = {
  header_logo: '/ULAA-logo-Header.png',
  footer_logo: '/ULAA-logo-Footer.png',
  favicon: '/icons/user/favicon-32.png',
  app_icon: '/icons/user/icon-192.png',
  admin_logo: '/ULAA.svg',
  admin_icon: '/favicon.svg',
};

export const EMPTY_BRANDING: BrandingContent = {
  header_logo: '',
  footer_logo: '',
  favicon: '',
  app_icon: '',
  admin_logo: '',
  admin_icon: '',
};

const CACHE_KEY = 'ulaa:branding';

// Only ever render an <img src> we'd expect: our own storage / a same-site
// path / an https URL. Anything else (javascript:, data: from a tampered
// cache, etc.) is dropped and the bundled default is used instead.
function isSafeUrl(value: string): boolean {
  return value.startsWith('/') || /^https:\/\//i.test(value);
}

export function normalizeBranding(data: unknown): BrandingContent {
  const out: BrandingContent = { ...EMPTY_BRANDING };
  if (data && typeof data === 'object') {
    for (const slot of BRANDING_SLOTS) {
      const v = (data as Record<string, unknown>)[slot];
      if (typeof v === 'string' && isSafeUrl(v.trim())) out[slot] = v.trim();
    }
  }
  return out;
}

function readCache(): BrandingContent {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? normalizeBranding(JSON.parse(raw)) : { ...EMPTY_BRANDING };
  } catch {
    return { ...EMPTY_BRANDING };
  }
}

// Cached copy lets a returning visitor see their custom logo on first paint
// instead of flashing the bundled one until the fetch resolves.
let state: BrandingContent = typeof window === 'undefined' ? { ...EMPTY_BRANDING } : readCache();
const listeners = new Set<() => void>();
let unsubscribeRealtime: (() => void) | null = null;

function setState(next: BrandingContent) {
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — branding still works for this session.
  }
  listeners.forEach(l => l());
}

async function refresh() {
  try {
    setState(normalizeBranding(await getSiteContent<unknown>(BRANDING_KEY)));
  } catch {
    // Keep whatever we have (cached or defaults) if the fetch fails.
  }
}

/** Push freshly-saved branding into the store immediately (admin save). */
export function applyBranding(next: BrandingContent) {
  setState(normalizeBranding(next));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    unsubscribeRealtime = subscribeToTable('site_content', () => void refresh(), `key=eq.${BRANDING_KEY}`);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeRealtime?.();
      unsubscribeRealtime = null;
    }
  };
}

const getSnapshot = () => state;

/**
 * `custom` is what the admin has uploaded (empty string = nothing uploaded);
 * `urls` is what to actually render — the upload if present, otherwise the
 * bundled default.
 */
export function useBranding() {
  const custom = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const urls: BrandingContent = { ...BRANDING_DEFAULTS };
  for (const slot of BRANDING_SLOTS) if (custom[slot]) urls[slot] = custom[slot];
  return { custom, urls };
}
