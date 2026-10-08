// =============================================
// Trip options & packages — shared helpers
// =============================================
// Used by the public trip page, the booking form and the admin editors so
// they all price a package the same way: active base price + the extra
// price of every option it ticks.
import type { TripOption, TripPackage, TripOptionsConfig, UpcomingTrip } from '../types/types-index';
import { getActivePrice, earlyBirdSeatsLeft } from './utils-index';

export const emptyTripOptions: TripOptionsConfig = { options: [], packages: [] };

// The top-tier package gets the golden styling (.premium-gold-border /
// .premium-gold-text in globals.css). Matched by name because package names
// are admin-defined text (e.g. "Premium", "Premium Plus").
export const isPremiumPackage = (name?: string | null): boolean => !!name && /premium/i.test(name);

let counter = 0;
export const newOptionId = (prefix: 'opt' | 'pkg') =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

function optionsPrice(optionIds: string[], cfg?: TripOptionsConfig | null): number {
  if (!cfg) return 0;
  const chosen = new Set(optionIds);
  return cfg.options.reduce((sum, o) => (chosen.has(o.id) ? sum + Math.max(0, o.price || 0) : sum), 0);
}

// Option ids that actually exist on the trip — drops stale ids left in a
// package after an option was deleted.
function validOptionIds(optionIds: string[], cfg?: TripOptionsConfig | null): string[] {
  if (!cfg) return [];
  const known = new Set(cfg.options.map(o => o.id));
  return optionIds.filter(id => known.has(id));
}

export function packageOptionIds(pkg: TripPackage, cfg?: TripOptionsConfig | null): string[] {
  return validOptionIds(pkg.option_ids || [], cfg);
}

// What the trip charges today for the plain trip, split so each package can
// pick the right one: `active` is what getActivePrice returns (early-bird /
// special-offer / regular), `regular` is the plain trip price, `isEarlyBird`
// says whether `active` is the early-bird price, and `earlyWindowOpen` says
// whether the trip's early-bird deadline hasn't passed (needed by packages
// that carry their own early-bird price). `seatLimited` says the trip's early
// bird is by SEATS (first N paid people): then it is a trip-level price that
// does not depend on the package's early-bird flag, and packages with their
// own fixed price never get it.
export interface PackageBase {
  active: number | null | undefined;
  regular: number | null | undefined;
  isEarlyBird: boolean;
  earlyWindowOpen: boolean;
  seatLimited: boolean;
  // Seat mode only: ₹ off every package while early-bird seats last
  // (regular trip price minus early-bird trip price, e.g. 1999 - 1799 = 200).
  seatDiscount: number;
}

export const noPackageBase: PackageBase = { active: null, regular: null, isEarlyBird: false, earlyWindowOpen: false, seatLimited: false, seatDiscount: 0 };

// True when the trip's early bird is limited by seats rather than a date.
// ₹ the early bird takes off a package in seat mode (0 when not applicable).
const seatEarlyDiscount = (trip: Pick<UpcomingTrip, 'price' | 'early_bird_price'>): number =>
  trip.price != null && trip.early_bird_price != null ? Math.max(0, trip.price - trip.early_bird_price) : 0;

const isSeatLimitedEarlyBird = (trip: Pick<UpcomingTrip, 'early_bird_seats'>): boolean =>
  !!trip.early_bird_seats && trip.early_bird_seats > 0;

export function getPackageBase(
  trip: Pick<UpcomingTrip, 'price' | 'early_bird_price' | 'early_bird_deadline' | 'special_offer_price' | 'special_offer_date' | 'special_offer_end_date' | 'early_bird_seats' | 'early_bird_seats_taken'>,
): PackageBase {
  const { activePrice, isEarlyBird } = getActivePrice(
    trip.price, trip.early_bird_price, trip.early_bird_deadline,
    trip.special_offer_price, trip.special_offer_date, trip.special_offer_end_date,
    trip.early_bird_seats, trip.early_bird_seats_taken,
  );
  const seatLimited = earlyBirdSeatsLeft(trip) !== null;
  let earlyWindowOpen = false;
  if (!seatLimited && trip.early_bird_deadline) {
    const deadline = new Date(trip.early_bird_deadline);
    deadline.setHours(23, 59, 59, 999);
    earlyWindowOpen = new Date() <= deadline;
  }
  return { active: activePrice, regular: trip.price, isEarlyBird, earlyWindowOpen, seatLimited, seatDiscount: seatLimited ? seatEarlyDiscount(trip) : 0 };
}

