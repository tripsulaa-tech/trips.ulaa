import { jsPDF } from 'jspdf';
import type { UpcomingTrip, CancellationTier, TripHighlightCard, TripIncludedGroup, ItineraryDay } from '../types/types-index';
import { CANCELLATION_POLICY_STATIC_SECTIONS as STATIC } from '../constants/cancellationPolicy';
import { formatDateRange, formatAgeRange, formatPrice, getActivePrice } from './utils-index';

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

// Static, site-wide brand info (not trip data) shown on the cover strip and
// the closing slide — the same constants used in the site footer/contact page.
const BRAND = {
  name: 'ULAA',
  tagline: 'Girls-Only Travel Community',
  website: 'www.ulaa.in',
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

// `included_groups` carries the site's grouped "What's Included" content
// (icon + heading + bulleted sub-items) straight through so the PDF can draw
// the same heading-card layout as TripDetailPage. `included` is a flattened
// fallback (just descriptions) used only when a trip has no groups, drawn as
// the plain icon-card grid instead. `not_included` prefers not_included_items'
// descriptions when present, else the legacy plain-text list — same
// precedence TripDetailPage itself uses.
type PdfTrip = UpcomingTrip & {
  highlight_cards: TripHighlightCard[];
  included_groups: TripIncludedGroup[];
  included: string[];
  things_to_carry: string[];
};

function sanitizeTrip(trip: UpcomingTrip): PdfTrip {
  // Things to Carry now has an icon-based rich variant (things_to_carry_items)
  // that the admin form treats as the source of truth — see AdminTrips.tsx.
  // The PDF only ever needed the description text, so prefer that when
  // present.
  const thingsToCarrySource = (trip.things_to_carry_items?.length ?? 0) > 0
    ? trip.things_to_carry_items!.map(item => item.description)
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
    included: hasIncludedGroups ? [] : (trip.included_items ?? []).map(item => sanitizeForPdf(item.description)),
    not_included: notIncludedSource.map(sanitizeForPdf),
    things_to_carry: thingsToCarrySource.map(sanitizeForPdf),
    meeting_point: trip.meeting_point ? sanitizeForPdf(trip.meeting_point) : trip.meeting_point,
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
  cornerRadiusPt = 0
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

    if (r > 0) {
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(w - r, 0);
      ctx.quadraticCurveTo(w, 0, w, r);
      ctx.lineTo(w, h - r);
      ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(r, h);
      ctx.quadraticCurveTo(0, h, 0, h - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
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

  function slideHeader(icon: (x: number, y: number) => void, title: string, subtitle?: string) {
    icon(MARGIN, 40);
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text(title, MARGIN + 30, 46);
    if (subtitle) {
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(subtitle, MARGIN + 30, 58);
    }
    setDraw(COLORS.grayLine);
    doc.setLineWidth(1);
    doc.line(MARGIN, 66, PAGE_W - MARGIN, 66);
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
  };

  /** Keyword match from an admin-typed "Things to Carry" item to the icon
   *  that best represents it, so the chip grid doesn't need a dedicated
   *  icon field in the data — falls back to a plain checkmark for anything
   *  that doesn't match a known category (still always correct, just less
   *  specific). */
  function carryIconFor(item: string): (x: number, y: number, s?: number, color?: RGB) => void {
    const t = item.toLowerCase();
    if (/passport|\bvisa\b|\bid\b|identity|documents?/.test(t)) return icons.idcard;
    if (/\bcash\b|\bcards?\b|money|wallet|currency|forex/.test(t)) return icons.cash;
    if (/sunscreen|sunglasses|shades|\bspf\b|lotion/.test(t)) return icons.sun;
    if (/medicine|medication|\bpills?\b|first[\s-]?aid|health kit/.test(t)) return icons.pill;
    if (/charger|power\s*bank|adapter|\bcable\b|battery|electronics?/.test(t)) return icons.plug;
    if (/\bshoes?\b|footwear|sneakers?|sandals?|slippers?/.test(t)) return icons.shoe;
    if (/clothes|clothing|jacket|sweater|\bwear\b|dress|outfit|apparel/.test(t)) return icons.shirt;
    return icons.check;
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

  // ---------------------------------------------------------------------
  // Generic pager: greedily bins items into "pages" (arrays of items) that
  // each fit within `availH`, based on a caller-supplied height estimate
  // per item. Used everywhere a list might be longer than one slide.
  // ---------------------------------------------------------------------
  function paginateRows<T>(items: T[], measure: (item: T) => number, availH: number): T[][] {
    if (items.length === 0) return [];
    const pages: T[][] = [];
    let page: T[] = [];
    let used = 0;
    for (const item of items) {
      const h = measure(item);
      if (used + h > availH && page.length > 0) {
        pages.push(page);
        page = [];
        used = 0;
      }
      page.push(item);
      used += h;
    }
    if (page.length) pages.push(page);
    return pages;
  }

  /** Like `paginateRows`, but spreads one shared list across two side-by-side
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
      isEarlyBird && activePrice ? `Early Bird ${formatPrice(activePrice)}` : '',
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

  function drawHighlightCard(card: TripHighlightCard, x: number, y: number, w: number, h: number, color: RGB) {
    setFill(COLORS.cream);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');
    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, w, h, 10, 10, 'S');

    const cx = x + w / 2;
    const iconCy = y + 28;
    setFill(color);
    doc.circle(cx, iconCy, 15, 'F');
    icons.star(cx - 7, iconCy + 5.6, 14, COLORS.white);

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
  function drawHighlightGrid(cards: TripHighlightCard[], top: number): number {
    const colGap = 20;
    const cardW = (CONTENT_W - colGap * (HIGHLIGHT_PER_ROW - 1)) / HIGHLIGHT_PER_ROW;
    cards.forEach((card, i) => {
      const row = Math.floor(i / HIGHLIGHT_PER_ROW);
      const col = i % HIGHLIGHT_PER_ROW;
      const x = MARGIN + col * (cardW + colGap);
      const y = top + row * (HIGHLIGHT_CARD_H + HIGHLIGHT_ROW_GAP);
      drawHighlightCard(card, x, y, cardW, HIGHLIGHT_CARD_H, CARD_PALETTE[i % CARD_PALETTE.length]);
    });
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
   *  while only laying out its own chunk of days. */
  function drawDaysSection(days: ItineraryDay[], top: number, totalLabel?: string) {
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const heading = totalLabel ?? `${days.length} Day${days.length === 1 ? '' : 's'} of Unforgettable Moments`;
    doc.text(heading, PAGE_W / 2, top + 12, { align: 'center' });

    const rowTop = top + 40;
    const perRow = Math.min(days.length, DAY_PER_ROW);
    const cellW = CONTENT_W / perRow;
    const circleR = 20;

    days.forEach((day, i) => {
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
      setText(COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('DAY', cx, cy - 4, { align: 'center' });
      doc.setFontSize(13);
      doc.text(String(day.day), cx, cy + 9, { align: 'center' });

      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const titleLines = clampLines(day.title, cellW - 12, 2);
      doc.text(titleLines, cx, cy + circleR + 16, { align: 'center' });
    });
  }

  function renderHighlightCardsSlides(cards: TripHighlightCard[]) {
    const perSlide = HIGHLIGHT_PER_ROW * 2;
    for (let i = 0; i < cards.length; i += perSlide) {
      newSlide();
      const top = drawSectionTitle("Why You'll Love This Trip", MARGIN);
      drawHighlightGrid(cards.slice(i, i + perSlide), top);
    }
  }

  function renderDaySlides(days: ItineraryDay[]) {
    const perSlide = DAY_PER_ROW * 2;
    for (let i = 0; i < days.length; i += perSlide) {
      newSlide();
      const label = `${days.length} Day${days.length === 1 ? '' : 's'} of Unforgettable Moments`;
      drawDaysSection(days.slice(i, i + perSlide), MARGIN, label);
    }
  }

  function renderHighlightsAndDays() {
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
        y = drawHighlightGrid(cards, y);
        y += gapBetween;
      }
      if (days.length) {
        drawDaysSection(days, y);
      }
    } else {
      if (cards.length) renderHighlightCardsSlides(cards);
      if (days.length) renderDaySlides(days);
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
    const gridTop = 92;
    const colGap = 20;
    const rowGap = 16;
    const cardW = cols > 1 ? (CONTENT_W - colGap * (cols - 1)) / cols : CONTENT_W;
    const fullAvailH = CONTENT_BOTTOM - gridTop;

    for (let pageStart = 0; pageStart < trip.itinerary.length; pageStart += perPage) {
      newSlide();
      const isFirst = pageStart === 0;
      slideHeader(
        (x, y) => icons.calendar(x, y, 20),
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
            ty = drawBulletList(dayBullets, cx + pad, ty, cardW - pad * 2, {
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

  function drawGroupCard(group: TripIncludedGroup, x: number, y: number, w: number, h: number) {
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');

    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(group.heading, x + GROUP_CARD_PAD, y + GROUP_CARD_PAD + 10);

    const bulletsTop = y + GROUP_CARD_PAD + 28;
    drawBulletList(group.bullets, x + GROUP_CARD_PAD, bulletsTop, w - GROUP_CARD_PAD * 2, {
      size: 8.8,
      color: COLORS.darkMuted,
      lineHeight: 12,
    });
  }

  function groupGridH(groups: TripIncludedGroup[]): number {
    if (groups.length === 0) return 0;
    const cardW = groupCardW();
    let total = 0;
    for (let i = 0; i < groups.length; i += GROUP_COLS) {
      const rowGroups = groups.slice(i, i + GROUP_COLS);
      const rowH = Math.max(...rowGroups.map(g => measureGroupCardH(g, cardW)));
      total += rowH + GROUP_ROW_GAP;
    }
    return total - GROUP_ROW_GAP;
  }

  function drawGroupGrid(groups: TripIncludedGroup[], top: number): number {
    const cardW = groupCardW();
    let y = top;
    for (let i = 0; i < groups.length; i += GROUP_COLS) {
      const rowGroups = groups.slice(i, i + GROUP_COLS);
      const rowH = Math.max(...rowGroups.map(g => measureGroupCardH(g, cardW)));
      rowGroups.forEach((group, idx) => {
        const x = MARGIN + idx * (cardW + GROUP_COL_GAP);
        drawGroupCard(group, x, y, cardW, rowH);
      });
      y += rowH + GROUP_ROW_GAP;
    }
    return y - GROUP_ROW_GAP;
  }

  // ---- "What's Included" fallback — flat icon-card grid, used only when
  // the trip has no included_groups (just included_items descriptions) ----
  const FLAT_CARD_H = 78;
  const FLAT_ROW_GAP = 10;
  const FLAT_PER_ROW = 3;

  function drawFlatIncludedCard(text: string, x: number, y: number, w: number, h: number) {
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');

    const cx = x + w / 2;
    const iconCy = y + 22;
    setFill(COLORS.green);
    doc.circle(cx, iconCy, 11, 'F');
    drawCheck(cx, iconCy, 7, COLORS.white, 1.7);

    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    const lines = clampLines(text, w - 20, 3);
    doc.text(lines, cx, iconCy + 22, { align: 'center', lineHeightFactor: 1.3 });
  }

  function flatGridH(count: number): number {
    if (count === 0) return 0;
    const rows = Math.ceil(count / FLAT_PER_ROW);
    return rows * FLAT_CARD_H + Math.max(0, rows - 1) * FLAT_ROW_GAP;
  }

  function drawFlatGrid(items: string[], top: number): number {
    const colGap = 20;
    const cardW = (CONTENT_W - colGap * (FLAT_PER_ROW - 1)) / FLAT_PER_ROW;
    items.forEach((item, i) => {
      const row = Math.floor(i / FLAT_PER_ROW);
      const col = i % FLAT_PER_ROW;
      const x = MARGIN + col * (cardW + colGap);
      const y = top + row * (FLAT_CARD_H + FLAT_ROW_GAP);
      drawFlatIncludedCard(item, x, y, cardW, FLAT_CARD_H);
    });
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

  function drawChipRow(items: string[], top: number): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    let x = MARGIN;
    let y = top;
    items.forEach(item => {
      const w = chipWidth(item);
      if (x > MARGIN && x + w > MARGIN + CONTENT_W) {
        x = MARGIN;
        y += CHIP_H + CHIP_GAP_Y;
      }
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, y, w, CHIP_H, CHIP_H / 2, CHIP_H / 2, 'F');

      const iconCx = x + CHIP_PAD_X + CHIP_ICON_R;
      const iconCy = y + CHIP_H / 2;
      setFill(COLORS.red);
      doc.circle(iconCx, iconCy, CHIP_ICON_R, 'F');
      drawCross(iconCx, iconCy, CHIP_ICON_R * 0.68, COLORS.white, 1.4);

      setText(COLORS.dark);
      doc.text(item, iconCx + CHIP_ICON_R + 8, iconCy + 3.2);
      x += w + CHIP_GAP_X;
    });
    return y + CHIP_H;
  }

  function renderInclusions() {
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
      slideHeader((x, y) => icons.check(x, y, 20), "What's Included & Not Included");
      let y = top;
      if (hasIncluded) {
        drawSectionHeading("What's Included", y);
        y += SECTION_TITLE_H;
        y = hasGroups ? drawGroupGrid(trip.included_groups, y) : drawFlatGrid(trip.included, y);
        y += gapBetween;
      }
      if (hasNotIncluded) {
        drawSectionHeading("What's Not Included", y);
        y += SECTION_TITLE_H;
        drawChipRow(trip.not_included, y);
      }
      return;
    }

    // Too tall for one slide — paginate each section independently, each
    // getting its own slide(s), so long lists never overflow or get cut off.
    if (hasGroups) {
      const cardW = groupCardW();
      const rowH = trip.included_groups.length
        ? Math.max(...trip.included_groups.map(g => measureGroupCardH(g, cardW)))
        : 0;
      const rowsPerPage = Math.max(1, Math.floor((availH - SECTION_TITLE_H) / (rowH + GROUP_ROW_GAP)));
      const perPage = rowsPerPage * GROUP_COLS;
      for (let i = 0; i < trip.included_groups.length; i += perPage) {
        newSlide();
        slideHeader((x, y) => icons.check(x, y, 20), i === 0 ? "What's Included" : "What's Included (continued)");
        drawGroupGrid(trip.included_groups.slice(i, i + perPage), top);
      }
    } else if (hasFlatIncluded) {
      const rowsPerPage = Math.max(1, Math.floor((availH - SECTION_TITLE_H) / (FLAT_CARD_H + FLAT_ROW_GAP)));
      const perPage = rowsPerPage * FLAT_PER_ROW;
      for (let i = 0; i < trip.included.length; i += perPage) {
        newSlide();
        slideHeader((x, y) => icons.check(x, y, 20), i === 0 ? "What's Included" : "What's Included (continued)");
        drawFlatGrid(trip.included.slice(i, i + perPage), top);
      }
    }

    if (hasNotIncluded) {
      newSlide();
      slideHeader((x, y) => icons.cross(x, y, 20), "What's Not Included");
      drawChipRow(trip.not_included, top);
    }
  }

  // =========================================================================
  // SLIDES — Things to Carry (icon chip grid, paginated by row)
  // =========================================================================
  function renderThingsToCarry() {
    if (trip.things_to_carry.length === 0) return;

    const perRow = 5;
    const gap = 14;
    const chipW = (CONTENT_W - gap * (perRow - 1)) / perRow;
    const chipH = 46;
    const top = 92;
    const rowsPerPage = Math.max(1, Math.floor((CONTENT_BOTTOM - top) / (chipH + gap)));
    const itemsPerPage = perRow * rowsPerPage;

    for (let pageStart = 0; pageStart < trip.things_to_carry.length; pageStart += itemsPerPage) {
      newSlide();
      slideHeader(
        (x, y) => icons.backpack(x, y, 20),
        'Things to Carry',
        pageStart === 0 ? 'Pack smart \u2014 here\u2019s what to bring along' : undefined
      );

      const pageItems = trip.things_to_carry.slice(pageStart, pageStart + itemsPerPage);
      const rowsThisPage = Math.ceil(pageItems.length / perRow);
      const gridH = rowsThisPage * chipH + (rowsThisPage - 1) * gap;
      const gridTop = centeredTop(top, CONTENT_BOTTOM, gridH);

      pageItems.forEach((item, i) => {
        const row = Math.floor(i / perRow);
        const itemsInRow = Math.min(perRow, pageItems.length - row * perRow);
        const rowOffset = ((perRow - itemsInRow) * (chipW + gap)) / 2; // centers a short/incomplete row
        const col = i % perRow;
        const x = MARGIN + rowOffset + col * (chipW + gap);
        const y = gridTop + row * (chipH + gap);

        setFill(COLORS.backgroundWarm);
        doc.roundedRect(x, y, chipW, chipH, 8, 8, 'F');
        setDraw(COLORS.grayLineSoft);
        doc.setLineWidth(0.75);
        doc.roundedRect(x, y, chipW, chipH, 8, 8, 'S');

        const itemIcon = carryIconFor(item);
        setFill(COLORS.primary);
        doc.circle(x + 20, y + chipH / 2, 8, 'F');
        itemIcon(x + 20 - 7, y + chipH / 2 + 7, 14, COLORS.white);

        setText(COLORS.dark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lines = clampLines(item, chipW - 44, 2);
        const lineY = y + chipH / 2 - ((lines.length - 1) * 11) / 2 + 3;
        doc.text(lines, x + 34, lineY);
      });
    }
  }

  // =========================================================================
  // SLIDE — Meeting Point
  // =========================================================================
  /** Looks for a handful of common assembly-point keywords in the trip's own
   *  meeting-point text so the icon/label on this slide matches the actual
   *  location type (airport / railway station / bus stand) — derived purely
   *  from what Admin typed for this trip, never hardcoded per trip. */
  function detectMeetingPointKind(text: string): 'airport' | 'railway' | 'bus' | 'other' {
    const t = text.toLowerCase();
    if (/\bairport\b/.test(t)) return 'airport';
    if (/\brailway\b|\btrain station\b|\brail station\b/.test(t)) return 'railway';
    if (/\bbus stand\b|\bbus station\b|\bbus stop\b|\bbus terminus\b/.test(t)) return 'bus';
    return 'other';
  }

  function renderMeetingPoint() {
    if (!trip.meeting_point) return;
    newSlide();
    slideHeader((x, y) => icons.pin(x, y, 20), 'Meeting Point');

    const kind = detectMeetingPointKind(trip.meeting_point);
    const kindLabel =
      kind === 'airport' ? 'Airport' : kind === 'railway' ? 'Railway Station' : kind === 'bus' ? 'Bus Stand' : 'Assembly Point';
    const kindIcon = kind === 'airport' ? icons.plane : kind === 'railway' ? icons.train : kind === 'bus' ? icons.bus : icons.pin;

    const top = 92;
    const availH = CONTENT_BOTTOM - top;
    const textColW = CONTENT_W * 0.56;
    const pad = 34;
    const lines = doc.splitTextToSize(trip.meeting_point, textColW - pad * 2);
    const hasLink = !!trip.meeting_point_map_url;

    // Structured logistics rows — real per-trip data once Admin fills them
    // in; sensible boilerplate otherwise (this is genuinely often correct,
    // since exact time/terminal for a trip months out often isn't final).
    const detailRows: { label: string; value: string }[] = [
      { label: 'Time', value: trip.meeting_time || 'To be communicated' },
      { label: 'Terminal', value: trip.meeting_terminal || 'To be informed' },
      { label: 'Details', value: trip.meeting_details || 'More info will be shared closer to the departure date.' },
    ];
    const rowMaxWidth = textColW - pad * 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const rowHeights = detailRows.map(r => {
      const labelW = doc.getTextWidth(`${r.label}:  `);
      const valueLines = doc.splitTextToSize(r.value, rowMaxWidth - labelW);
      return Math.max(1, valueLines.length) * 15;
    });
    const rowsH = rowHeights.reduce((a, b) => a + b, 0) + (detailRows.length - 1) * 8;

    const contentH = 30 /* badge row */ + lines.length * 16 + 22 /* divider gap */ + rowsH + (hasLink ? 46 : 16);
    const boxH = Math.min(Math.max(200, contentH + pad * 2), availH);
    const boxTop = top + Math.max(0, (availH - boxH) / 2);

    setFill(COLORS.backgroundWarm);
    doc.roundedRect(MARGIN, boxTop, CONTENT_W, boxH, 12, 12, 'F');
    setDraw(COLORS.grayLine);
    doc.setLineWidth(0.75);
    doc.roundedRect(MARGIN, boxTop, CONTENT_W, boxH, 12, 12, 'S');

    // Large, low-opacity watermark of the location-type icon fills the
    // right side of the card instead of leaving it visually empty.
    withOpacity(0.08, () => {
      kindIcon(MARGIN + CONTENT_W - 260, boxTop + boxH / 2 + 90, 220, COLORS.primaryDark);
    });

    let ty = boxTop + pad;
    setFill(COLORS.primary);
    doc.circle(MARGIN + pad + 18, ty, 18, 'F');
    kindIcon(MARGIN + pad + 4, ty + 14, 18, COLORS.white);

    setText(COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(kindLabel.toUpperCase(), MARGIN + pad + 46, ty - 4);
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('Assembly Location', MARGIN + pad + 46, ty + 12);

    ty += 34;
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.5);
    doc.text(lines, MARGIN + pad, ty);
    ty += lines.length * 16 + 14;

    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(0.75);
    doc.line(MARGIN + pad, ty, MARGIN + pad + rowMaxWidth, ty);
    ty += 20;

    detailRows.forEach((row, i) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      setText(COLORS.dark);
      const labelText = `${row.label}:  `;
      doc.text(labelText, MARGIN + pad, ty);
      const labelW = doc.getTextWidth(labelText);
      doc.setFont('helvetica', 'normal');
      setText(COLORS.darkMuted);
      const valueLines = doc.splitTextToSize(row.value, rowMaxWidth - labelW);
      doc.text(valueLines, MARGIN + pad + labelW, ty);
      ty += rowHeights[i] + 8;
    });
    ty += 6;

    if (hasLink) {
      const label = 'View on map';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const labelW = doc.getTextWidth(label);
      const btnW = labelW + 44;
      const btnH = 26;
      setFill(COLORS.primary);
      doc.roundedRect(MARGIN + pad, ty, btnW, btnH, 13, 13, 'F');
      setText(COLORS.white);
      doc.text(label, MARGIN + pad + 16, ty + 17);
      // Small vector arrow instead of a unicode glyph — the core PDF fonts
      // don't include arrow characters, so drawing it avoids a rendering
      // artifact where the arrow glyph would otherwise fail to render.
      const ax = MARGIN + pad + 16 + labelW + 10;
      const ay = ty + 13;
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1.4);
      doc.setLineCap('round');
      doc.line(ax, ay, ax + 8, ay);
      doc.line(ax + 4, ay - 4, ax + 8, ay);
      doc.line(ax + 4, ay + 4, ax + 8, ay);
      doc.link(MARGIN + pad, ty, btnW, btnH, { url: trip.meeting_point_map_url });
    }
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
      slideHeader((x, y) => icons.question(x, y, 20), p === 0 ? 'FAQs' : 'FAQs (continued)');
      const startY = centeredTop(top, CONTENT_BOTTOM, Math.max(page.leftH, page.rightH));
      if (page.left.length) drawColumn(MARGIN, startY, page.left);
      if (page.right.length) drawColumn(MARGIN + colW + colGap, startY, page.right);
    });
  }

  // =========================================================================
  // SLIDES — Cancellation Policy (numbered clauses, 2-column, paginated)
  // =========================================================================
  function renderCancellationPolicy() {
    const policy = trip.cancellation_policy;
    if (!policy) return;

    type Clause = { title: string; body: string[] };
    const clauses: Clause[] = [
      { title: 'Booking Confirmation', body: STATIC.bookingConfirmation },
      {
        title: 'Payment Schedule',
        body: [
          `The remaining trip balance must be paid at least ${policy.payment_due_days} days before the departure date, unless otherwise communicated. Failure to complete the payment by the due date may result in automatic cancellation of your booking without prior notice.`,
        ],
      },
      {
        title: 'Cancellation by Participant',
        body: policy.tiers.map(tier => `${tierLabel(tier)}: ${tier.description}`),
      },
      { title: 'No Show', body: [STATIC.noShow] },
      { title: 'Missed Services', body: [STATIC.missedServices] },
      { title: 'Trip Cancellation by Organizer', body: STATIC.organizerCancellation },
      {
        title: 'Refund Timeline',
        body: [
          `Where applicable, approved refunds will be processed within ${policy.refund_min_days}\u2013${policy.refund_max_days} working days, subject to the receipt of refunds from the respective third-party service providers.`,
        ],
      },
    ];

    const colGap = 36;
    const colW = (CONTENT_W - colGap) / 2;
    const top = 92;
    const availH = CONTENT_BOTTOM - top;

    const measureClause = (c: Clause) => {
      const titleH = 18;
      const bodyH = c.body.reduce((sum, line) => sum + measureParagraphHeight(line, colW - 40, 9.3, 13.2) + 3, 0);
      return titleH + bodyH + 20;
    };

    const balanced = paginateTwoColumns(clauses, measureClause, availH);

    const numbers = new Map<Clause, number>();
    clauses.forEach((c, i) => numbers.set(c, i + 1));

    function drawColumn(x: number, startY: number, items: Clause[]) {
      let y = startY;
      items.forEach(clause => {
        const num = numbers.get(clause)!;
        setFill(COLORS.primary);
        doc.circle(x + 9, y - 5, 9, 'F');
        setText(COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(String(num), x + 9, y - 1.5, { align: 'center' });

        setText(COLORS.dark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.text(clause.title, x + 24, y);
        y += 17;

        clause.body.forEach(line => {
          y = drawParagraph(line, x + 24, y, colW - 24, { size: 9.3, color: COLORS.darkMuted, lineHeight: 13.2 });
          y += 3;
        });
        y += 16;
      });
    }

    balanced.forEach((page, p) => {
      newSlide();
      slideHeader((x, y) => icons.shield(x, y, 20), p === 0 ? 'Cancellation Policy' : 'Cancellation Policy (continued)');
      const startY = centeredTop(top, CONTENT_BOTTOM, Math.max(page.leftH, page.rightH));
      if (page.left.length) drawColumn(MARGIN, startY, page.left);
      if (page.right.length) drawColumn(MARGIN + colW + colGap, startY, page.right);
    });
  }

  // =========================================================================
  // SLIDE — Closing / Contact
  // =========================================================================
  async function renderClosing() {
    newSlide();

    // Soft decorative arcs, echoing the cover slide, bottom of page.
    withOpacity(0.5, () => {
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.circle(PAGE_W / 2 - 140, PAGE_H - 30, 40, 'S');
      doc.circle(PAGE_W / 2 + 160, PAGE_H - 20, 24, 'S');
    });
    setFill(COLORS.secondary);
    doc.rect(0, 0, PAGE_W, 4, 'F');

    const logo = await loadContainImage('/ULAA-logo-navbar.png');
    const cy = PAGE_H * 0.36;
    if (logo) {
      const logoH = 70;
      const logoW = logoH * logo.ratio;
      try {
        doc.addImage(logo.dataUrl, 'PNG', PAGE_W / 2 - logoW / 2, cy - logoH / 2, logoW, logoH);
      } catch {
        drawTextLogo(PAGE_W / 2 - 60, cy - 15, false);
      }
    } else {
      drawTextLogo(PAGE_W / 2 - 60, cy - 15, false);
    }

    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Thank you for choosing ULAA. We can\u2019t wait to travel with you.', PAGE_W / 2, cy + 58, { align: 'center' });

    const contacts = [
      { label: BRAND.website, url: `https://${BRAND.website.replace('www.', '')}` },
      { label: BRAND.instagram, url: `https://instagram.com/${BRAND.instagram.replace('@', '')}` },
      { label: BRAND.email, url: `mailto:${BRAND.email}` },
      { label: BRAND.phone, url: `tel:${BRAND.phone.replace(/\s/g, '')}` },
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const widths = contacts.map(c => doc.getTextWidth(c.label));
    const gap = 30;
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (contacts.length - 1);
    let cx = PAGE_W / 2 - totalW / 2;
    const rowY = cy + 100;
    contacts.forEach((c, i) => {
      setText(COLORS.primary);
      doc.textWithLink(c.label, cx, rowY, { url: c.url });
      cx += widths[i] + gap;
    });
  }

  // =========================================================================
  // Assemble the deck. Sections with no data render nothing (see the
  // `if` guard at the top of each function), so the final page count is
  // always exactly what this specific trip's content needs.
  // =========================================================================
  await renderCover();
  renderHighlightsAndDays();
  await renderItinerary();
  renderInclusions();
  renderThingsToCarry();
  renderMeetingPoint();
  renderFaqs();
  renderCancellationPolicy();
  await renderClosing();

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
//      the closest match — using `paginateRows` so it automatically
//      spills onto extra slides if the list is long.
//   3. Call it from the assembly block above, guarded by the same
//      `if (list.length === 0) return;` pattern so trips without that
//      field don't get an empty slide.
//
// No changes to the cover, page-numbering, or any other section are ever
// needed to add a new one.
// =============================================================================
