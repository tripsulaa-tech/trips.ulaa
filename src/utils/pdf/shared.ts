// Values shared between the two PDF generators (invoice + itinerary), kept
// here once so they can't quietly drift apart between the two documents.
// Each generator still layers its own document-specific values on top
// locally (exact tagline wording, extra brand-page-only colors, etc.) —
// see BRAND/COLORS in invoicePdf.ts and pdf/itinerary/shared.ts.

export type RGB = readonly [number, number, number];

export const BRAND_BASE = {
  name: 'ULAA',
  website: 'www.ulaatrips.com',
  instagram: '@ulaa.trips',
  email: 'trips.ulaa@gmail.com',
  phone: '+91 63813 36772',
};

export const COLORS_BASE = {
  primary: [168, 90, 42] as RGB,
  primaryDark: [139, 72, 32] as RGB,
  secondary: [217, 138, 58] as RGB,
  dark: [45, 33, 24] as RGB,
  darkMuted: [74, 55, 40] as RGB,
  background: [248, 244, 236] as RGB,
  backgroundWarm: [242, 235, 224] as RGB,
  cream: [250, 247, 242] as RGB,
  gold: [200, 150, 42] as RGB,
  white: [255, 255, 255] as RGB,
  green: [45, 140, 90] as RGB,
  red: [190, 70, 65] as RGB,
  grayLine: [222, 211, 199] as RGB,
  grayLineSoft: [232, 224, 213] as RGB,
} as const;
