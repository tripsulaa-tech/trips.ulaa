import { jsPDF } from 'jspdf';
// Side-effect import — patches jsPDF's prototype with `.svg(element, opts)`,
// used by `drawLucideIcon` below to draw real lucide-react icons as crisp
// vector paths instead of hand-drawn approximations.
import 'svg2pdf.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';
import {
  Star, CheckCircle, XCircle, Backpack,
  Shirt, Footprints, Glasses, HatGlasses, Hand, Headphones, BatteryCharging,
  Pill, SprayCan, Droplet, GlassWater, Cookie, Sparkles, FileText, IdCard,
  Calendar, Clock, Users, UserCheck, Phone, Mail, Globe, MessageSquare,
  ShieldCheck, BadgeCheck, PlugZap, Camera, Stamp, Plane, CreditCard,
  Clock3, CalendarClock, UserX, PackageX, Building2, CheckCircle2,
} from 'lucide-react';
import type { UpcomingTrip, CancellationTier, TripHighlightCard, TripIncludedGroup, TripInclusionItem, ItineraryDay, ButtonLabelsConfig } from '../types/types-index';
import { CANCELLATION_POLICY_STATIC_SECTIONS as STATIC } from '../constants/cancellationPolicy';
import { getTripHighlightIcon } from '../constants/tripHighlightIcons';
import { DEFAULT_BUTTON_LABELS } from '../constants/buttonLabels';
import { getSiteContent } from '../services/api';
import { formatDateRange, formatAgeRange, formatPrice, formatDate, getActivePrice, getStrikeThroughPrice, publicSeatsLeft } from './utils-index';
import { PARISIENNE_FONT_BASE64 } from './parisienneFont';
import { RUPEE_SANS_REGULAR_BASE64, RUPEE_SANS_BOLD_BASE64 } from './rupeeFont';

// =============================================================================
// Icon fidelity with the live site
// -----------------------------------------------------------------------------
// Highlight cards, "What's Included" groups/items, "Travel with Confidence"
// items, "Things to Carry" items, and each itinerary day can all have an
// admin-picked icon (a `lucide-react` key resolved via `getTripHighlightIcon`
// — see src/constants/tripHighlightIcons.ts). `drawLucideIcon` renders that
// *exact* icon component into the PDF as real vector paths (via svg2pdf.js),
// the same way `TripHighlightIconDisplay.tsx` renders it on TripDetailPage —
// rather than approximating it with a hand-drawn glyph from the `icons` set
// below (which is reserved for chrome that has no per-trip icon field:
// calendar, share, download, contact icons, etc.).
//
// Fallback icons below mirror the exact fallbacks TripDetailPage.tsx uses
// when a trip predates the icon picker (or a field has no icon set):
//   - Included item with no icon      -> CheckCircle (green)
//   - Not-included item                -> XCircle (red) — always, no icon field
//   - Things to Carry item with no icon -> keyword match against
//     THINGS_TO_CARRY_ICON_RULES, else Backpack (mirrors getThingsToCarryIcon
//     in TripDetailPage.tsx)
//   - Highlight card / group / confidence item / itinerary day with an
//     unrecognized or legacy (emoji) icon value -> Star, as a neutral default
//     print can always render (emoji glyphs aren't in the PDF font's charset
//     — see sanitizeForPdf above).
// =============================================================================

function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Resolves an admin-picked icon-library key (e.g. "shield-check") to its
 *  actual lucide-react component, falling back for empty/legacy values. */
function resolveIcon(key: string | undefined | null, fallback: LucideIcon): LucideIcon {
  const meta = key ? getTripHighlightIcon(key) : undefined;
  return meta ? meta.Icon : fallback;
}

// Mirrors THINGS_TO_CARRY_ICON_RULES / getThingsToCarryIcon in
// src/pages/TripDetailPage.tsx exactly, so an admin-typed "Things to Carry"
// item with no explicit icon still resolves to the same glyph in the PDF as
// it does on the live site.
const THINGS_TO_CARRY_ICON_RULES: [RegExp, LucideIcon][] = [
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

function getThingsToCarryFallbackIcon(item: string): LucideIcon {
  const rule = THINGS_TO_CARRY_ICON_RULES.find(([pattern]) => pattern.test(item));
  return rule ? rule[1] : Backpack;
}

// =============================================================================
// "Download Itinerary PDF" — renders a trip's public detail page as a clean,
// branded, landscape SLIDE DECK (one PowerPoint-style 16:9 slide per page)
// rather than a flowing document. Every slide is built entirely from the
// `UpcomingTrip` object passed in, so it always reflects whatever's live in
// Admin — nothing about a specific trip is hardcoded here.
//
// Design intent: reproduce the 9-slide reference deck (cover → overview +
// highlights → itinerary → inclusions/exclusions + things to carry (one
// combined slide when both fit) → meeting point → FAQs → cancellation
// policy → closing) while staying fully data-driven:
//   - Sections with no data are skipped entirely (no empty slides).
//   - Sections whose content is longer than one slide (many itinerary days,
//     many FAQs, many cancellation clauses...) automatically continue onto
//     extra slides instead of overflowing or getting silently cut off.
//   - If new list-shaped fields are added to a trip in the future and
//     surfaced through one of the section renderers below, they'll render
//     without any layout changes — see "Future compatibility" at the
//     bottom of this file for the extension point.
//
// Colors are kept in sync with the @theme block in src/styles/globals.css —
// update both places together if the brand palette ever changes.
// =============================================================================

type RGB = readonly [number, number, number];

const COLORS = {
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
  whiteMuted: [230, 220, 209] as RGB,
  green: [45, 140, 90] as RGB,
  red: [190, 70, 65] as RGB,
  grayLine: [222, 211, 199] as RGB,
  grayLineSoft: [232, 224, 213] as RGB,
} as const;

// Mirrors TRIP_HIGHLIGHT_ICON_PALETTE in src/constants/tripHighlightIcons.ts —
// the same rotating pastel-circle colors the site uses for highlight cards
// and Travel with Confidence items. Kept in sync manually, same as COLORS
// above being kept in sync with @theme in globals.css.
const CONFIDENCE_PALETTE: { bg: RGB; fg: RGB }[] = [
  { bg: [251, 234, 217], fg: [196, 112, 58] },
  { bg: [243, 231, 220], fg: [139, 72, 32] },
  { bg: [233, 240, 228], fg: [91, 122, 74] },
  { bg: [253, 241, 220], fg: [200, 150, 42] },
  { bg: [251, 234, 217], fg: [217, 138, 58] },
  { bg: [247, 227, 224], fg: [194, 74, 74] },
];

// Static, site-wide brand info (not trip data) shown on the cover strip and
// the closing slide — the same constants used in the site footer/contact page.
const BRAND = {
  name: 'ULAA',
  tagline: 'Girls-Only Travel Community',
  website: 'www.ulaatrips.com',
  instagram: '@ulaa.trips',
  email: 'trips.ulaa@gmail.com',
  phone: '+91 63813 36772',
};

// PowerPoint's default 16:9 widescreen slide size (13.333in × 7.5in),
// expressed in points (72pt/in) so all layout math below is in whole points.
const PAGE_W = 960;
const PAGE_H = 540;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_H - 40; // leaves room for the page-number badge

/** Every piece of trip-authored text (description, FAQs, itinerary copy...)
 *  passes through here before it's measured or drawn. Two real problems
 *  this fixes:
 *   1. Emoji/pictographs aren't in the core PDF font's character set. Left
 *      in, they don't just look wrong — jsPDF's width measurement for that
 *      glyph is unreliable, which throws off line-wrapping for the *whole*
 *      line and can silently drop text after it.
 *   2. The ₹ sign isn't part of the Windows-1252 charset the core fonts
 *      use, so it renders as a stray unrelated character.
 *  Common "smart" punctuation (curly quotes, em/en dash, ellipsis, bullet)
 *  is deliberately left alone — jsPDF has built-in support for those. */
function sanitizeForPdf(text: string): string {
  if (!text) return text;
  return text
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\u{FE0F}/gu, '')
    .replace(/\u200D/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** `formatPrice()` returns the ₹ glyph, which isn't in the core PDF font's
 *  charset — used directly it renders as a mis-measured stray glyph, which
 *  throws off any layout math based on its width (e.g. positioning a
 *  strike-through price right after it). Every price shown in the PDF goes
 *  through this instead, so it's always the sanitized "Rs. 39,999" form. */
function money(amount: number): string {
  return sanitizeForPdf(formatPrice(amount));
}

/** Same as `money()`, but for the large hero price figures (main price and
 *  its strike-through) where the "Rs." prefix sits right next to big bold
 *  digits — "Rs." has a lowercase 's', which is visibly shorter than the
 *  capital 'R' at that size. Using "RS" instead keeps both letters the same
 *  (capital) height, so the currency prefix reads as evenly weighted
 *  next to the price rather than lopsided. */
/** Same figure as `heroMoney()` would have produced, but with the real ₹
 *  glyph instead of the "RS" text fallback — for use only where the
 *  `RupeeSans` font (see rupeeFont.ts) is active, i.e. the hero price on
 *  the "Trip Leader & Booking" slide, matching TripDetailPage's
 *  <BookingForm>. Every other price on this PDF still goes through
 *  `money()`, which keeps the "Rs." text form since it draws with
 *  helvetica, whose Windows-1252 charset can't render ₹. */
function heroMoneyRupee(amount: number): string {
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
// `drawLucideIcon` above.
type PdfListItem = Pick<TripInclusionItem, 'description' | 'icon'>;

type PdfTrip = UpcomingTrip & {
  highlight_cards: TripHighlightCard[];
  included_groups: TripIncludedGroup[];
  included: PdfListItem[];
  things_to_carry: PdfListItem[];
};

function sanitizeTrip(trip: UpcomingTrip): PdfTrip {
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

function tierLabel(tier: CancellationTier): string {
  if (tier.max_days === null && tier.min_days !== null) return `More than ${tier.min_days} days before departure`;
  if (tier.min_days !== null && tier.max_days !== null) return `${tier.min_days}\u2013${tier.max_days} days before departure`;
  if (tier.min_days === null && tier.max_days !== null) return `Within ${tier.max_days} days of departure`;
  return 'Cancellation window';
}

// -----------------------------------------------------------------------
// Image loading helpers — both are best-effort and never throw. A slow
// network, a CORS-restricted host, or a missing image should never break
// PDF generation; the layout just quietly skips that photo/logo.
// -----------------------------------------------------------------------

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = src;
  });
}

/** Fetches a photo and returns it pre-cropped to exactly targetWpt ×
 *  targetHpt using "object-fit: cover" math (scale to fill, crop the
 *  overflow, keep it centered) so it never gets stretched — plus soft
 *  rounded corners baked in via a clip path. */
async function loadCoverCroppedImage(
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

/** Loads a logo/icon image and returns it plus its natural aspect ratio, so
 *  callers can fit it into a bounding box without distortion. */
async function loadContainImage(url: string): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const dataUrl = await fetchAsDataUrl(url);
    if (!dataUrl) return null;
    const img = await loadImageEl(dataUrl);
    return { dataUrl, ratio: img.naturalWidth / img.naturalHeight };
  } catch {
    return null;
  }
}

// =============================================================================
// Builder
// =============================================================================

