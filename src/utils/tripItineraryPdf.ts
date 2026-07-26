import { jsPDF } from 'jspdf';
import type { UpcomingTrip, CancellationTier } from '../types';
import { CANCELLATION_POLICY_STATIC_SECTIONS as STATIC } from '../constants/cancellationPolicy';
import { formatDateRange, getActivePrice } from './index';

// =============================================================================
// "Download Itinerary PDF" — renders a trip's public detail page as a clean,
// branded, landscape SLIDE DECK (one PowerPoint-style 16:9 slide per page)
// rather than a flowing document. Every slide is built entirely from the
// `UpcomingTrip` object passed in, so it always reflects whatever's live in
// Admin — nothing about a specific trip is hardcoded here.
//
// Design intent: reproduce the 9-slide reference deck (cover → overview +
// highlights → itinerary → inclusions/exclusions → things to carry →
// meeting point → FAQs → cancellation policy → closing) while staying
// fully data-driven:
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

/** The core PDF fonts don't include the ₹ glyph, so we spell out the
 *  currency instead of risking it render as a missing-glyph box. */
function formatINR(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

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

function sanitizeTrip(trip: UpcomingTrip): UpcomingTrip {
  return {
    ...trip,
    title: sanitizeForPdf(trip.title),
    destination: sanitizeForPdf(trip.destination),
    duration: sanitizeForPdf(trip.duration),
    description: sanitizeForPdf(trip.description),
    highlights: trip.highlights.map(sanitizeForPdf),
    itinerary: trip.itinerary.map(day => ({
      ...day,
      title: sanitizeForPdf(day.title),
      description: sanitizeForPdf(day.description),
    })),
    included: trip.included.map(sanitizeForPdf),
    not_included: trip.not_included.map(sanitizeForPdf),
    things_to_carry: trip.things_to_carry.map(sanitizeForPdf),
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
  };

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
    const heroH = PAGE_H * 0.62;

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

    let ty = heroH + 46;
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(27);
    const titleMaxW = CONTENT_W - 130;
    const titleLines: string[] = clampLines(trip.title, titleMaxW, 2);
    doc.text(titleLines, MARGIN, ty);
    ty += titleLines.length * 30 + 6;

    // Meta row: duration • destination • dates
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const metaParts = [trip.duration, trip.destination, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean);
    let mx = MARGIN;
    metaParts.forEach((part, i) => {
      const w = doc.getTextWidth(part) + 16;
      setFill(i === 0 ? COLORS.primary : COLORS.backgroundWarm);
      doc.roundedRect(mx, ty, w, 20, 10, 10, 'F');
      setText(i === 0 ? COLORS.white : COLORS.darkMuted);
      doc.text(part, mx + 8, ty + 13.5);
      mx += w + 8;
    });
    ty += 34;

    if (trip.description) {
      drawParagraph(trip.description, MARGIN, ty, CONTENT_W - 130, {
        size: 11,
        color: COLORS.darkMuted,
        maxLines: 3,
        lineHeight: 15.5,
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
  // SLIDE — Trip Overview + Trip Highlights
  // =========================================================================
  function renderOverviewAndHighlights() {
    if (!trip.description && trip.highlights.length === 0) return;
    newSlide();

    const hasBoth = !!trip.description && trip.highlights.length > 0;
    const leftW = hasBoth ? CONTENT_W * 0.48 : CONTENT_W;
    const gap = 40;
    const rightX = MARGIN + leftW + gap;
    const rightW = CONTENT_W - leftW - gap;

    if (trip.description) {
      const y0 = MARGIN;
      icons.mountain(MARGIN, y0 + 20, 18);
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Trip Overview', MARGIN + 26, y0 + 16);

      const textX = MARGIN + 18;
      const textW = leftW - 18;
      const paraTop = y0 + 48;
      const paraBottom = drawParagraph(trip.description, textX, paraTop, textW, {
        size: 13,
        color: COLORS.darkMuted,
        lineHeight: 21,
      });
      // A slim accent rule alongside the paragraph gives the column visual
      // weight even when the description itself is short.
      setFill(COLORS.secondary);
      doc.roundedRect(MARGIN, paraTop - 14, 3, Math.max(40, paraBottom - (paraTop - 14) - 6), 1.5, 1.5, 'F');
    }

    if (trip.highlights.length > 0) {
      const x = hasBoth ? rightX : MARGIN;
      const w = hasBoth ? rightW : CONTENT_W;
      let y = MARGIN;
      icons.star(x, y + 18, 16);
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Trip Highlights', x + 24, y + 16);
      y += 44;

      const rowGap = 12;
      const rowPad = 12;
      trip.highlights.forEach(h => {
        const lines = clampLines(h, w - rowPad * 2 - 30, 2);
        const rowH = Math.max(lines.length * 15 + rowPad * 2 - 6, 40);
        if (y + rowH > CONTENT_BOTTOM) return; // safety net; highlight lists are short by nature

        setFill(COLORS.cream);
        doc.roundedRect(x, y, w, rowH, 8, 8, 'F');
        setDraw(COLORS.grayLineSoft);
        doc.setLineWidth(0.75);
        doc.roundedRect(x, y, w, rowH, 8, 8, 'S');

        const iconR = 9;
        setFill(COLORS.primary);
        doc.circle(x + rowPad + iconR, y + rowH / 2, iconR, 'F');
        drawCheck(x + rowPad + iconR, y + rowH / 2 + 1, iconR * 0.75, COLORS.white, 1.7);
        setText(COLORS.dark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11.5);
        const textY = y + rowH / 2 - ((lines.length - 1) * 15) / 2 + 4;
        doc.text(lines, x + rowPad + iconR * 2 + 12, textY);
        y += rowH + rowGap;
      });
    }
  }

  // =========================================================================
  // SLIDES — Detailed Itinerary (2×2 photo cards per slide, paginated)
  // =========================================================================
  async function renderItinerary() {
    if (trip.itinerary.length === 0) return;

    const cols = 2;
    const rows = 2;
    const perPage = cols * rows;
    const gridTop = 92;
    const colGap = 20;
    const rowGap = 16;
    const cardW = (CONTENT_W - colGap) / cols;
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
        // Day badge
        const badgeLabel = `DAY ${String(day.day).padStart(2, '0')}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        const badgeW = doc.getTextWidth(badgeLabel) + 18;
        setFill(COLORS.primary);
        doc.roundedRect(cx + pad, cy + pad, badgeW, 20, 10, 10, 'F');
        setText(COLORS.white);
        doc.text(badgeLabel, cx + pad + 9, cy + pad + 13.5);

        const hasImages = !!day.images && day.images.length > 0;
        const thumbH = hasImages ? Math.min(160, cardH * 0.34) : 0;
        const textBottom = cy + cardH - pad - thumbH - (hasImages ? 10 : 0);
        let ty = cy + pad + 20 + 16;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        setText(COLORS.dark);
        const titleLines = clampLines(day.title, cardW - pad * 2, 1);
        doc.text(titleLines, cx + pad, ty);
        ty += 17;

        const descMaxLines = Math.max(1, Math.floor((textBottom - ty) / 12.5));
        drawParagraph(day.description, cx + pad, ty, cardW - pad * 2, {
          size: 8.8,
          color: COLORS.darkMuted,
          lineHeight: 12.5,
          maxLines: descMaxLines,
        });

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
  // SLIDES — What's Included / What's Not Included (paired columns)
  // =========================================================================
  function renderInclusions() {
    if (trip.included.length === 0 && trip.not_included.length === 0) return;

    const colGap = 40;
    const colW = (CONTENT_W - colGap) / 2;
    const top = 92;
    const titleH = 34;
    const availH = CONTENT_BOTTOM - top - titleH;

    const measureItem = (item: string) => measureParagraphHeight(item, colW - 28, 9.8, 14) + 10;
    const columnHeight = (items: string[]) => (items.length === 0 ? 0 : titleH + items.reduce((s, it) => s + measureItem(it), 0));

    const includedPages = paginateRows(trip.included, measureItem, availH);
    const notIncludedPages = paginateRows(trip.not_included, measureItem, availH);
    const pageCount = Math.max(includedPages.length, notIncludedPages.length, 1);

    function drawColumn(x: number, startY: number, title: string, items: string[], color: RGB, kind: 'check' | 'cross') {
      let y = startY;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13.5);
      doc.text(title, x, y);
      y += 24;
      items.forEach(item => {
        const lines = doc.splitTextToSize(item, colW - 28);
        if (kind === 'check') drawCheck(x + 6, y - 3, 7, color, 1.6);
        else drawCross(x + 6, y - 3, 6, color, 1.6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.8);
        setText(COLORS.darkMuted);
        doc.text(lines, x + 20, y);
        y += lines.length * 14 + 10;
      });
    }

    for (let p = 0; p < pageCount; p++) {
      newSlide();
      slideHeader(
        (x, y) => icons.check(x, y, 20),
        p === 0 ? "What's Included & Not Included" : "What's Included & Not Included (continued)"
      );
      const leftItems = includedPages[p] || [];
      const rightItems = notIncludedPages[p] || [];
      const startY = centeredTop(top, CONTENT_BOTTOM, Math.max(columnHeight(leftItems), columnHeight(rightItems)));
      if (leftItems.length) drawColumn(MARGIN, startY, "What's Included", leftItems, COLORS.green, 'check');
      if (rightItems.length) drawColumn(MARGIN + colW + colGap, startY, "What's Not Included", rightItems, COLORS.red, 'cross');
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

        setFill(COLORS.primary);
        doc.circle(x + 20, y + chipH / 2, 8, 'F');
        drawCheck(x + 20, y + chipH / 2 + 1, 6.5, COLORS.white, 1.5);

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
    const contentH = 30 /* badge row */ + lines.length * 16 + (hasLink ? 46 : 20);
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
    ty += lines.length * 16 + 16;

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
        title: 'Minimum Group Size',
        body: [STATIC.minimumGroupSize.intro, ...STATIC.minimumGroupSize.options.map(o => `\u2022 ${o}`)],
      },
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

    // Acceptance note, appended as its own small closing strip.
    newSlide();
    slideHeader((x, y) => icons.shield(x, y, 20), 'Cancellation Policy', 'Acknowledgement');
    const noteLines = doc.splitTextToSize(STATIC.acceptance, CONTENT_W - 60);
    const noteH = noteLines.length * 15 + 40;
    const { activePrice } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
    const noteTop = centeredTop(top, CONTENT_BOTTOM, noteH + (activePrice != null ? 40 : 0));
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(MARGIN, noteTop, CONTENT_W, noteH, 10, 10, 'F');
    setDraw(COLORS.grayLine);
    doc.setLineWidth(0.75);
    doc.roundedRect(MARGIN, noteTop, CONTENT_W, noteH, 10, 10, 'S');
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text(noteLines, MARGIN + 24, noteTop + 28);

    if (activePrice != null) {
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(`Advance / trip amount: ${formatINR(activePrice)} per person`, MARGIN + 24, noteTop + noteH + 30);
    }
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
  renderOverviewAndHighlights();
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
