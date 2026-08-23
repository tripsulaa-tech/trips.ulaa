import { jsPDF } from 'jspdf';
import type { Enquiry, Payment } from '../types/types-index';
import { PAGE_W, PAGE_H, loadLogo, loadFooterBanner, invoiceFileName } from './pdf/invoice/shared';
import { createInvoiceContext } from './pdf/invoice/context';
import { renderHeader } from './pdf/invoice/header';
import { renderDetails } from './pdf/invoice/details';
import { renderPriceCards } from './pdf/invoice/priceCards';
import { renderPaymentTable } from './pdf/invoice/paymentTable';
import { renderFooterAndPageNumbers } from './pdf/invoice/footer';

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
// paginates on exact row boundaries (see checkPageBreak in
// pdf/invoice/context.ts) — the payment table can never be sliced mid-row.
//
// Each section of the invoice now lives in its own module under
// src/utils/pdf/invoice/ (header.ts, details.ts, priceCards.ts,
// paymentTable.ts, footer.ts), sharing drawing primitives and the running
// draw cursor via the `InvoicePdfCtx` built by pdf/invoice/context.ts —
// mirroring the split already used for src/utils/tripItineraryPdf.ts (see
// src/utils/pdf/itinerary/). This file just wires them together in order.
//
// Flow:
//   buildInvoicePdfDoc()   → returns the assembled jsPDF document
//   downloadInvoicePdf()   → builds it and triggers a direct browser
//                            download (no print dialog, no "Save as PDF")
//   invoiceAsFile()        → returns the same PDF as a File, for the Web
//                            Share API
// =============================================================================

/**
 * Builds the invoice as a native jsPDF document — every field pulled
 * straight from `enquiry`/`payments`, so it always reflects exactly what's
 * on record. Returns the assembled doc; downloadInvoicePdf() and
 * invoiceAsFile() both just call this and then export it differently.
 */
async function buildInvoicePdfDoc(enquiry: Enquiry, payments: Payment[]): Promise<jsPDF> {
  const logo = await loadLogo();
  const footerBanner = await loadFooterBanner();

  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });
  const ctx = createInvoiceContext(doc, enquiry);
  ctx.cursor.y = ctx.drawPageTop(false);

  // -------------------------------------------------------------------
  // Assemble the document. Every section advances `ctx.cursor.y` past
  // whatever it drew, so the next section always starts in the right
  // place regardless of how much content came before it.
  // -------------------------------------------------------------------
  await renderHeader(ctx, enquiry, logo);
  renderDetails(ctx, enquiry);
  await renderPriceCards(ctx, enquiry);
  renderPaymentTable(ctx, payments);
  renderFooterAndPageNumbers(ctx, footerBanner);

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
