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
// admin-picked icon. Matches common packing-list keywords to a
// representative icon, falling back to the Backpack icon for anything
// unrecognized.
const THINGS_TO_CARRY_ICON_RULES: [RegExp, TripHighlightIconType][] = [
  [/jacket|sweater|hoodie|fleece|thermal/i, Shirt],
  [/shoe|boot|sandal|footwear|trek/i, Footprints],
  [/sunglass|goggle/i, Glasses],
  [/cap|hat/i, HatGlasses],
  [/glove|mitten/i, Hand],
  [/earphone|headphone|earbud/i, Headphones],
  [/adapter|\bplug\b|converter/i, PlugZap],
  [/power ?bank|charger|battery/i, BatteryCharging],
  [/medicine|medication|pill|first aid/i, Pill],
  [/sunscreen|spf/i, SprayCan],
  [/moistur|lotion|cream/i, Droplet],
  [/water ?bottle|bottle/i, GlassWater],
  [/snack|food/i, Cookie],
  [/wipe|sanitiz|towel/i, Sparkles],
  [/tissue|paper/i, FileText],
  // Photo/photograph checked before the passport/id-proof rule below, since
  // "Passport-size photographs" would otherwise match on "passport".
  [/passport.{0,10}photo|photograph/i, Camera],
  [/\beta\b|visa|travel authoriz|entry permit/i, Stamp],
  [/flight|air ticket|boarding pass|\bticket/i, Plane],
  [/insurance/i, ShieldCheck],
  [/debit card|credit card|currency|rupee|\bcash\b/i, CreditCard],
  [/id proof|passport|aadhar|adhar|govern|voter|licen|document/i, IdCard],
];

export function getThingsToCarryIcon(item: string): TripHighlightIconType {
  const rule = THINGS_TO_CARRY_ICON_RULES.find(([pattern]) => pattern.test(item));
  return rule ? rule[1] : Backpack;
}
