import { jsPDF } from 'jspdf';
import type { Enquiry, Payment } from '../types/types-index';
import { formatPrice, formatDate } from './utils-index';

// =============================================================================
// "Download Invoice" — a single A4 portrait page summarizing one booking:
// booking reference, traveller + trip details, price breakdown, and the
// full payment ledger. Built from an `Enquiry` row (booking_id, amounts,
// trip snapshot fields) plus its `Payment` ledger rows — no other data
// source needed, so it stays accurate even after a trip is archived to
// completed_trips.
//
// Visual layout is a hand-drawn approximation of the ULAA brand invoice
// mock-up: logo block, right-aligned title + booking-id pill, a two-column
// details panel with small pill headers, an icon summary card, a styled
// payment table, a note strip, and a curved brand-colored footer with
// simple vector icons (jsPDF has no icon-font/SVG support, so every "icon"
// below is drawn from primitive shapes — circles/rects/lines/triangles).
//
// Same ₹-glyph problem as tripItineraryPdf.ts (the core PDF fonts don't
// have the ₹ codepoint, which breaks jsPDF's text-width measurement) — see
// money() below, same fix (render "Rs." instead).
// =============================================================================

type RGB = readonly [number, number, number];

const COLORS = {
  primary: [180, 90, 42] as RGB,
  primaryDark: [139, 72, 32] as RGB,
  badgeDark: [92, 54, 30] as RGB,
  dark: [45, 33, 24] as RGB,
  darkMuted: [120, 100, 84] as RGB,
  backgroundWarm: [246, 240, 231] as RGB,
  cream: [250, 246, 239] as RGB,
  white: [255, 255, 255] as RGB,
  green: [45, 140, 90] as RGB,
  greenTint: [222, 240, 229] as RGB,
  red: [190, 70, 65] as RGB,
  redTint: [248, 227, 224] as RGB,
  peachTint: [242, 227, 213] as RGB,
  grayLine: [225, 213, 199] as RGB,
} as const;

const BRAND = {
  name: 'ULAA',
  tagline: 'Girls-Only Travel Community',
  website: 'www.ulaatrips.com',
  email: 'trips.ulaa@gmail.com',
  phone: '+91 63813 36772',
};

const PAGE_W = 595.28; // A4 @ 72pt/in
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

function sanitizeForPdf(text: string): string {
  if (!text) return text;
  return text
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\u{FE0F}/gu, '')
    .trim();
}

function money(amount: number): string {
  return sanitizeForPdf(formatPrice(amount || 0));
}

const PAYMENT_TYPE_LABEL: Record<Payment['payment_type'], string> = {
  booking_amount: 'Booking amount',
  installment: 'Installment',
  balance: 'Balance payment',
  refund: 'Refund',
};

// -----------------------------------------------------------------------
// Logo loading — best-effort and never throws, same reasoning as
// tripItineraryPdf.ts's loadContainImage/fetchAsDataUrl/loadImageEl: a
// slow network or a missing file should never break invoice generation,
// it should just fall back to the plain-text "ULAA" wordmark.
// -----------------------------------------------------------------------
async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch('/ULAA-logo.jpg');
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });
    const ratio = await new Promise<number>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = dataUrl;
    });
    return { dataUrl, ratio };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------
// Tiny vector "icons" — jsPDF has no icon-font/SVG support, so every icon
// used below is a handful of primitive shapes (circle/rect/line/triangle)
// drawn at a given center point, sized to sit inside an r-radius bubble.
// -----------------------------------------------------------------------
function iconBubble(doc: jsPDF, cx: number, cy: number, r: number, bg: RGB) {
  doc.setFillColor(...bg);
  doc.circle(cx, cy, r, 'F');
}

function iconGlobe(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.circle(cx, cy, 5.5, 'S');
  doc.line(cx - 5.5, cy, cx + 5.5, cy);
  doc.ellipse(cx, cy, 2.4, 5.5, 'S');
}

function iconMail(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.rect(cx - 6, cy - 4.2, 12, 8.4, 'S');
  doc.line(cx - 6, cy - 4.2, cx, cy + 0.8);
  doc.line(cx + 6, cy - 4.2, cx, cy + 0.8);
}

function iconPhone(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.roundedRect(cx - 3, cy - 6, 6, 12, 1.5, 1.5, 'S');
  doc.setFillColor(...color);
  doc.circle(cx, cy + 3.3, 0.6, 'F');
}

