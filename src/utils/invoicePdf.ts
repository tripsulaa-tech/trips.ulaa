import { jsPDF } from 'jspdf';
import type { Enquiry, Payment } from '../types/types-index';
import { formatPrice, formatDate } from './utils-index';

// =============================================================================
// Invoice generation — drawn as a real, native vector PDF (jsPDF text/shape
// primitives), the same approach src/utils/tripItineraryPdf.ts uses for the
// itinerary download. This replaces the old pipeline (build an HTML string
// in src/lib/invoice/invoiceTemplate.ts → rasterize it with html2canvas →
// paste the screenshot into a PDF page as one big image), which had four
// real, structural problems no amount of tuning could fix:
//   - Text was a raster image, not real PDF text — soft/blurry at normal
//     zoom, and not selectable, searchable, or copyable (a customer
//     couldn't copy their booking ID or amount out of it).
//   - File size: a full-page screenshot PNG is much heavier than vector
//     text plus a handful of small shapes.
//   - Long payment histories were paginated by slicing one tall image at a
//     fixed pixel offset, with no idea where a table row's boundary was —
//     a row could get cut in half exactly at the page break.
//   - html2canvas has known CSS-rendering quirks (flexbox gap, border-
//     radius + table clipping) that the old template had to work around
//     rather than avoid.
//
// Everything here is drawn directly with jsPDF, so the invoice always
// starts sharp, is real selectable/searchable text, stays small, and
// paginates on exact row boundaries (see checkPageBreak below) — the
// payment table can never be sliced mid-row.
//
// Flow:
//   buildInvoicePdfDoc()   → returns the assembled jsPDF document
//   downloadInvoicePdf()   → builds it and triggers a direct browser
//                            download (no print dialog, no "Save as PDF")
//   invoiceAsFile()        → returns the same PDF as a File, for the Web
//                            Share API
// =============================================================================

type RGB = readonly [number, number, number];

// Kept in sync with the @theme block in src/styles/globals.css and the same
// palette src/utils/tripItineraryPdf.ts uses, so the invoice and the
// itinerary PDF read as the same document family.
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
  green: [45, 140, 90] as RGB,
  greenBg: [227, 240, 231] as RGB,
  red: [190, 70, 65] as RGB,
  redBg: [247, 227, 224] as RGB,
  amberBg: [251, 238, 216] as RGB,
  grayLine: [222, 211, 199] as RGB,
  grayLineSoft: [232, 224, 213] as RGB,
} as const;

const BRAND = {
  name: 'ULAA',
  tagline: 'GIRLS-ONLY TRAVEL COMMUNITY',
  website: 'www.ulaatrips.com',
  instagram: '@ulaa.trips',
  email: 'trips.ulaa@gmail.com',
  phone: '+91 63813 36772',
  bottomTagline: 'Empowering women to explore, together.',
};

const PAYMENT_TYPE_LABEL: Record<Payment['payment_type'], string> = {
  booking_amount: 'Booking amount',
  installment: 'Installment',
  balance: 'Balance payment',
  refund: 'Refund',
  full_payment: 'Full Payment',
  advance: 'Advance',
  extra_charge: 'Extra Charge',
};

// A4 in points (72pt/in) — same unit convention as tripItineraryPdf.ts.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_RESERVE = 34; // room left at the bottom of every page for the page-number badge

/** Filename used for both downloaded and shared files. */
export function invoiceFileName(enquiry: Enquiry): string {
  const ref = (enquiry.booking_id || enquiry.id).replace(/[^a-zA-Z0-9-]/g, '');
  return `ULAA-Invoice-${ref}.pdf`;
}

/** Same rationale as tripItineraryPdf.ts's sanitizeForPdf: the ₹ glyph
 *  isn't in the core PDF font's charset (renders as a stray mis-measured
 *  character, which throws off layout math based on its width), and
 *  emoji/pictographs aren't either. Every piece of enquiry-authored text
 *  passes through this before being measured or drawn. */
