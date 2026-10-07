// Icon lookup for the site-wide navigation (BottomNav + Footer).
//
// Both components render on every page, so they must NOT statically import
// constants/tripHighlightIcons.ts: that file is the ~1,500-icon catalogue
// (names, labels, search keywords) used by the admin picker and trip pages,
// and importing it here dragged all of it into the main bundle.
//
// Instead, the tabs' built-in icons (see constants/bottomNav.ts) resolve
// instantly from a few static imports, and the catalogue is only fetched
// (once, then cached) when an admin has saved a tab with some other icon.
import { useEffect, useState } from 'react';
import {
  Calendar,
  Headphones,
  Heart,
  House,
  PersonSimpleSki,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';

type IconCatalogue = typeof import('../constants/tripHighlightIcons');

// Keys must match the entries in constants/tripHighlightIcons.ts.
const BUILT_IN_NAV_ICONS: Record<string, PhosphorIcon> = {
  home: House,
  calendar: Calendar,
  'mountain-snow': PersonSimpleSki,
  heart: Heart,
  headphones: Headphones,
};

const normalise = (key: string | null | undefined) => (key ?? '').trim().toLowerCase();

let loadedCatalogue: IconCatalogue | null = null;
let pendingCatalogue: Promise<IconCatalogue> | null = null;

function loadCatalogue(): Promise<IconCatalogue> {
  pendingCatalogue ??= import('../constants/tripHighlightIcons').then(mod => {
    loadedCatalogue = mod;
    return mod;
  });
  return pendingCatalogue;
}

/**
 * Returns a function that resolves an icon key to a Phosphor icon, falling
 * back to the Home icon for unknown keys (same as before). Triggers the
 * one-time catalogue download only if some key isn't a built-in one.
 */
export function useNavIconResolver(keys: (string | null | undefined)[]): (key: string | null | undefined) => PhosphorIcon {
  const [catalogue, setCatalogue] = useState<IconCatalogue | null>(loadedCatalogue);
  const needsCatalogue = keys.some(key => !(normalise(key) in BUILT_IN_NAV_ICONS));

  useEffect(() => {
    if (!needsCatalogue || catalogue) return;
    let cancelled = false;
    loadCatalogue()
      .then(mod => { if (!cancelled) setCatalogue(mod); })
      .catch(() => { /* keep the Home fallback if the chunk fails to load */ });
    return () => { cancelled = true; };
  }, [needsCatalogue, catalogue]);

  return key => {
    const k = normalise(key);
    return BUILT_IN_NAV_ICONS[k] ?? catalogue?.getTripHighlightIcon(k)?.Icon ?? House;
  };
}