function iconCalendar(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.roundedRect(cx - 6, cy - 5, 12, 11, 1.2, 1.2, 'S');
  doc.line(cx - 6, cy - 1.5, cx + 6, cy - 1.5);
  doc.line(cx - 3, cy - 6.5, cx - 3, cy - 4);
  doc.line(cx + 3, cy - 6.5, cx + 3, cy - 4);
}

function iconPin(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setFillColor(...color);
  doc.circle(cx, cy - 1, 4.4, 'F');
  doc.triangle(cx - 3.4, cy + 1.2, cx + 3.4, cy + 1.2, cx, cy + 7, 'F');
  doc.setFillColor(...COLORS.white);
  doc.circle(cx, cy - 1, 1.7, 'F');
}

function iconMoneyBag(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.lines([[3, -4], [3, 4], [-6, 0], [0, -8]], cx - 3, cy - 1, [1, 1], 'S', true);
  doc.circle(cx, cy - 6.2, 1.6, 'S');
}

function iconWallet(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.roundedRect(cx - 7, cy - 5, 14, 10, 1.5, 1.5, 'S');
  doc.setFillColor(...color);
  doc.circle(cx + 3.2, cy, 1.3, 'F');
}

function iconReceipt(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  doc.rect(cx - 5, cy - 6.5, 10, 13, 'S');
  [-3.2, -0.4, 2.4].forEach(dy => doc.line(cx - 3, cy + dy, cx + 3, cy + dy));
}

function iconInfo(doc: jsPDF, cx: number, cy: number, color: RGB, bg: RGB) {
  doc.setFillColor(...bg);
  doc.circle(cx, cy, 7, 'F');
  doc.setFillColor(...color);
  doc.circle(cx, cy - 3, 0.9, 'F');
  doc.setDrawColor(...color);
  doc.setLineWidth(1.1);
  doc.line(cx, cy - 0.5, cx, cy + 3.5);
}

function iconHeart(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setFillColor(...color);
  doc.circle(cx - 2.2, cy - 1.4, 2.4, 'F');
  doc.circle(cx + 2.2, cy - 1.4, 2.4, 'F');
  doc.triangle(cx - 4.2, cy - 0.6, cx + 4.2, cy - 0.6, cx, cy + 4.4, 'F');
}

function iconInstagram(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.roundedRect(cx - 6, cy - 6, 12, 12, 3, 3, 'S');
  doc.circle(cx, cy, 3, 'S');
  doc.setFillColor(...color);
  doc.circle(cx + 3.6, cy - 3.6, 0.7, 'F');
}

function iconWhatsapp(doc: jsPDF, cx: number, cy: number, color: RGB) {
  doc.setFillColor(...color);
  doc.circle(cx, cy - 0.5, 6, 'F');
  doc.setFillColor(...COLORS.white);
  doc.circle(cx, cy - 0.5, 4.2, 'F');
  doc.setFillColor(...color);
  doc.circle(cx - 1.2, cy - 1.5, 1, 'F');
  doc.circle(cx + 1.2, cy - 1.5, 1, 'F');
  doc.triangle(cx + 3.6, cy + 4.4, cx + 3.6, cy + 7.2, cx + 1, cy + 5.2, 'F');
}

function iconWorld(doc: jsPDF, cx: number, cy: number, color: RGB) {
  iconGlobe(doc, cx, cy, color);
}

function drawPalmTree(doc: jsPDF, cx: number, baseY: number, color: RGB) {
  doc.setDrawColor(...color);
  doc.setLineWidth(2.2);
  doc.lines([[-3, -14], [3, -18]], cx, baseY, [1, 1], 'S');
  const topX = cx, topY = baseY - 32;
  const leaves: [number, number][] = [
    [-16, -4], [-13, -12], [-4, -16], [6, -15], [15, -9], [17, -1],
  ];
  leaves.forEach(([dx, dy]) => {
    doc.setLineWidth(1.4);
    doc.line(topX, topY, topX + dx, topY + dy);
  });
}

/** Builds the invoice jsPDF document (not yet saved/downloaded) so callers
 *  can either .save() it directly or pull an output Blob for sharing. */
