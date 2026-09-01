// Fallback icon matching for Things to Carry items that don't have an
// admin-picked icon. Matches common packing-list keywords to a
// representative icon key, falling back to 'default' (Backpack) for
// anything unrecognized.
//
// Used by both the live site (src/pages/trip-detail/tripDetailUtils.ts,
// via @phosphor-icons/react) and the PDF export
// (src/utils/pdf/itinerary/shared.ts, via lucide-react) so an admin-typed
// item with no explicit icon resolves to the same *kind* of glyph in both
// places, even though each renders it through a different icon library.
// Only the keyword→key mapping lives here; each caller supplies its own
// key→icon-component lookup.
export type ThingsToCarryIconKey =
  | 'jacket' | 'shoe' | 'sunglasses' | 'cap' | 'glove' | 'earphone'
  | 'adapter' | 'powerBank' | 'medicine' | 'sunscreen' | 'moisturizer'
  | 'waterBottle' | 'snack' | 'wipe' | 'tissue' | 'photo' | 'visa'
  | 'flight' | 'insurance' | 'card' | 'idProof';

export const THINGS_TO_CARRY_ICON_RULES: [RegExp, ThingsToCarryIconKey][] = [
  [/jacket|sweater|hoodie|fleece|thermal/i, 'jacket'],
  [/shoe|boot|sandal|footwear|trek/i, 'shoe'],
  [/sunglass|goggle/i, 'sunglasses'],
  [/cap|hat/i, 'cap'],
  [/glove|mitten/i, 'glove'],
  [/earphone|headphone|earbud/i, 'earphone'],
  [/adapter|\bplug\b|converter/i, 'adapter'],
  [/power ?bank|charger|battery/i, 'powerBank'],
  [/medicine|medication|pill|first aid/i, 'medicine'],
  [/sunscreen|spf/i, 'sunscreen'],
  [/moistur|lotion|cream/i, 'moisturizer'],
  [/water ?bottle|bottle/i, 'waterBottle'],
  [/snack|food/i, 'snack'],
  [/wipe|sanitiz|towel/i, 'wipe'],
  [/tissue|paper/i, 'tissue'],
  // Photo/photograph checked before the passport/id-proof rule below, since
  // "Passport-size photographs" would otherwise match on "passport".
  [/passport.{0,10}photo|photograph/i, 'photo'],
  [/\beta\b|visa|travel authoriz|entry permit/i, 'visa'],
  [/flight|air ticket|boarding pass|\bticket/i, 'flight'],
  [/insurance/i, 'insurance'],
  [/debit card|credit card|currency|rupee|\bcash\b/i, 'card'],
  [/id proof|passport|aadhar|adhar|govern|voter|licen|document/i, 'idProof'],
];

/** Looks up the icon key for a Things to Carry item's free text, or 'default' if nothing matches. */
export function matchThingsToCarryIconKey(item: string): ThingsToCarryIconKey | 'default' {
  const rule = THINGS_TO_CARRY_ICON_RULES.find(([pattern]) => pattern.test(item));
  return rule ? rule[1] : 'default';
}
