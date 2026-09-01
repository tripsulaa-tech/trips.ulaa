import { useState, useEffect } from 'react';
import {
  Backpack,
  ShirtFolded as Shirt,
  Footprints,
  Sunglasses as Glasses,
  Beanie as HatGlasses,
  Headphones,
  BatteryCharging,
  Pill,
  Drop as SprayCan,
  Drop as Droplet,
  Drop as GlassWater,
  Cookie,
  Sparkle as Sparkles,
  FileText,
  IdentificationCard as IdCard,
  Hand,
  ShieldCheck,
  Stamp,
  Airplane as Plane,
  CreditCard,
  Camera,
  Plug as PlugZap,
} from '@phosphor-icons/react';
import type { TripHighlightIconType } from '../../constants/tripHighlightIcons';
import { matchThingsToCarryIconKey, type ThingsToCarryIconKey } from '../../constants/thingsToCarryIconRules';

// Tracks whether the viewport is at/above the `sm` breakpoint (640px) so
// scroll-triggered entrance animations can be skipped on mobile (per design
// request) while remaining on larger screens.
export function useIsDesktop(): boolean {
  const getValue = () => (typeof window === 'undefined' ? true : window.innerWidth >= 640);
  const [isDesktop, setIsDesktop] = useState(getValue);

  useEffect(() => {
    const onResize = () => setIsDesktop(getValue());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isDesktop;
}

// Maps the number of itinerary days to a responsive grid so the cards always
// land in the requested row pattern on larger screens (2→one row of 2,
// 3→one row of 3, 4→2+2, 5→3+2, 6→3+3) while still stacking to fewer
// columns on narrow screens instead of ever scrolling horizontally.
export function getItineraryGridClass(days: number): string {
  switch (days) {
    case 1:
      return 'grid-cols-1';
    case 2:
      return 'grid-cols-1 sm:grid-cols-2';
    case 4:
      return 'grid-cols-1 sm:grid-cols-2';
    default:
      // 3, 5, 6, and anything larger: 3 per row on large screens, which
      // naturally wraps into the 3+2 / 3+3 pattern for 5/6-day trips.
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
}

// Fallback icon matching for Things to Carry items that don't have an
// admin-picked icon. The keyword→key matching rules are shared with the PDF
// export (see constants/thingsToCarryIconRules.ts) so both resolve to the
// same *kind* of glyph; only the icon components themselves differ here
// (this app uses @phosphor-icons/react, the PDF uses lucide-react).
const THINGS_TO_CARRY_ICONS: Record<ThingsToCarryIconKey | 'default', TripHighlightIconType> = {
  jacket: Shirt,
  shoe: Footprints,
  sunglasses: Glasses,
  cap: HatGlasses,
  glove: Hand,
  earphone: Headphones,
  adapter: PlugZap,
  powerBank: BatteryCharging,
  medicine: Pill,
  sunscreen: SprayCan,
  moisturizer: Droplet,
  waterBottle: GlassWater,
  snack: Cookie,
  wipe: Sparkles,
  tissue: FileText,
  photo: Camera,
  visa: Stamp,
  flight: Plane,
  insurance: ShieldCheck,
  card: CreditCard,
  idProof: IdCard,
  default: Backpack,
};

export function getThingsToCarryIcon(item: string): TripHighlightIconType {
  return THINGS_TO_CARRY_ICONS[matchThingsToCarryIconKey(item)];
}
