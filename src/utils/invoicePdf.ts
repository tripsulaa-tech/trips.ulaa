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

// How long before actual expiry we treat a token as "already expired" and
// refresh it proactively, in ms.
const EXPIRY_BUFFER_MS = 60_000;

/** Returns a Supabase access token that's actually valid right now.
 *
 * `supabase.auth.getSession()` just reads whatever's cached in storage —
 * it does NOT guarantee the token hasn't expired. supabase-js's own
 * auto-refresh relies on an in-page setTimeout, which browsers throttle (or
 * pause entirely) while a tab is backgrounded; an admin who leaves this tab
 * open for a while and then clicks "Download Invoice" can easily have a
 * cached session whose access_token expired minutes ago. That stale token
 * gets sent to the API route, which correctly rejects it with 401 "Invalid
 * or expired session." Checking `expires_at` here and forcing a refresh
 * when needed (or when the caller already knows the token was rejected)
 * fixes that without requiring the admin to reload the page. */
async function getFreshAccessToken(forceRefresh = false): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const expiresInMs = session?.expires_at ? session.expires_at * 1000 - Date.now() : -Infinity;
  const needsRefresh = forceRefresh || !session?.access_token || expiresInMs < EXPIRY_BUFFER_MS;

  if (needsRefresh) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (error || !token) throw new Error('Not signed in.');
    return token;
  }

  return session.access_token;
}

async function authHeader(forceRefresh = false): Promise<Record<string, string>> {
  const token = await getFreshAccessToken(forceRefresh);
  return { Authorization: `Bearer ${token}` };
}

/** Calls the Puppeteer-backed API route and returns the generated PDF as a Blob. */
async function fetchInvoicePdfBlob(enquiry: Enquiry): Promise<Blob> {
  const endpoint = `/api/invoices/${enquiry.id}/pdf`;
  let res = await fetch(endpoint, { headers: await authHeader() });

  // Belt-and-braces: if the server still says the session is invalid/expired
  // (e.g. a race with the proactive check above, or the refresh token itself
  // just rotated in another tab), force one refresh and retry once before
  // giving up. Anything other than 401 falls straight through to the normal
  // error handling below.
  if (res.status === 401) {
    res = await fetch(endpoint, { headers: await authHeader(true) });
  }

  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(`Failed to generate invoice (${res.status}). ${message}`);
  }
  const blob = await res.blob();

  // Defensive check: the server can, in rare cases, respond 200 with a
  // non-PDF body (e.g. an HTML error/edge page slipping through, or a
  // truncated response on a serverless timeout). Catching that here means
  // the person sees "Failed to generate invoice" instead of a file that
  // downloads fine but Acrobat/Edge reports as "We can't open this file".
  const contentType = res.headers.get('content-type') || '';
  const looksLikePdf =
    contentType.includes('application/pdf') ||
    (await blob.slice(0, 5).text().catch(() => '')) === '%PDF-';
  if (!blob.size || !looksLikePdf) {
    throw new Error('The server returned an invalid PDF. Please try downloading the invoice again.');
  }

  return blob;
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