export async function buildInvoicePdf(enquiry: Enquiry, payments: Payment[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });
  doc.setFillColor(...COLORS.white);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // ---------------------------------------------------------------------
  // Header: logo block on the left, brand contact rows in the middle,
  // "BOOKING INVOICE" title + dark Booking-ID pill + date on the right.
  // ---------------------------------------------------------------------
  const logo = await loadLogo();
  const logoH = 96;
  let logoW = logoH;
  let midX = MARGIN + 130;
  if (logo) {
    logoW = logoH * logo.ratio;
    doc.addImage(logo.dataUrl, 'JPEG', MARGIN, MARGIN - 6, logoW, logoH);
    midX = MARGIN + logoW + 18;
  } else {
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.text(BRAND.name, MARGIN, MARGIN + 40);
  }

  const rightX = PAGE_W - MARGIN;
  const midW = rightX - 190 - midX;

  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Girls-Only', midX, MARGIN + 8);
  doc.text('Travel Community', midX, MARGIN + 24);

  let contactY = MARGIN + 46;
  const contactRows: [((d: jsPDF, x: number, y: number, c: RGB) => void), string][] = [
    [iconWorld, BRAND.website],
    [iconMail, BRAND.email],
    [iconPhone, BRAND.phone],
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  contactRows.forEach(([drawIcon, label]) => {
    drawIcon(doc, midX + 5, contactY - 3, COLORS.primary);
    doc.setTextColor(...COLORS.darkMuted);
    doc.text(sanitizeForPdf(label), midX + 16, contactY, midW > 0 ? { maxWidth: midW } : undefined);
    contactY += 16;
  });

  // Title + decorative rule
  doc.setTextColor(...COLORS.primary);
  doc.setFont('times', 'bold');
  doc.setFontSize(21);
  doc.text('BOOKING INVOICE', rightX, MARGIN + 14, { align: 'right' });
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(1);
  doc.line(rightX - 150, MARGIN + 24, rightX - 8, MARGIN + 24);
  doc.setFillColor(...COLORS.primary);
  doc.circle(rightX - 79, MARGIN + 24, 1.6, 'F');

  // Booking-ID pill
  const pillW = 178;
  const pillH = 34;
  const pillX = rightX - pillW;
  const pillY = MARGIN + 34;
  doc.setFillColor(...COLORS.badgeDark);
  doc.roundedRect(pillX, pillY, pillW, pillH, 8, 8, 'F');
  doc.setTextColor(...COLORS.peachTint);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('BOOKING ID', pillX + 14, pillY + 13);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(enquiry.booking_id || '—', pillX + 14, pillY + 27);

  // Invoice date, with a small calendar icon
  const dateY = pillY + pillH + 20;
  iconCalendar(doc, rightX - 150, dateY - 3, COLORS.primary);
  doc.setTextColor(...COLORS.darkMuted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Invoice Date: ${formatDate(new Date().toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}`,
    rightX - 140,
    dateY,
  );

  let y = MARGIN + logoH + 24;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y, rightX, y);
  y += 26;

  // ---------------------------------------------------------------------
  // Traveller + trip details — two columns inside a soft cream panel,
  // each headed by a small dark pill label.
  // ---------------------------------------------------------------------
  const colGap = 28;
  const colW = (CONTENT_W - colGap) / 2;
  const leftColX = MARGIN + 16;
  const rightColX = MARGIN + colW + colGap + 16;

  const rowCount = enquiry.group_size && enquiry.group_size > 1 ? 4 : 3;
  const panelH = 40 + rowCount * 34 + 10;
  doc.setFillColor(...COLORS.backgroundWarm);
  doc.roundedRect(MARGIN, y, CONTENT_W, panelH, 8, 8, 'F');
  doc.setDrawColor(...COLORS.grayLine);
  doc.setLineWidth(0.8);
  doc.line(MARGIN + colW + colGap / 2 + 16, y + 20, MARGIN + colW + colGap / 2 + 16, y + panelH - 16);

  const drawPill = (x: number, label: string) => {
    const w = doc.getTextWidth(label) + 20;
    doc.setFillColor(...COLORS.badgeDark);
    doc.roundedRect(x, y + 14, w, 20, 5, 5, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(label, x + 10, y + 27.5);
  };
  drawPill(leftColX, 'TRAVELLER DETAILS');
  drawPill(rightColX, 'TRIP DETAILS');

  let fieldY = y + 56;
  const drawField = (x: number, label: string, value: string) => {
    doc.setTextColor(...COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, x, fieldY);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(sanitizeForPdf(value) || '—', x, fieldY + 15);
  };

  drawField(leftColX, 'Traveller Name', enquiry.full_name);
  drawField(rightColX, 'Trip', enquiry.trip_title || '—');
  fieldY += 34;
  drawField(leftColX, 'Phone', enquiry.phone);
  drawField(rightColX, 'Departure Date', enquiry.departure_date ? formatDate(enquiry.departure_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  fieldY += 34;
  drawField(leftColX, 'Email', enquiry.email);
  drawField(rightColX, 'Package', enquiry.package_type === 'early_bird' ? 'Early Bird' : 'Normal');
  fieldY += 34;
  if (rowCount === 4) {
    drawField(leftColX, 'Group Booking', `Seat ${enquiry.group_seq} of ${enquiry.group_size}`);
    drawField(rightColX, 'City', enquiry.city || '—');
  }

  y += panelH + 26;

  // ---------------------------------------------------------------------
  // Price summary card — 3 icon "stat" columns separated by thin rules.
  // ---------------------------------------------------------------------
  const total = enquiry.total_amount || 0;
  const paid = enquiry.amount_paid || 0;
  const balance = Math.max(0, total - paid);
  const cardH = 78;

  doc.setDrawColor(...COLORS.grayLine);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 8, 8, 'S');

  const cardColW = CONTENT_W / 3;
  const summaryRows: { label: string; value: string; color: RGB; tint: RGB; icon: (d: jsPDF, x: number, y: number, c: RGB) => void }[] = [
    { label: 'TOTAL AMOUNT', value: money(total), color: COLORS.dark, tint: COLORS.peachTint, icon: iconMoneyBag },
    { label: 'AMOUNT PAID', value: money(paid), color: COLORS.green, tint: COLORS.greenTint, icon: iconWallet },
    { label: 'BALANCE DUE', value: money(balance), color: balance > 0 ? COLORS.red : COLORS.green, tint: balance > 0 ? COLORS.redTint : COLORS.greenTint, icon: iconReceipt },
  ];
  summaryRows.forEach((row, i) => {
    const colX = MARGIN + i * cardColW;
    if (i > 0) {
      doc.setDrawColor(...COLORS.grayLine);
      doc.line(colX, y + 14, colX, y + cardH - 14);
    }
    const iconCx = colX + 30;
    const iconCy = y + cardH / 2;
    iconBubble(doc, iconCx, iconCy, 15, row.tint);
    row.icon(doc, iconCx, iconCy, row.color);
    const textX = colX + 54;
    doc.setTextColor(...COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(row.label, textX, y + cardH / 2 - 8);
    doc.setTextColor(...row.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(row.value, textX, y + cardH / 2 + 12);
  });
  y += cardH + 26;

  // ---------------------------------------------------------------------
  // Payment history table
  // ---------------------------------------------------------------------
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PAYMENT HISTORY', MARGIN, y);
  y += 16;

  const cols = [
    { label: 'DATE', w: 0.24 },
    { label: 'TYPE', w: 0.3 },
    { label: 'METHOD', w: 0.23 },
    { label: 'AMOUNT', w: 0.23 },
  ];
  let x = MARGIN;
  doc.setFillColor(...COLORS.badgeDark);
  doc.rect(MARGIN, y, CONTENT_W, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  cols.forEach(c => {
    const w = CONTENT_W * c.w;
    doc.text(c.label, c.label === 'AMOUNT' ? x + w - 10 : x + 10, y + 16, c.label === 'AMOUNT' ? { align: 'right' } : undefined);
    x += w;
  });
  y += 24;

  if (payments.length === 0) {
    doc.setFillColor(...COLORS.cream);
    doc.rect(MARGIN, y, CONTENT_W, 24, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.darkMuted);
    doc.text('No payments recorded yet.', MARGIN + 10, y + 16);
    y += 24;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    payments.forEach((p, i) => {
      if (y > PAGE_H - 180) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setFillColor(...(i % 2 === 1 ? COLORS.cream : COLORS.white));
      doc.rect(MARGIN, y, CONTENT_W, 24, 'F');
      x = MARGIN;
      const isRefund = p.payment_type === 'refund';
      doc.setTextColor(...COLORS.dark);
      doc.text(formatDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' }), x + 10, y + 16);
      x += CONTENT_W * cols[0].w;
      doc.text(PAYMENT_TYPE_LABEL[p.payment_type] || p.payment_type, x + 10, y + 16);
      x += CONTENT_W * cols[1].w;
      doc.text(sanitizeForPdf(p.payment_method || '—'), x + 10, y + 16);
      x += CONTENT_W * cols[2].w;
      doc.setTextColor(...(isRefund ? COLORS.red : COLORS.green));
      doc.text(`${isRefund ? '- ' : ''}${money(Math.abs(p.amount))}`, x + CONTENT_W * cols[3].w - 10, y + 16, { align: 'right' });
      y += 24;
    });
  }
  y += 24;

  // ---------------------------------------------------------------------
  // Note strip — info icon + policy note on the left, "Thank you!" + a
  // small heart icon on the right.
  // ---------------------------------------------------------------------
  const noteH = 46;
  if (y + noteH > PAGE_H - 130) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFillColor(...COLORS.cream);
  doc.roundedRect(MARGIN, y, CONTENT_W, noteH, 8, 8, 'F');
  iconInfo(doc, MARGIN + 22, y + noteH / 2, COLORS.primary, COLORS.peachTint);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.darkMuted);
  const note = 'This invoice reflects amounts recorded for this booking only. Cancellation and refund amounts, if any, are governed by ULAA\'s Terms & Cancellation Policy shared at the time of booking.';
  const noteLines = doc.splitTextToSize(note, CONTENT_W - 250);
  doc.text(noteLines, MARGIN + 42, y + noteH / 2 - (noteLines.length > 1 ? 10 : 4));

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(15);
  doc.setTextColor(...COLORS.primary);
  doc.text('Thank you!', rightX - 46, y + noteH / 2 + 4, { align: 'right' });
  iconHeart(doc, rightX - 20, y + noteH / 2, COLORS.primary);

  y += noteH + 30;

  // ---------------------------------------------------------------------
  // Curved brand footer — community line + socials + a small palm silhouette.
  // Drawn tall enough to hang past the page edge so its bottom corners'
  // rounding never peeks out below the page.
  // ---------------------------------------------------------------------
  const footerH = 88;
  const footerY = PAGE_H - footerH;
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(MARGIN === 0 ? 0 : 0, footerY, PAGE_W, footerH + 24, 18, 18, 'F');
  doc.setFillColor(...COLORS.primaryDark);
  doc.rect(0, footerY + footerH - 10, PAGE_W, 34, 'F');

  iconPin(doc, MARGIN + 12, footerY + 30, COLORS.white);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ULAA TRAVEL COMMUNITY', MARGIN + 26, footerY + 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.peachTint);
  doc.text('Empowering women to explore, together.', MARGIN + 26, footerY + 42);

  doc.setDrawColor(...COLORS.peachTint);
  doc.setLineWidth(0.7);
  doc.line(rightX - 175, footerY + 12, rightX - 175, footerY + 48);

  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('FOLLOW US', rightX - 150, footerY + 26);
  const socialY = footerY + 40;
  const socials: [((d: jsPDF, x: number, y: number, c: RGB) => void)][] = [[iconInstagram], [iconWhatsapp], [iconWorld]];
  socials.forEach(([drawIcon], i) => {
    const scx = rightX - 150 + i * 26;
    doc.setFillColor(...COLORS.white);
    doc.circle(scx, socialY, 9, 'F');
    drawIcon(doc, scx, socialY, COLORS.primary);
  });

  drawPalmTree(doc, rightX - 24, footerY + footerH + 4, COLORS.primaryDark);

  return doc;
}

/** Filename shared by both the download and share paths, so a saved file
 *  and a shared file always carry the same name. */
export function invoiceFileName(enquiry: Enquiry): string {
  const ref = (enquiry.booking_id || enquiry.id).replace(/[^a-zA-Z0-9-]/g, '');
  return `ULAA-Invoice-${ref}.pdf`;
}

export async function downloadInvoicePdf(enquiry: Enquiry, payments: Payment[]): Promise<void> {
  const doc = await buildInvoicePdf(enquiry, payments);
  doc.save(invoiceFileName(enquiry));
}

/** Returns the invoice as a File, for use with the Web Share API
 *  (navigator.share) — lets a caller offer "Share to WhatsApp" on devices
 *  that support sharing files, with a text-only wa.me fallback elsewhere. */
export async function invoiceAsFile(enquiry: Enquiry, payments: Payment[]): Promise<File> {
  const doc = await buildInvoicePdf(enquiry, payments);
  const blob = doc.output('blob');
  return new File([blob], invoiceFileName(enquiry), { type: 'application/pdf' });
}