function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\u{FE0F}/gu, '')
    .replace(/\u200D/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function val(text: string | null | undefined): string {
  const s = sanitizeForPdf(text);
  return s || '\u2014'; // em dash for empty fields, matching the old template
}

function money(amount: number): string {
  return sanitizeForPdf(formatPrice(amount || 0));
}

function fdate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

// -----------------------------------------------------------------------
// Logo loading — best-effort, never throws. A slow network or a missing
// file should never break invoice generation; the layout just falls back
// to the wordmark text.
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

/**
 * Builds the invoice as a native jsPDF document — every field pulled
 * straight from `enquiry`/`payments`, so it always reflects exactly what's
 * on record. Returns the assembled doc; downloadInvoicePdf() and
 * invoiceAsFile() both just call this and then export it differently.
 */
export async function buildInvoicePdfDoc(enquiry: Enquiry, payments: Payment[]): Promise<jsPDF> {
  const logo = await loadLogo();

  const total = enquiry.total_amount || 0;
  const paid = enquiry.amount_paid || 0;
  const balance = Math.max(0, total - paid);
  const invoiceDate = fdate(new Date().toISOString());
  const packageLabel = enquiry.package_type === 'early_bird' ? 'Early Bird' : 'Normal';

  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  let cy = 0; // current draw cursor, reset by each page's chrome

  // ---------------------------------------------------------------------
  // Page chrome: thin brand top bar on every page, plus (from page 2 on) a
  // compact "continued" header so a reader who lands on page 2 of a long
  // payment history still knows what document/booking this is.
  // ---------------------------------------------------------------------
  function drawPageTop(continuation: boolean): number {
    setFill(COLORS.primary);
    doc.rect(0, 0, PAGE_W, 4, 'F');

    if (!continuation) return MARGIN;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setText(COLORS.dark);
    doc.text('ULAA \u2014 Booking Invoice', MARGIN, MARGIN);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(COLORS.darkMuted);
    doc.text(`Booking ID: ${val(enquiry.booking_id)} (continued)`, PAGE_W - MARGIN, MARGIN, { align: 'right' });
    setDraw(COLORS.grayLine);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, MARGIN + 12, PAGE_W - MARGIN, MARGIN + 12);
    return MARGIN + 30;
  }

  function newPage() {
    doc.addPage([PAGE_W, PAGE_H], 'portrait');
    cy = drawPageTop(true);
  }

  /** Starts a new page if the next block of height `h` wouldn't fit above
   *  the footer reserve. Every multi-row section (the payment table, most
   *  importantly) checks this per-row, so a page break only ever falls
   *  cleanly between rows — never mid-row, which was the old raster
   *  pipeline's exact failure mode. */
  function checkPageBreak(h: number) {
    if (cy + h > PAGE_H - FOOTER_RESERVE) newPage();
  }

  cy = drawPageTop(false);

  // ---------------------------------------------------------------------
  // Header — logo/tagline/contact on the left, invoice title/booking ID/
  // date on the right.
  // ---------------------------------------------------------------------
  const headerTop = cy;
  const logoBoxW = 132;
  const logoBoxH = 42;
  if (logo) {
    const drawH = Math.min(logoBoxH, logoBoxW / logo.ratio);
    const drawW = drawH * logo.ratio;
    const format = logo.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(logo.dataUrl, format, MARGIN, headerTop, drawW, drawH);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    setText(COLORS.primary);
    doc.text(BRAND.name, MARGIN, headerTop + 24);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setText(COLORS.darkMuted);
  doc.text(BRAND.tagline, MARGIN, headerTop + logoBoxH + 12);

  let contactY = headerTop + logoBoxH + 28;
  [BRAND.website, BRAND.email, BRAND.phone].forEach((line) => {
    setFill(COLORS.secondary);
    doc.circle(MARGIN + 2.2, contactY - 3, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(COLORS.darkMuted);
    doc.text(line, MARGIN + 10, contactY);
    contactY += 13;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  setText(COLORS.dark);
  doc.text('BOOKING INVOICE', PAGE_W - MARGIN, headerTop + 16, { align: 'right' });

  setDraw(COLORS.gold);
  doc.setLineWidth(1);
  doc.line(PAGE_W - MARGIN - 150, headerTop + 26, PAGE_W - MARGIN, headerTop + 26);
  setFill(COLORS.gold);
  doc.circle(PAGE_W - MARGIN - 75, headerTop + 26, 2.4, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(COLORS.darkMuted);
  doc.text('BOOKING ID', PAGE_W - MARGIN, headerTop + 42, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const bookingIdText = val(enquiry.booking_id);
  const bidW = doc.getTextWidth(bookingIdText) + 20;
  setFill(COLORS.backgroundWarm);
  doc.roundedRect(PAGE_W - MARGIN - bidW, headerTop + 48, bidW, 20, 4, 4, 'F');
  setText(COLORS.primaryDark);
  doc.text(bookingIdText, PAGE_W - MARGIN - bidW / 2, headerTop + 62, { align: 'center' });

  setFill(COLORS.secondary);
  doc.circle(PAGE_W - MARGIN - bidW - 84, headerTop + 82, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(COLORS.darkMuted);
  doc.text(`Invoice Date: ${invoiceDate}`, PAGE_W - MARGIN, headerTop + 86, { align: 'right' });

  cy = headerTop + 110;
  setDraw(COLORS.grayLine);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, cy, PAGE_W - MARGIN, cy);
  cy += 26;

  // ---------------------------------------------------------------------
  // Two-column details: Traveller Details / Trip Details.
  // ---------------------------------------------------------------------
  function drawPill(text: string, x: number, y: number) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const w = doc.getTextWidth(text) + 20;
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(x, y, w, 18, 9, 9, 'F');
    setText(COLORS.primaryDark);
    doc.text(text, x + w / 2, y + 12.5, { align: 'center' });
  }

  function drawField(label: string, value: string, x: number, y: number, w: number): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(COLORS.darkMuted);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setText(COLORS.dark);
    const lines = doc.splitTextToSize(value, w);
    doc.text(lines, x, y + 14);
    return y + 14 + lines.length * 13 + 10;
  }

  const colW = (CONTENT_W - 30) / 2;
  const col2X = MARGIN + colW + 30;

  drawPill('TRAVELLER DETAILS', MARGIN, cy);
  drawPill('TRIP DETAILS', col2X, cy);
  let leftY = cy + 34;
  let rightY = cy + 34;

  leftY = drawField('Traveller Name', val(enquiry.full_name), MARGIN, leftY, colW);
  leftY = drawField('Phone', val(enquiry.phone), MARGIN, leftY, colW);
  leftY = drawField('Email', val(enquiry.email), MARGIN, leftY, colW);
  if (enquiry.group_size && enquiry.group_size > 1) {
    leftY = drawField('Group Booking', `Seat ${enquiry.group_seq} of ${enquiry.group_size}`, MARGIN, leftY, colW);
  }

  rightY = drawField('Trip', val(enquiry.trip_title), col2X, rightY, colW);
  rightY = drawField('Departure Date', fdate(enquiry.departure_date), col2X, rightY, colW);
  rightY = drawField('Package', packageLabel, col2X, rightY, colW);
  rightY = drawField('City', val(enquiry.city), col2X, rightY, colW);

  cy = Math.max(leftY, rightY) + 4;

  // ---------------------------------------------------------------------
  // Price summary — three cards: Total / Paid / Balance Due.
  // ---------------------------------------------------------------------
  const cardGap = 14;
  const cardW = (CONTENT_W - cardGap * 2) / 3;
  const cardH = 62;

  function drawIconCircle(cx: number, cy0: number, bg: RGB, fg: RGB, kind: 'wallet' | 'card' | 'receipt') {
    setFill(bg);
    doc.circle(cx, cy0, 15, 'F');
    setDraw(fg);
    doc.setLineWidth(1.4);
    if (kind === 'wallet') {
      doc.roundedRect(cx - 7, cy0 - 5, 14, 10, 1.5, 1.5, 'S');
      doc.line(cx + 2, cy0, cx + 7, cy0);
    } else if (kind === 'card') {
      doc.roundedRect(cx - 7, cy0 - 5, 14, 10, 1.5, 1.5, 'S');
      doc.line(cx - 7, cy0 - 1.5, cx + 7, cy0 - 1.5);
    } else {
      doc.line(cx - 5, cy0 - 6, cx - 5, cy0 + 6);
      doc.line(cx + 5, cy0 - 6, cx + 5, cy0 + 6);
      doc.line(cx - 5, cy0 - 6, cx + 5, cy0 - 6);
      doc.line(cx - 5, cy0 + 6, cx + 5, cy0 + 6);
      doc.line(cx - 2.5, cy0 - 2, cx + 2.5, cy0 - 2);
      doc.line(cx - 2.5, cy0 + 2, cx + 2.5, cy0 + 2);
    }
  }

  function drawPriceCard(x: number, label: string, amount: string, color: RGB, iconBg: RGB, kind: 'wallet' | 'card' | 'receipt') {
    setFill(COLORS.cream);
    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, cy, cardW, cardH, 8, 8, 'FD');
    drawIconCircle(x + 28, cy + cardH / 2, iconBg, color, kind);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(COLORS.darkMuted);
    doc.text(label.toUpperCase(), x + 50, cy + cardH / 2 - 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setText(color);
    doc.text(amount, x + 50, cy + cardH / 2 + 12);
  }

  drawPriceCard(MARGIN, 'Total Amount', money(total), COLORS.dark, COLORS.backgroundWarm, 'wallet');
  drawPriceCard(MARGIN + cardW + cardGap, 'Amount Paid', money(paid), COLORS.green, COLORS.greenBg, 'card');
  drawPriceCard(
    MARGIN + (cardW + cardGap) * 2,
    'Balance Due',
    money(balance),
    balance > 0 ? COLORS.red : COLORS.green,
    balance > 0 ? COLORS.redBg : COLORS.greenBg,
    'receipt'
  );

  cy += cardH + 30;

  // ---------------------------------------------------------------------
  // Payment history table.
  // ---------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(COLORS.dark);
  doc.text('PAYMENT HISTORY', MARGIN, cy);
  setDraw(COLORS.grayLine);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, cy + 6, PAGE_W - MARGIN, cy + 6);
  cy += 24;

  const colInvoice = MARGIN;
  const colDate = MARGIN + 95;
  const colType = MARGIN + 165;
  const colMethod = MARGIN + 260;
  const colAmountRight = MARGIN + CONTENT_W - 80;
  const colStatus = MARGIN + CONTENT_W - 70;

  function drawTableHeader() {
    setFill(COLORS.primaryDark);
    doc.roundedRect(MARGIN, cy, CONTENT_W, 24, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setText(COLORS.white);
    doc.text('INVOICE #', colInvoice + 8, cy + 15.5);
    doc.text('DATE', colDate, cy + 15.5);
    doc.text('TYPE', colType, cy + 15.5);
    doc.text('METHOD', colMethod, cy + 15.5);
    doc.text('AMOUNT', colAmountRight, cy + 15.5, { align: 'right' });
    doc.text('STATUS', colStatus + 32, cy + 15.5, { align: 'center' });
    cy += 24;
  }

  drawTableHeader();

  if (payments.length === 0) {
    checkPageBreak(30);
    setFill(COLORS.cream);
    doc.rect(MARGIN, cy, CONTENT_W, 30, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    setText(COLORS.darkMuted);
    doc.text('No payments recorded yet.', PAGE_W / 2, cy + 19, { align: 'center' });
    cy += 30;
  } else {
    payments.forEach((p, i) => {
      const hasUtr = !!p.utr_number;
      const rowH = hasUtr ? 34 : 24;

      // If a break happens here, redraw the table header on the new page
      // so a reader who lands mid-table on page 2 still sees column
      // labels — the break itself always falls on a row boundary.
      if (cy + rowH > PAGE_H - FOOTER_RESERVE) {
        newPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setText(COLORS.dark);
        doc.text('PAYMENT HISTORY (continued)', MARGIN, cy);
        cy += 18;
        drawTableHeader();
      }

      const isRefund = p.payment_type === 'refund';
      const isPending = p.status === 'pending';

      if (i % 2 === 0) {
        setFill(COLORS.cream);
        doc.rect(MARGIN, cy, CONTENT_W, rowH, 'F');
      }

      const textY = cy + (hasUtr ? 15 : 15.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setText(COLORS.dark);
      doc.text(val(p.invoice_number), colInvoice + 8, textY);
      doc.text(fdate(p.paid_at), colDate, textY);
      doc.text(PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type, colType, textY);

      const methodLines = doc.splitTextToSize(val(p.payment_method), 78);
      doc.text(methodLines[0], colMethod, textY);
      if (hasUtr) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setText(COLORS.darkMuted);
        doc.text(`UTR: ${sanitizeForPdf(p.utr_number)}`, colMethod, textY + 11);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      setText(isRefund ? COLORS.red : COLORS.green);
      doc.text(`${isRefund ? '\u2212 ' : ''}${money(Math.abs(p.amount))}`, colAmountRight, textY, { align: 'right' });

      const badgeText = isPending ? 'Pending' : 'Paid';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const badgeW = doc.getTextWidth(badgeText) + 14;
      const badgeX = colStatus + 32 - badgeW / 2;
      setFill(isPending ? COLORS.amberBg : COLORS.greenBg);
      doc.roundedRect(badgeX, cy + rowH / 2 - 8, badgeW, 16, 8, 8, 'F');
      setText(isPending ? COLORS.primaryDark : COLORS.green);
      doc.text(badgeText, colStatus + 32, cy + rowH / 2 + 3, { align: 'center' });

      cy += rowH;
    });
  }

  setDraw(COLORS.grayLineSoft);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, cy, PAGE_W - MARGIN, cy);
  cy += 26;

  // ---------------------------------------------------------------------
  // Footer note + thank-you + bottom brand bar — flows after the table
  // (not pinned to the physical page bottom), so a long payment history
  // never overlaps it.
  // ---------------------------------------------------------------------
  checkPageBreak(70);
  const noteText =
    "This invoice reflects amounts recorded for this booking only. Cancellation and refund amounts, if any, are governed by ULAA's Terms & Cancellation Policy shared at the time of booking.";
  setFill(COLORS.gold);
  doc.circle(MARGIN + 5, cy, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(COLORS.white);
  doc.text('i', MARGIN + 5, cy + 2.6, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  setText(COLORS.darkMuted);
  const noteLines = doc.splitTextToSize(noteText, CONTENT_W - 20);
  doc.text(noteLines, MARGIN + 16, cy + 3);
  cy += noteLines.length * 11 + 20;

  checkPageBreak(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(COLORS.primary);
  doc.text('Thank you! \u2665', PAGE_W / 2, cy, { align: 'center' });
  cy += 26;

  checkPageBreak(40);
  setFill(COLORS.backgroundWarm);
  doc.rect(MARGIN, cy, CONTENT_W, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(COLORS.primaryDark);
  doc.text(BRAND.name, MARGIN + 14, cy + 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(COLORS.darkMuted);
  doc.text(BRAND.bottomTagline, MARGIN + 14 + doc.getTextWidth(BRAND.name) + 14, cy + 21);
  doc.text(`Follow us \u2014 Instagram ${BRAND.instagram}  \u2022  WhatsApp  \u2022  ${BRAND.website}`, PAGE_W - MARGIN - 14, cy + 21, {
    align: 'right',
  });

  // ---------------------------------------------------------------------
  // Page-number badge on every page, added last so the final total is
  // known no matter how many pages the payment history needed.
  // ---------------------------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const label = `Page ${p} of ${pageCount}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const w = doc.getTextWidth(label) + 16;
    setFill(COLORS.dark);
    doc.roundedRect(PAGE_W - MARGIN - w, PAGE_H - 26, w, 16, 8, 8, 'F');
    setText(COLORS.white);
    doc.text(label, PAGE_W - MARGIN - w / 2, PAGE_H - 15, { align: 'center' });
  }

  return doc;
}

/**
 * Generates the invoice PDF and triggers an immediate, direct browser
 * download — no print dialog, no manual "Save as PDF" step required.
 */
export async function downloadInvoicePdf(enquiry: Enquiry, payments: Payment[]): Promise<void> {
  const doc = await buildInvoicePdfDoc(enquiry, payments);
  doc.save(invoiceFileName(enquiry));
}

/**
 * Returns the invoice as a real application/pdf File, suitable for the Web
 * Share API (navigator.canShare({ files })) as well as any other file input.
 */
export async function invoiceAsFile(enquiry: Enquiry, payments: Payment[]): Promise<File> {
  const doc = await buildInvoicePdfDoc(enquiry, payments);
  const blob = doc.output('blob');
  return new File([blob], invoiceFileName(enquiry), { type: 'application/pdf' });
}
