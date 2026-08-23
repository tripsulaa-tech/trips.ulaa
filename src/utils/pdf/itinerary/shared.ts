import type { UpcomingTrip, TripHighlightCard, TripIncludedGroup, TripInclusionItem } from '../../../types/types-index';
import { getTripHighlightIcon, type TripHighlightIconType } from '../../../constants/tripHighlightIcons';
import {
  Shirt, Footprints, Glasses, HatGlasses, Hand, Headphones, BatteryCharging,
  Pill, SprayCan, Droplet, GlassWater, Cookie, Sparkles, FileText, IdCard,
  Camera, Stamp, Plane, ShieldCheck, CreditCard, PlugZap, Backpack,
} from 'lucide-react';
import { formatPrice } from '../../utils-index';
import { sanitizeForPdf } from '../../pdfText';
import { fetchAsDataUrl, loadImageEl } from '../../pdfImageLoading';
import { BRAND_BASE, COLORS_BASE, type RGB } from '../shared';
export { tierLabel } from '../../../constants/cancellationPolicy';

export type { RGB } from '../shared';

// Icons drawn into the PDF can come from either the lucide-react imports
// above (chrome/fallback glyphs) or from the trip highlight icon store,
// which now renders via @phosphor-icons/react — see
// src/constants/tripHighlightIcons.ts. `drawLucideIcon` (see drawing.ts)
// accepts either, since both render to plain SVG markup via
// `renderToStaticMarkup` the same way.
export type AnyIcon = TripHighlightIconType;

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Resolves an admin-picked icon-library key (e.g. "shield-check") to its
 *  actual lucide-react component, falling back for empty/legacy values. */
export function resolveIcon(key: string | undefined | null, fallback: AnyIcon): AnyIcon {
  const meta = key ? getTripHighlightIcon(key) : undefined;
  return meta ? meta.Icon : fallback;
}

