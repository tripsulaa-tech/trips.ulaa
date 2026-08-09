import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Enquiry, Payment } from '../types/types-index';
import { buildInvoiceHtml, loadLogoDataUrl } from '../lib/invoice/invoiceTemplate';

// =============================================================================
// Invoice generation via HTML → rasterized → real PDF file.
//
// The invoice markup/CSS itself lives in src/lib/invoice/invoiceTemplate.ts
// (see that file for layout notes, including html2canvas's specific known
// weak spots and how the template avoids them). This file is just the
// render pipeline: turn that HTML into a real PDF Blob.
//
// The invoice is rendered off-screen in a hidden iframe so the browser lays
// out fonts/images exactly as designed, then rasterized with html2canvas
// and assembled into an actual binary PDF with jsPDF. The resulting PDF is
// downloaded directly (no browser print dialog, no manual "Save as PDF"
// step).
//
// Flow:
//   buildInvoiceHtml()      → full HTML document string (invoiceTemplate.ts)
//   renderInvoicePdfBlob()  → renders the HTML off-screen, rasterizes it,
//                             and returns a real application/pdf Blob
//   downloadInvoicePdf()    → triggers a direct browser download of that PDF
//   invoiceAsFile()         → returns the same PDF as a File for Web Share
// =============================================================================

/** Filename used for both downloaded and shared files. */
export function invoiceFileName(enquiry: Enquiry): string {
  const ref = (enquiry.booking_id || enquiry.id).replace(/[^a-zA-Z0-9-]/g, '');
  return `ULAA-Invoice-${ref}.pdf`;
}

// A4 at 96dpi, used for the off-screen render frame.
const RENDER_WIDTH_PX = 794;
const RENDER_HEIGHT_PX = 1123;

/**
 * Waits for an off-screen iframe's document to be genuinely ready to
 * rasterize: document load, fonts loaded (document.fonts.ready — the app's
 * system font stack resolves near-instantly, but this also covers any
 * environment where it doesn't), and two animation-frame turns so layout
 * has fully settled. A previous version used a flat 80ms timeout here,
 * which was sometimes too short — html2canvas would snapshot mid-layout,
 * producing inconsistent results between structurally-identical elements
 * (e.g. two pills using the exact same CSS class rendering at different
 * sizes). This is the fix for that class of bug.
 */
function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const settle = async () => {
      const doc = iframe.contentDocument;
      try {
        await doc?.fonts?.ready;
      } catch {
        // fonts.ready isn't universally supported — fine to skip.
      }
      // Two rAF turns: one to flush any layout queued by fonts.ready
      // resolving, one more so the browser has actually painted it.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const doc = iframe.contentDocument;
    if (doc && doc.readyState === 'complete') {
      settle();
      return;
    }
    iframe.addEventListener('load', settle, { once: true });
  });
}

/**
 * Renders the invoice HTML off-screen, rasterizes it with html2canvas, and
 * assembles a real, binary, multi-page-safe PDF with jsPDF. Returns the PDF
 * as a Blob — this is the single source of truth used by both the direct
 * download and the Web Share file path below.
 */
async function renderInvoicePdfBlob(enquiry: Enquiry, payments: Payment[]): Promise<Blob> {
  const logoDataUrl = await loadLogoDataUrl();
  const html = buildInvoiceHtml(enquiry, payments, logoDataUrl);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${RENDER_WIDTH_PX}px`;
  iframe.style.height = `${RENDER_HEIGHT_PX}px`;
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Could not create invoice render frame');

    doc.open();
    doc.write(html);
    doc.close();

    await waitForIframeReady(iframe);

    const target = doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: RENDER_WIDTH_PX,
      windowHeight: target.scrollHeight,
    });

    // PNG, not JPEG: this invoice is flat-color UI (icons, text, thin
    // circle strokes, badges) rather than a photo. JPEG's lossy chroma
    // subsampling wrecks exactly that kind of content — small high-contrast
    // details like the 10px contact icons come out visibly mangled/blotchy,
    // especially once a viewer zooms in. PNG is lossless, so those same
    // details stay crisp. The page is a single design with a limited,
    // mostly-flat color palette, so PNG compresses well here despite being
    // lossless — this isn't the "PNG is huge for photos" case.
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Sub-pixel/rounding differences between the rendered canvas and the
    // A4 page size (e.g. 297.02mm vs 297mm) used to trip the "content is
    // taller than one page" branch below by a fraction of a millimeter,
    // producing a spurious, entirely blank second page. A small tolerance
    // absorbs that rounding noise while still paginating genuinely long
    // invoices (long payment histories) correctly.
    const ROUNDING_TOLERANCE_MM = 2;

    if (imgHeight <= pageHeight + ROUNDING_TOLERANCE_MM) {
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    } else {
      // Content taller than one A4 page — paginate the single tall image
      // across as many pages as needed, each shifted up by one page height.
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > ROUNDING_TOLERANCE_MM) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(iframe);
  }
}

/**
 * Generates the invoice PDF and triggers an immediate, direct browser
 * download — no print dialog, no manual "Save as PDF" step required.
 */
export async function downloadInvoicePdf(enquiry: Enquiry, payments: Payment[]): Promise<void> {
  const blob = await renderInvoicePdfBlob(enquiry, payments);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = invoiceFileName(enquiry);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Returns the invoice as a real application/pdf File, suitable for the Web
 * Share API (navigator.canShare({ files })) as well as any other file input.
 */
export async function invoiceAsFile(enquiry: Enquiry, payments: Payment[]): Promise<File> {
  const blob = await renderInvoicePdfBlob(enquiry, payments);
  return new File([blob], invoiceFileName(enquiry), { type: 'application/pdf' });
}