// A package with an admin-set price ignores the trip price and its options'
// prices entirely — the number the admin typed is what the traveler pays.
export function hasOwnPrice(pkg: TripPackage): boolean {
  return pkg.price != null && pkg.price > 0;
}

// What one traveler pays for this package today.
//   price       null when there's nothing to show (no own price and the trip
//               has no price) — the UI then shows only the "+₹ extra".
//   extra       options' price on top of the trip price (0 for own-price).
//   isEarlyBird the price shown is the early-bird one.
export function packageQuote(
  pkg: TripPackage,
  cfg: TripOptionsConfig,
  base: PackageBase,
): { price: number | null; extra: number; isEarlyBird: boolean } {
  if (hasOwnPrice(pkg)) {
    // Seat-limited early bird: the same ₹ discount comes off any package.
    if (base.seatLimited && base.isEarlyBird && base.seatDiscount > 0) {
      return { price: Math.max(0, pkg.price! - base.seatDiscount), extra: 0, isEarlyBird: true };
    }
    if (base.earlyWindowOpen && pkg.early_bird && pkg.early_bird_price != null && pkg.early_bird_price > 0) {
      return { price: pkg.early_bird_price, extra: 0, isEarlyBird: true };
    }
    return { price: pkg.price!, extra: 0, isEarlyBird: false };
  }
  // Derived: early-bird trip price only reaches packages flagged for it.
  const extra = optionsPrice(packageOptionIds(pkg, cfg), cfg);
  // (Seat-limited early bird is trip-level: it reaches every such package.)
  const earlyForPkg = !!pkg.early_bird || base.seatLimited;
  const isEarlyBird = base.isEarlyBird && earlyForPkg;
  const baseAmount = base.isEarlyBird && !earlyForPkg ? (base.regular ?? base.active) : base.active;
  return { price: baseAmount != null ? baseAmount + extra : null, extra, isEarlyBird };
}

// The trip as it should be PRICED in headline spots (trip cards, trip page
// price box, sticky bar, itinerary PDF): the first package's price — Basic —
// so travelers see the entry price first and find Premium etc. in the
// package picker. Every other field is untouched, and trips without packages
// come back as-is. Only use it for display; booking/pricing of a chosen
// package goes through packageQuote().
export function withBasicPricing<T extends UpcomingTrip>(trip: T): T {
  const cfg = trip.trip_options;
  if (!hasPackages(cfg)) return trip;
  const first = cfg.packages[0];
  if (hasOwnPrice(first)) {
    // Admin typed the package's price: it replaces the trip's prices, and
    // trip-level special-offer pricing no longer applies to it.
    return {
      ...trip,
      price: first.price ?? undefined,
      // Seat mode: the trip's early-bird discount comes off the package price.
      early_bird_price: isSeatLimitedEarlyBird(trip)
        ? (seatEarlyDiscount(trip) > 0 ? Math.max(0, (first.price ?? 0) - seatEarlyDiscount(trip)) : null)
        : first.early_bird && first.early_bird_price != null && first.early_bird_price > 0 ? first.early_bird_price : null,
      special_offer_price: null,
      special_offer_date: null,
      special_offer_end_date: null,
    };
  }
  // No own price: trip price + the package's options; early-bird only if
  // the package is flagged for it.
  const extra = optionsPrice(packageOptionIds(first, cfg), cfg);
  return {
    ...trip,
    price: trip.price != null ? trip.price + extra : trip.price,
    early_bird_price: (first.early_bird || isSeatLimitedEarlyBird(trip)) && trip.early_bird_price != null ? trip.early_bird_price + extra : null,
    special_offer_price: trip.special_offer_price != null ? trip.special_offer_price + extra : trip.special_offer_price,
  };
}

// Label for a package's price: "₹12,000", "+₹1,200" (no trip price) or
// "Included".
export function packagePriceLabel(q: { price: number | null; extra: number }, format: (n: number) => string): string {
  return q.price != null ? format(q.price) : q.extra > 0 ? `+${format(q.extra)}` : 'Included';
}