// Mirrors THINGS_TO_CARRY_ICON_RULES / getThingsToCarryIcon in
// src/pages/TripDetailPage.tsx exactly, so an admin-typed "Things to Carry"
// item with no explicit icon still resolves to the same glyph in the PDF as
// it does on the live site.
const THINGS_TO_CARRY_ICON_RULES: [RegExp, AnyIcon][] = [
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

export function getThingsToCarryFallbackIcon(item: string): AnyIcon {
  const rule = THINGS_TO_CARRY_ICON_RULES.find(([pattern]) => pattern.test(item));
  return rule ? rule[1] : Backpack;
}

// Static, site-wide brand info (not trip data) shown on the cover strip and
// the closing slide — the same constants used in the site footer/contact page.
export const BRAND = {
  ...BRAND_BASE,
  tagline: 'Girls-Only Travel Community',
};

// PowerPoint's default 16:9 widescreen slide size (13.333in × 7.5in),
// expressed in points (72pt/in) so all layout math below is in whole points.
export const PAGE_W = 960;
export const PAGE_H = 540;
export const MARGIN = 44;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const CONTENT_BOTTOM = PAGE_H - 40; // leaves room for the page-number badge

export const COLORS = {
  ...COLORS_BASE,
  whiteMuted: [230, 220, 209] as RGB,
} as const;

// Mirrors TRIP_HIGHLIGHT_ICON_PALETTE in src/constants/tripHighlightIcons.ts —
// the same rotating pastel-circle colors the site uses for highlight cards
// and Travel with Confidence items. Kept in sync manually, same as COLORS
// above being kept in sync with @theme in globals.css.
export const CONFIDENCE_PALETTE: { bg: RGB; fg: RGB }[] = [
  { bg: [251, 234, 217], fg: [196, 112, 58] },
  { bg: [243, 231, 220], fg: [139, 72, 32] },
  { bg: [233, 240, 228], fg: [91, 122, 74] },
  { bg: [253, 241, 220], fg: [200, 150, 42] },
  { bg: [251, 234, 217], fg: [217, 138, 58] },
  { bg: [247, 227, 224], fg: [194, 74, 74] },
];

/** `formatPrice()` returns the ₹ glyph, which isn't in the core PDF font's
 *  charset — used directly it renders as a mis-measured stray glyph, which
 *  throws off any layout math based on its width (e.g. positioning a
 *  strike-through price right after it). Every price shown in the PDF goes
 *  through this instead, so it's always the sanitized "Rs. 39,999" form. */
export { money } from '../shared';

/** Same figure as `money()` would have produced, but with the real ₹
 *  glyph instead of the "RS" text fallback — for use only where the
 *  `RupeeSans` font (see rupeeFont.ts) is active, i.e. the hero price on
 *  the "Trip Leader & Booking" slide, matching TripDetailPage's
 *  <BookingForm>. Every other price on this PDF still goes through
 *  `money()`, which keeps the "Rs." text form since it draws with
 *  helvetica, whose Windows-1252 charset can't render ₹. */
export function heroMoneyRupee(amount: number): string {
  return formatPrice(amount); // e.g. "₹39,999" — same shape as TripDetailPage
}

// `included_groups` carries the site's grouped "What's Included" content
// (icon + heading + bulleted sub-items) straight through so the PDF can draw
// the same heading-card layout as TripDetailPage. `included` is a flattened
// fallback (description + icon) used only when a trip has no groups, drawn as
// the plain icon-card grid instead. `not_included` prefers not_included_items'
// descriptions when present, else the legacy plain-text list — same
// precedence TripDetailPage itself uses. `included`/`things_to_carry` keep
// each item's `icon` key (not just its description) so the PDF can resolve
// and draw the exact same lucide-react glyph the live site does — see
// `drawLucideIcon` in drawing.ts.
export type PdfListItem = Pick<TripInclusionItem, 'description' | 'icon'>;

export type PdfTrip = UpcomingTrip & {
  highlight_cards: TripHighlightCard[];
  included_groups: TripIncludedGroup[];
  included: PdfListItem[];
  things_to_carry: PdfListItem[];
};

export function sanitizeTrip(trip: UpcomingTrip): PdfTrip {
  // Things to Carry now has an icon-based rich variant (things_to_carry_items)
  // that the admin form treats as the source of truth — see AdminTrips.tsx.
  const thingsToCarrySource = (trip.things_to_carry_items?.length ?? 0) > 0
    ? trip.things_to_carry_items!
    : [];
  const hasIncludedGroups = (trip.included_groups?.length ?? 0) > 0;
  const notIncludedSource = (trip.not_included_items?.length ?? 0) > 0
    ? trip.not_included_items!.map(item => item.description)
    : trip.not_included;
  return {
    ...trip,
    title: sanitizeForPdf(trip.title),
    destination: sanitizeForPdf(trip.destination),
    duration: sanitizeForPdf(trip.duration),
    description: sanitizeForPdf(trip.description),
    highlight_cards: (trip.highlight_cards ?? []).map(card => ({
      ...card,
      heading: sanitizeForPdf(card.heading),
      description: sanitizeForPdf(card.description),
    })),
    itinerary: trip.itinerary.map(day => ({
      ...day,
      title: sanitizeForPdf(day.title),
      description: sanitizeForPdf(day.description),
      bullets: (day.bullets ?? []).map(sanitizeForPdf),
    })),
    included_groups: hasIncludedGroups
      ? trip.included_groups!.map(group => ({
          ...group,
          heading: sanitizeForPdf(group.heading),
          bullets: group.bullets.map(sanitizeForPdf),
        }))
      : [],
    included: hasIncludedGroups
      ? []
      : (trip.included_items ?? []).map(item => ({ description: sanitizeForPdf(item.description), icon: item.icon })),
    not_included: notIncludedSource.map(sanitizeForPdf),
    things_to_carry: thingsToCarrySource.map(item => ({ description: sanitizeForPdf(item.description), icon: item.icon })),
    meeting_point: trip.meeting_point ? sanitizeForPdf(trip.meeting_point) : trip.meeting_point,
    gallery_description: trip.gallery_description ? sanitizeForPdf(trip.gallery_description) : trip.gallery_description,
    gallery_items: trip.gallery_items?.map(item => ({ ...item, description: sanitizeForPdf(item.description) })),
    accommodation_description: trip.accommodation_description ? sanitizeForPdf(trip.accommodation_description) : trip.accommodation_description,
    fashion_description: trip.fashion_description ? sanitizeForPdf(trip.fashion_description) : trip.fashion_description,
    confidence_description: trip.confidence_description ? sanitizeForPdf(trip.confidence_description) : trip.confidence_description,
    confidence_items: trip.confidence_items?.map(item => ({ ...item, description: sanitizeForPdf(item.description) })),
    faqs: trip.faqs.map(faq => ({
      ...faq,
      question: sanitizeForPdf(faq.question),
      answer: sanitizeForPdf(faq.answer),
    })),
    cancellation_policy: trip.cancellation_policy
      ? {
          ...trip.cancellation_policy,
          tiers: trip.cancellation_policy.tiers.map(tier => ({
            ...tier,
            description: sanitizeForPdf(tier.description),
          })),
        }
      : trip.cancellation_policy,
  };
}

/** Fetches a photo and returns it pre-cropped to exactly targetWpt ×
 *  targetHpt using "object-fit: cover" math (scale to fill, crop the
 *  overflow, keep it centered) so it never gets stretched — plus soft
 *  rounded corners baked in via a clip path. */
export async function loadCoverCroppedImage(
  url: string,
  targetWpt: number,
  targetHpt: number,
  cornerRadiusPt = 0,
  backgroundHex = '#ffffff'
): Promise<string | null> {
  try {
    const dataUrl = await fetchAsDataUrl(url);
    if (!dataUrl) return null;
    const img = await loadImageEl(dataUrl);

    const PX_PER_PT = 2.4; // ~230 DPI equivalent: sharp for print, keeps the PDF light
    const w = Math.round(targetWpt * PX_PER_PT);
    const h = Math.round(targetHpt * PX_PER_PT);
    const r = cornerRadiusPt * PX_PER_PT;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fill first with backgroundHex (defaults to white). JPEG has no alpha
    // channel, so any pixels left untouched outside a rounded/circular clip
    // path below would otherwise get flattened to black on export — visible
    // as corners poking out around circular avatars (e.g. the Trip Leader
    // photo). Passing the page's own background color here (rather than the
    // default white) makes those corners blend in instead of standing out
    // as a slightly-off-white patch against a cream page.
    ctx.fillStyle = backgroundHex;
    ctx.fillRect(0, 0, w, h);

    if (r > 0) {
      ctx.beginPath();
      if (r * 2 >= Math.min(w, h)) {
        // Fully rounded — a true circle (e.g. the Trip Leader avatar).
        // The quadratic-corner path below is only a rough approximation
        // of round at this radius (visibly flattens/bulges around the
        // 45° points), so use a real arc instead for a perfect circle.
        ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      } else {
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r);
        ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h);
        ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
      }
      ctx.closePath();
      ctx.clip();
    }

    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    ctx.drawImage(img, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);

    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}
