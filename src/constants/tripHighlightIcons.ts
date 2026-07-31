import {
  Palmtree, Waves, Umbrella, Sailboat, Ship, Anchor, Fish, Sunset, Sunrise,
  Coffee, Utensils, Wine, IceCreamCone, Cherry, Grape, Beer,
  PawPrint, Bird, Binoculars, Compass, Backpack, Tent, TentTree, MountainSnow, Mountain, TreePine, Trees, Bike,
  Leaf, Flower, Flower2, TreeDeciduous, Snowflake, Sun,
  ShoppingBag, Gift, Ticket, Music, Guitar, Drum, Camera,
  Heart, Users, Handshake, Sparkles, Star,
  Landmark, Castle, Building2,
  Plane, Car, TrainFront, CableCar,
  ShieldCheck, Shield, Phone, HeartHandshake, BadgeCheck, Clock, Headset, LifeBuoy, Lock, UserCheck,
  Hotel, Venus, UserRoundCheck, PhoneCall, MapPinned,
  Shirt, Footprints, Hand, Glasses, HatGlasses, BatteryCharging, Pill, IdCard, GlassWater,
  X, HelpCircle, Frown, Smile, AlertCircle, Meh,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// =============================================
// ULAA — Trip Highlight Icon Library
// =============================================
// Curated set of "app theme" icons admins can pick from when building the
// "Why You'll Love This Trip" cards (TripHighlightCard.icon). Each entry has
// search keywords so the admin icon picker can auto-suggest matches as soon
// as a heading like "Beaches" or "Wild Adventure" is typed.
//
// `icon` is stored on the trip as this `key` string (e.g. "palmtree"), not
// the emoji itself — this keeps old emoji-based data working too, since the
// display components fall back to rendering the raw string if the key isn't
// found here (see resolveTripHighlightIcon in TripHighlightIcon.tsx).

export interface TripHighlightIconMeta {
  key: string;
  label: string;
  Icon: LucideIcon;
  keywords: string[];
}

export const TRIP_HIGHLIGHT_ICONS: TripHighlightIconMeta[] = [
  // Beach & coastal
  { key: 'palmtree', label: 'Palm Tree', Icon: Palmtree, keywords: ['beach', 'beaches', 'palm', 'tropical', 'coast', 'coastal', 'seaside', 'island'] },
  { key: 'waves', label: 'Waves', Icon: Waves, keywords: ['waves', 'sea', 'ocean', 'surf', 'surfing', 'coast'] },
  { key: 'umbrella', label: 'Beach Umbrella', Icon: Umbrella, keywords: ['beach', 'umbrella', 'sunbathe', 'relax', 'lounge'] },
  { key: 'sailboat', label: 'Sailboat', Icon: Sailboat, keywords: ['boat', 'sailing', 'cruise', 'lake', 'sea'] },
  { key: 'ship', label: 'Ship', Icon: Ship, keywords: ['cruise', 'ferry', 'boat', 'ship'] },
  { key: 'anchor', label: 'Anchor', Icon: Anchor, keywords: ['nautical', 'port', 'harbor', 'sea'] },
  { key: 'fish', label: 'Fish', Icon: Fish, keywords: ['snorkel', 'snorkeling', 'diving', 'marine', 'fish', 'reef'] },
  { key: 'sunset', label: 'Sunset', Icon: Sunset, keywords: ['sunset', 'evening', 'golden hour', 'beach walks'] },
  { key: 'sunrise', label: 'Sunrise', Icon: Sunrise, keywords: ['sunrise', 'morning', 'dawn'] },

  // Food & cafés
  { key: 'coffee', label: 'Coffee', Icon: Coffee, keywords: ['coffee', 'cafe', 'cafes', 'breakfast', 'brew', 'mornings'] },
  { key: 'utensils', label: 'Dining', Icon: Utensils, keywords: ['food', 'dining', 'meal', 'meals', 'cuisine', 'local food'] },
  { key: 'wine', label: 'Wine', Icon: Wine, keywords: ['wine', 'drinks', 'vineyard', 'winery'] },
  { key: 'ice-cream', label: 'Ice Cream', Icon: IceCreamCone, keywords: ['dessert', 'sweet', 'icecream', 'ice cream', 'treats'] },
  { key: 'cherry', label: 'Cherry', Icon: Cherry, keywords: ['orchard', 'local produce', 'fruit'] },
  { key: 'grape', label: 'Grapes', Icon: Grape, keywords: ['vineyard', 'wine', 'orchard', 'fruit'] },
  { key: 'beer', label: 'Beer', Icon: Beer, keywords: ['nightlife', 'brewery', 'drinks', 'bar'] },

  // Wildlife & adventure
  { key: 'paw-print', label: 'Paw Print', Icon: PawPrint, keywords: ['wildlife', 'wild adventure', 'safari', 'animal', 'animals', 'jungle', 'leopards', 'elephants'] },
  { key: 'bird', label: 'Bird', Icon: Bird, keywords: ['birdwatching', 'birds', 'wildlife'] },
  { key: 'binoculars', label: 'Binoculars', Icon: Binoculars, keywords: ['safari', 'wildlife spotting', 'birdwatching', 'jeep safari'] },
  { key: 'compass', label: 'Compass', Icon: Compass, keywords: ['adventure', 'explore', 'exploration', 'trek', 'navigation', 'wild adventure'] },
  { key: 'backpack', label: 'Backpack', Icon: Backpack, keywords: ['trekking', 'hiking', 'backpacking', 'adventure'] },
  { key: 'tent', label: 'Tent', Icon: Tent, keywords: ['camping', 'campsite', 'outdoors'] },
  { key: 'tent-tree', label: 'Glamping', Icon: TentTree, keywords: ['glamping', 'camp', 'nature camp'] },
  { key: 'mountain', label: 'Mountain', Icon: Mountain, keywords: ['mountain', 'mountains', 'trek', 'trekking', 'hill', 'peak'] },
  { key: 'mountain-snow', label: 'Snow Mountain', Icon: MountainSnow, keywords: ['mountain', 'snow', 'ski', 'winter peak', 'himalaya'] },
  { key: 'tree-pine', label: 'Pine Forest', Icon: TreePine, keywords: ['forest', 'pine', 'nature', 'mountains'] },
  { key: 'trees', label: 'Forest', Icon: Trees, keywords: ['forest', 'jungle', 'greenery', 'nature'] },
  { key: 'bike', label: 'Cycling', Icon: Bike, keywords: ['cycling', 'biking', 'adventure'] },

  // Nature & local experiences
  { key: 'leaf', label: 'Leaf', Icon: Leaf, keywords: ['nature', 'local experiences', 'eco', 'conservation', 'green', 'turtle conservation'] },
  { key: 'flower', label: 'Flower', Icon: Flower, keywords: ['garden', 'floral', 'nature', 'spring'] },
  { key: 'flower-2', label: 'Blossom', Icon: Flower2, keywords: ['garden', 'floral', 'wellness', 'spa'] },
  { key: 'tree-deciduous', label: 'Tree', Icon: TreeDeciduous, keywords: ['forest', 'nature', 'countryside'] },
  { key: 'snowflake', label: 'Snowflake', Icon: Snowflake, keywords: ['winter', 'snow', 'cold', 'ski'] },
  { key: 'sun', label: 'Sun', Icon: Sun, keywords: ['sunny', 'weather', 'warm', 'summer'] },

  // Shopping & fun
  { key: 'shopping-bag', label: 'Shopping', Icon: ShoppingBag, keywords: ['shopping', 'shopping & fun', 'market', 'souvenirs', 'bazaar'] },
  { key: 'gift', label: 'Gift', Icon: Gift, keywords: ['souvenirs', 'gifts', 'shopping'] },
  { key: 'ticket', label: 'Ticket', Icon: Ticket, keywords: ['entry', 'events', 'attractions', 'tickets'] },
  { key: 'music', label: 'Music', Icon: Music, keywords: ['nightlife', 'festival', 'live music', 'fun'] },
  { key: 'guitar', label: 'Guitar', Icon: Guitar, keywords: ['music', 'culture', 'bonfire'] },
  { key: 'drum', label: 'Drum', Icon: Drum, keywords: ['festival', 'culture', 'celebration'] },
  { key: 'camera', label: 'Camera', Icon: Camera, keywords: ['photography', 'sightseeing', 'photo spot', 'memories'] },

  // Girls-only / social vibes
  { key: 'heart', label: 'Heart', Icon: Heart, keywords: ['love', 'vibes', 'girls-only vibes', 'bonding', 'girl gang', 'safe space'] },
  { key: 'users', label: 'Group', Icon: Users, keywords: ['group', 'squad', 'friends', 'girl gang', 'community'] },
  { key: 'handshake', label: 'Handshake', Icon: Handshake, keywords: ['community', 'bonding', 'trust'] },
  { key: 'sparkles', label: 'Sparkles', Icon: Sparkles, keywords: ['magic', 'memories', 'fun', 'special'] },
  { key: 'star', label: 'Star', Icon: Star, keywords: ['special', 'favorite', 'unforgettable', 'highlight'] },

  // Culture & heritage
  { key: 'landmark', label: 'Landmark', Icon: Landmark, keywords: ['heritage', 'monument', 'culture', 'history', 'local experiences'] },
  { key: 'castle', label: 'Castle', Icon: Castle, keywords: ['fort', 'palace', 'heritage', 'history'] },
  { key: 'building-2', label: 'Architecture', Icon: Building2, keywords: ['architecture', 'city', 'urban'] },

  // Transport
  { key: 'plane', label: 'Flight', Icon: Plane, keywords: ['flight', 'travel', 'airport'] },
  { key: 'car', label: 'Road Trip', Icon: Car, keywords: ['road trip', 'drive', 'jeep safari'] },
  { key: 'train-front', label: 'Train', Icon: TrainFront, keywords: ['train journey', 'railway'] },
  { key: 'cable-car', label: 'Cable Car', Icon: CableCar, keywords: ['cable car', 'ropeway', 'mountains'] },

  // Trust & safety (mainly for "Travel with Confidence" items)
  { key: 'shield-check', label: 'Verified Safety', Icon: ShieldCheck, keywords: ['safety', 'safe', 'verified', 'protection', 'secure'] },
  { key: 'shield', label: 'Shield', Icon: Shield, keywords: ['safety', 'protection', 'security'] },
  { key: 'phone', label: 'Phone Support', Icon: Phone, keywords: ['support', '24/7', 'helpline', 'call', 'contact'] },
  { key: 'phone-call', label: 'Airport Assistance', Icon: PhoneCall, keywords: ['airport', 'assistance', 'airport assistance', 'airport pickup', 'airport transfer', 'pickup', 'transfer', 'arrival'] },
  { key: 'headset', label: '24/7 Support', Icon: Headset, keywords: ['support', '24/7', 'helpline', 'assistance', 'on-ground support'] },
  { key: 'life-buoy', label: 'Emergency Support', Icon: LifeBuoy, keywords: ['emergency', 'emergency support', 'support', 'assistance', 'rescue', 'sos'] },
  { key: 'heart-handshake', label: 'Trusted Care', Icon: HeartHandshake, keywords: ['trust', 'care', 'community', 'support'] },
  { key: 'handshake-partners', label: 'Trusted Local Partners', Icon: Handshake, keywords: ['trusted local partners', 'local partners', 'trusted partners', 'partners', 'vendors', 'tour operators', 'ground team'] },
  { key: 'badge-check', label: 'Verified', Icon: BadgeCheck, keywords: ['verified', 'certified', 'trusted organizers', 'authentic'] },
  { key: 'hotel', label: 'Verified Hotels', Icon: Hotel, keywords: ['verified hotels', 'hotels', 'hotel', 'accommodation', 'stay', 'resort', 'lodging'] },
  { key: 'clock', label: 'Always Available', Icon: Clock, keywords: ['24/7', 'always available', 'time', 'punctual'] },
  { key: 'lock', label: 'Secure', Icon: Lock, keywords: ['secure', 'privacy', 'data protection', 'safety'] },
  { key: 'user-check', label: 'Verified Guide', Icon: UserCheck, keywords: ['verified organizer', 'trip leader', 'guide', 'escort'] },
  { key: 'user-round-check', label: 'Female Trip Captain', Icon: UserRoundCheck, keywords: ['female trip captain', 'trip captain', 'female guide', 'female leader', 'woman guide', 'captain'] },
  { key: 'venus', label: 'Girls Only. Always.', Icon: Venus, keywords: ['girls only', 'girls only always', 'girls-only', 'women only', 'female only', 'ladies only', 'always'] },
  { key: 'map-pinned', label: 'Local Ground Support', Icon: MapPinned, keywords: ['local support', 'ground support', 'on-ground', 'local partners'] },

  // Things to Carry / travel essentials
  { key: 'shirt', label: 'Warm Jacket', Icon: Shirt, keywords: ['warm jacket', 'jacket', 'thermal wear', 'thermal', 'sweater', 'hoodie', 'fleece', 'winter clothing', 'clothing'] },
  { key: 'footprints', label: 'Comfortable Shoes', Icon: Footprints, keywords: ['comfortable shoes', 'shoes', 'shoe', 'boots', 'boot', 'sandals', 'footwear', 'trek shoes', 'walking shoes'] },
  { key: 'hand', label: 'Gloves', Icon: Hand, keywords: ['gloves', 'glove', 'hand warmers', 'mittens'] },
  { key: 'hat-glasses', label: 'Woollen Cap', Icon: HatGlasses, keywords: ['woollen cap', 'wool cap', 'cap', 'hat', 'beanie', 'headwear'] },
  { key: 'glasses', label: 'Sunglasses', Icon: Glasses, keywords: ['sunglasses', 'sunglass', 'goggles', 'goggle', 'shades'] },
  { key: 'battery-charging', label: 'Power Bank', Icon: BatteryCharging, keywords: ['power bank', 'powerbank', 'charger', 'battery', 'charging'] },
  { key: 'pill', label: 'Personal Medicines', Icon: Pill, keywords: ['personal medicines', 'medicines', 'medicine', 'medication', 'pills', 'first aid'] },
  { key: 'id-card', label: 'Government ID Proof', Icon: IdCard, keywords: ['government id proof', 'id proof', 'id card', 'passport', 'aadhar', 'adhar', 'voter id', 'license', 'documents'] },
  { key: 'glass-water', label: 'Water Bottle', Icon: GlassWater, keywords: ['water bottle', 'bottle', 'water', 'hydration', 'flask'] },

  // Moods & questions (mainly for "Have You Ever…" style prompts)
  { key: 'x', label: 'Cancelled', Icon: X, keywords: ['cancelled', 'cancel', 'no', 'plans fell through', 'let down'] },
  { key: 'help-circle', label: 'Unsure', Icon: HelpCircle, keywords: ['unsure', 'question', 'confused', 'worried', 'uncertain', 'doubt'] },
  { key: 'frown', label: 'Disappointed', Icon: Frown, keywords: ['disappointed', 'sad', 'nervous', 'upset', 'frown'] },
  { key: 'smile', label: 'Happy', Icon: Smile, keywords: ['happy', 'excited', 'joy', 'positive', 'smile'] },
  { key: 'alert-circle', label: 'Concern', Icon: AlertCircle, keywords: ['concern', 'worried', 'anxious', 'alert', 'caution'] },
  { key: 'meh', label: 'Indifferent', Icon: Meh, keywords: ['indifferent', 'unsure', 'meh', 'neutral', 'nervous'] },
];

const TRIP_HIGHLIGHT_ICON_MAP: Record<string, TripHighlightIconMeta> = Object.fromEntries(
  TRIP_HIGHLIGHT_ICONS.map(meta => [meta.key, meta])
);

/** Looks up an icon by its stored key. Returns undefined for legacy emoji values. */
export function getTripHighlightIcon(key: string | undefined | null): TripHighlightIconMeta | undefined {
  if (!key) return undefined;
  return TRIP_HIGHLIGHT_ICON_MAP[key.trim().toLowerCase()];
}

/**
 * Suggests icons that best match a free-text heading (e.g. "Wild Adventure",
 * "Beach Cafés"), for the admin icon picker's "Suggested" section. Scores by
 * keyword/label word overlap with the heading — highest score first.
 */
export function suggestTripHighlightIcons(heading: string, limit = 8): TripHighlightIconMeta[] {
  const words = heading
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return TRIP_HIGHLIGHT_ICONS.slice(0, limit);

  const scored = TRIP_HIGHLIGHT_ICONS.map(meta => {
    let score = 0;
    for (const word of words) {
      if (meta.keywords.some(k => k === word)) score += 3;
      else if (meta.keywords.some(k => k.includes(word) || word.includes(k))) score += 2;
      else if (meta.label.toLowerCase().includes(word)) score += 1;
    }
    return { meta, score };
  });

  const matches = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (matches.length === 0) return TRIP_HIGHLIGHT_ICONS.slice(0, limit);
  return matches.slice(0, limit).map(s => s.meta);
}

/** Case-insensitive search across icon labels and keywords, for the "browse all" search box. */
export function searchTripHighlightIcons(query: string): TripHighlightIconMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return TRIP_HIGHLIGHT_ICONS;
  return TRIP_HIGHLIGHT_ICONS.filter(
    meta => meta.label.toLowerCase().includes(q) || meta.keywords.some(k => k.includes(q))
  );
}

/**
 * Rotating pastel palette for the highlight-card icon circles, keeping the
 * same warm ULAA brand tones (primary/secondary/gold) while still giving
 * each card in the row a distinct look, matching the "Why You'll Love This
 * Trip" reference design.
 */
export const TRIP_HIGHLIGHT_ICON_PALETTE: { bg: string; fg: string }[] = [
  { bg: '#FBEAD9', fg: '#C4703A' }, // warm peach / primary-light
  { bg: '#F3E7DC', fg: '#8B4820' }, // soft tan / primary-dark
  { bg: '#E9F0E4', fg: '#5B7A4A' }, // sage green
  { bg: '#FDF1DC', fg: '#C8962A' }, // pale gold
  { bg: '#FBEAD9', fg: '#D98A3A' }, // peach / secondary
  { bg: '#F7E3E0', fg: '#C24A4A' }, // blush rose
];

export function getTripHighlightPalette(index: number) {
  return TRIP_HIGHLIGHT_ICON_PALETTE[index % TRIP_HIGHLIGHT_ICON_PALETTE.length];
}
