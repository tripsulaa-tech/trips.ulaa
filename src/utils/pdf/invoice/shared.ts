import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { Enquiry, Payment } from '../../../types/types-index';
import { formatDate } from '../../utils-index';
import { sanitizeForPdf } from '../../pdfText';
import { loadContainImage } from '../../pdfImageLoading';
import { BRAND_BASE, COLORS_BASE, type RGB } from '../shared';

// =============================================================================
// Values shared across the invoice-PDF modules (shared.ts, context.ts,
// header.ts, details.ts, priceCards.ts, paymentTable.ts, footer.ts) — split
// out of the original single-file invoicePdf.ts, mirroring the pattern
// already used for the itinerary deck (see src/utils/pdf/itinerary/).
// =============================================================================

// Kept in sync with the @theme block in src/styles/globals.css and the same
// palette src/utils/tripItineraryPdf.ts uses, so the invoice and the
// itinerary PDF read as the same document family.
export const COLORS = {
  ...COLORS_BASE,
  greenBg: [227, 240, 231] as RGB,
  redBg: [247, 227, 224] as RGB,
  amberBg: [251, 238, 216] as RGB,
} as const;

export const BRAND = {
  ...BRAND_BASE,
  tagline: 'GIRLS-ONLY TRAVEL COMMUNITY',
  bottomTagline: 'Empowering women to explore, together.',
};

// Exact lucide-react icon path data (same shapes rendered by the site's
// header/footer contact rows — see src/components/layout/Footer.tsx), kept
// here so the PDF's header icons are true vectors rather than raster art.
// Lucide icons are drawn on a 24x24 viewBox, stroke-only, 2pt stroke,
// round caps/joins — matching that spec here keeps them identical to the
// website's icon set.
export const ICON_GLOBE = '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>';
export const ICON_MAIL = '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>';
export const ICON_PHONE = '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>';

// Price-summary-card icons (Total Amount / Amount Paid / Balance Due), same
// lucide set as above: Wallet, CircleCheckBig, ReceiptIndianRupee — swapped
// in for the old hand-drawn line-primitive icons so these read as crisp,
// recognizable glyphs instead of rough approximations.
export const ICON_WALLET = '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>';
export const ICON_CIRCLE_CHECK = '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>';
export const ICON_RECEIPT_RUPEE = '<path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/><path d="M8 11h8"/><path d="M8 7h8"/><path d="M9 7a4 4 0 0 1 0 8H8l3 2"/>';

/** Renders one lucide-style icon (stroke-only, 24x24 viewBox) as a real
 *  vector shape at (x, y) sized to `size` points — via svg2pdf.js, which
 *  converts an actual SVG element into native jsPDF drawing commands. This
 *  is why the icon stays crisp at any zoom and costs almost nothing in
 *  file size, unlike pasting in a rasterized icon. */
export async function drawVectorIcon(
  doc: jsPDF,
  innerSvg: string,
  x: number,
  y: number,
  size: number,
  color: RGB
): Promise<void> {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="rgb(${color[0]},${color[1]},${color[2]})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</svg>`;
  const svgEl = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  await svg2pdf(svgEl, doc, { x, y, width: size, height: size });
}

export const PAYMENT_TYPE_LABEL: Record<Payment['payment_type'], string> = {
  booking_amount: 'Booking amount',
  installment: 'Installment',
  balance: 'Balance payment',
  refund: 'Refund',
  full_payment: 'Full Payment',
  advance: 'Advance',
  extra_charge: 'Extra Charge',
};

// A4 in points (72pt/in) — same unit convention as tripItineraryPdf.ts.
export const PAGE_W = 595;
export const PAGE_H = 842;
export const MARGIN = 40;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const FOOTER_RESERVE = 34; // room left at the bottom of every page for the page-number badge

/** Filename used for both downloaded and shared files. */
export function invoiceFileName(enquiry: Enquiry): string {
  const ref = (enquiry.booking_id || enquiry.id).replace(/[^a-zA-Z0-9-]/g, '');
  return `ULAA-Invoice-${ref}.pdf`;
}

/** Same rationale as tripItineraryPdf.ts's sanitizeForPdf (now shared —
 *  see pdfText.ts): the ₹ glyph isn't in the core PDF font's charset
 *  (renders as a stray mis-measured character, which throws off layout
 *  math based on its width), and emoji/pictographs aren't either. Every
 *  piece of enquiry-authored text passes through this before being
 *  measured or drawn. */
export function val(text: string | null | undefined): string {
  const s = sanitizeForPdf(text);
  return s || '\u2014'; // em dash for empty fields, matching the old template
}

export { money } from '../shared';

export function fdate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

// -----------------------------------------------------------------------
// Logo/banner loading — best-effort, never throws (see loadContainImage in
// pdfImageLoading.ts). A slow network or a missing file should never break
// invoice generation; the layout just falls back to the wordmark text.
// -----------------------------------------------------------------------
export function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  return loadContainImage('/ULAA-logo.jpg');
}

// Same best-effort/never-throws contract as loadLogo() above, for the
// bottom brand banner (palm trees / sailboat artwork with the "Follow us"
// row baked into the image). Ratio is width/height, used to size the
// image to the content width while keeping it undistorted.
export function loadFooterBanner(): Promise<{ dataUrl: string; ratio: number } | null> {
  return loadContainImage('/ulaa-invoice-footer-banner.png');
}

// Clickable hotspots baked into the footer banner artwork, as fractions of
// the image's own width/height (0–1). Measured directly against the source
// PNG (1254x252) so they stay correctly aligned at any print size. Order:
// Instagram handle, WhatsApp, website.
export const FOOTER_BANNER_LINKS: { x1: number; y1: number; x2: number; y2: number; url: string }[] = [
  { x1: 415 / 1254, y1: 78 / 252, x2: 585 / 1254, y2: 132 / 252, url: 'https://instagram.com/ulaa.trips' },
  { x1: 600 / 1254, y1: 78 / 252, x2: 780 / 1254, y2: 132 / 252, url: 'https://wa.me/916381336772?text=' + encodeURIComponent('Hi! I am interested in ULAA trips.') },
  { x1: 795 / 1254, y1: 78 / 252, x2: 1030 / 1254, y2: 132 / 252, url: 'https://www.ulaatrips.com' },
];

export type { RGB };
