import type { Enquiry } from '../types/types-index';
import { supabase } from '../services/supabase';
import { invoiceFileName } from '../lib/invoice/invoiceHtml';

// =============================================================================
// "Download Invoice" — production PDF generation.
//
// Real invoice PDFs are generated server-side: HTML → Puppeteer → PDF (see
// api/invoices/[id]/pdf.ts). The client here only calls that endpoint
// (authenticated with the admin's Supabase session token) and hands the
// browser the resulting binary — no jsPDF, no html2canvas, no window.print().
// =============================================================================

export { invoiceFileName };

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  return { Authorization: `Bearer ${token}` };
}

/** Calls the Puppeteer-backed API route and returns the generated PDF as a Blob. */
async function fetchInvoicePdfBlob(enquiry: Enquiry): Promise<Blob> {
  const headers = await authHeader();
  const res = await fetch(`/api/invoices/${enquiry.id}/pdf`, { headers });
  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(`Failed to generate invoice (${res.status}). ${message}`);
  }
  return res.blob();
}

/** Downloads the server-generated invoice PDF to the browser's normal
 *  download location. The server fetches the payment ledger itself from
 *  the database, so callers don't need to pass it in. */
export async function downloadInvoicePdf(enquiry: Enquiry): Promise<void> {
  const blob = await fetchInvoicePdfBlob(enquiry);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = invoiceFileName(enquiry);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Returns the invoice as a real application/pdf File, for use with the Web
 *  Share API (navigator.share) — lets a caller offer "Share to WhatsApp" on
 *  devices that support sharing files, with a wa.me text fallback elsewhere. */
export async function invoiceAsFile(enquiry: Enquiry): Promise<File> {
  const blob = await fetchInvoicePdfBlob(enquiry);
  return new File([blob], invoiceFileName(enquiry), { type: 'application/pdf' });
}
