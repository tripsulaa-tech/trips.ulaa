import { jsPDF } from 'jspdf';
import type { UpcomingTrip, CancellationTier } from '../types';
import { CANCELLATION_POLICY_STATIC_SECTIONS as STATIC } from '../constants/cancellationPolicy';
import { formatDateRange, getActivePrice } from './index';

// =============================================
// "Download Itinerary PDF" — builds a clean, branded PDF of a trip's full
// public detail page (overview, itinerary, inclusions, FAQs, cancellation
// policy, etc.) entirely client-side, so it stays a live snapshot of
// whatever's in Admin rather than a separately-maintained document.
//
// Colors below are kept in sync with the @theme block in
// src/styles/globals.css — update both places together if the palette ever
// changes.
// =============================================

type RGB = readonly [number, number, number];

const COLORS = {
  primary: [168, 90, 42] as RGB,
  primaryDark: [139, 72, 32] as RGB,
  secondary: [217, 138, 58] as RGB,
  dark: [45, 33, 24] as RGB,
  darkMuted: [74, 55, 40] as RGB,
  backgroundWarm: [242, 235, 224] as RGB,
  cream: [250, 247, 242] as RGB,
  gold: [200, 150, 42] as RGB,
  white: [255, 255, 255] as RGB,
  whiteMuted: [225, 214, 203] as RGB,
  green: [45, 140, 90] as RGB,
  red: [190, 70, 65] as RGB,
  grayLine: [210, 200, 190] as RGB,
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_ZONE = 16;
const BOTTOM_LIMIT = PAGE_H - FOOTER_ZONE;

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
 *      use, so it renders as a stray unrelated character (seen in the wild
 *      as a superscript "¹").
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

/** Best-effort: fetches a photo and returns it pre-cropped to exactly
 *  targetWmm × targetHmm using "object-fit: cover" math (scale to fill,
 *  crop the overflow, keep it centered) so it never gets stretched — plus
 *  soft rounded corners baked in via a clip path. Returns null (never
 *  throws) so a slow network, a CORS-restricted host, or a missing image
 *  never breaks PDF generation — the layout just skips the hero photo. */
async function loadCoverCroppedImage(
  url: string,
  targetWmm: number,
  targetHmm: number,
  cornerRadiusMm = 3.5
): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const srcDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = srcDataUrl;
    });

    const PX_PER_MM = 8; // ~200 DPI: sharp enough for print, keeps the PDF light
    const w = Math.round(targetWmm * PX_PER_MM);
    const h = Math.round(targetHmm * PX_PER_MM);
    const r = cornerRadiusMm * PX_PER_MM;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

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

    // object-fit: cover — scale to fill the box, crop the overflow, center it.
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    ctx.drawImage(img, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Builds the itinerary PDF and returns the jsPDF document (without
 *  triggering a download) — split out from downloadTripItineraryPdf so it
 *  can be unit-tested/inspected directly. */
export async function buildTripItineraryPdfDoc(rawTrip: UpcomingTrip): Promise<jsPDF> {
  const trip = sanitizeTrip(rawTrip);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  function newPage() {
    doc.addPage();
    y = MARGIN;
  }

  function ensureSpace(h: number): boolean {
    if (y + h > BOTTOM_LIMIT) {
      newPage();
      return true;
    }
    return false;
  }

  function sectionTitle(text: string) {
    ensureSpace(16);
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(text, MARGIN, y);
    setDraw(COLORS.secondary);
    doc.setLineWidth(0.9);
    doc.line(MARGIN, y + 2.4, MARGIN + 18, y + 2.4);
    y += 9.5;
  }

  function subheading(text: string) {
    ensureSpace(9);
    setFill(COLORS.secondary);
    doc.rect(MARGIN, y - 3.2, 1.3, 4.4, 'F');
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(text, MARGIN + 4, y);
    y += 5.5;
  }

  function paragraph(text: string, opts?: { size?: number; color?: RGB; bold?: boolean; indent?: number }) {
    const size = opts?.size ?? 10;
    const color = opts?.color ?? COLORS.darkMuted;
    const indent = opts?.indent ?? 0;
    const lh = size * 0.46;
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    setText(color);
    const lines = doc.splitTextToSize(text, CONTENT_W - indent);
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, MARGIN + indent, y);
      y += lh;
    }
  }

  function spacer(h: number) {
    y += h;
  }

  function divider() {
    ensureSpace(6);
    setDraw(COLORS.grayLine);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 5;
  }

  function drawCheck(cx: number, cy: number, r: number, color: RGB) {
    setDraw(color);
    doc.setLineWidth(0.7);
    doc.line(cx - r * 0.55, cy, cx - r * 0.1, cy + r * 0.45);
    doc.line(cx - r * 0.1, cy + r * 0.45, cx + r * 0.6, cy - r * 0.4);
  }

  function drawCross(cx: number, cy: number, r: number, color: RGB) {
    setDraw(color);
    doc.setLineWidth(0.7);
    doc.line(cx - r * 0.45, cy - r * 0.45, cx + r * 0.45, cy + r * 0.45);
    doc.line(cx - r * 0.45, cy + r * 0.45, cx + r * 0.45, cy - r * 0.45);
  }

  // ---------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------
  const { activePrice, isEarlyBird } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
  const hasPriceBox = activePrice != null;
  const priceBoxW = 42;

  const headerH = 58;
  setFill(COLORS.dark);
  doc.rect(0, 0, PAGE_W, headerH, 'F');
  setFill(COLORS.secondary);
  doc.rect(0, headerH - 1.6, PAGE_W, 1.6, 'F');

  setText(COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('U L A A', MARGIN, 13);
  setText(COLORS.whiteMuted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Girls-Only Travel Community', MARGIN, 18);

  const titleMaxW = hasPriceBox ? CONTENT_W - priceBoxW - 6 : CONTENT_W;
  setText(COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  const titleLines: string[] = doc.splitTextToSize(trip.title, titleMaxW);
  doc.text(titleLines, MARGIN, 30);

  let metaY = 30 + titleLines.length * 7.6 + 2;

  // Destination pill
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const destW = doc.getTextWidth(trip.destination) + 10;
  setFill(COLORS.primaryDark);
  doc.roundedRect(MARGIN, metaY, destW, 7, 3.5, 3.5, 'F');
  setText(COLORS.white);
  doc.text(trip.destination, MARGIN + 5, metaY + 4.8);
  metaY += 12;

  // Meta row: dates | duration | group size
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(COLORS.whiteMuted);
  const remaining = Math.max(0, trip.total_seats - trip.seats_booked);
  const groupLabel = remaining === 0 ? 'Sold out' : remaining <= 5 ? `Only ${remaining} seats left` : `Group of ${trip.total_seats}`;
  const metaText = `${formatDateRange(trip.start_date, trip.end_date)}   \u2022   ${trip.duration}   \u2022   ${groupLabel}`;
  doc.text(doc.splitTextToSize(metaText, titleMaxW), MARGIN, metaY);

  if (hasPriceBox && activePrice != null) {
    const boxX = PAGE_W - MARGIN - priceBoxW;
    const boxY = 9;
    const boxH = isEarlyBird && trip.price ? 32 : 20;
    setFill(COLORS.white);
    doc.roundedRect(boxX, boxY, priceBoxW, boxH, 3, 3, 'F');
    setText(COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(formatINR(activePrice), boxX + priceBoxW / 2, boxY + 11, { align: 'center' });
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('PER PERSON', boxX + priceBoxW / 2, boxY + 15.5, { align: 'center' });

    if (isEarlyBird && trip.price) {
      const origLabel = formatINR(trip.price);
      doc.setFontSize(7.5);
      const tw = doc.getTextWidth(origLabel);
      const tx = boxX + priceBoxW / 2 - tw / 2;
      doc.text(origLabel, tx, boxY + 20.5);
      setDraw([150, 150, 150]);
      doc.setLineWidth(0.3);
      doc.line(tx, boxY + 19.6, tx + tw, boxY + 19.6);

      setFill(COLORS.secondary);
      doc.roundedRect(boxX + 5, boxY + 23, priceBoxW - 10, 5.5, 2.75, 2.75, 'F');
      setText(COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text('EARLY BIRD', boxX + priceBoxW / 2, boxY + 26.7, { align: 'center' });
    }
  }

  y = headerH + 10;

  // ---------------------------------------------------------------------
  // Hero photo (best-effort — skipped silently if it can't be fetched)
  // ---------------------------------------------------------------------
  if (trip.cover_image) {
    const HERO_H = 62;
    const cropped = await loadCoverCroppedImage(trip.cover_image, CONTENT_W, HERO_H, 3.5);
    if (cropped) {
      ensureSpace(HERO_H + 8);
      try {
        doc.addImage(cropped, 'PNG', MARGIN, y, CONTENT_W, HERO_H);
        y += HERO_H + 8;
      } catch {
        // Unsupported format — skip the photo, rest of the PDF still builds.
      }
    }
  }

  // ---------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------
  if (trip.description) {
    sectionTitle('Trip Overview');
    paragraph(trip.description, { size: 10.5 });
    spacer(6);
  }

  // ---------------------------------------------------------------------
  // Highlights
  // ---------------------------------------------------------------------
  if (trip.highlights.length > 0) {
    sectionTitle('Trip Highlights');
    const colGap = 6;
    const colW = (CONTENT_W - colGap) / 2;
    const pad = 4;
    const iconR = 2.6;
    const textX = pad * 2 + iconR;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);

    for (let i = 0; i < trip.highlights.length; i += 2) {
      const pair = [trip.highlights[i], trip.highlights[i + 1]].filter((v): v is string => !!v);
      const linesPerCol = pair.map(t => doc.splitTextToSize(t, colW - textX - pad) as string[]);
      const rowH = Math.max(...linesPerCol.map(l => l.length * 4.3 + pad * 2), 12);

      ensureSpace(rowH + 3);
      pair.forEach((_, idx) => {
        const x = MARGIN + idx * (colW + colGap);
        setFill(COLORS.backgroundWarm);
        doc.roundedRect(x, y, colW, rowH, 2.5, 2.5, 'F');
        setDraw(COLORS.grayLine);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, colW, rowH, 2.5, 2.5, 'S');
        setFill(COLORS.primary);
        doc.circle(x + pad + iconR, y + rowH / 2, iconR, 'F');
        drawCheck(x + pad + iconR, y + rowH / 2, iconR * 0.85, COLORS.white);
        setText(COLORS.dark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text(linesPerCol[idx], x + textX, y + pad + 3.2);
      });
      y += rowH + 3;
    }
    spacer(4);
  }

  // ---------------------------------------------------------------------
  // Detailed itinerary — a timeline of cards, each day's badge overlapping
  // a bordered card and connected to the next by a vertical rail (only
  // drawn between badges that land on the same page).
  // ---------------------------------------------------------------------
  if (trip.itinerary.length > 0) {
    sectionTitle('Detailed Itinerary');

    const badgeSize = 15;
    const cardX = MARGIN + badgeSize / 2 + 4;
    const cardW = MARGIN + CONTENT_W - cardX;
    const textPad = 6;
    const textW = cardW - textPad * 2;

    let prevBadgeBottom: number | null = null;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.3);

    trip.itinerary.forEach(day => {
      const titleLinesD: string[] = doc.splitTextToSize(day.title, textW);
      const descLinesD: string[] = doc.splitTextToSize(day.description, textW);
      const innerH = titleLinesD.length * 5.2 + descLinesD.length * 4.3 + textPad * 2 + 2;
      const cardH = Math.max(innerH, badgeSize + 6);

      const paginated = ensureSpace(cardH + 7);
      if (paginated) prevBadgeBottom = null;

      const cardTop = y;
      const badgeCenterX = MARGIN + badgeSize / 2;
      const badgeCenterY = cardTop + badgeSize / 2;

      if (prevBadgeBottom !== null) {
        setDraw(COLORS.grayLine);
        doc.setLineWidth(1.1);
        doc.line(badgeCenterX, prevBadgeBottom, badgeCenterX, cardTop);
      }

      setFill(COLORS.cream);
      doc.roundedRect(cardX, cardTop, cardW, cardH, 3, 3, 'F');
      setDraw(COLORS.grayLine);
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, cardTop, cardW, cardH, 3, 3, 'S');

      setFill(COLORS.primary);
      doc.circle(badgeCenterX, badgeCenterY, badgeSize / 2, 'F');
      setText(COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.text('DAY', badgeCenterX, badgeCenterY - 1.8, { align: 'center' });
      doc.setFontSize(9.5);
      doc.text(String(day.day), badgeCenterX, badgeCenterY + 3.2, { align: 'center' });

      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(titleLinesD, cardX + textPad, cardTop + textPad + 1.5);

      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.3);
      doc.text(descLinesD, cardX + textPad, cardTop + textPad + 1.5 + titleLinesD.length * 5.2 + 3);

      prevBadgeBottom = cardTop + badgeSize;
      y = cardTop + cardH + 7;
    });
    spacer(1);
  }

  // ---------------------------------------------------------------------
  // Inclusions & exclusions
  // ---------------------------------------------------------------------
  if (trip.included.length > 0 || trip.not_included.length > 0) {
    sectionTitle('Inclusions & Exclusions');
    const colGap = 10;
    const colW = (CONTENT_W - colGap) / 2;

    function measure(items: string[]): number {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      let h = 6;
      items.forEach(item => {
        const lines: string[] = doc.splitTextToSize(item, colW - 8);
        h += lines.length * 4.3 + 2.4;
      });
      return h;
    }

    function draw(x: number, startY: number, title: string, items: string[], color: RGB, kind: 'check' | 'cross') {
      let cy = startY;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(title, x, cy);
      cy += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      items.forEach(item => {
        const lines: string[] = doc.splitTextToSize(item, colW - 8);
        const iconCy = cy - 1.2;
        if (kind === 'check') drawCheck(x + 1.8, iconCy, 1.9, color);
        else drawCross(x + 1.8, iconCy, 1.9, color);
        setText(COLORS.darkMuted);
        doc.text(lines, x + 7, cy);
        cy += lines.length * 4.3 + 2.4;
      });
    }

    const leftH = trip.included.length ? measure(trip.included) : 0;
    const rightH = trip.not_included.length ? measure(trip.not_included) : 0;
    ensureSpace(Math.max(leftH, rightH) + 4);
    const startY = y;
    if (trip.included.length) draw(MARGIN, startY, "What's Included", trip.included, COLORS.green, 'check');
    if (trip.not_included.length) draw(MARGIN + colW + colGap, startY, "What's Not Included", trip.not_included, COLORS.red, 'cross');
    y = startY + Math.max(leftH, rightH) + 6;
  }

  // ---------------------------------------------------------------------
  // Things to carry (pill chips, flowing)
  // ---------------------------------------------------------------------
  if (trip.things_to_carry.length > 0) {
    sectionTitle('Things to Carry');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const padX = 3.6;
    const chipH = 7.5;
    const gap = 3;
    let x = MARGIN;
    ensureSpace(chipH + 2);
    trip.things_to_carry.forEach(item => {
      const tw = doc.getTextWidth(item);
      const chipW = tw + padX * 2;
      if (x + chipW > MARGIN + CONTENT_W) {
        x = MARGIN;
        y += chipH + gap;
        ensureSpace(chipH + 2);
      }
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, y, chipW, chipH, chipH / 2, chipH / 2, 'F');
      setText(COLORS.dark);
      doc.text(item, x + padX, y + chipH / 2 + 1.1);
      x += chipW + gap;
    });
    y += chipH + 8;
  }

  // ---------------------------------------------------------------------
  // Meeting point
  // ---------------------------------------------------------------------
  if (trip.meeting_point) {
    const lines: string[] = doc.splitTextToSize(trip.meeting_point, CONTENT_W - 8);
    const boxH = lines.length * 4.6 + 16;
    ensureSpace(boxH + 6);
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 3, 3, 'F');
    setDraw(COLORS.grayLine);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 3, 3, 'S');
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('Meeting Point', MARGIN + 5, y + 8);
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(lines, MARGIN + 5, y + 14);
    y += boxH + 8;
  }

  // ---------------------------------------------------------------------
  // FAQs
  // ---------------------------------------------------------------------
  if (trip.faqs.length > 0) {
    sectionTitle('FAQs');
    trip.faqs.forEach((faq, i) => {
      paragraph(faq.question, { size: 10.5, bold: true, color: COLORS.dark });
      spacer(1);
      paragraph(faq.answer, { size: 9.5 });
      if (i < trip.faqs.length - 1) divider();
      else spacer(4);
    });
  }

  // ---------------------------------------------------------------------
  // Cancellation policy
  // ---------------------------------------------------------------------
  const policy = trip.cancellation_policy;
  if (policy) {
    sectionTitle('Cancellation Policy');

    subheading('Booking Confirmation');
    STATIC.bookingConfirmation.forEach(line => paragraph(line, { size: 9.5 }));
    spacer(3);

    subheading('Payment Schedule');
    paragraph(
      `The remaining trip balance must be paid at least ${policy.payment_due_days} days before the departure date, unless otherwise communicated. Failure to complete the payment by the due date may result in automatic cancellation of your booking without prior notice.`,
      { size: 9.5 }
    );
    spacer(3);

    subheading('Cancellation by Participant');
    policy.tiers.forEach(tier => {
      paragraph(tierLabel(tier), { size: 9.5, bold: true, color: COLORS.dark });
      paragraph(tier.description, { size: 9.5, indent: 2 });
      spacer(2);
    });

    subheading('No Show');
    paragraph(STATIC.noShow, { size: 9.5 });
    spacer(3);

    subheading('Missed Services');
    paragraph(STATIC.missedServices, { size: 9.5 });
    spacer(3);

    subheading('Trip Cancellation by Organizer');
    STATIC.organizerCancellation.forEach(line => paragraph(line, { size: 9.5 }));
    spacer(3);

    subheading('Minimum Group Size');
    paragraph(STATIC.minimumGroupSize.intro, { size: 9.5 });
    STATIC.minimumGroupSize.options.forEach(opt => paragraph(`\u2022  ${opt}`, { size: 9.5, indent: 2 }));
    spacer(3);

    subheading('Refund Timeline');
    paragraph(
      `Where applicable, approved refunds will be processed within ${policy.refund_min_days}\u2013${policy.refund_max_days} working days, subject to the receipt of refunds from the respective third-party service providers.`,
      { size: 9.5 }
    );
    spacer(4);

    ensureSpace(14);
    setFill(COLORS.backgroundWarm);
    const accLines: string[] = doc.splitTextToSize(STATIC.acceptance, CONTENT_W - 10);
    const accH = accLines.length * 4.2 + 6;
    doc.roundedRect(MARGIN, y, CONTENT_W, accH, 2.5, 2.5, 'F');
    setDraw(COLORS.grayLine);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, accH, 2.5, 2.5, 'S');
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(accLines, MARGIN + 5, y + 5.2);
    y += accH + 4;
  }

  // ---------------------------------------------------------------------
  // Footer on every page
  // ---------------------------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setDraw(COLORS.grayLine);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('ULAA \u2022 ulaa.trips \u2022 Generated for informational purposes', MARGIN, PAGE_H - 7);
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
  }

  return doc;
}

/** Builds the itinerary PDF and triggers a browser download. */
export async function downloadTripItineraryPdf(trip: UpcomingTrip): Promise<void> {
  const doc = await buildTripItineraryPdfDoc(trip);
  doc.save(`${trip.slug || 'ulaa-trip'}-itinerary.pdf`);
}
