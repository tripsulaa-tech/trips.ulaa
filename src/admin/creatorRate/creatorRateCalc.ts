// Pure calculation logic for the Creator Rate Calculator (no React). Mirrors the
// formulas of the original spreadsheet; cell references are kept in the comments.
import type { CreatorRateAsset } from '../../types/types-index';
import { NICHE_CPV_BENCHMARKS, VIEW_QUALITY_TIERS, RATE_ROUND_TO, RATE_CARD_ITEMS } from '../../constants/creatorRate';

export const NICHE_OPTIONS = NICHE_CPV_BENCHMARKS.map(n => ({ value: n.niche, label: n.niche }));

// Pulls every view-count-looking token out of pasted text, so a Reel field
// can accept a whole column copied from Instagram Insights or a
// spreadsheet (one value per line, comma/tab separated, etc.) instead of
// forcing the admin to enter all 10 values one at a time. Handles thousand
// separators ("12,345") and shorthand suffixes ("12.3k", "1.1M").
export function extractViewNumbers(text: string): number[] {
  const matches = text.match(/-?\d[\d,]*(?:\.\d+)?\s*[kKmM]?/g) || [];
  return matches
    .map(raw => {
      const cleaned = raw.replace(/,/g, '').trim();
      const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([kKmM])?$/);
      if (!m) return null;
      let value = parseFloat(m[1]);
      if (Number.isNaN(value)) return null;
      const suffix = m[2]?.toLowerCase();
      if (suffix === 'k') value *= 1_000;
      if (suffix === 'm') value *= 1_000_000;
      return Math.round(value);
    })
    .filter((n): n is number => n !== null);
}

// Rate Calculator!H8 — tiered View/Follower Ratio → Quality Multiplier,
// straight from the nested IF in that cell (equivalent to the lookup table
// on Model Settings!D:E).
function viewQualityMultiplier(ratio: number): number {
  const tier = VIEW_QUALITY_TIERS.find(t => t.below === undefined || ratio < t.below);
  return tier ? tier.multiplier : 1;
}

// Excel FLOOR(x, 50) / CEILING(x, 50) — round down/up to the nearest ₹50,
// used throughout the "Final Commercials" section of the sheet.
function floorTo50(x: number): number {
  return Math.floor(x / RATE_ROUND_TO) * RATE_ROUND_TO;
}
function ceilTo50(x: number): number {
  return Math.ceil(x / RATE_ROUND_TO) * RATE_ROUND_TO;
}

export interface CreatorRateResult {
  avgViews: number;
  viewFollowerRatio: number;
  nicheCpv: number;
  qualityMultiplier: number;
  baseRate: number;
  minReelRate: number;
  maxReelRate: number;
  assets: CreatorRateAsset[];
}

/** Runs every formula of the calculator for one set of inputs. */
export function calculateCreatorRate(followers: number, views: number[], niche: string): CreatorRateResult {
  // Rate Calculator!H5 — AVERAGE(B6:B15)
  const avgViews = views.length ? views.reduce((s, v) => s + v, 0) / views.length : 0;
  // Rate Calculator!H6 — IFERROR(H5/B5, 0)
  const viewFollowerRatio = followers > 0 ? avgViews / followers : 0;
  // Rate Calculator!H7 — VLOOKUP(niche, Model Settings!I2:J11, 2, FALSE)
  const nicheCpv = NICHE_CPV_BENCHMARKS.find(n => n.niche === niche)?.cpv ?? 0;
  // Rate Calculator!H8
  const qualityMultiplier = viewQualityMultiplier(viewFollowerRatio);
  // Rate Calculator!H9 — B5*H7
  const baseRate = followers * nicheCpv;
  // Rate Calculator!H10 — MIN(B5, H9*H8)
  const minReelRate = Math.min(followers, baseRate * qualityMultiplier);
  // Rate Calculator!H11 — MIN(B5, H9)
  const maxReelRate = Math.min(followers, baseRate);

  // Rate Calculator!A22:D26 — Final Commercials table
  const reelRate = { min: minReelRate, max: maxReelRate };
  const assets: CreatorRateAsset[] = RATE_CARD_ITEMS.map(item => ({
    asset: item.asset,
    min: floorTo50(item.minMult * reelRate[item.minFrom]),
    max: ceilTo50(item.maxMult * reelRate[item.maxFrom]),
    pricing_logic: item.logic,
  }));

  return { avgViews, viewFollowerRatio, nicheCpv, qualityMultiplier, baseRate, minReelRate, maxReelRate, assets };
}