export async function buildTripItineraryPdfDoc(rawTrip: UpcomingTrip): Promise<jsPDF> {
  const trip = sanitizeTrip(rawTrip);
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'landscape' });

  // Admin-editable "Pack Your Bags" / "Join Waitlist" button text (see
  // /admin/button-labels — AdminButtonLabels.tsx). Read once up front so the
  // CTA button on the Trip Leader & Booking slide matches whatever the live
  // trip detail page is currently showing. Falls back to the defaults if
  // nothing's been saved yet or the fetch fails.
  const buttonLabels: ButtonLabelsConfig = await getSiteContent<ButtonLabelsConfig>('button_labels')
    .then(data => (data && data.primaryCta ? data : DEFAULT_BUTTON_LABELS))
    .catch(() => DEFAULT_BUTTON_LABELS);

  // Register the cursive "Parisienne" script font (site-wide --font-script,
  // see globals.css) for the closing slide's handwritten-style headings.
  // jsPDF only knows fonts it's been given directly — the @font-face import
  // in globals.css has no effect here — so the TTF bytes are embedded as
  // base64 (parisienneFont.ts) and registered once, up front. Best-effort:
  // if this ever fails, every doc.setFont('Parisienne', ...) call below
  // silently falls back to jsPDF's default font instead of breaking PDF
  // generation.
  try {
    doc.addFileToVFS('Parisienne-Regular.ttf', PARISIENNE_FONT_BASE64);
    doc.addFont('Parisienne-Regular.ttf', 'Parisienne', 'normal');
  } catch {
    /* falls back to the default font — see comment above */
  }

  // Register a tiny Roboto subset (digits, comma, period, space, "RS" and
  // the ₹ glyph itself) so the hero price on the "Trip Leader & Booking"
  // slide can show the real ₹ symbol — helvetica's Windows-1252 charset
  // doesn't include it (see heroMoneyRupee() below). Same best-effort
  // pattern as Parisienne above: on failure, callers fall back to helvetica.
  try {
    doc.addFileToVFS('RupeeSans-Regular.ttf', RUPEE_SANS_REGULAR_BASE64);
    doc.addFont('RupeeSans-Regular.ttf', 'RupeeSans', 'normal');
    doc.addFileToVFS('RupeeSans-Bold.ttf', RUPEE_SANS_BOLD_BASE64);
    doc.addFont('RupeeSans-Bold.ttf', 'RupeeSans', 'bold');
  } catch {
    /* falls back to jsPDF's default font — see comment above */
  }

  // ---------------------------------------------------------------------
  // Low-level drawing helpers
  // ---------------------------------------------------------------------
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  let firstSlide = true;
  function newSlide() {
    if (!firstSlide) doc.addPage([PAGE_W, PAGE_H], 'landscape');
    firstSlide = false;
    setFill(COLORS.background);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  }

  function withOpacity(opacity: number, draw: () => void) {
    try {
      doc.saveGraphicsState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.setGState(new (doc as any).GState({ opacity }));
      draw();
    } finally {
      try {
        doc.restoreGraphicsState();
      } catch {
        /* older jsPDF builds may no-op restoreGraphicsState — safe to ignore */
      }
    }
  }

  function clampLines(text: string, maxWidth: number, maxLines: number): string[] {
    const lines: string[] = doc.splitTextToSize(text, maxWidth);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    // Prefer dropping whole words over chopping mid-word. Only fall back to
    // a character-by-character trim if a single word is wider than the box.
    while (doc.getTextWidth(`${last}\u2026`) > maxWidth && last.includes(' ')) {
      last = last.slice(0, last.lastIndexOf(' ')).trimEnd();
    }
    while (doc.getTextWidth(`${last}\u2026`) > maxWidth && last.length > 1) {
      last = last.slice(0, -1).trimEnd();
    }
    kept[maxLines - 1] = `${last}\u2026`;
    return kept;
  }

  // `icon` is optional — pass `null` to render a plain text-only header
  // (no leading icon glyph), used for sections where the icon is now
  // deliberately omitted. Text simply starts at MARGIN instead of being
  // indented to make room for the icon.
  function slideHeader(icon: ((x: number, y: number) => void) | null, title: string, subtitle?: string) {
    const textX = icon ? MARGIN + 30 : MARGIN;
    if (icon) icon(MARGIN, 40);
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(title, textX, 46);
    setDraw(COLORS.grayLine);
    doc.setLineWidth(1);
    doc.line(MARGIN, 66, PAGE_W - MARGIN, 66);
    // Subtitle sits below the divider line (same placement as the
    // "Travel with Confidence" / "Things to Carry" descriptions) instead
    // of being squeezed between the title and the line — with breathing
    // room both above (from the line) and below (before slide content).
    if (subtitle) {
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(subtitle, textX, 92);
    }
  }

  function drawCheck(cx: number, cy: number, r: number, color: RGB, weight = 1.6) {
    setDraw(color);
    doc.setLineWidth(weight);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.line(cx - r * 0.55, cy, cx - r * 0.1, cy + r * 0.5);
    doc.line(cx - r * 0.1, cy + r * 0.5, cx + r * 0.62, cy - r * 0.45);
  }

  function drawCross(cx: number, cy: number, r: number, color: RGB, weight = 1.6) {
    setDraw(color);
    doc.setLineWidth(weight);
    doc.setLineCap('round');
    doc.line(cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5);
    doc.line(cx - r * 0.5, cy + r * 0.5, cx + r * 0.5, cy - r * 0.5);
  }

  /** Small "→" arrow glyph (shaft + head), used next to CTA button labels
   *  like "Secure Your Spot" — cheaper and crisper than relying on the
   *  core font's arrow character support. */
  function drawArrowRight(cx: number, cy: number, r: number, color: RGB, weight = 1.6) {
    setDraw(color);
    doc.setLineWidth(weight);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.line(cx - r * 0.6, cy, cx + r * 0.5, cy);
    doc.line(cx + r * 0.1, cy - r * 0.4, cx + r * 0.5, cy);
    doc.line(cx + r * 0.1, cy + r * 0.4, cx + r * 0.5, cy);
  }

  /** Draws one line of text made of differently-colored/weighted runs,
   *  left-to-right starting at `x` — used for the booking card's reserve
   *  box ("Reserve today with only <amount>") where only the amount is
   *  highlighted, matching the live site's <BookingForm> styling. */
  function drawMixedLine(x: number, y: number, parts: { text: string; color: RGB; bold?: boolean }[], size: number) {
    let runX = x;
    parts.forEach(part => {
      doc.setFont('helvetica', part.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      setText(part.color);
      doc.text(part.text, runX, y);
      runX += doc.getTextWidth(part.text);
    });
  }

  /** Measures the total width of a mixed-style line (see drawMixedLine)
   *  without drawing it, so callers can center the group before drawing. */
  function mixedLineWidth(parts: { text: string; bold?: boolean }[], size: number): number {
    let w = 0;
    parts.forEach(part => {
      doc.setFont('helvetica', part.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      w += doc.getTextWidth(part.text);
    });
    return w;
  }

  /** Simple line-art icon set, drawn as vectors (never rasterized) so they
   *  stay crisp at any zoom and never depend on an external icon font. */
  const icons = {
    calendar(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x, y - s * 0.72, s, s * 0.82, 2.5, 2.5, 'S');
      doc.line(x, y - s * 0.42, x + s, y - s * 0.42);
      doc.line(x + s * 0.25, y - s * 0.86, x + s * 0.25, y - s * 0.6);
      doc.line(x + s * 0.75, y - s * 0.86, x + s * 0.75, y - s * 0.6);
    },
    star(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s / 2;
      const cy = y - s * 0.4;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? s * 0.5 : s * 0.21;
        pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
      }
      const lines = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
      doc.lines(lines, pts[0][0], pts[0][1], [1, 1], 'F', true);
    },
    mountain(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.triangle(x, y, x + s * 0.42, y - s * 0.8, x + s * 0.72, y, 'F');
      doc.triangle(x + s * 0.4, y, x + s * 0.75, y - s * 0.6, x + s, y, 'F');
    },
    backpack(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x + s * 0.12, y - s * 0.78, s * 0.76, s * 0.78, 3, 3, 'S');
      doc.roundedRect(x + s * 0.3, y - s * 0.95, s * 0.4, s * 0.24, 2, 2, 'S');
      doc.line(x + s * 0.24, y - s * 0.4, x + s * 0.76, y - s * 0.4);
    },
    pin(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.4;
      const cy = y - s * 0.65;
      doc.circle(cx, cy, s * 0.32, 'F');
      doc.triangle(cx - s * 0.24, cy + s * 0.14, cx + s * 0.24, cy + s * 0.14, cx, y, 'F');
      setFill(COLORS.white);
      doc.circle(cx, cy, s * 0.12, 'F');
    },
    plane(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s / 2;
      const cy = y - s * 0.5;
      // Fuselage
      doc.triangle(cx - s * 0.05, cy - s * 0.42, cx + s * 0.05, cy - s * 0.42, cx + s * 0.08, cy + s * 0.4, 'F');
      doc.triangle(cx - s * 0.05, cy - s * 0.42, cx + s * 0.08, cy + s * 0.4, cx - s * 0.08, cy + s * 0.4, 'F');
      // Wings
      doc.triangle(cx, cy - s * 0.02, cx + s * 0.5, cy + s * 0.22, cx + s * 0.04, cy + s * 0.12, 'F');
      doc.triangle(cx, cy - s * 0.02, cx - s * 0.5, cy + s * 0.22, cx - s * 0.04, cy + s * 0.12, 'F');
      // Tail fins
      doc.triangle(cx - s * 0.06, cy + s * 0.3, cx - s * 0.22, cy + s * 0.42, cx - s * 0.02, cy + s * 0.4, 'F');
      doc.triangle(cx + s * 0.06, cy + s * 0.3, cx + s * 0.22, cy + s * 0.42, cx + s * 0.02, cy + s * 0.4, 'F');
    },
    train(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const bodyW = s * 0.7;
      const bodyH = s * 0.78;
      const bx = x + (s - bodyW) / 2;
      const by = y - s * 0.92;
      doc.roundedRect(bx, by, bodyW, bodyH, bodyW * 0.22, bodyW * 0.22, 'F');
      setFill(COLORS.white);
      doc.roundedRect(bx + bodyW * 0.14, by + bodyH * 0.16, bodyW * 0.3, bodyH * 0.28, 2, 2, 'F');
      doc.roundedRect(bx + bodyW * 0.56, by + bodyH * 0.16, bodyW * 0.3, bodyH * 0.28, 2, 2, 'F');
      setFill(color);
      doc.rect(bx - bodyW * 0.08, y - s * 0.14, bodyW * 1.16, s * 0.1, 'F');
      doc.circle(bx + bodyW * 0.2, y - s * 0.04, s * 0.06, 'F');
      doc.circle(bx + bodyW * 0.8, y - s * 0.04, s * 0.06, 'F');
    },
    bus(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const bodyW = s * 0.9;
      const bodyH = s * 0.55;
      const bx = x + (s - bodyW) / 2;
      const by = y - s * 0.78;
      doc.roundedRect(bx, by, bodyW, bodyH, 4, 4, 'F');
      setFill(COLORS.white);
      for (let i = 0; i < 3; i++) {
        doc.roundedRect(bx + bodyW * 0.08 + i * bodyW * 0.3, by + bodyH * 0.2, bodyW * 0.22, bodyH * 0.35, 1.5, 1.5, 'F');
      }
      setFill(color);
      doc.circle(bx + bodyW * 0.22, by + bodyH + s * 0.05, s * 0.08, 'F');
      doc.circle(bx + bodyW * 0.78, by + bodyH + s * 0.05, s * 0.08, 'F');
    },
    question(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      setText(COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(s * 0.5);
      doc.text('?', x + s / 2, y - s * 0.28, { align: 'center' });
    },
    shield(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.triangle(x, y - s * 0.85, x + s * 0.5, y - s, x + s * 0.5, y - s * 0.1, 'F');
      doc.triangle(x, y - s * 0.85, x + s * 0.5, y - s * 0.1, x, y - s * 0.15, 'F');
      doc.triangle(x + s, y - s * 0.85, x + s * 0.5, y - s, x + s * 0.5, y - s * 0.1, 'F');
      doc.triangle(x + s, y - s * 0.85, x + s * 0.5, y - s * 0.1, x + s, y - s * 0.15, 'F');
    },
    check(x: number, y: number, s = 20, color: RGB = COLORS.green) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      drawCheck(x + s / 2, y - s * 0.4, s * 0.32, COLORS.white, 2);
    },
    cross(x: number, y: number, s = 20, color: RGB = COLORS.red) {
      setFill(color);
      doc.circle(x + s / 2, y - s * 0.4, s * 0.4, 'F');
      drawCross(x + s / 2, y - s * 0.4, s * 0.3, COLORS.white, 2);
    },
    // ---- Things-to-Carry item icons ----
    idcard(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.roundedRect(x + s * 0.05, y - s * 0.85, s * 0.9, s * 0.7, 2.5, 2.5, 'S');
      setFill(color);
      doc.circle(x + s * 0.28, y - s * 0.58, s * 0.13, 'F');
      doc.setLineWidth(1.1);
      doc.line(x + s * 0.52, y - s * 0.62, x + s * 0.84, y - s * 0.62);
      doc.line(x + s * 0.52, y - s * 0.48, x + s * 0.74, y - s * 0.48);
    },
    cash(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(x + s * 0.02, y - s * 0.62, s * 0.96, s * 0.5, 3, 3, 'S');
      doc.circle(x + s * 0.5, y - s * 0.37, s * 0.14, 'S');
      setFill(color);
      doc.circle(x + s * 0.14, y - s * 0.37, s * 0.045, 'F');
      doc.circle(x + s * 0.86, y - s * 0.37, s * 0.045, 'F');
    },
    shirt(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.22, y - s * 0.78, s * 0.56, s * 0.7, 3, 3, 'F');
      doc.triangle(x + s * 0.22, y - s * 0.7, x + s * 0.02, y - s * 0.5, x + s * 0.22, y - s * 0.4, 'F');
      doc.triangle(x + s * 0.78, y - s * 0.7, x + s * 0.98, y - s * 0.5, x + s * 0.78, y - s * 0.4, 'F');
    },
    sun(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      setFill(color);
      doc.circle(cx, cy, s * 0.24, 'F');
      setDraw(color);
      doc.setLineWidth(1.5);
      doc.setLineCap('round');
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i;
        const r1 = s * 0.36;
        const r2 = s * 0.48;
        doc.line(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1, cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      }
    },
    pill(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const w = s * 0.8;
      const h = s * 0.34;
      const rx = x + (s - w) / 2;
      const ry = y - s * 0.6;
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.roundedRect(rx, ry, w, h, h / 2, h / 2, 'S');
      setFill(color);
      doc.rect(rx + w * 0.06, ry + h * 0.1, w * 0.42, h * 0.8, 'F');
      doc.line(rx + w / 2, ry, rx + w / 2, ry + h);
    },
    plug(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.18, y - s * 0.62, s * 0.64, s * 0.5, 4, 4, 'F');
      doc.rect(x + s * 0.32, y - s * 0.82, s * 0.1, s * 0.22, 'F');
      doc.rect(x + s * 0.58, y - s * 0.82, s * 0.1, s * 0.22, 'F');
      setFill(COLORS.white);
      const cx = x + s * 0.5;
      const cy = y - s * 0.38;
      doc.triangle(cx + s * 0.06, cy - s * 0.16, cx - s * 0.08, cy + s * 0.02, cx + s * 0.02, cy + s * 0.02, 'F');
      doc.triangle(cx + s * 0.02, cy + s * 0.02, cx - s * 0.06, cy + s * 0.2, cx + s * 0.08, cy - s * 0.02, 'F');
    },
    shoe(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      doc.roundedRect(x + s * 0.05, y - s * 0.22, s * 0.9, s * 0.16, 3, 3, 'F');
      doc.roundedRect(x + s * 0.08, y - s * 0.55, s * 0.5, s * 0.36, 4, 4, 'F');
      doc.triangle(x + s * 0.5, y - s * 0.5, x + s * 0.95, y - s * 0.3, x + s * 0.55, y - s * 0.2, 'F');
    },
    // ---- Info-box icons (Meeting Point / Eligibility compact cards) ----
    navigation(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      // Compass-arrow / "get directions" kite shape, pointing up-right.
      doc.triangle(cx - s * 0.04, cy - s * 0.48, cx + s * 0.4, cy + s * 0.42, cx - s * 0.04, cy + s * 0.14, 'F');
      doc.triangle(cx - s * 0.04, cy - s * 0.48, cx - s * 0.04, cy + s * 0.14, cx - s * 0.44, cy + s * 0.42, 'F');
    },
    userCheck(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const cx = x + s * 0.36;
      doc.circle(cx, y - s * 0.76, s * 0.19, 'F');
      doc.roundedRect(cx - s * 0.3, y - s * 0.5, s * 0.6, s * 0.44, s * 0.2, s * 0.2, 'F');
      setFill(COLORS.green);
      doc.circle(x + s * 0.84, y - s * 0.2, s * 0.22, 'F');
      drawCheck(x + s * 0.84, y - s * 0.2, s * 0.16, COLORS.white, 1.6);
    },
    // ---- Closing-slide icons (booking card meta row, contact bar, footer) ----
    clock(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const r = s * 0.42;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.circle(cx, cy, r, 'S');
      doc.setLineWidth(1.2);
      doc.setLineCap('round');
      doc.line(cx, cy, cx, cy - r * 0.55);
      doc.line(cx, cy, cx + r * 0.42, cy + r * 0.08);
    },
    users(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      setFill(color);
      const r1 = s * 0.17;
      const cx1 = x + s * 0.32;
      const cy1 = y - s * 0.7;
      doc.circle(cx1, cy1, r1, 'F');
      doc.roundedRect(cx1 - s * 0.24, y - s * 0.44, s * 0.48, s * 0.34, s * 0.17, s * 0.17, 'F');
      const r2 = s * 0.14;
      const cx2 = x + s * 0.74;
      const cy2 = y - s * 0.6;
      doc.circle(cx2, cy2, r2, 'F');
      doc.roundedRect(cx2 - s * 0.2, y - s * 0.38, s * 0.4, s * 0.3, s * 0.14, s * 0.14, 'F');
    },
    phone(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      setFill(color);
      doc.circle(cx - s * 0.18, cy - s * 0.18, s * 0.15, 'F');
      doc.circle(cx + s * 0.18, cy + s * 0.18, s * 0.15, 'F');
      setDraw(color);
      doc.setLineWidth(s * 0.2);
      doc.setLineCap('round');
      doc.line(cx - s * 0.1, cy - s * 0.1, cx + s * 0.1, cy + s * 0.1);
    },
    mail(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const w = s * 0.9;
      const h = s * 0.62;
      const rx = x + (s - w) / 2;
      const ry = y - s * 0.72;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(rx, ry, w, h, 2, 2, 'S');
      doc.line(rx, ry, rx + w / 2, ry + h * 0.55);
      doc.line(rx + w, ry, rx + w / 2, ry + h * 0.55);
    },
    globe(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const r = s * 0.42;
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.circle(cx, cy, r, 'S');
      doc.ellipse(cx, cy, r * 0.42, r, 'S');
      doc.line(cx - r, cy, cx + r, cy);
    },
    instagram(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      // Sized/weighted to match the real lucide-react icons used for the
      // other contact-bar entries (Headphones/Phone/Mail/Globe), which fill
      // most of their `s`-sized box — this hand-drawn glyph previously used
      // only 72% of that box at a thinner stroke, so it read smaller and
      // lighter than its neighbors in the footer row.
      const w = s * 0.86;
      const rx = x + (s - w) / 2;
      const ry = y - s / 2 - w / 2;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.roundedRect(rx, ry, w, w, w * 0.28, w * 0.28, 'S');
      doc.circle(rx + w / 2, ry + w / 2, w * 0.26, 'S');
      setFill(color);
      doc.circle(rx + w * 0.76, ry + w * 0.24, w * 0.07, 'F');
    },
    headset(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.6;
      const r = s * 0.4;
      setDraw(color);
      doc.setLineWidth(1.6);
      doc.setLineCap('round');
      for (let i = 0; i < 8; i++) {
        const a1 = Math.PI + (Math.PI * i) / 8;
        const a2 = Math.PI + (Math.PI * (i + 1)) / 8;
        doc.line(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
      }
      setFill(color);
      doc.roundedRect(cx - r - s * 0.06, cy - s * 0.02, s * 0.14, s * 0.26, 3, 3, 'F');
      doc.roundedRect(cx + r - s * 0.08, cy - s * 0.02, s * 0.14, s * 0.26, 3, 3, 'F');
      // Mic boom + bulb curving down-forward from the left ear cup, so the
      // icon reads as a support headset (with mic) rather than plain headphones.
      const earBottomX = cx - r - s * 0.06 + s * 0.07;
      const earBottomY = cy - s * 0.02 + s * 0.26;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.line(earBottomX, earBottomY, earBottomX + s * 0.13, earBottomY + s * 0.15);
      setFill(color);
      doc.circle(earBottomX + s * 0.15, earBottomY + s * 0.17, s * 0.06, 'F');
    },
    /** WhatsApp-style call bubble: a filled circle with a speech-bubble tail
     *  and a simple white handset glyph, used for the "Call / WhatsApp"
     *  contact item instead of the plain phone icon. */
    whatsapp(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.56;
      const r = s * 0.46;
      setFill(color);
      doc.circle(cx, cy, r, 'F');
      doc.triangle(cx - r * 0.15, cy + r * 0.78, cx + r * 0.35, cy + r * 0.78, cx - r * 0.05, cy + r * 1.25, 'F');
      setFill(COLORS.white);
      doc.circle(cx - r * 0.16, cy - r * 0.16, r * 0.16, 'F');
      doc.circle(cx + r * 0.16, cy + r * 0.16, r * 0.16, 'F');
      setDraw(COLORS.white);
      doc.setLineWidth(r * 0.22);
      doc.setLineCap('round');
      doc.line(cx - r * 0.08, cy - r * 0.08, cx + r * 0.08, cy + r * 0.08);
    },
    lock(x: number, y: number, s = 20, color: RGB = COLORS.white) {
      const bw = s * 0.62;
      const bh = s * 0.48;
      const bx = x + (s - bw) / 2;
      const by = y - bh;
      setFill(color);
      doc.roundedRect(bx, by, bw, bh, 2.5, 2.5, 'F');
      setDraw(color);
      doc.setLineWidth(s * 0.09);
      const cx = x + s / 2;
      const r = s * 0.2;
      for (let i = 0; i < 8; i++) {
        const a1 = Math.PI + (Math.PI * i) / 8;
        const a2 = Math.PI + (Math.PI * (i + 1)) / 8;
        doc.line(cx + Math.cos(a1) * r, by + Math.sin(a1) * r, cx + Math.cos(a2) * r, by + Math.sin(a2) * r);
      }
      setFill(COLORS.primary);
      doc.circle(cx, by + bh * 0.42, s * 0.05, 'F');
    },
    /** Small hand-drawn-style heart, used next to the cursive closing-slide
     *  headings. style 'F' fills it solid, 'S' draws an outline only. */
    heart(x: number, y: number, s = 20, color: RGB = COLORS.primary, style: 'F' | 'S' = 'F') {
      const cx = x + s * 0.5;
      const topY = y - s * 0.62;
      const r = s * 0.26;
      if (style === 'F') {
        setFill(color);
      } else {
        setDraw(color);
        doc.setLineWidth(1.3);
      }
      doc.circle(cx - r * 0.7, topY, r, style);
      doc.circle(cx + r * 0.7, topY, r, style);
      doc.triangle(cx - r * 1.55, topY + r * 0.32, cx + r * 1.55, topY + r * 0.32, cx, y, style);
    },
    /** Simple palm-silhouette doodle for the closing slide's footer band. */
    palm(x: number, y: number, s = 20, color: RGB = COLORS.white) {
      setDraw(color);
      doc.setLineWidth(1.6);
      doc.setLineCap('round');
      doc.line(x + s * 0.5, y, x + s * 0.42, y - s * 0.5);
      doc.line(x + s * 0.42, y - s * 0.5, x + s * 0.55, y - s * 0.88);
      setFill(color);
      const tipX = x + s * 0.55;
      const tipY = y - s * 0.88;
      [-0.9, -0.45, 0, 0.45, 0.9].forEach(a => {
        const ang = -Math.PI / 2 + a;
        const ex = tipX + Math.cos(ang) * s * 0.42;
        const ey = tipY + Math.sin(ang) * s * 0.42;
        const ex2 = tipX + Math.cos(ang + 0.32) * s * 0.26;
        const ey2 = tipY + Math.sin(ang + 0.32) * s * 0.26;
        doc.triangle(tipX, tipY, ex, ey, ex2, ey2, 'F');
      });
    },
    share(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      const cy = y - s * 0.5;
      const pts: [number, number][] = [
        [cx - s * 0.32, cy],
        [cx + s * 0.3, cy - s * 0.3],
        [cx + s * 0.3, cy + s * 0.3],
      ];
      setDraw(color);
      doc.setLineWidth(1.3);
      doc.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      doc.line(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      setFill(color);
      pts.forEach(p => doc.circle(p[0], p[1], s * 0.11, 'F'));
    },
    download(x: number, y: number, s = 20, color: RGB = COLORS.primary) {
      const cx = x + s * 0.5;
      setDraw(color);
      doc.setLineWidth(1.4);
      doc.setLineCap('round');
      doc.line(cx, y - s * 0.9, cx, y - s * 0.3);
      doc.line(cx - s * 0.22, y - s * 0.5, cx, y - s * 0.28);
      doc.line(cx + s * 0.22, y - s * 0.5, cx, y - s * 0.28);
      doc.line(x + s * 0.12, y, x + s * 0.88, y);
    },
  };

  /** Renders an actual lucide-react icon (the same component
   *  TripHighlightIconDisplay / TripDetailPage.tsx render on the live site)
   *  into the PDF as real vector paths via svg2pdf.js — not a hand-drawn
   *  approximation from the `icons` set above. Follows the same
   *  "x, y = bottom-left anchor" convention as every `icons.*` helper so
   *  call sites read the same either way: `y` is the icon's bottom edge,
   *  `s` is both its width and height. Best-effort: a failed render (e.g.
   *  an unsupported SVG feature) is swallowed rather than breaking the
   *  whole PDF, matching the same defensive pattern used for image loads
   *  elsewhere in this file. */
  async function drawLucideIcon(Icon: LucideIcon, x: number, y: number, s = 20, color: RGB = COLORS.primary) {
    try {
      const markup = renderToStaticMarkup(
        createElement(Icon, { size: s, color: rgbToHex(color), strokeWidth: 2 })
      );
      const svgEl = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
      await doc.svg(svgEl, { x, y: y - s, width: s, height: s });
    } catch {
      /* icon glyph skipped — see comment above */
    }
  }

  // ---------------------------------------------------------------------
  // Text primitive: draws left-aligned wrapped text and returns the y
  // position immediately below the last line (top-down, single block).
  // ---------------------------------------------------------------------
  function drawParagraph(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    opts?: { size?: number; color?: RGB; bold?: boolean; lineHeight?: number; maxLines?: number }
  ): number {
    const size = opts?.size ?? 11;
    const color = opts?.color ?? COLORS.darkMuted;
    const lh = opts?.lineHeight ?? size * 1.42;
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    setText(color);
    const lines: string[] = opts?.maxLines
      ? clampLines(text, maxWidth, opts.maxLines)
      : doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lh;
  }

  // ---------------------------------------------------------------------
  // Bullet list primitive: draws a small dot-marker + wrapped text for
  // each item, sharing one line budget (`opts.maxLines`) across the whole
  // list so it truncates gracefully (with an ellipsis on the last line
  // drawn) instead of overflowing its container. Returns the y position
  // immediately below the last line drawn.
  // ---------------------------------------------------------------------
  function drawBulletList(
    items: string[],
    x: number,
    y: number,
    maxWidth: number,
    opts?: { size?: number; color?: RGB; lineHeight?: number; maxLines?: number }
  ): number {
    const size = opts?.size ?? 8.8;
    const color = opts?.color ?? COLORS.darkMuted;
    const lh = opts?.lineHeight ?? size * 1.42;
    const markerIndent = 10;
    const textWidth = maxWidth - markerIndent;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);

    let remaining = opts?.maxLines ?? Infinity;
    let cy = y;
    for (const item of items) {
      if (remaining <= 0) break;
      const wrapped: string[] = doc.splitTextToSize(item, textWidth);
      const lines = wrapped.length > remaining ? clampLines(item, textWidth, remaining) : wrapped;
      if (lines.length === 0) break;

      setFill(COLORS.secondary);
      doc.circle(x + 2.5, cy - size * 0.35, 1.4, 'F');
      setText(color);
      doc.text(lines, x + markerIndent, cy);

      cy += lines.length * lh;
      remaining -= lines.length;
    }
    return cy;
  }

  function measureParagraphHeight(
    text: string,
    maxWidth: number,
    size: number,
    lineHeight?: number,
    maxLines?: number
  ): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lh = lineHeight ?? size * 1.42;
    const lines: string[] = doc.splitTextToSize(text, maxWidth);
    const count = maxLines ? Math.min(lines.length, maxLines) : lines.length;
    return count * lh;
  }

  /** Spreads one shared list across two side-by-side
   *  columns, always dropping the next item into whichever column is
   *  currently shorter. This keeps both columns filled evenly (rather than
   *  a naive odd/even split, which can leave a continuation page with a
   *  single item in one column and the other totally empty). */
  function paginateTwoColumns<T>(
    items: T[],
    measure: (item: T) => number,
    availH: number
  ): { left: T[]; right: T[]; leftH: number; rightH: number }[] {
    if (items.length === 0) return [];
    const pages: { left: T[]; right: T[]; leftH: number; rightH: number }[] = [];
    let left: T[] = [];
    let right: T[] = [];
    let leftH = 0;
    let rightH = 0;

    for (const item of items) {
      const h = measure(item);
      const shortIsLeft = leftH <= rightH;
      const fitsShort = (shortIsLeft ? leftH : rightH) + h <= availH;
      const fitsOther = (shortIsLeft ? rightH : leftH) + h <= availH;
      const isEmptyPage = left.length === 0 && right.length === 0;

      if (fitsShort || isEmptyPage) {
        if (shortIsLeft) {
          left.push(item);
          leftH += h;
        } else {
          right.push(item);
          rightH += h;
        }
      } else if (fitsOther) {
        if (shortIsLeft) {
          right.push(item);
          rightH += h;
        } else {
          left.push(item);
          leftH += h;
        }
      } else {
        pages.push({ left, right, leftH, rightH });
        left = [item];
        right = [];
        leftH = h;
        rightH = 0;
      }
    }
    pages.push({ left, right, leftH, rightH });
    return pages;
  }

  /** Returns a y-offset that centers a block of the given height within
   *  [top, bottom] — used so slides with little content (a short packing
   *  list, a single cancellation clause on a continuation page, etc.) read
   *  as an intentionally-composed card instead of a mostly-empty page. */
  function centeredTop(top: number, bottom: number, contentH: number): number {
    const avail = bottom - top;
    if (contentH >= avail) return top;
    return top + (avail - contentH) / 2;
  }

  // =========================================================================
  // SLIDE — Cover
  // =========================================================================
  async function renderCover() {
    newSlide();
    const heroH = PAGE_H * 0.56;

    let heroDrawn = false;
    if (trip.cover_image) {
      const cropped = await loadCoverCroppedImage(trip.cover_image, PAGE_W, heroH, 0);
      if (cropped) {
        try {
          doc.addImage(cropped, 'JPEG', 0, 0, PAGE_W, heroH);
          heroDrawn = true;
        } catch {
          heroDrawn = false;
        }
      }
    }
    if (!heroDrawn) {
      setFill(COLORS.backgroundWarm);
      doc.rect(0, 0, PAGE_W, heroH, 'F');
    }

    // Subtle bottom gradient over the photo so a logo/badge sitting near
    // the seam stays legible regardless of the photo's own colors.
    withOpacity(0.28, () => {
      setFill(COLORS.dark);
      doc.rect(0, heroH - 70, PAGE_W, 70, 'F');
    });

    // Brand mark, top-left over the photo.
    const logo = await loadContainImage('/ULAA-logo-Footer.png');
    if (logo) {
      const logoH = 40;
      const logoW = logoH * logo.ratio;
      try {
        doc.addImage(logo.dataUrl, 'PNG', MARGIN, 22, logoW, logoH);
      } catch {
        drawTextLogo(MARGIN, 22, true);
      }
    } else {
      drawTextLogo(MARGIN, 22, true);
    }

    // Cream information strip below the photo.
    setFill(COLORS.background);
    doc.rect(0, heroH, PAGE_W, PAGE_H - heroH, 'F');
    setFill(COLORS.secondary);
    doc.rect(0, heroH, PAGE_W, 3, 'F');

    // Soft decorative arcs, bottom-right — a quiet echo of the brand mark
    // rather than a literal illustration, so it never looks out of place
    // for any destination.
    withOpacity(0.5, () => {
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.circle(PAGE_W - 46, PAGE_H - 40, 30, 'S');
      doc.circle(PAGE_W - 80, PAGE_H - 26, 16, 'S');
    });

    let ty = heroH + 34;
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    const titleMaxW = CONTENT_W - 130;
    const titleLines: string[] = clampLines(trip.title, titleMaxW, 2);
    doc.text(titleLines, MARGIN, ty);
    ty += titleLines.length * 27 + 4;

    // Destination line, directly under the title.
    if (trip.destination) {
      icons.pin(MARGIN, ty + 11, 13);
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(trip.destination, MARGIN + 17, ty + 7);
      ty += 22;
    }

    // Meta row: dates • duration • total seats • age eligibility • early bird.
    // Pills auto-wrap onto a second row if the full set doesn't fit one line
    // (long destinations/durations, or an early-bird pill, can push it over).
    const { activePrice, isEarlyBird } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
    const metaParts = [
      formatDateRange(trip.start_date, trip.end_date),
      trip.duration,
      trip.total_seats ? `Group of ${trip.total_seats}` : '',
      formatAgeRange(trip.min_age, trip.max_age),
      isEarlyBird && activePrice ? `Early Bird ${money(activePrice)}` : '',
    ]
      .filter(Boolean)
      .map(sanitizeForPdf);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const pillH = 20;
    const pillGap = 8;
    const rowGap = 8;
    let mx = MARGIN;
    metaParts.forEach((part, i) => {
      const w = doc.getTextWidth(part) + 16;
      if (mx + w > MARGIN + CONTENT_W && mx > MARGIN) {
        mx = MARGIN;
        ty += pillH + rowGap;
      }
      setFill(i === 0 ? COLORS.primary : COLORS.backgroundWarm);
      doc.roundedRect(mx, ty, w, pillH, 10, 10, 'F');
      setText(i === 0 ? COLORS.white : COLORS.darkMuted);
      doc.text(part, mx + 8, ty + 13.5);
      mx += w + pillGap;
    });
    ty += pillH + 16;

    if (trip.description) {
      const descBottom = PAGE_H - 34;
      const descLineHeight = 14;
      const maxLines = Math.max(1, Math.floor((descBottom - ty) / descLineHeight));
      drawParagraph(trip.description, MARGIN, ty, CONTENT_W - 130, {
        size: 10,
        color: COLORS.darkMuted,
        maxLines,
        lineHeight: descLineHeight,
      });
    }

    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(BRAND.website, MARGIN, PAGE_H - 20);
  }

  function drawTextLogo(x: number, y: number, onDark: boolean) {
    setText(onDark ? COLORS.gold : COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(BRAND.name, x, y + 13);
    setText(onDark ? COLORS.whiteMuted : COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(BRAND.tagline.toUpperCase(), x, y + 22);
  }

  // =========================================================================
  // SLIDE — "Why You'll Love This Trip" (highlight cards) + "N Days of
  // Unforgettable Moments" (day badge strip). Mirrors the two sections that
  // sit back-to-back on the public Trip Detail page. Both are short by
  // nature (a handful of cards, a handful of days) so they normally share
  // one slide; if a trip has an unusually long list of either, each section
  // gets its own paginated slide(s) instead of squeezing/overflowing.
  // =========================================================================
  const CARD_PALETTE: RGB[] = [COLORS.primary, COLORS.secondary, COLORS.gold, COLORS.green];

  function drawSectionTitle(title: string, top: number): number {
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(title, PAGE_W / 2, top + 14, { align: 'center' });
    return top + 34;
  }

  async function drawHighlightCard(card: TripHighlightCard, x: number, y: number, w: number, h: number, color: RGB) {
    setFill(COLORS.cream);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');
    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, w, h, 10, 10, 'S');

    const cx = x + w / 2;
    const iconCy = y + 28;
    setFill(color);
    doc.circle(cx, iconCy, 15, 'F');
    // The admin's actual picked icon (same TripHighlightIconDisplay renders
    // on the live site), not a fixed star — falls back to Star only for
    // legacy/emoji values the picker predates.
    await drawLucideIcon(resolveIcon(card.icon, Star), cx - 9, iconCy + 9, 18, COLORS.white);

    let ty = iconCy + 32;
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    const headingLines = clampLines(card.heading, w - 24, 1);
    doc.text(headingLines, cx, ty, { align: 'center' });
    ty += 16;

    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const descLines = clampLines(card.description, w - 28, 3);
    doc.text(descLines, cx, ty, { align: 'center', lineHeightFactor: 1.35 });
  }

  const HIGHLIGHT_CARD_H = 110;
  const HIGHLIGHT_ROW_GAP = 16;
  const HIGHLIGHT_PER_ROW = 3;

  /** Draws up to `cards.length` highlight cards as a wrapping 3-across grid
   *  and returns the y position immediately below the grid. */
  async function drawHighlightGrid(cards: TripHighlightCard[], top: number): Promise<number> {
    const colGap = 20;
    const cardW = (CONTENT_W - colGap * (HIGHLIGHT_PER_ROW - 1)) / HIGHLIGHT_PER_ROW;
    for (let i = 0; i < cards.length; i++) {
      const row = Math.floor(i / HIGHLIGHT_PER_ROW);
      const col = i % HIGHLIGHT_PER_ROW;
      const x = MARGIN + col * (cardW + colGap);
      const y = top + row * (HIGHLIGHT_CARD_H + HIGHLIGHT_ROW_GAP);
      await drawHighlightCard(cards[i], x, y, cardW, HIGHLIGHT_CARD_H, CARD_PALETTE[i % CARD_PALETTE.length]);
    }
    const rows = Math.ceil(cards.length / HIGHLIGHT_PER_ROW);
    return top + rows * HIGHLIGHT_CARD_H + Math.max(0, rows - 1) * HIGHLIGHT_ROW_GAP;
  }

  const DAY_ROW_PITCH = 100;
  const DAY_PER_ROW = 6;

  /** Draws the "N Days of Unforgettable Moments" heading plus a row (or
   *  wrapped rows) of day badges — a circle with the day number, connected
   *  by a dotted line, with the day's title underneath — echoing the
   *  itinerary-day strip at the top of the public trip page. `totalLabel`
   *  lets a continuation slide keep showing the true overall day count
   *  while only laying out its own chunk of days. When a day has an
   *  admin-picked icon (day.icon), the badge shows that icon instead of the
   *  day number — matching the live site's itinerary-day button, which
   *  swaps in the same icon in place of the number once one is set. */
  async function drawDaysSection(days: ItineraryDay[], top: number, totalLabel?: string) {
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const heading = totalLabel ?? `${days.length} Day${days.length === 1 ? '' : 's'} of Unforgettable Moments`;
    doc.text(heading, PAGE_W / 2, top + 12, { align: 'center' });

    const rowTop = top + 40;
    const perRow = Math.min(days.length, DAY_PER_ROW);
    const cellW = CONTENT_W / perRow;
    const circleR = 20;

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const cx = MARGIN + col * cellW + cellW / 2;
      const cy = rowTop + row * DAY_ROW_PITCH + circleR;

      // Dotted connector to the next badge in the same row.
      if (col < perRow - 1 && i < days.length - 1) {
        setDraw(COLORS.grayLine);
        doc.setLineWidth(1);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(cx + circleR, cy, cx + cellW - circleR, cy);
        doc.setLineDashPattern([], 0);
      }

      setFill(COLORS.primary);
      doc.circle(cx, cy, circleR, 'F');
      const dayMeta = day.icon ? getTripHighlightIcon(day.icon) : undefined;
      if (dayMeta) {
        await drawLucideIcon(dayMeta.Icon, cx - 10, cy + 10, 20, COLORS.white);
      } else {
        setText(COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('DAY', cx, cy - 4, { align: 'center' });
        doc.setFontSize(13);
        doc.text(String(day.day), cx, cy + 9, { align: 'center' });
      }

      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const titleLines = clampLines(day.title, cellW - 12, 2);
      doc.text(titleLines, cx, cy + circleR + 16, { align: 'center' });
    }
  }

  async function renderHighlightCardsSlides(cards: TripHighlightCard[]) {
    const perSlide = HIGHLIGHT_PER_ROW * 2;
    for (let i = 0; i < cards.length; i += perSlide) {
      newSlide();
      const top = drawSectionTitle("Why You'll Love This Trip", MARGIN);
      await drawHighlightGrid(cards.slice(i, i + perSlide), top);
    }
  }

  async function renderDaySlides(days: ItineraryDay[]) {
    const perSlide = DAY_PER_ROW * 2;
    for (let i = 0; i < days.length; i += perSlide) {
      newSlide();
      const label = `${days.length} Day${days.length === 1 ? '' : 's'} of Unforgettable Moments`;
      await drawDaysSection(days.slice(i, i + perSlide), MARGIN, label);
    }
  }

  async function renderHighlightsAndDays() {
    const cards = trip.highlight_cards;
    const days = trip.itinerary;
    if (cards.length === 0 && days.length === 0) return;

    const cardRows = cards.length ? Math.ceil(cards.length / HIGHLIGHT_PER_ROW) : 0;
    const cardsBlockH = cards.length ? 34 + cardRows * HIGHLIGHT_CARD_H + Math.max(0, cardRows - 1) * HIGHLIGHT_ROW_GAP : 0;
    const dayPerRow = Math.min(days.length, DAY_PER_ROW);
    const dayRows = dayPerRow ? Math.ceil(days.length / dayPerRow) : 0;
    const daysBlockH = days.length ? 40 + dayRows * DAY_ROW_PITCH : 0;
    const gapBetween = cards.length && days.length ? 28 : 0;
    const availH = CONTENT_BOTTOM - MARGIN;

    if (cardsBlockH + gapBetween + daysBlockH <= availH) {
      newSlide();
      let y = MARGIN;
      if (cards.length) {
        y = drawSectionTitle("Why You'll Love This Trip", y);
        y = await drawHighlightGrid(cards, y);
        y += gapBetween;
      }
      if (days.length) {
        await drawDaysSection(days, y);
      }
    } else {
      if (cards.length) await renderHighlightCardsSlides(cards);
      if (days.length) await renderDaySlides(days);
    }
  }


  // =========================================================================
  // SLIDES — Detailed Itinerary (2×2 photo cards per slide, paginated)
  // =========================================================================
  async function renderItinerary() {
    if (trip.itinerary.length === 0) return;

    const cols = 2;
    const rows = 1;
    const perPage = cols * rows;
    const gridTop = 106; // clears the subtitle (only shown on the first page) with room to spare
    const colGap = 20;
    const rowGap = 16;
    const cardW = cols > 1 ? (CONTENT_W - colGap * (cols - 1)) / cols : CONTENT_W;
    const fullAvailH = CONTENT_BOTTOM - gridTop;

    for (let pageStart = 0; pageStart < trip.itinerary.length; pageStart += perPage) {
      newSlide();
      const isFirst = pageStart === 0;
      slideHeader(
        null,
        'Detailed Itinerary',
        isFirst ? `${trip.itinerary.length} day${trip.itinerary.length === 1 ? '' : 's'} of things to do` : undefined
      );

      const pageItems = trip.itinerary.slice(pageStart, pageStart + perPage);
      const rowsUsed = Math.ceil(pageItems.length / cols);
      // A page with a single row of cards (last page has 1-2 days left)
      // gets the full slide height instead of being squeezed into half of
      // it with a blank row underneath.
      const cardH = rowsUsed < rows ? fullAvailH : (fullAvailH - rowGap) / rows;

      for (let i = 0; i < pageItems.length; i++) {
        const day = pageItems[i];
        const row = Math.floor(i / cols);
        const itemsInRow = Math.min(cols, pageItems.length - row * cols);
        const rowOffset = ((cols - itemsInRow) * (cardW + colGap)) / 2; // centers an incomplete last row
        const colIdx = i % cols;
        const cx = MARGIN + rowOffset + colIdx * (cardW + colGap);
        const cy = gridTop + row * (cardH + rowGap);

        setFill(COLORS.cream);
        doc.roundedRect(cx, cy, cardW, cardH, 8, 8, 'F');
        setDraw(COLORS.grayLine);
        doc.setLineWidth(0.75);
        doc.roundedRect(cx, cy, cardW, cardH, 8, 8, 'S');

        const pad = 14;
        const hasImages = !!day.images && day.images.length > 0;
        const thumbH = hasImages ? Math.min(160, cardH * 0.34) : 0;
        const textBottom = cy + cardH - pad - thumbH - (hasImages ? 10 : 0);
        let ty = cy + pad + 12;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        setText(COLORS.dark);
        const titleLines = clampLines(day.title, cardW - pad * 2, 2);
        doc.text(titleLines, cx + pad, ty);
        ty += titleLines.length * 15 + 8;

        const lineH = 12.5;
        const availLines = Math.max(1, Math.floor((textBottom - ty) / lineH));
        let usedLines = 0;
        const hasDescription = !!day.description && day.description.trim().length > 0;
        const dayBullets = day.bullets ?? [];
        const hasBullets = dayBullets.length > 0;

        if (hasDescription) {
          const beforeTy = ty;
          ty = drawParagraph(day.description, cx + pad, ty, cardW - pad * 2, {
            size: 8.8,
            color: COLORS.darkMuted,
            lineHeight: lineH,
            maxLines: availLines,
          });
          usedLines += Math.round((ty - beforeTy) / lineH);
          if (hasBullets && usedLines < availLines) ty += 4;
        }

        if (hasBullets) {
          const remainingLines = availLines - usedLines;
          if (remainingLines > 0) {
            drawBulletList(dayBullets, cx + pad, ty, cardW - pad * 2, {
              size: 8.8,
              color: COLORS.darkMuted,
              lineHeight: lineH,
              maxLines: remainingLines,
            });
          }
        }

        if (hasImages) {
          const imgs = (day.images || []).slice(0, 3);
          const thumbGap = 6;
          const thumbW = (cardW - pad * 2 - thumbGap * (imgs.length - 1)) / imgs.length;
          const thumbY = cy + cardH - pad - thumbH;
          const crops = await Promise.all(imgs.map(url => loadCoverCroppedImage(url, thumbW, thumbH, 4)));
          crops.forEach((cropped, idx) => {
            const tx = cx + pad + idx * (thumbW + thumbGap);
            if (cropped) {
              try {
                doc.addImage(cropped, 'JPEG', tx, thumbY, thumbW, thumbH);
                return;
              } catch {
                /* fall through to placeholder */
              }
            }
            setFill(COLORS.backgroundWarm);
            doc.roundedRect(tx, thumbY, thumbW, thumbH, 4, 4, 'F');
          });
        }
      }
    }
  }

  // =========================================================================
  // SLIDE — What's Included / What's Not Included, matching the live trip
  // page's own layout:
  //   - What's Included: when the trip has grouped content (included_groups
  //     — icon + heading + bulleted sub-items), draw those as 2-up cards.
  //     Falls back to a plain icon-card grid of included_items when the
  //     trip has no groups.
  //   - What's Not Included: wrapped pill chips (icon + label), same as the
  //     flex-wrap chip row on the site.
  // "What's Included" renders first, "What's Not Included" directly below
  // it, on the same slide when both fit — otherwise each section paginates
  // onto its own slide(s) independently.
  // =========================================================================
  const SECTION_TITLE_H = 26;
  const SECTION_GAP = 18;

  function drawSectionHeading(title: string, y: number) {
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, MARGIN, y + 11);
  }

  // ---- "What's Included" — grouped cards (heading + bullets, no icon) ----
  const GROUP_COLS = 2;
  const GROUP_COL_GAP = 16;
  const GROUP_ROW_GAP = 10;
  const GROUP_CARD_PAD = 12;

  function groupCardW(): number {
    return (CONTENT_W - GROUP_COL_GAP * (GROUP_COLS - 1)) / GROUP_COLS;
  }

  function measureGroupCardH(group: TripIncludedGroup, cardW: number): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    const bulletsW = cardW - GROUP_CARD_PAD * 2 - 10;
    const bulletsH = group.bullets.reduce((sum, item) => sum + doc.splitTextToSize(item, bulletsW).length * 12, 0);
    const headingBlockH = 28;
    return GROUP_CARD_PAD * 2 + headingBlockH + bulletsH;
  }

  async function drawGroupCard(group: TripIncludedGroup, x: number, y: number, w: number, h: number, index: number): Promise<void> {
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');

    // Admin-picked group icon (same TripHighlightIconDisplay pastel circle
    // the site shows next to the heading) — only drawn when the group
    // actually has one set, matching the site's `group.icon &&` guard.
    const meta = group.icon ? getTripHighlightIcon(group.icon) : undefined;
    const headingX = meta ? x + GROUP_CARD_PAD + 26 : x + GROUP_CARD_PAD;

    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(group.heading, headingX, y + GROUP_CARD_PAD + 10);

    const bulletsTop = y + GROUP_CARD_PAD + 28;
    drawBulletList(group.bullets, x + GROUP_CARD_PAD, bulletsTop, w - GROUP_CARD_PAD * 2, {
      size: 8.8,
      color: COLORS.darkMuted,
      lineHeight: 12,
    });

    if (!meta) return;
    const { bg, fg } = CONFIDENCE_PALETTE[index % CONFIDENCE_PALETTE.length];
    const iconCx = x + GROUP_CARD_PAD + 10;
    const iconCy = y + GROUP_CARD_PAD + 5;
    setFill(bg);
    doc.circle(iconCx, iconCy, 11, 'F');
    await drawLucideIcon(meta.Icon, iconCx - 8, iconCy + 8, 16, fg);
  }

  type GroupPos = { group: TripIncludedGroup; x: number; y: number; w: number; h: number; index: number };

  /** True masonry packing, not fixed row-pairs: each card keeps its own
   *  natural height (never stretched to match a neighbour), and each group
   *  in turn drops into whichever column currently has the most room used
   *  up the least — so a short card and a tall card don't get force-paired
   *  into one row (wasting space under the short one), and a later short
   *  card can backfill space next to an earlier tall one. Places as many
   *  groups as fit under `maxBottom` starting from `top`; the caller
   *  continues anything left over on a fresh page. Pass `maxBottom =
   *  Infinity` to lay out (or just measure) a whole list with no page
   *  break, which is what `groupGridH`/`drawGroupGrid` below do for the
   *  common case where everything already fits on one slide. */
  function packGroupsMasonry(
    groups: TripIncludedGroup[],
    cardW: number,
    top: number,
    maxBottom: number,
    indexOffset: number,
  ): { positions: GroupPos[]; placed: number; bottom: number } {
    const colX = Array.from({ length: GROUP_COLS }, (_, c) => MARGIN + c * (cardW + GROUP_COL_GAP));
    const colY = Array.from({ length: GROUP_COLS }, () => top);
    const positions: GroupPos[] = [];
    let placed = 0;
    for (let i = 0; i < groups.length; i++) {
      const h = measureGroupCardH(groups[i], cardW);
      const col = colY.indexOf(Math.min(...colY));
      const y = colY[col];
      if (y + h > maxBottom) break;
      positions.push({ group: groups[i], x: colX[col], y, w: cardW, h, index: indexOffset + i });
      colY[col] = y + h + GROUP_ROW_GAP;
      placed++;
    }
    const bottom = groups.length ? Math.max(...colY) - GROUP_ROW_GAP : top;
    return { positions, placed, bottom };
  }

  function groupGridH(groups: TripIncludedGroup[]): number {
    if (groups.length === 0) return 0;
    const { bottom } = packGroupsMasonry(groups, groupCardW(), 0, Infinity, 0);
    return bottom;
  }

  /** Draws a masonry-packed list that's already known to fit in the space
   *  available (no page breaks) — used both for the common single-slide
   *  case and for each already-sliced page in the paginated path below. */
  async function drawGroupGrid(groups: TripIncludedGroup[], top: number, indexOffset = 0): Promise<number> {
    const { positions, bottom } = packGroupsMasonry(groups, groupCardW(), top, Infinity, indexOffset);
    for (const pos of positions) {
      await drawGroupCard(pos.group, pos.x, pos.y, pos.w, pos.h, pos.index);
    }
    return bottom;
  }

  /** Multi-page version: masonry-packs groups starting at `top` on the
   *  current slide, spilling onto additional "(continued)" slides for
   *  whatever doesn't fit — each page independently packed to its own
   *  actual content, not a size borrowed from elsewhere in the list. */
  /** Returns the y position immediately below the last group placed, so the
   *  caller can pack "What's Not Included" onto the same trailing page
   *  instead of always starting a fresh one. */
  async function drawGroupsMasonryPaginated(groups: TripIncludedGroup[], top: number): Promise<number> {
    const cardW = groupCardW();
    let remaining = groups;
    let indexCursor = 0;
    let pageNum = 0;
    let lastBottom = top;
    while (remaining.length > 0) {
      newSlide();
      slideHeader(null, pageNum === 0 ? "What's Included" : "What's Included (continued)");
      const { positions, placed, bottom } = packGroupsMasonry(remaining, cardW, top, CONTENT_BOTTOM, indexCursor);
      if (placed === 0) {
        // A single group taller than a whole page — place it alone rather
        // than looping forever; it'll simply run past the page bottom.
        const h = measureGroupCardH(remaining[0], cardW);
        await drawGroupCard(remaining[0], MARGIN, top, cardW, h, indexCursor);
        lastBottom = top + h;
        remaining = remaining.slice(1);
        indexCursor += 1;
      } else {
        for (const pos of positions) {
          await drawGroupCard(pos.group, pos.x, pos.y, pos.w, pos.h, pos.index);
        }
        lastBottom = bottom;
        remaining = remaining.slice(placed);
        indexCursor += placed;
      }
      pageNum++;
    }
    return lastBottom;
  }

  // ---- "What's Included" fallback — flat icon-card grid, used only when
  // the trip has no included_groups (just included_items) ----
  const FLAT_CARD_H = 78;
  const FLAT_ROW_GAP = 10;
  const FLAT_PER_ROW = 3;

  async function drawFlatIncludedCard(item: PdfListItem, x: number, y: number, w: number, h: number, index: number) {
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');

    const cx = x + w / 2;
    const iconCy = y + 22;
    // Mirrors the site exactly: an admin-picked icon (in its pastel
    // TripHighlightIconDisplay circle) when the item has one, else the
    // plain green CheckCircle fallback.
    const meta = item.icon ? getTripHighlightIcon(item.icon) : undefined;
    if (meta) {
      const { bg, fg } = CONFIDENCE_PALETTE[index % CONFIDENCE_PALETTE.length];
      setFill(bg);
      doc.circle(cx, iconCy, 11, 'F');
      await drawLucideIcon(meta.Icon, cx - 8, iconCy + 8, 16, fg);
    } else {
      // Matches the site's exact fallback styling: a pale green-100 circle
      // with a green-600 CheckCircle icon (not solid green/white).
      setFill(GREEN_100);
      doc.circle(cx, iconCy, 11, 'F');
      await drawLucideIcon(CheckCircle, cx - 8, iconCy + 8, 16, GREEN_600);
    }

    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    const lines = clampLines(item.description, w - 20, 3);
    doc.text(lines, cx, iconCy + 22, { align: 'center', lineHeightFactor: 1.3 });
  }

  function flatGridH(count: number): number {
    if (count === 0) return 0;
    const rows = Math.ceil(count / FLAT_PER_ROW);
    return rows * FLAT_CARD_H + Math.max(0, rows - 1) * FLAT_ROW_GAP;
  }

  async function drawFlatGrid(items: PdfListItem[], top: number, indexOffset = 0): Promise<number> {
    const colGap = 20;
    const cardW = (CONTENT_W - colGap * (FLAT_PER_ROW - 1)) / FLAT_PER_ROW;
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / FLAT_PER_ROW);
      const col = i % FLAT_PER_ROW;
      const x = MARGIN + col * (cardW + colGap);
      const y = top + row * (FLAT_CARD_H + FLAT_ROW_GAP);
      await drawFlatIncludedCard(items[i], x, y, cardW, FLAT_CARD_H, indexOffset + i);
    }
    const rows = Math.ceil(items.length / FLAT_PER_ROW);
    return top + rows * FLAT_CARD_H + Math.max(0, rows - 1) * FLAT_ROW_GAP;
  }

  // ---- "What's Not Included" — wrapped pill chips ----
  const CHIP_H = 24;
  const CHIP_GAP_X = 8;
  const CHIP_GAP_Y = 8;
  const CHIP_PAD_X = 12;
  const CHIP_ICON_R = 5.5;

  function chipWidth(text: string): number {
    return doc.getTextWidth(text) + CHIP_PAD_X * 2 + CHIP_ICON_R * 2 + 6;
  }

  function measureChipRowH(items: string[]): number {
    if (items.length === 0) return 0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    let x = 0;
    let rows = 1;
    items.forEach(item => {
      const w = chipWidth(item);
      if (x > 0 && x + w > CONTENT_W) {
        rows++;
        x = 0;
      }
      x += w + CHIP_GAP_X;
    });
    return rows * CHIP_H + Math.max(0, rows - 1) * CHIP_GAP_Y;
  }

  // Not-included items always use XCircle (red-400), regardless of any
  // per-item icon field — the site never wires an icon picker into this
  // section either (see the "What's Not Included" chip row in
  // TripDetailPage.tsx), so this is already a faithful match.
  const NOT_INCLUDED_RED: RGB = [248, 113, 113];
  // Tailwind green-100 / green-600 — matches the site's exact fallback
  // styling for an included item with no admin-picked icon.
  const GREEN_100: RGB = [220, 252, 231];
  const GREEN_600: RGB = [22, 163, 74];

  async function drawChipRow(items: string[], top: number): Promise<number> {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    let x = MARGIN;
    let y = top;
    for (const item of items) {
      const w = chipWidth(item);
      if (x > MARGIN && x + w > MARGIN + CONTENT_W) {
        x = MARGIN;
        y += CHIP_H + CHIP_GAP_Y;
      }
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, y, w, CHIP_H, CHIP_H / 2, CHIP_H / 2, 'F');

      const iconCx = x + CHIP_PAD_X + CHIP_ICON_R;
      const iconCy = y + CHIP_H / 2;
      await drawLucideIcon(XCircle, iconCx - CHIP_ICON_R, iconCy + CHIP_ICON_R, CHIP_ICON_R * 2, NOT_INCLUDED_RED);

      setText(COLORS.dark);
      doc.text(item, iconCx + CHIP_ICON_R + 8, iconCy + 3.2);
      x += w + CHIP_GAP_X;
    }
    return y + CHIP_H;
  }

  async function renderInclusions() {
    const hasGroups = trip.included_groups.length > 0;
    const hasFlatIncluded = !hasGroups && trip.included.length > 0;
    const hasIncluded = hasGroups || hasFlatIncluded;
    const hasNotIncluded = trip.not_included.length > 0;
    if (!hasIncluded && !hasNotIncluded) return;

    const top = 92;
    const availH = CONTENT_BOTTOM - top;
    const includedH = hasIncluded
      ? SECTION_TITLE_H + (hasGroups ? groupGridH(trip.included_groups) : flatGridH(trip.included.length))
      : 0;
    const notIncludedH = hasNotIncluded ? SECTION_TITLE_H + measureChipRowH(trip.not_included) : 0;
    const gapBetween = hasIncluded && hasNotIncluded ? SECTION_GAP : 0;

    // Both sections fit stacked on one slide — the common case.
    if (includedH + gapBetween + notIncludedH <= availH) {
      newSlide();
      slideHeader(null, "What's Included & Not Included");
      let y = top;
      if (hasIncluded) {
        drawSectionHeading("What's Included", y);
        y += SECTION_TITLE_H;
        y = hasGroups ? await drawGroupGrid(trip.included_groups, y) : await drawFlatGrid(trip.included, y);
        y += gapBetween;
      }
      if (hasNotIncluded) {
        drawSectionHeading("What's Not Included", y);
        y += SECTION_TITLE_H;
        await drawChipRow(trip.not_included, y);
      }
      return;
    }

    // Too tall for one slide — paginate each section independently, each
    // getting its own slide(s), so long lists never overflow or get cut off.
    // Whichever section's pagination runs last tracks how much room is left
    // on its trailing page, so "What's Not Included" can reuse it instead
    // of always claiming a fresh slide.
    let lastBottom = top;
    if (hasGroups) {
      // True masonry packing across as many "(continued)" slides as needed
      // — see drawGroupsMasonryPaginated / packGroupsMasonry above. Each
      // card keeps its own natural height and flows into whichever column
      // has room, rather than being force-paired into equal-height rows.
      lastBottom = await drawGroupsMasonryPaginated(trip.included_groups, top);
    } else if (hasFlatIncluded) {
      const rowsPerPage = Math.max(1, Math.floor((availH - SECTION_TITLE_H) / (FLAT_CARD_H + FLAT_ROW_GAP)));
      const perPage = rowsPerPage * FLAT_PER_ROW;
      for (let i = 0; i < trip.included.length; i += perPage) {
        newSlide();
        slideHeader(null, i === 0 ? "What's Included" : "What's Included (continued)");
        lastBottom = await drawFlatGrid(trip.included.slice(i, i + perPage), top, i);
      }
    }

    if (hasNotIncluded) {
      const chipsH = SECTION_TITLE_H + measureChipRowH(trip.not_included);
      // Reuse the leftover space at the bottom of the included list's last
      // page when it fits, instead of unconditionally starting a fresh
      // slide just for the not-included chips.
      if (hasIncluded && lastBottom + SECTION_GAP + chipsH <= CONTENT_BOTTOM) {
        let y = lastBottom + SECTION_GAP;
        drawSectionHeading("What's Not Included", y);
        y += SECTION_TITLE_H;
        await drawChipRow(trip.not_included, y);
      } else {
        newSlide();
        slideHeader(null, "What's Not Included");
        await drawChipRow(trip.not_included, top);
      }
    }
  }

  // =========================================================================
  // SLIDE — Travel with Confidence (left) | Things to Carry (right), with
  // compact Meeting Point / Eligibility cards anchored along the bottom.
  // =========================================================================
  // A single split slide rather than several separate ones — divided by a
  // vertical rule down the middle, matching the reference screenshot. Falls
  // back to a single full-width column if only one side has content, and to
  // nothing at all if none of the four sections have data. Icon circles on
  // the left rotate through CONFIDENCE_PALETTE, mirroring the site's own
  // rotating pastel circles for these items (see TripHighlightIconDisplay's
  // base/unfilled state). The two checklist/chip columns don't paginate —
  // if a list is too long to fit above the bottom cards, drawing simply
  // stops rather than overflowing the slide.
  async function renderConfidenceAndCarry() {
    const confidenceItems = trip.confidence_items ?? [];
    const hasConfidence = confidenceItems.length > 0;
    const hasCarry = trip.things_to_carry.length > 0;
    const hasMeetingPoint = !!trip.meeting_point;
    const hasEligibility = trip.min_age != null || trip.max_age != null;
    if (!hasConfidence && !hasCarry && !hasMeetingPoint && !hasEligibility) return;

    newSlide();
    const top = 92;
    const colGap = 40;
    // Either row (checklist/chips up top, or the two info cards along the
    // bottom) can independently need a two-column split, so the shared
    // column geometry reacts to whichever row actually needs it — keeping
    // the vertical rule and column edges aligned across the whole slide.
    const topTwoCol = hasConfidence && hasCarry;
    const cardsTwoCol = hasMeetingPoint && hasEligibility;
    const twoCol = topTwoCol || cardsTwoCol;
    const leftW = twoCol ? (CONTENT_W - colGap) / 2 : CONTENT_W;
    const rightW = leftW;
    const rightX = MARGIN + leftW + colGap;

    // Bottom info cards reserve their own band; the checklist/chip content
    // above is capped to whatever's left so nothing overlaps.
    const hasCards = hasMeetingPoint || hasEligibility;
    const cardH = 116;
    const cardGap = 22;
    const listBottom = hasCards ? CONTENT_BOTTOM - cardH - cardGap : CONTENT_BOTTOM;

    if (hasConfidence) {
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.text('Travel with Confidence', MARGIN, 46);
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.line(MARGIN, 66, MARGIN + leftW, 66);

      let y = top;
      if (trip.confidence_description) {
        y = drawParagraph(trip.confidence_description, MARGIN, y, leftW, {
          size: 9.5,
          color: COLORS.darkMuted,
          lineHeight: 13.5,
          maxLines: 3,
        }) + 16;
      }

      const circleR = 14;
      const itemGap = 8;
      const textX = MARGIN + circleR * 2 + 14;
      const textW = leftW - (circleR * 2 + 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      for (let i = 0; i < confidenceItems.length; i++) {
        // Mirrors the site's `item.icon && <TripHighlightIconDisplay .../>`
        // guard — an item with no icon set gets no icon circle at all, and
        // its text starts flush left instead of indented past one.
        const meta = confidenceItems[i].icon ? getTripHighlightIcon(confidenceItems[i].icon) : undefined;
        const itemTextX = meta ? textX : MARGIN;
        const itemTextW = meta ? textW : leftW;
        const lines: string[] = doc.splitTextToSize(confidenceItems[i].description, itemTextW);
        const rowH = Math.max(meta ? circleR * 2 : 0, lines.length * 13);
        if (y + rowH > listBottom) break;

        const cy = y + rowH / 2;
        if (meta) {
          const { bg, fg } = CONFIDENCE_PALETTE[i % CONFIDENCE_PALETTE.length];
          const cx = MARGIN + circleR;
          setFill(bg);
          doc.circle(cx, cy, circleR, 'F');
          await drawLucideIcon(meta.Icon, cx - circleR * 0.72, cy + circleR * 0.72, circleR * 1.44, fg);
        }

        setText(COLORS.dark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text(lines, itemTextX, cy - ((lines.length - 1) * 13) / 2 + 3.5);

        y += rowH + itemGap;
      }
    }

    if (twoCol) {
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.line(rightX - colGap / 2, top - 26, rightX - colGap / 2, CONTENT_BOTTOM);
    }

    if (hasCarry) {
      const carryX = twoCol ? rightX : MARGIN;
      const carryW = twoCol ? rightW : CONTENT_W;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.text('Things to Carry', carryX, 46);
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.line(carryX, 66, carryX + carryW, 66);

      // Subtitle sits below the divider line, same as "Travel with
      // Confidence"'s description on the left column.
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text('Pack smart. Travel light. Stay ready.', carryX, top);

      // Auto-width, single-line wrapped pill chips — mirrors the site's
      // exact "Things to Carry" chip markup (inline-flex, bg-background-warm/60,
      // rounded-lg, icon + whitespace-nowrap label sized to its own content)
      // instead of a fixed equal-width grid with 2-line wrapped text, so
      // short and long items size and wrap exactly like TripDetailPage.tsx.
      const chipH = 25;
      const padX = 10;
      const iconSize = 13;
      const iconGap = 6;
      const chipGapX = 8;
      const chipGapY = 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      let x = carryX;
      let y = top + 26;
      for (const item of trip.things_to_carry) {
        const w = doc.getTextWidth(item.description) + padX * 2 + iconSize + iconGap;
        if (x > carryX && x + w > carryX + carryW) {
          x = carryX;
          y += chipH + chipGapY;
        }
        if (y + chipH > listBottom) break;

        setFill(COLORS.backgroundWarm);
        doc.roundedRect(x, y, w, chipH, 6, 6, 'F');

        // Mirrors TripDetailPage.tsx exactly: the admin-picked icon when
        // set, else the same keyword-matched fallback (getThingsToCarryIcon),
        // drawn inline in the primary color — not boxed in a filled circle.
        const itemIcon = resolveIcon(item.icon, getThingsToCarryFallbackIcon(item.description));
        const iconX = x + padX;
        const iconCy = y + chipH / 2;
        await drawLucideIcon(itemIcon, iconX, iconCy + iconSize / 2, iconSize, COLORS.primary);

        setText(COLORS.dark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(item.description, iconX + iconSize + iconGap, iconCy + 3.2);

        x += w + chipGapX;
      }
    }

    if (!hasCards) return;

    // ---------------------------------------------------------------------
    // Bottom band — compact Meeting Point / Eligibility cards. Each sits in
    // its own column slot (left under "Travel with Confidence", right under
    // "Things to Carry") when both are present; a lone card takes the full
    // slot width it would otherwise share.
    // ---------------------------------------------------------------------
    const cardTop = CONTENT_BOTTOM - cardH;
    const cardPad = 18;

    function drawInfoCard(x: number, w: number, icon: (px: number, py: number, s?: number, c?: RGB) => void, title: string, drawBody: (bx: number, by: number, bw: number) => void) {
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, cardTop, w, cardH, 10, 10, 'F');
      setDraw(COLORS.grayLineSoft);
      doc.setLineWidth(0.75);
      doc.roundedRect(x, cardTop, w, cardH, 10, 10, 'S');

      const tx = x + cardPad;
      let ty = cardTop + cardPad + 4;
      icon(tx, ty + 13, 18);
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title, tx + 26, ty + 10);
      ty += 30;

      drawBody(tx, ty, w - cardPad * 2);
    }

    if (hasMeetingPoint) {
      const w = cardsTwoCol ? leftW : (hasEligibility ? leftW : CONTENT_W);
      drawInfoCard(MARGIN, w, icons.navigation, 'Meeting Point', (bx, by, bw) => {
        setText(COLORS.dark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        const lines = clampLines(trip.meeting_point!, bw, 2);
        doc.text(lines, bx, by);
        const linkY = by + lines.length * 15 + 6;

        if (trip.meeting_point_map_url) {
          const label = 'View on map';
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          icons.pin(bx, linkY + 7, 12, COLORS.secondary);
          setText(COLORS.secondary);
          doc.text(label, bx + 16, linkY + 4);
          doc.link(bx, linkY - 8, doc.getTextWidth(label) + 16, 16, { url: trip.meeting_point_map_url });
        }
      });
    }

    if (hasEligibility) {
      const x = cardsTwoCol ? rightX : (hasMeetingPoint ? rightX : MARGIN);
      const w = cardsTwoCol ? rightW : (hasMeetingPoint ? rightW : CONTENT_W);
      drawInfoCard(x, w, icons.userCheck, 'Eligibility', (bx, by, bw) => {
        drawParagraph(`This trip is open to travelers aged ${formatAgeRange(trip.min_age, trip.max_age)}.`, bx, by, bw, {
          size: 10,
          color: COLORS.darkMuted,
          lineHeight: 14,
          maxLines: 3,
        });
      });
    }
  }

  // =========================================================================
  // SLIDE — Places You'll Definitely Post (photo grid)
  // =========================================================================
  // Falls back to the plain `gallery_images` string list when the richer
  // `gallery_items` (photo + caption) field is empty, matching the same
  // fallback TripDetailPage.tsx uses for this section on the public site.
  // Only the first 8 photos are shown — the reference layout is a fixed
  // 4-across, 2-row wall of square photos, not a paginated list.
  async function renderGallery() {
    const allPhotos: string[] =
      (trip.gallery_items?.length ?? 0) > 0
        ? trip.gallery_items!.map(item => item.photo)
        : trip.gallery_images;
    if (allPhotos.length === 0) return;

    newSlide();
    slideHeader(null, "Places You'll Definitely Post");

    let contentTop = 92;
    if (trip.gallery_description) {
      contentTop = drawParagraph(trip.gallery_description, MARGIN, contentTop, CONTENT_W, {
        size: 10,
        color: COLORS.darkMuted,
        lineHeight: 14,
        maxLines: 2,
      }) + 14;
    }

    const cols = 4;
    const rows = 2;
    const colGap = 14;
    const rowGap = 14;
    const photos = allPhotos.slice(0, cols * rows);

    // Square size is whichever of width- or height-driven fits smaller, so
    // the grid always stays made of true squares; centeredTop/horizontal
    // centering below then spreads that grid evenly across whatever space
    // is left over in the other dimension.
    const squareByWidth = (CONTENT_W - colGap * (cols - 1)) / cols;
    const availH = CONTENT_BOTTOM - contentTop;
    const squareByHeight = (availH - rowGap * (rows - 1)) / rows;
    const square = Math.min(squareByWidth, squareByHeight);

    const gridW = cols * square + colGap * (cols - 1);
    const gridH = rows * square + rowGap * (rows - 1);
    const gridX = MARGIN + (CONTENT_W - gridW) / 2;
    const gridY = centeredTop(contentTop, CONTENT_BOTTOM, gridH);

    const crops = await Promise.all(photos.map(url => loadCoverCroppedImage(url, square, square, 8)));

    crops.forEach((cropped, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = gridX + col * (square + colGap);
      const y = gridY + row * (square + rowGap);
      if (cropped) {
        try {
          doc.addImage(cropped, 'JPEG', x, y, square, square);
          return;
        } catch {
          /* fall through to placeholder */
        }
      }
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, y, square, square, 8, 8, 'F');
      setDraw(COLORS.grayLineSoft);
      doc.setLineWidth(0.75);
      doc.roundedRect(x, y, square, square, 8, 8, 'S');
    });
  }

  // =========================================================================
  // SLIDE — Fashion Aesthetics (photo grid)
  // =========================================================================
  // Same shape as `renderGallery` above (optional intro paragraph + a fixed,
  // non-paginated wall of square photos) but as a 3-across, 2-row grid (6
  // photos) instead of Places' 4-across, 2-row wall. Shows a "+N" overlay
  // on the last tile when there are more than 6 photos.
  async function renderFashion() {
    const allPhotos = trip.fashion_photos ?? [];
    if (allPhotos.length === 0) return;

    newSlide();
    slideHeader(null, 'Fashion Aesthetics');

    let contentTop = 92;
    if (trip.fashion_description) {
      contentTop = drawParagraph(trip.fashion_description, MARGIN, contentTop, CONTENT_W, {
        size: 10,
        color: COLORS.darkMuted,
        lineHeight: 14,
        maxLines: 2,
      }) + 14;
    }

    const cols = 3;
    const rows = 2;
    const colGap = 14;
    const rowGap = 14;
    const photos = allPhotos.slice(0, cols * rows);
    const remaining = allPhotos.length - photos.length;

    // Square size is whichever of width- or height-driven fits smaller, so
    // the grid always stays made of true squares; centeredTop/horizontal
    // centering below then spreads that grid evenly across whatever space
    // is left over in the other dimension. Same approach as renderGallery.
    const squareByWidth = (CONTENT_W - colGap * (cols - 1)) / cols;
    const availH = CONTENT_BOTTOM - contentTop;
    const squareByHeight = (availH - rowGap * (rows - 1)) / rows;
    const square = Math.min(squareByWidth, squareByHeight);

    const gridW = cols * square + colGap * (cols - 1);
    const gridH = rows * square + rowGap * (rows - 1);
    const gridX = MARGIN + (CONTENT_W - gridW) / 2;
    const gridY = centeredTop(contentTop, CONTENT_BOTTOM, gridH);

    const crops = await Promise.all(photos.map(url => loadCoverCroppedImage(url, square, square, 8)));

    crops.forEach((cropped, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = gridX + col * (square + colGap);
      const y = gridY + row * (square + rowGap);
      if (cropped) {
        try {
          doc.addImage(cropped, 'JPEG', x, y, square, square);
        } catch {
          setFill(COLORS.backgroundWarm);
          doc.roundedRect(x, y, square, square, 8, 8, 'F');
          setDraw(COLORS.grayLineSoft);
          doc.setLineWidth(0.75);
          doc.roundedRect(x, y, square, square, 8, 8, 'S');
        }
      } else {
        setFill(COLORS.backgroundWarm);
        doc.roundedRect(x, y, square, square, 8, 8, 'F');
        setDraw(COLORS.grayLineSoft);
        doc.setLineWidth(0.75);
        doc.roundedRect(x, y, square, square, 8, 8, 'S');
      }

      if (i === photos.length - 1 && remaining > 0) {
        withOpacity(0.55, () => {
          setFill(COLORS.dark);
          doc.roundedRect(x, y, square, square, 8, 8, 'F');
        });
        setText(COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`+${remaining}`, x + square / 2, y + square / 2 + 5, { align: 'center' });
      }
    });
  }

  // =========================================================================
  // SLIDES — FAQs (2-column, balanced, paginated)
  // =========================================================================
  function renderFaqs() {
    if (trip.faqs.length === 0) return;

    const colGap = 36;
    const colW = (CONTENT_W - colGap) / 2;
    const top = 92;
    const availH = CONTENT_BOTTOM - top;

    const measureFaq = (faq: { question: string; answer: string }) => {
      const qH = measureParagraphHeight(faq.question, colW - 16, 11.5, 15.5);
      const aH = measureParagraphHeight(faq.answer, colW - 16, 9.5, 13.5, 4);
      return qH + aH + 22;
    };

    const balanced = paginateTwoColumns(trip.faqs, measureFaq, availH);

    function drawColumn(x: number, startY: number, faqs: { question: string; answer: string }[]) {
      let y = startY;
      faqs.forEach(faq => {
        setFill(COLORS.primary);
        doc.circle(x + 6, y - 4, 6, 'F');
        setText(COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Q', x + 6, y - 1.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        setText(COLORS.dark);
        const qLines = doc.splitTextToSize(faq.question, colW - 20);
        doc.text(qLines, x + 18, y);
        y += qLines.length * 15.5 + 4;

        y = drawParagraph(faq.answer, x, y, colW, { size: 9.5, color: COLORS.darkMuted, lineHeight: 13.5, maxLines: 4 });
        y += 18;
      });
    }

    balanced.forEach((page, p) => {
      newSlide();
      slideHeader(null, p === 0 ? 'FAQs' : 'FAQs (continued)');
      const startY = centeredTop(top, CONTENT_BOTTOM, Math.max(page.leftH, page.rightH));
      if (page.left.length) drawColumn(MARGIN, startY, page.left);
      if (page.right.length) drawColumn(MARGIN + colW + colGap, startY, page.right);
    });
  }

  // =========================================================================
  // SLIDES — Cancellation Policy (icon-badged clauses, 2-column, paginated)
  // -----------------------------------------------------------------------
  // Mirrors CancellationPolicyDisplay.tsx exactly: same 8 clauses in the
  // same order (including "Minimum Group Size", previously missing here)
  // with the same lucide-react icon per clause instead of a plain number
  // badge, plus the same closing acceptance disclaimer the site shows below
  // all the cards.
  // =========================================================================
  async function renderCancellationPolicy() {
    const policy = trip.cancellation_policy;
    if (!policy) return;

    type Clause = { title: string; body: string[]; icon: LucideIcon };
    const clauses: Clause[] = [
      { title: 'Booking Confirmation', body: STATIC.bookingConfirmation, icon: ShieldCheck },
      {
        title: 'Payment Schedule',
        body: [
          `The remaining trip balance must be paid at least ${policy.payment_due_days} days before the departure date, unless otherwise communicated. Failure to complete the payment by the due date may result in automatic cancellation of your booking without prior notice.`,
        ],
        icon: Clock3,
      },
      {
        title: 'Cancellation by Participant',
        body: policy.tiers.map(tier => `${tierLabel(tier)}: ${tier.description}`),
        icon: CalendarClock,
      },
      { title: 'No Show', body: [STATIC.noShow], icon: UserX },
      { title: 'Missed Services', body: [STATIC.missedServices], icon: PackageX },
      { title: 'Trip Cancellation by Organizer', body: STATIC.organizerCancellation, icon: Building2 },
      {
        title: 'Minimum Group Size',
        body: [STATIC.minimumGroupSize.intro, ...STATIC.minimumGroupSize.options.map(o => `\u2022 ${o}`)],
        icon: Users,
      },
      {
        title: 'Refund Timeline',
        body: [
          `Where applicable, approved refunds will be processed within ${policy.refund_min_days}\u2013${policy.refund_max_days} working days, subject to the receipt of refunds from the respective third-party service providers.`,
        ],
        icon: CheckCircle2,
      },
    ];

    const colGap = 36;
    const colW = (CONTENT_W - colGap) / 2;
    const top = 92;
    // Reserve a band on every page for the closing acceptance note so its
    // box sits at the same fixed spot regardless of which page turns out
    // to be last — only that page actually draws text into it.
    const footerReserve = 46;
    const footerTop = CONTENT_BOTTOM - footerReserve + 10;
    const availH = CONTENT_BOTTOM - footerReserve - top;

    const measureClause = (c: Clause) => {
      const titleH = 18;
      const bodyH = c.body.reduce((sum, line) => sum + measureParagraphHeight(line, colW - 40, 9.3, 13.2) + 3, 0);
      return titleH + bodyH + 20;
    };

    const balanced = paginateTwoColumns(clauses, measureClause, availH);

    async function drawColumn(x: number, startY: number, items: Clause[]) {
      let y = startY;
      for (const clause of items) {
        const badgeCx = x + 10;
        const badgeCy = y - 5;
        const badgeSize = 21;
        setFill(COLORS.backgroundWarm);
        doc.roundedRect(badgeCx - badgeSize / 2, badgeCy - badgeSize / 2, badgeSize, badgeSize, 5, 5, 'F');
        await drawLucideIcon(clause.icon, badgeCx - badgeSize / 2 + 2, badgeCy + badgeSize / 2 - 2, badgeSize - 4, COLORS.primary);

        setText(COLORS.dark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.text(clause.title, x + 26, y);
        y += 17;

        clause.body.forEach(line => {
          y = drawParagraph(line, x + 26, y, colW - 26, { size: 9.3, color: COLORS.darkMuted, lineHeight: 13.2 });
          y += 3;
        });
        y += 16;
      }
    }

    for (let p = 0; p < balanced.length; p++) {
      const page = balanced[p];
      newSlide();
      slideHeader(null, p === 0 ? 'Cancellation Policy' : 'Cancellation Policy (continued)');
      const startY = centeredTop(top, CONTENT_BOTTOM - footerReserve, Math.max(page.leftH, page.rightH));
      if (page.left.length) await drawColumn(MARGIN, startY, page.left);
      if (page.right.length) await drawColumn(MARGIN + colW + colGap, startY, page.right);

      // Closing acceptance disclaimer — only on the final Cancellation
      // Policy slide, same as the single note at the bottom of the site's
      // CancellationPolicyDisplay (below all the section cards).
      if (p === balanced.length - 1) {
        setFill(COLORS.backgroundWarm);
        doc.roundedRect(MARGIN, footerTop, CONTENT_W, footerReserve - 14, 6, 6, 'F');
        drawParagraph(STATIC.acceptance, MARGIN + 16, footerTop + 15, CONTENT_W - 32, {
          size: 8.5,
          color: COLORS.darkMuted,
          lineHeight: 12,
          maxLines: 2,
        });
      }
    }
  }

  // =========================================================================
  // SLIDE — Trip Leader & Booking: a plain, generic page (same slideHeader
  // treatment as FAQs/Cancellation Policy) covering "Meet Your Trip Leader",
  // a "Booking Form" summary card, and the "Need Help?" contact bar. All
  // content is read straight off `trip`/`BRAND`, same as the closing slide's
  // versions of these — this page exists as an earlier, easy-to-find stop
  // for that same info, ahead of the decorative closing slide.
  // =========================================================================
  async function renderTripLeaderAndBooking() {
    newSlide();
    slideHeader(null, 'Trip Leader & Booking', 'Meet your host, then reserve your seat below');

    const CARDS_TOP = 108;
    const CARDS_BOTTOM = 450;
    const PAD = 20;
    const leftW = 470;
    const colGapCards = 20;
    const leftX = MARGIN;
    const rightX = leftX + leftW + colGapCards;
    const rightW = CONTENT_W - leftW - colGapCards;
    const cardCX = rightX + rightW / 2; // horizontal center of the booking card, for the centered layout below

    // The booking card sits a little higher than the left column (shifted up
    // by BOOK_CARD_RAISE), giving it a touch more breathing room above
    // "Secure Your Spot Soon" without disturbing the "Meet Your Trip Leader"
    // side, which still anchors to CARDS_TOP/CARDS_BOTTOM directly.
    const BOOK_CARD_RAISE = 10;
    const RIGHT_TOP = CARDS_TOP - BOOK_CARD_RAISE;
    const RIGHT_BOTTOM = CARDS_BOTTOM - BOOK_CARD_RAISE;

    function cardShell(x: number, w: number, top: number, bottom: number) {
      setFill(COLORS.white);
      doc.roundedRect(x, top, w, bottom - top, 8, 8, 'F');
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.roundedRect(x, top, w, bottom - top, 8, 8, 'S');
    }
    // Only the booking card gets the bordered/filled card shell — the
    // "Meet Your Trip Leader" side sits directly on the page background now.
    cardShell(rightX, rightW, RIGHT_TOP, RIGHT_BOTTOM);

    // -- Left: Meet Your Trip Leader (from trip.trip_founder) --
    // "Meet Your Trip Leader" sits above the name column (not the photo),
    // right-shifted to align with the founder's name/title below it.
    const photoD = 150;
    const photoX = leftX + PAD;
    const photoY = CARDS_TOP + PAD + 22;
    const headingX = photoX + photoD + 14;
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('Meet Your Trip Leader', headingX, CARDS_TOP + PAD + 6);
    // Underline only "Meet" (not the full heading), with a little more
    // breathing room between the text baseline and the rule below it.
    const meetW = doc.getTextWidth('Meet');
    setDraw(COLORS.secondary);
    doc.setLineWidth(2);
    doc.line(headingX, CARDS_TOP + PAD + 13, headingX + meetW, CARDS_TOP + PAD + 13);

    const founder = trip.trip_founder;
    if (founder && (founder.name || founder.photo)) {
      let photoDrawn = false;
      if (founder.photo) {
        const cropped = await loadCoverCroppedImage(founder.photo, photoD, photoD, photoD / 2, rgbToHex(COLORS.background));
        if (cropped) {
          try {
            doc.addImage(cropped, 'JPEG', photoX, photoY, photoD, photoD);
            photoDrawn = true;
          } catch {
            photoDrawn = false;
          }
        }
      }
      if (!photoDrawn) {
        setFill(COLORS.backgroundWarm);
        doc.circle(photoX + photoD / 2, photoY + photoD / 2, photoD / 2, 'F');
        setText(COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(46);
        doc.text((founder.name || '?').charAt(0).toUpperCase(), photoX + photoD / 2, photoY + photoD / 2 + 16, { align: 'center' });
      }
      // Two-tone frame: a white/background ring sits right against the
      // photo (the gap/padding effect), then a slightly larger orange
      // accent ring sits just outside it — so the photo reads as
      // white-matted with an orange frame, not one or the other.
      setDraw(COLORS.background);
      doc.setLineWidth(4);
      doc.circle(photoX + photoD / 2, photoY + photoD / 2, photoD / 2, 'S');
      setDraw(COLORS.secondary);
      doc.setLineWidth(2.5);
      doc.circle(photoX + photoD / 2, photoY + photoD / 2, photoD / 2 + 3, 'S');

      const textX = photoX + photoD + 14;
      const textW = leftX + leftW - PAD - textX;
      let ny = photoY + 18;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      const nameLines = clampLines(founder.name || '', textW, 2);
      doc.text(nameLines, textX, ny);
      ny += nameLines.length * 16 + 2;
      setText(COLORS.secondary);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('Founder & Trip Leader', textX, ny);
      ny += 7;
      setDraw(COLORS.grayLineSoft);
      doc.setLineWidth(1);
      doc.line(textX, ny, leftX + leftW - PAD, ny);

      // Wrap the founder's bio as one continuous flow that runs in the
      // narrow column beside the photo while there's room, then
      // automatically widens to the full card width once it passes below
      // the photo's bottom edge — a magazine-style "text wraps around the
      // image" effect, rather than being split into separate fixed blocks.
      const paragraphs = (founder.description || '').split(/\n+/).map(p => p.trim()).filter(Boolean);
      const paraFontSize = 10.5;
      const paraLineHeight = 18; // more spacing between lines
      const paraGap = 6; // extra breathing room between paragraphs
      const rightColTop = ny + 22; // more breathing room below the divider line
      const rightColBottom = photoY + photoD + 16; // clears the photo's border rings and the next line's ascenders
      const fullX = leftX + PAD;
      const fullW = leftW - PAD * 2;
      const bottomLimit = CARDS_BOTTOM - PAD;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(paraFontSize);
      setText(COLORS.darkMuted);

      let dy = rightColTop;
      for (const para of paragraphs) {
        if (dy > bottomLimit) break;
        const words = para.split(/\s+/).filter(Boolean);
        let wi = 0;
        while (wi < words.length && dy <= bottomLimit) {
          const inColumn = dy < rightColBottom;
          const lineX = inColumn ? textX : fullX;
          const lineW = inColumn ? textW : fullW;
          let lineWords: string[] = [];
          let lineText = '';
          while (wi < words.length) {
            const candidate = lineWords.length ? `${lineText} ${words[wi]}` : words[wi];
            if (doc.getTextWidth(candidate) > lineW && lineWords.length > 0) break;
            lineWords.push(words[wi]);
            lineText = candidate;
            wi++;
          }
          doc.text(lineText, lineX, dy);
          dy += paraLineHeight;
        }
        dy += paraGap;
      }
    } else {
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Trip leader details coming soon.', leftX + PAD, CARDS_TOP + PAD + 40);
    }

    // -- Right: Booking Form — a centered, single-column layout matching the
    // live site's <BookingForm> widget exactly (price, per-person, savings
    // badges, offer countdown, a full-width reserve/status box, a stacked
    // trip-facts list, the CTA button, quick links and a reassurance note). --
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('Secure Your Spot Soon', cardCX, RIGHT_TOP + PAD + 6, { align: 'center' });

    const { activePrice, isEarlyBird, deadlinePassed } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
    const strikeThroughPrice = getStrikeThroughPrice(activePrice, trip.price, isEarlyBird, trip.strike_through_price);
    const remaining = publicSeatsLeft(trip.total_seats, trip.seats_booked, trip.waitlist_reserved || 0);
    const isFull = remaining === 0;
    const isAlmostFull = remaining > 0 && remaining <= 5;
    const remainingAfterAdvance =
      activePrice != null && trip.advance_amount != null ? Math.max(0, activePrice - trip.advance_amount) : null;

    const BOOK_TOP = RIGHT_TOP + PAD + 34; // clears the "Secure Your Spot Soon" heading above
    const innerLeft = rightX + PAD;
    const innerRight = rightX + rightW - PAD;
    const innerW = innerRight - innerLeft;

    let ry = BOOK_TOP;

    // Price row: main price + strikethrough, centered as one group. Uses the
    // embedded RupeeSans subset (see rupeeFont.ts) so the real ₹ glyph shows
    // here, matching TripDetailPage's <BookingForm> — helvetica can't render
    // it (see money()/formatPrice()), which is why every other price on this PDF still
    // falls back to the "Rs."/"RS" text form.
    if (activePrice != null) {
      doc.setFont('RupeeSans', 'bold');
      doc.setFontSize(24);
      const priceStr = heroMoneyRupee(activePrice);
      const priceW = doc.getTextWidth(priceStr);

      let strikeStr = '';
      let strikeW = 0;
      if (strikeThroughPrice != null) {
        doc.setFont('RupeeSans', 'normal');
        doc.setFontSize(12);
        strikeStr = heroMoneyRupee(strikeThroughPrice);
        strikeW = doc.getTextWidth(strikeStr);
      }
      const gap1 = strikeStr ? 10 : 0;
      let px = cardCX - (priceW + gap1 + strikeW) / 2;

      setText(COLORS.primary);
      doc.setFont('RupeeSans', 'bold');
      doc.setFontSize(24);
      doc.text(priceStr, px, ry);
      px += priceW + gap1;

      if (strikeStr) {
        setText(COLORS.darkMuted);
        doc.setFont('RupeeSans', 'normal');
        doc.setFontSize(12);
        doc.text(strikeStr, px, ry);
        setDraw(COLORS.darkMuted);
        doc.setLineWidth(1);
        doc.line(px, ry - 4, px + strikeW, ry - 4);
      }
      ry += 15;

      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.6);
      doc.text('per person', cardCX, ry, { align: 'center' });
      ry += 16;

      // Savings / Early Bird badges, centered as a row
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.6);
      const saveLabel = strikeThroughPrice != null ? `Save ${money(strikeThroughPrice - activePrice)}` : null;
      const saveW = saveLabel ? doc.getTextWidth(saveLabel) + 16 : 0;
      const earlyLabel = isEarlyBird ? 'Early Bird' : null;
      const earlyW = earlyLabel ? doc.getTextWidth(earlyLabel) + 16 : 0;
      const badgeGap = saveLabel && earlyLabel ? 8 : 0;
      const badgesTotalW = saveW + badgeGap + earlyW;
      if (badgesTotalW > 0) {
        let bx = cardCX - badgesTotalW / 2;
        const badgeY = ry;
        if (saveLabel) {
          setFill([232, 247, 237] as RGB);
          doc.roundedRect(bx, badgeY - 12, saveW, 17, 5, 5, 'F');
          setText(COLORS.green);
          doc.text(saveLabel, bx + 8, badgeY + 1);
          bx += saveW + badgeGap;
        }
        if (earlyLabel) {
          setFill(COLORS.secondary);
          doc.roundedRect(bx, badgeY - 12, earlyW, 17, 5, 5, 'F');
          setText(COLORS.white);
          doc.text(earlyLabel, bx + 8, badgeY + 1);
        }
        ry += 15;
      }

      // Offer countdown / expiry note, centered (icon + text as one group)
      if (isEarlyBird && trip.early_bird_deadline) {
        const label = `Offer ends ${formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'long', year: 'numeric' })}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.4);
        const w = doc.getTextWidth(label);
        const gx = cardCX - (14 + w) / 2;
        icons.clock(gx, ry + 6, 11, COLORS.secondary);
        setText(COLORS.secondary);
        doc.text(label, gx + 14, ry + 5);
        ry += 13;
      } else if (deadlinePassed) {
        setText(COLORS.darkMuted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.4);
        doc.text('Early-bird offer has ended', cardCX, ry + 5, { align: 'center' });
        ry += 13;
      }
    }

    // Full-width divider before the reserve/status box
    const dividerY = ry + 6;
    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(1);
    doc.line(innerLeft, dividerY, innerRight, dividerY);
    ry = dividerY + 10;

    // Reserve / status box — full width, matching the live site's green
    // "Reserve today" panel (or the sold-out / almost-full variants)
    const boxTop = ry;
    let boxH = 30;
    if (isFull) {
      boxH = 36;
      setFill([253, 235, 234] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 10, 10, 'F');
      setText(COLORS.red);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text('Sold Out', cardCX, boxTop + boxH / 2 + 4, { align: 'center' });
    } else if (isAlmostFull) {
      boxH = 36;
      setFill([254, 243, 226] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 10, 10, 'F');
      setText([180, 120, 20] as RGB);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.6);
      doc.text(`Only ${remaining} seats left \u2014 almost full!`, cardCX, boxTop + boxH / 2 + 4, { align: 'center' });
    } else if (trip.advance_amount != null) {
      boxH = 40;
      setFill([232, 247, 237] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 10, 10, 'F');

      // Line 1 (check icon + "Reserve today with only <amount>") and line 2
      // ("Remaining ... payable before the trip.") are both centered as
      // groups within the box, rather than left-anchored after the icon.
      const line1Parts: { text: string; color: RGB; bold?: boolean }[] = [
        { text: 'Reserve today with only ', color: COLORS.dark, bold: true },
        { text: money(trip.advance_amount), color: COLORS.green, bold: true },
      ];
      const line1IconGap = 22;
      const line1TextW = mixedLineWidth(line1Parts, 9.4);
      const line1GroupW = line1IconGap + line1TextW;
      const line1StartX = cardCX - line1GroupW / 2;
      // Green circle + white ShieldCheck glyph — same combo TripDetailPage's
      // <BookingForm> uses for this box (w-9 h-9 bg-green-600 circle behind
      // a white ShieldCheck), instead of the hand-drawn check mark.
      const shieldCX = line1StartX - 6 + 9;
      const shieldCY = boxTop + boxH / 2 - 7.2;
      setFill(COLORS.green);
      doc.circle(shieldCX, shieldCY, 7.2, 'F');
      await drawLucideIcon(ShieldCheck, shieldCX - 5, shieldCY + 5, 10, COLORS.white);
      drawMixedLine(line1StartX + line1IconGap - 6, boxTop + 16, line1Parts, 9.4);

      if (remainingAfterAdvance != null) {
        const line2Parts: { text: string; color: RGB; bold?: boolean }[] = [
          { text: 'Remaining ', color: COLORS.darkMuted },
          { text: money(remainingAfterAdvance), color: COLORS.dark, bold: true },
          { text: ' payable before the trip.', color: COLORS.darkMuted },
        ];
        const line2W = mixedLineWidth(line2Parts, 7.8);
        drawMixedLine(cardCX - line2W / 2, boxTop + 29, line2Parts, 7.8);
      }
    } else {
      boxH = 28;
      setFill([232, 247, 237] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 8, 8, 'F');
      setText(COLORS.green);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.6);
      doc.text('Seats available', cardCX, boxTop + boxH / 2 + 4, { align: 'center' });
    }
    ry = boxTop + boxH + 12;

    // Trip-facts list: label+icon on the left, value right-aligned
    ry += 15;

    const metaItems: { icon: LucideIcon; label: string; value: string }[] = [
      { icon: Calendar, label: 'Dates', value: formatDateRange(trip.start_date, trip.end_date) },
      { icon: Clock, label: 'Duration', value: trip.duration },
      { icon: Users, label: 'Group Size', value: `Max ${trip.total_seats}` },
      { icon: UserCheck, label: 'Age Range', value: formatAgeRange(trip.min_age, trip.max_age) },
    ];
    const rowH = 18;
    for (const item of metaItems) {
      // Real lucide-react icons (same Calendar/Clock/Users/UserCheck the
      // live booking widget uses), not the hand-drawn `icons.*` set — those
      // were coming out visually cramped/misaligned at this small size.
      await drawLucideIcon(item.icon, innerLeft + 6, ry + 4, 12, COLORS.primary);
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(item.label, innerLeft + 20, ry);
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(item.value, innerRight, ry, { align: 'right' });
      ry += rowH;
    }
    ry += 6;

    // CTA button — full width, label + arrow icon (no lock glyph, per the
    // live site's button), whole area stays clickable
    const showAdvance = trip.advance_amount != null && !isFull;
    const btnH = showAdvance ? 36 : 32;
    const btnY = ry;
    setFill(COLORS.primary);
    doc.roundedRect(innerLeft, btnY, innerW, btnH, 5, 5, 'F');
    setText(COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const ctaLabel = isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta;
    const ctaLabelW = doc.getTextWidth(ctaLabel);
    const ctaGroupW = ctaLabelW + 8 + 12;
    const ctaTextY = showAdvance ? btnY + 16 : btnY + btnH / 2 + 4;
    const ctaStartX = cardCX - ctaGroupW / 2;
    doc.text(ctaLabel, ctaStartX, ctaTextY);
    drawArrowRight(ctaStartX + ctaLabelW + 14, ctaTextY - 4, 12, COLORS.white);
    if (showAdvance) {
      setText(COLORS.white);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      doc.text(`At only ${money(trip.advance_amount as number)} today`, cardCX, btnY + 29, { align: 'center' });
    }
    // Whole button is clickable — opens this trip's page with its booking
    // form pre-opened (TripDetailPage watches for "?book=1").
    doc.link(innerLeft, btnY, innerW, btnH, {
      url: `https://${BRAND.website.replace('www.', '')}/trips/${trip.slug}?book=1`,
    });
    ry = btnY + btnH + 16;

    // Reassurance note, centered with a small check icon before the first
    // line — BadgeCheck, same glyph TripDetailPage uses next to this note.
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    const noteLines: string[] = doc.splitTextToSize("No payment required to enquire. We'll contact you within 24 hours.", innerW - 20);
    const firstLineW = doc.getTextWidth(noteLines[0]);
    await drawLucideIcon(BadgeCheck, cardCX - firstLineW / 2 - 12, ry + 3, 10, COLORS.green);
    noteLines.forEach((line, i) => {
      doc.text(line, cardCX, ry + i * 10, { align: 'center' });
    });

    // ---- Contact bar (from BRAND — the site's existing contact info) ----
    const CONTACT_TOP = 456;
    const CONTACT_BOTTOM = 506;
    setFill(COLORS.cream);
    doc.roundedRect(MARGIN, CONTACT_TOP, CONTENT_W, CONTACT_BOTTOM - CONTACT_TOP, 6, 6, 'F');
    setDraw(COLORS.grayLine);
    doc.setLineWidth(1);
    doc.roundedRect(MARGIN, CONTACT_TOP, CONTENT_W, CONTACT_BOTTOM - CONTACT_TOP, 6, 6, 'S');

    const siteDomain = BRAND.website.replace('www.', '');
    const contactItems: { icon: LucideIcon; title: string; value: string; url?: string }[] = [
      { icon: Headphones, title: 'Need Help?', value: "We're just a message away!", url: `https://${siteDomain}/contact` },
      { icon: Phone, title: 'Call / WhatsApp', value: BRAND.phone, url: `https://wa.me/${BRAND.phone.replace(/\D/g, '')}` },
      { icon: Mail, title: 'Email Us', value: BRAND.email, url: `mailto:${BRAND.email}` },
      { icon: Globe, title: 'Website', value: BRAND.website, url: `https://${siteDomain}` },
      // `icon` here is unused for this entry — see the "Follow Us" special
      // case below, which draws the hand-drawn `icons.instagram` glyph
      // instead. Kept as a placeholder only to satisfy the array's type.
      { icon: MessageSquare, title: 'Follow Us', value: BRAND.instagram, url: `https://instagram.com/${BRAND.instagram.replace('@', '')}` },
    ];
    const contactColW = CONTENT_W / contactItems.length;
    const contactMidY = CONTACT_TOP + (CONTACT_BOTTOM - CONTACT_TOP) / 2;
    for (let i = 0; i < contactItems.length; i++) {
      const item = contactItems[i];
      const colX = MARGIN + contactColW * i;
      const cx0 = colX + 18;
      setFill(COLORS.backgroundWarm);
      doc.circle(cx0 + 12, contactMidY, 15, 'F');
      // Real lucide-react icons, not the hand-drawn `icons.*` set — those
      // were coming out visually messy/misaligned inside this circle. The
      // one exception is Instagram: lucide dropped brand icons a few
      // versions back, so "Follow Us" uses the hand-drawn `icons.instagram`
      // glyph instead, at matching size/position.
      // Icon glyph is slightly smaller than the circle behind it (16 vs the
      // circle's radius-15 background), centered within it.
      const contactIconS = 16;
      if (item.title === 'Follow Us') {
        icons.instagram(cx0 + 12 - contactIconS / 2, contactMidY + contactIconS / 2, contactIconS, COLORS.primary);
      } else {
        await drawLucideIcon(item.icon, cx0 + 12 - contactIconS / 2, contactMidY + contactIconS / 2, contactIconS, COLORS.primary);
      }

      const tx = cx0 + 30;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.text(item.title, tx, contactMidY - 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      if (item.url) {
        setText(COLORS.primary);
        doc.text(item.value, tx, contactMidY + 10);
        // Whole card (icon + title + value) is clickable, not just the value line.
        doc.link(colX, CONTACT_TOP, contactColW, CONTACT_BOTTOM - CONTACT_TOP, { url: item.url });
      } else {
        setText(COLORS.darkMuted);
        doc.text(item.value, tx, contactMidY + 10);
      }

      if (i < contactItems.length - 1) {
        setDraw(COLORS.grayLineSoft);
        doc.line(MARGIN + contactColW * (i + 1), CONTACT_TOP + 8, MARGIN + contactColW * (i + 1), CONTACT_BOTTOM - 8);
      }
    }
  }

  // =========================================================================
  // Assemble the deck. Sections with no data render nothing (see the
  // `if` guard at the top of each function), so the final page count is
  // always exactly what this specific trip's content needs.
  // =========================================================================
  await renderCover();
  await renderHighlightsAndDays();
  await renderItinerary();
  await renderInclusions();
  await renderGallery();
  await renderFashion();
  await renderConfidenceAndCarry();
  renderFaqs();
  await renderCancellationPolicy();
  await renderTripLeaderAndBooking();

  // ---------------------------------------------------------------------
  // Page-number badge on every slide, added last so the final total is
  // known no matter how many slides the content above generated.
  // ---------------------------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const label = `${String(p).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const w = doc.getTextWidth(label) + 16;
    setFill(COLORS.dark);
    doc.roundedRect(PAGE_W - MARGIN - w, PAGE_H - 30, w, 18, 9, 9, 'F');
    setText(COLORS.white);
    doc.text(label, PAGE_W - MARGIN - w / 2, PAGE_H - 18, { align: 'center' });
  }

  return doc;
}

/** Builds the itinerary PDF and triggers a browser download. */
export async function downloadTripItineraryPdf(trip: UpcomingTrip): Promise<void> {
  const doc = await buildTripItineraryPdfDoc(trip);
  doc.save(`${trip.slug || 'ulaa-trip'}-itinerary.pdf`);
}

// =============================================================================
// Future compatibility
// -----------------------------------------------------------------------------
// This generator reads every field straight off the `UpcomingTrip` object —
// nothing about a specific trip is hardcoded above. If Admin grows a new
// *list-shaped* field that should appear on the Trip Details page and in
// this PDF (e.g. an "Add-on Experiences" list, or a "Packing List by
// Category" grouping), the pattern to extend is:
//
//   1. Add the field to `UpcomingTrip` in src/types/index.ts.
//   2. Add a `render<Section>()` function here following the shape of
//      `renderThingsToCarry` (simple list) or `renderInclusions` (paired
//      columns) or `renderFaqs` (question/answer columns) — whichever is
//      the closest match — computing a `rowsPerPage`/`itemsPerPage` split
//      (as `renderThingsToCarry` does) so it automatically spills onto
//      extra slides if the list is long.
//   3. Call it from the assembly block above, guarded by the same
//      `if (list.length === 0) return;` pattern so trips without that
//      field don't get an empty slide.
//
// No changes to the cover, page-numbering, or any other section are ever
// needed to add a new one.
// =============================================================================
