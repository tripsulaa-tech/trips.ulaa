import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Enquiry, Payment } from '../types/types-index';
import { formatPrice, formatDate } from './utils-index';
 
// =============================================================================
// Invoice generation via HTML → rasterized → real PDF file.
//
// The invoice is built as a styled HTML document, rendered off-screen in a
// hidden iframe so the browser lays out fonts/images exactly as designed,
// then rasterized with html2canvas and assembled into an actual binary PDF
// with jsPDF. The resulting PDF is downloaded directly (no browser print
// dialog, no manual "Save as PDF" step).
//
// Flow:
//   buildInvoiceHtml()      → full HTML document string
//   renderInvoicePdfBlob()  → renders the HTML off-screen, rasterizes it,
//                             and returns a real application/pdf Blob
//   downloadInvoicePdf()    → triggers a direct browser download of that PDF
//   invoiceAsFile()         → returns the same PDF as a File for Web Share
// =============================================================================
 
const BRAND = {
  name: 'ULAA',
  tagline: 'Girls-Only Travel Community',
  website: 'www.ulaatrips.com',
  email: 'trips.ulaa@gmail.com',
  phone: '+91 63813 36772',
  bottomTagline: 'Empowering women to explore, together.',
};
 
const PAYMENT_TYPE_LABEL: Record<Payment['payment_type'], string> = {
  booking_amount: 'Booking amount',
  installment: 'Installment',
  balance: 'Balance payment',
  refund: 'Refund',
};
 
function esc(text: string | null | undefined): string {
  if (!text) return '—';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\u20B9/g, 'Rs.');
}
 
function money(amount: number): string {
  return esc(formatPrice(amount || 0));
}
 
function fdate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}
 
// ---------------------------------------------------------------------------
// Loads the ULAA logo as a base64 data-URL so it works reliably inside a
// detached print window on the same origin.
// ---------------------------------------------------------------------------
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/ULAA-logo.jpg');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
 
