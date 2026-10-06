// Settings for the admin Creator Rate Calculator. They mirror the "Model Settings" tab of the
// original Creator_Rate_Calculator spreadsheet, so a rate change is an edit here, not in the page.

/** Niche → cost per view benchmark (₹). The calculator's niche dropdown lists these in this order. */
export const NICHE_CPV_BENCHMARKS: { niche: string; cpv: number }[] = [
  { niche: 'Finance / Fintech', cpv: 0.75 },
  { niche: 'Tech', cpv: 0.65 },
  { niche: 'Business / Entrepreneurship', cpv: 0.65 },
  { niche: 'Beauty / Fashion', cpv: 0.475 },
  { niche: 'Travel & Lifestyle', cpv: 0.5 },
  { niche: 'Food', cpv: 0.375 },
  { niche: 'Comedy / Entertainment', cpv: 0.25 },
  { niche: 'Gaming', cpv: 0.25 },
  { niche: 'Education', cpv: 0.5 },
  { niche: 'Health / Wellness', cpv: 0.45 },
];

/** How many recent reels' view counts the calculator asks for. */
export const REEL_COUNT = 10;

/** Average views ÷ followers → quality multiplier. The first tier whose `below` the ratio is under
 *  wins; the last tier (no `below`) catches everything above. Keep in ascending order. */
export const VIEW_QUALITY_TIERS: { below?: number; multiplier: number }[] = [
  { below: 0.2, multiplier: 0.25 },
  { below: 0.4, multiplier: 0.4 },
  { below: 0.6, multiplier: 0.6 },
  { below: 0.8, multiplier: 0.8 },
  { below: 1, multiplier: 0.9 },
  { below: 1.25, multiplier: 0.92 },
  { below: 1.5, multiplier: 0.96 },
  { multiplier: 1 },
];

/** Rate-card amounts are rounded down (min) / up (max) to the nearest multiple of this (₹). */
export const RATE_ROUND_TO = 50;

/** Final Commercials table. Each row is priced from the calculator's min or max reel rate:
 *  min = floor(minMult × reel rate named by minFrom), max = ceil(maxMult × reel rate named by maxFrom).
 *  `logic` is the explanation shown in the table; the preview sample uses it too. */
export const RATE_CARD_ITEMS: {
  asset: string;
  minFrom: 'min' | 'max';
  minMult: number;
  maxFrom: 'min' | 'max';
  maxMult: number;
  logic: string;
}[] = [
  { asset: '1 Non-Collab Reel', minFrom: 'min', minMult: 1, maxFrom: 'max', maxMult: 1, logic: 'Base Reel Rate' },
  { asset: '1 Collab Tag Reel', minFrom: 'max', minMult: 1, maxFrom: 'max', maxMult: 1.2, logic: '1.1–1.2× Non-Collab Reel' },
  { asset: '1 Feed Post', minFrom: 'min', minMult: 0.3, maxFrom: 'max', maxMult: 0.4, logic: '0.3–0.4× Reel' },
  { asset: '1 Story', minFrom: 'min', minMult: 0.2, maxFrom: 'max', maxMult: 0.4, logic: '0.2–0.4× Reel' },
  { asset: '1 Month Ad Rights', minFrom: 'min', minMult: 0.3, maxFrom: 'max', maxMult: 0.3, logic: '0.3× Reel' },
];

/** Pre-filled (and restored by Reset) so quoting the same house creator doesn't need retyping. */
export const DEFAULT_CREATOR = {
  name: 'Jini',
  instagramHandle: '@justjini_',
  phone: '6383336772',
};

/** Message-template preview, used until a real calculation exists. Min/max line up with RATE_CARD_ITEMS. */
export const PREVIEW_SAMPLE_FOLLOWERS = 10100;
export const PREVIEW_SAMPLE_RATES: { min: number; max: number }[] = [
  { min: 5050, max: 5050 },
  { min: 5550, max: 6050 },
  { min: 1500, max: 2000 },
  { min: 1000, max: 2000 },
  { min: 1500, max: 1500 },
];
