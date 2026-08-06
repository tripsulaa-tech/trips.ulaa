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
// Same ₹-glyph problem as tripItineraryPdf.ts (the core PDF fonts don't
// have the ₹ codepoint, which breaks jsPDF's text-width measurement) — see
// money() below, same fix (render "Rs." instead).
// =============================================================================

type RGB = readonly [number, number, number];

const COLORS = {
  primary: [168, 90, 42] as RGB,
  primaryDark: [139, 72, 32] as RGB,
  dark: [45, 33, 24] as RGB,
  darkMuted: [74, 55, 40] as RGB,
  backgroundWarm: [242, 235, 224] as RGB,
  cream: [250, 247, 242] as RGB,
  white: [255, 255, 255] as RGB,
  green: [45, 140, 90] as RGB,
  red: [190, 70, 65] as RGB,
  grayLine: [222, 211, 199] as RGB,
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

/** Builds the invoice jsPDF document (not yet saved/downloaded) so callers
 *  can either .save() it directly or pull an output Blob for sharing. */
export async function buildInvoicePdf(enquiry: Enquiry, payments: Payment[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });
  let y = MARGIN;

  // Header band
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_W, 96, 'F');
  doc.setTextColor(...COLORS.white);

  const logo = await loadLogo();
  if (logo) {
    // Fit within a 32pt-tall box, preserving aspect ratio (same "contain"
    // math as tripItineraryPdf.ts's footer logo).
    const logoH = 32;
    const logoW = logoH * logo.ratio;
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, 24, logoW, logoH);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(BRAND.name, MARGIN, 46);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(BRAND.tagline, MARGIN, 64);
  doc.text(`${BRAND.website}  |  ${BRAND.email}  |  ${BRAND.phone}`, MARGIN, 80);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BOOKING INVOICE', PAGE_W - MARGIN, 46, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Booking ID: ${enquiry.booking_id || '—'}`, PAGE_W - MARGIN, 64, { align: 'right' });
  doc.text(`Invoice date: ${formatDate(new Date().toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}`, PAGE_W - MARGIN, 80, { align: 'right' });

  y = 96 + 36;

  // Traveller + trip details, two columns
  const colW = (CONTENT_W - 24) / 2;
  const drawField = (x: number, label: string, value: string) => {
    doc.setTextColor(...COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), x, y);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(sanitizeForPdf(value) || '—', x, y + 15);
  };

  drawField(MARGIN, 'Traveller name', enquiry.full_name);
  drawField(MARGIN + colW + 24, 'Trip', enquiry.trip_title || '—');
  y += 34;
  drawField(MARGIN, 'Phone', enquiry.phone);
  drawField(MARGIN + colW + 24, 'Departure date', enquiry.departure_date ? formatDate(enquiry.departure_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  y += 34;
  drawField(MARGIN, 'Email', enquiry.email);
  drawField(MARGIN + colW + 24, 'Package', enquiry.package_type === 'early_bird' ? 'Early Bird' : 'Normal');
  y += 34;

  if (enquiry.group_size && enquiry.group_size > 1) {
    drawField(MARGIN, 'Group booking', `Seat ${enquiry.group_seq} of ${enquiry.group_size}`);
    drawField(MARGIN + colW + 24, 'City', enquiry.city || '—');
    y += 34;
  }

  y += 8;
  doc.setDrawColor(...COLORS.grayLine);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 28;

  // Price summary card
  const total = enquiry.total_amount || 0;
  const paid = enquiry.amount_paid || 0;
  const balance = Math.max(0, total - paid);

  doc.setFillColor(...COLORS.cream);
  doc.roundedRect(MARGIN, y, CONTENT_W, 96, 6, 6, 'F');
  const rowY = y + 30;
  const cardColW = CONTENT_W / 3;
  const summaryRows: { label: string; value: string; color: RGB }[] = [
    { label: 'Total amount', value: money(total), color: COLORS.dark },
    { label: 'Amount paid', value: money(paid), color: COLORS.green },
    { label: 'Balance due', value: money(balance), color: balance > 0 ? COLORS.red : COLORS.green },
  ];
  summaryRows.forEach((row, i) => {
    const x = MARGIN + 20 + i * cardColW;
    doc.setTextColor(...COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(row.label.toUpperCase(), x, rowY);
    doc.setTextColor(...row.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(row.value, x, rowY + 24);
  });
  y += 96 + 28;

  // Payment history table
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Payment History', MARGIN, y);
  y += 18;

  const cols = [
    { label: 'Date', w: 0.22 },
    { label: 'Type', w: 0.28 },
    { label: 'Method', w: 0.25 },
    { label: 'Amount', w: 0.25 },
  ];
  let x = MARGIN;
  doc.setFillColor(...COLORS.backgroundWarm);
  doc.rect(MARGIN, y, CONTENT_W, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.darkMuted);
  cols.forEach(c => {
    const w = CONTENT_W * c.w;
    doc.text(c.label.toUpperCase(), c.label === 'Amount' ? x + w - 8 : x + 8, y + 15, c.label === 'Amount' ? { align: 'right' } : undefined);
    x += w;
  });
  y += 22;

  if (payments.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.darkMuted);
    doc.text('No payments recorded yet.', MARGIN + 8, y + 18);
    y += 30;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    payments.forEach((p, i) => {
      if (y > PAGE_H - 140) {
        doc.addPage();
        y = MARGIN;
      }
      if (i % 2 === 1) {
        doc.setFillColor(...COLORS.cream);
        doc.rect(MARGIN, y, CONTENT_W, 22, 'F');
      }
      x = MARGIN;
      const isRefund = p.payment_type === 'refund';
      doc.setTextColor(...COLORS.dark);
      doc.text(formatDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' }), x + 8, y + 15);
      x += CONTENT_W * cols[0].w;
      doc.text(PAYMENT_TYPE_LABEL[p.payment_type] || p.payment_type, x + 8, y + 15);
      x += CONTENT_W * cols[1].w;
      doc.text(sanitizeForPdf(p.payment_method || '—'), x + 8, y + 15);
      x += CONTENT_W * cols[2].w;
      doc.setTextColor(...(isRefund ? COLORS.red : COLORS.green));
      doc.text(`${isRefund ? '- ' : ''}${money(Math.abs(p.amount))}`, x + CONTENT_W * cols[3].w - 8, y + 15, { align: 'right' });
      y += 22;
    });
    y += 12;
  }

  // Footer note
  doc.setDrawColor(...COLORS.grayLine);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkMuted);
  const note = 'This invoice reflects amounts recorded for this booking only. Cancellation and refund amounts, if any, are governed by ULAA\'s Terms & Cancellation Policy shared at the time of booking.';
  const noteLines = doc.splitTextToSize(note, CONTENT_W);
  doc.text(noteLines, MARGIN, y);

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