// ---------------------------------------------------------------------------
// Core: builds a self-contained, print-ready A4 HTML document string.
// ---------------------------------------------------------------------------
function buildInvoiceHtml(
  enquiry: Enquiry,
  payments: Payment[],
  logoDataUrl: string | null,
): string {
  const total = enquiry.total_amount || 0;
  const paid = enquiry.amount_paid || 0;
  const balance = Math.max(0, total - paid);
 
  const invoiceDate = fdate(new Date().toISOString());
 
  const packageLabel =
    enquiry.package_type === 'early_bird' ? 'Early Bird' : 'Normal';
 
  // Logo HTML
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="ULAA" class="logo-img" />`
    : `<span class="logo-text">ULAA</span>`;
 
  // Group booking field (only when group_size > 1)
  const groupField =
    enquiry.group_size && enquiry.group_size > 1
      ? `<div class="field">
           <div class="field-label">Group Booking</div>
           <div class="field-value">Seat ${enquiry.group_seq} of ${enquiry.group_size}</div>
         </div>`
      : '';
 
  // Payment rows
  const paymentRows =
    payments.length === 0
      ? `<tr><td colspan="4" class="no-payments">No payments recorded yet.</td></tr>`
      : payments
          .map((p, i) => {
            const isRefund = p.payment_type === 'refund';
            const rowClass = i % 2 === 0 ? 'row-even' : 'row-odd';
            return `<tr class="${rowClass}">
              <td>${fdate(p.paid_at)}</td>
              <td>${esc(PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type)}</td>
              <td>${esc(p.payment_method)}</td>
              <td class="amount-col ${isRefund ? 'amount-refund' : 'amount-paid'}">
                ${isRefund ? '− ' : ''}${money(Math.abs(p.amount))}
              </td>
            </tr>`;
          })
          .join('');
 
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>ULAA Invoice ${esc(enquiry.booking_id)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
 
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
 
  body {
    width: 210mm;
    min-height: 297mm;
    background: #f5ede3;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #2d1f14;
    font-size: 13px;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
 
  /* ── Page wrapper ───────────────────────────────── */
  .page {
    width: 210mm;
    min-height: 297mm;
    display: flex;
    flex-direction: column;
  }
 
  /* ── HEADER ─────────────────────────────────────── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 28px 40px 22px;
    background: #fdf8f3;
    border-bottom: 1.5px solid #e0cfc0;
  }
 
  .header-left { display: flex; flex-direction: column; gap: 10px; }
 
  .logo-area { display: flex; align-items: center; gap: 12px; }
 
  .logo-img  { height: 54px; width: auto; object-fit: contain; }
  .logo-text {
    font-size: 30px; font-weight: 800; letter-spacing: 3px; color: #a0522d;
  }
 
  .brand-tagline {
    font-size: 11px; font-weight: 500; color: #7a5030; letter-spacing: 0.3px;
  }
 
  .contact-list { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
 
  .contact-row {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; color: #7a5030;
  }
 
  .contact-icon {
    width: 18px; height: 18px; border-radius: 50%;
    background: #ecdece; display: flex; align-items: center;
    justify-content: center; font-size: 9px; flex-shrink: 0;
    color: #a0522d;
  }
 
  /* right column */
  .header-right { text-align: right; }
 
  .invoice-title {
    font-size: 24px; font-weight: 800; letter-spacing: 1.5px;
    color: #a0522d; margin-bottom: 4px;
  }
 
  .title-rule {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 6px; margin-bottom: 14px;
  }
  .title-rule-line {
    height: 1.5px; background: #c8a07a; flex: 1; max-width: 160px;
  }
  .title-rule-diamond {
    width: 6px; height: 6px; background: #a0522d;
    transform: rotate(45deg); flex-shrink: 0;
  }
 
  .booking-id-label {
    font-size: 9px; color: #9a7060; text-transform: uppercase;
    letter-spacing: 0.8px; margin-bottom: 5px;
  }
 
  .booking-id-badge {
    display: inline-block; background: #a0522d; color: #fff;
    font-size: 11.5px; font-weight: 700; padding: 5px 16px;
    border-radius: 5px; letter-spacing: 0.3px; margin-bottom: 10px;
  }
 
  .invoice-date-row {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 6px; font-size: 11px; color: #7a5030;
  }
 
  .cal-icon {
    width: 18px; height: 18px; border-radius: 4px;
    background: #ecdece; display: flex; align-items: center;
    justify-content: center; font-size: 10px;
  }
 
  /* ── BODY ───────────────────────────────────────── */
  .body { flex: 1; padding: 26px 40px 20px; }
 
  /* ── TWO-COLUMN DETAILS ─────────────────────────── */
  .details-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 28px;
    margin-bottom: 26px;
  }
 
  .section-pill {
    display: inline-block; background: #a0522d; color: #fff;
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.9px;
    text-transform: uppercase; padding: 5px 16px; border-radius: 4px;
    margin-bottom: 14px;
  }
 
  .field { margin-bottom: 13px; }
 
  .field-label {
    font-size: 9.5px; color: #9a7060; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 3px;
  }
 
  .field-value { font-size: 14px; font-weight: 600; color: #2d1f14; }
 
  /* ── PRICE SUMMARY ──────────────────────────────── */
  .price-summary {
    display: grid; grid-template-columns: repeat(3, 1fr);
    border: 1.5px solid #e0cfc0; border-radius: 10px;
    overflow: hidden; margin-bottom: 26px; background: #fff;
  }
 
  .price-card {
    display: flex; align-items: center; gap: 14px; padding: 18px 20px;
  }
 
  .price-card + .price-card { border-left: 1.5px solid #e0cfc0; }
 
  .price-icon-circle {
    width: 42px; height: 42px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 19px; flex-shrink: 0;
  }
 
  .icon-total   { background: #fff3e8; }
  .icon-paid    { background: #e6f7ef; }
  .icon-balance { background: #fef0ee; }
 
  .price-label {
    font-size: 9.5px; color: #9a7060; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 4px;
  }
 
  .price-amount { font-size: 19px; font-weight: 800; }
 
  .amount-total   { color: #2d1f14; }
  .amount-paid    { color: #1e7d4e; }
  .amount-balance-due  { color: #c0392b; }
  .amount-balance-zero { color: #1e7d4e; }
 
  /* ── PAYMENT HISTORY ────────────────────────────── */
  .section-heading {
    font-size: 14px; font-weight: 700; color: #2d1f14;
    margin-bottom: 12px; letter-spacing: 0.2px;
  }
 
  .payment-table {
    width: 100%; border-collapse: collapse;
    border-radius: 8px; overflow: hidden;
    margin-bottom: 24px;
  }
 
  .payment-table thead tr { background: #5c3318; }
 
  .payment-table th {
    padding: 10px 14px; font-size: 9.5px; font-weight: 700;
    color: #fff; text-transform: uppercase; letter-spacing: 0.9px;
    text-align: left;
  }
 
  .payment-table th.amount-col { text-align: right; }
 
  .payment-table td {
    padding: 10px 14px; font-size: 12px; color: #2d1f14;
  }
 
  .payment-table td.amount-col { text-align: right; font-weight: 600; }
 
  .amount-paid   { color: #1e7d4e; }
  .amount-refund { color: #c0392b; }
 
  .row-even td { background: #ffffff; }
  .row-odd  td { background: #faf5f0; }
 
  .no-payments {
    text-align: center; padding: 18px; color: #9a7060; font-size: 12px;
    background: #fff;
  }
 
  /* ── FOOTER NOTE ────────────────────────────────── */
  .footer-note {
    display: flex; align-items: flex-start; gap: 11px;
    background: #fff; border-radius: 8px;
    padding: 13px 16px; margin-bottom: 22px;
    border: 1px solid #e8ddd3;
  }
 
  .info-icon {
    width: 22px; height: 22px; border-radius: 50%;
    background: #dde8ff; display: flex; align-items: center;
    justify-content: center; font-size: 12px; font-weight: 700;
    color: #3a5fc8; flex-shrink: 0; line-height: 1;
  }
 
  .footer-note-text {
    font-size: 10.5px; color: #7a5030; line-height: 1.55;
  }
 
  /* ── THANK YOU ──────────────────────────────────── */
  .thank-you {
    text-align: right; padding-right: 8px; margin-bottom: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic; font-size: 27px; color: #2d1f14;
  }
 
  /* ── BOTTOM BAR ─────────────────────────────────── */
  .bottom-bar {
    background: #a0522d; padding: 16px 40px;
    display: flex; justify-content: space-between; align-items: center;
    margin-top: auto;
  }
 
  .bottom-left {
    display: flex; align-items: center; gap: 0; color: #fff;
  }
 
  .bottom-logo-img { height: 36px; width: auto; filter: brightness(0) invert(1); }
 
  .bottom-logo-text {
    font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #fff;
  }
 
  .bottom-divider {
    width: 1px; height: 30px; background: rgba(255,255,255,0.35);
    margin: 0 14px;
  }
 
  .bottom-tagline {
    font-size: 10px; color: rgba(255,255,255,0.85);
    max-width: 160px; line-height: 1.4;
  }
 
  .bottom-right {
    display: flex; align-items: center; gap: 12px; color: #fff;
  }
 
  .follow-label {
    font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase;
    color: rgba(255,255,255,0.85);
  }
 
  .social-icons { display: flex; gap: 8px; }
 
  .social-icon {
    width: 26px; height: 26px; border-radius: 50%;
    background: rgba(255,255,255,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; color: #fff;
  }
 
  /* ── PRINT RESET ────────────────────────────────── */
  @media print {
    @page { size: A4 portrait; margin: 0; }
    body  {
      width: 210mm; min-height: 297mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
<div class="page">
 
  <!-- ═══════════ HEADER ════════════════════════════════════════════════ -->
  <header class="header">
    <div class="header-left">
      <div class="logo-area">${logoHtml}</div>
      <div class="brand-tagline">${esc(BRAND.tagline)}</div>
      <div class="contact-list">
        <div class="contact-row">
          <div class="contact-icon">&#9679;</div>
          <span>${esc(BRAND.website)}</span>
        </div>
        <div class="contact-row">
          <div class="contact-icon">&#9993;</div>
          <span>${esc(BRAND.email)}</span>
        </div>
        <div class="contact-row">
          <div class="contact-icon">&#9742;</div>
          <span>${esc(BRAND.phone)}</span>
        </div>
      </div>
    </div>
 
    <div class="header-right">
      <div class="invoice-title">BOOKING INVOICE</div>
      <div class="title-rule">
        <div class="title-rule-line"></div>
        <div class="title-rule-diamond"></div>
      </div>
      <div class="booking-id-label">Booking ID:</div>
      <div class="booking-id-badge">${esc(enquiry.booking_id)}</div>
      <div class="invoice-date-row">
        <div class="cal-icon">&#128197;</div>
        <span>Invoice Date: ${invoiceDate}</span>
      </div>
    </div>
  </header>
 
  <!-- ═══════════ BODY ══════════════════════════════════════════════════ -->
  <main class="body">
 
    <!-- ── Two-column details ── -->
    <div class="details-grid">
      <div>
        <div class="section-pill">Traveller Details</div>
        <div class="field">
          <div class="field-label">Traveller Name</div>
          <div class="field-value">${esc(enquiry.full_name)}</div>
        </div>
        <div class="field">
          <div class="field-label">Phone</div>
          <div class="field-value">${esc(enquiry.phone)}</div>
        </div>
        <div class="field">
          <div class="field-label">Email</div>
          <div class="field-value">${esc(enquiry.email)}</div>
        </div>
        ${groupField}
      </div>
 
      <div>
        <div class="section-pill">Trip Details</div>
        <div class="field">
          <div class="field-label">Trip</div>
          <div class="field-value">${esc(enquiry.trip_title)}</div>
        </div>
        <div class="field">
          <div class="field-label">Departure Date</div>
          <div class="field-value">${fdate(enquiry.departure_date)}</div>
        </div>
        <div class="field">
          <div class="field-label">Package</div>
          <div class="field-value">${packageLabel}</div>
        </div>
        <div class="field">
          <div class="field-label">City</div>
          <div class="field-value">${esc(enquiry.city)}</div>
        </div>
      </div>
    </div>
 
    <!-- ── Price summary ── -->
    <div class="price-summary">
      <div class="price-card">
        <div class="price-icon-circle icon-total">&#128176;</div>
        <div>
          <div class="price-label">Total Amount</div>
          <div class="price-amount amount-total">${money(total)}</div>
        </div>
      </div>
      <div class="price-card">
        <div class="price-icon-circle icon-paid">&#128179;</div>
        <div>
          <div class="price-label">Amount Paid</div>
          <div class="price-amount amount-paid">${money(paid)}</div>
        </div>
      </div>
      <div class="price-card">
        <div class="price-icon-circle icon-balance">&#128203;</div>
        <div>
          <div class="price-label">Balance Due</div>
          <div class="price-amount ${balance > 0 ? 'amount-balance-due' : 'amount-balance-zero'}">${money(balance)}</div>
        </div>
      </div>
    </div>
 
    <!-- ── Payment history ── -->
    <div class="section-heading">PAYMENT HISTORY</div>
    <table class="payment-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Method</th>
          <th class="amount-col">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows}
      </tbody>
    </table>
 
    <!-- ── Footer note ── -->
    <div class="footer-note">
      <div class="info-icon">i</div>
      <div class="footer-note-text">
        This invoice reflects amounts recorded for this booking only.
        Cancellation and refund amounts, if any, are governed by ULAA&rsquo;s
        Terms &amp; Cancellation Policy shared at the time of booking.
      </div>
    </div>
 
    <div class="thank-you">Thank you! &#9825;</div>
 
  </main>
 
  <!-- ═══════════ BOTTOM BAR ════════════════════════════════════════════ -->
  <footer class="bottom-bar">
    <div class="bottom-left">
      <span class="bottom-logo-text">ULAA</span>
      <div class="bottom-divider"></div>
      <span class="bottom-tagline">${esc(BRAND.bottomTagline)}</span>
    </div>
    <div class="bottom-right">
      <span class="follow-label">Follow Us</span>
      <div class="social-icons">
        <div class="social-icon">&#128247;</div>
        <div class="social-icon">&#128172;</div>
        <div class="social-icon">&#127760;</div>
      </div>
    </div>
  </footer>
 
</div>
</body>
</html>`;
}
 
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
 
/** Filename used for both downloaded and shared files. */
export function invoiceFileName(enquiry: Enquiry): string {
  const ref = (enquiry.booking_id || enquiry.id).replace(/[^a-zA-Z0-9-]/g, '');
  return `ULAA-Invoice-${ref}.pdf`;
}
 
// A4 at 96dpi, used for the off-screen render frame.
const RENDER_WIDTH_PX = 794;
const RENDER_HEIGHT_PX = 1123;

/**
 * Waits for an off-screen iframe's document to finish loading, plus a short
 * grace period so images (logo) and fonts have a chance to paint before we
 * rasterize — otherwise the captured canvas can come out blank/half-drawn.
 */
function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => requestAnimationFrame(() => setTimeout(resolve, 80));
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

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    } else {
      // Content taller than one A4 page — paginate the single tall image
      // across as many pages as needed, each shifted up by one page height.
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
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