import { jsPDF } from 'jspdf';
import type { Enquiry } from '../../../types/types-index';
import type { RGB } from '../shared';
import { COLORS, PAGE_W, PAGE_H, MARGIN, FOOTER_RESERVE, val, drawVectorIcon as drawVectorIconRaw } from './shared';

// =============================================================================
// Shared drawing context for the invoice PDF.
// -----------------------------------------------------------------------------
// Every section renderer (header.ts, details.ts, priceCards.ts,
// paymentTable.ts, footer.ts) is handed one `InvoicePdfCtx` built by
// `createInvoiceContext(doc, enquiry)` below. Unlike the itinerary slide
// deck (where each section starts a fresh, independent slide), the invoice
// is a single flowing document, so this context also carries the shared
// `cursor` — the current vertical draw position — plus the page-break
// helpers that need to know which page they might have to continue onto.
// =============================================================================

/** Builds the shared drawing context for one invoice PDF run, then passed
 *  into every section renderer below. */
export function createInvoiceContext(doc: jsPDF, enquiry: Enquiry) {
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  // Current draw cursor, reset by each page's chrome. Held in a mutable
  // object (rather than a plain variable) so every section renderer can
  // read and advance the same shared position.
  const cursor = { y: 0 };

  // -------------------------------------------------------------------
  // Page chrome: thin brand top bar on every page, plus (from page 2 on)
  // a compact "continued" header so a reader who lands on page 2 of a
  // long payment history still knows what document/booking this is.
  // -------------------------------------------------------------------
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
    cursor.y = drawPageTop(true);
  }

  /** Starts a new page if the next block of height `h` wouldn't fit above
   *  the footer reserve. Every multi-row section (the payment table, most
   *  importantly) checks this per-row, so a page break only ever falls
   *  cleanly between rows — never mid-row, which was the old raster
   *  pipeline's exact failure mode. */
  function checkPageBreak(h: number) {
    if (cursor.y + h > PAGE_H - FOOTER_RESERVE) newPage();
  }

  const drawVectorIcon = (innerSvg: string, x: number, y: number, size: number, color: RGB) =>
    drawVectorIconRaw(doc, innerSvg, x, y, size, color);

  return {
    doc,
    enquiry,
    setFill,
    setText,
    setDraw,
    cursor,
    drawPageTop,
    newPage,
    checkPageBreak,
    drawVectorIcon,
  };
}

export type InvoicePdfCtx = ReturnType<typeof createInvoiceContext>;