// List price (before any discount) an enquiry on this package should carry
// for the given price tier. undefined = can't be worked out.
export function packageListPrice(
  pkg: TripPackage | undefined,
  cfg: TripOptionsConfig | null | undefined,
  trip: Pick<UpcomingTrip, 'price' | 'early_bird_price' | 'early_bird_seats'>,
  tier: 'early_bird' | 'normal',
): number | undefined {
  if (pkg && cfg && hasOwnPrice(pkg)) {
    if (tier === 'early_bird' && isSeatLimitedEarlyBird(trip)) return Math.max(0, pkg.price! - seatEarlyDiscount(trip));
    if (tier === 'early_bird' && pkg.early_bird && pkg.early_bird_price != null && pkg.early_bird_price > 0) return pkg.early_bird_price;
    return pkg.price!;
  }
  const tripPrice = tier === 'early_bird' ? trip.early_bird_price : trip.price;
  if (tripPrice == null) return undefined;
  return tripPrice + (pkg && cfg ? optionsPrice(packageOptionIds(pkg, cfg), cfg) : 0);
}

export function includedOptions(pkg: TripPackage, cfg: TripOptionsConfig): TripOption[] {
  const ids = new Set(packageOptionIds(pkg, cfg));
  return cfg.options.filter(o => ids.has(o.id));
}

// Drops blank/unnamed rows and dangling references before saving so the DB
// never holds half-filled entries. Returns null when nothing is left, which
// is stored as "no packages" (same as never having configured any).
export function cleanTripOptions(cfg: TripOptionsConfig): TripOptionsConfig | null {
  const options = cfg.options
    .map(o => ({ ...o, name: o.name.trim(), description: (o.description || '').trim(), price: o.price ?? 0 }))
    .filter(o => o.name);
  const known = new Set(options.map(o => o.id));
  const packages = cfg.packages
    .map(p => ({
      ...p,
      name: p.name.trim(),
      description: (p.description || '').trim(),
      option_ids: (p.option_ids || []).filter(id => known.has(id)),
      early_bird: !!p.early_bird,
      price: p.price != null && p.price > 0 ? p.price : null,
      early_bird_price: p.early_bird && p.early_bird_price != null && p.early_bird_price > 0 ? p.early_bird_price : null,
    }))
    .filter(p => p.name);
  if (options.length === 0 && packages.length === 0) return null;
  return { options, packages };
}

// Public page only offers packages (options alone stay an admin-side tool
// for per-booking tweaks). A trip with no packages behaves exactly as it
// did before this feature existed.
export function hasPackages(cfg?: TripOptionsConfig | null): cfg is TripOptionsConfig {
  return !!cfg && cfg.packages.length > 0;
}

// Splits `groupSize` seats across packages. The first package takes
// whatever is left after the others' counts (mirrors how the form's
// veg/non-veg split works), so the counts always add up to the group.
export function seatPackageAssignments(
  cfg: TripOptionsConfig,
  groupSize: number,
  counts: Record<string, number>,
): { package_id: string; selected_option_ids: string[] }[] {
  const [first, ...rest] = cfg.packages;
  const seats: { package_id: string; selected_option_ids: string[] }[] = [];
  let used = 0;
  for (const pkg of rest) {
    const n = Math.max(0, Math.min(Math.round(counts[pkg.id] || 0), groupSize - used));
    used += n;
    for (let i = 0; i < n; i++) seats.push({ package_id: pkg.id, selected_option_ids: packageOptionIds(pkg, cfg) });
  }
  for (let i = used; i < groupSize; i++) seats.push({ package_id: first.id, selected_option_ids: packageOptionIds(first, cfg) });
  // First package's seats first, so seat order is stable/readable.
  return seats.sort((a, b) => (a.package_id === first.id ? 0 : 1) - (b.package_id === first.id ? 0 : 1));
}

// How many of these bookings took each option (option id -> people). Feeds
// the finance summary so an activity's cost is counted from what travelers
// actually picked instead of a number typed in by hand.
export function countOptionSelections(
  bookings: { selected_option_ids?: string[] | null }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of bookings) {
    for (const id of new Set(b.selected_option_ids || [])) counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}
