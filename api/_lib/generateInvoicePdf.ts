// =============================================================================
// Server-side invoice generation helpers — shared between:
//   - api/invoices/[id]/pdf.ts                  (production, on Vercel)
//   - vite-plugins/invoicePdfDevMiddleware.ts   (local `npm run dev`, Vite)
//
// Pulling the Supabase fetch + PDF-buffer logic out into one place means the
// two entry points can't drift apart (e.g. one validating the PDF magic
// bytes and the other not). The two entry points still each launch their
// own Puppeteer browser instance, because they need different Chromium
// binaries — see the comment on renderInvoicePdfBuffer() below.
//
// Node-only (Buffer, etc.) — lives under api/_lib/ rather than src/lib/
// on purpose: everything under src/ is type-checked against
// tsconfig.app.json, which has no Node types (it's the browser bundle's
// project), so a Node-only file placed there fails `tsc -b` with
// "Cannot find name 'Buffer'". api/_lib/ isn't part of any tsconfig
// project's `include`, so it's only type-checked via whatever imports it
// (here, vite.config.ts's project, which does have Node types) — never
// bundled into client code either way.
// =============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildInvoiceHtml, type InvoiceEnquiry, type InvoicePayment } from '../../src/lib/invoice/invoiceHtml.ts';

export { buildInvoiceHtml };
export type { InvoiceEnquiry, InvoicePayment };

export class InvoiceNotFoundError extends Error {}

/** The minimal Puppeteer-shaped browser this module needs. Deliberately
 *  structural rather than `import('puppeteer-core').Browser` — puppeteer's
 *  and puppeteer-core's Browser/Page classes use TS private fields, which
 *  makes them nominally incompatible with each other even though they're
 *  the same API. Production (puppeteer-core) and local dev (full
 *  puppeteer) each satisfy this without a cast. */
export interface PdfCapableBrowser {
  newPage(): Promise<PdfCapablePage>;
  close(): Promise<void>;
}

export interface PdfCapablePage {
  setContent(html: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' }): Promise<void>;
  pdf(options: {
    format?: 'A4';
    printBackground?: boolean;
    preferCSSPageSize?: boolean;
    margin?: { top?: string | number; right?: string | number; bottom?: string | number; left?: string | number };
  }): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** Fetches the booking + its payment ledger with a service-role Supabase
 *  client. Throws InvoiceNotFoundError if `id` (an enquiries.id or
 *  booking_id) doesn't match a row, or a plain Error if the payments query
 *  itself fails. */
export async function fetchInvoiceRecord(
  supabaseAdmin: SupabaseClient,
  id: string
): Promise<{ enquiry: InvoiceEnquiry; payments: InvoicePayment[] }> {
  const { data: enquiry, error: enquiryError } = await supabaseAdmin
    .from('enquiries')
    .select(
      'id, booking_id, full_name, phone, email, city, trip_title, departure_date, package_type, total_amount, amount_paid, group_id, group_size, group_seq'
    )
    .or(`id.eq.${id},booking_id.eq.${id}`)
    .single();

  if (enquiryError || !enquiry) {
    throw new InvoiceNotFoundError('Booking not found.');
  }

  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from('payments')
    .select('amount, payment_type, payment_method, paid_at')
    .eq('enquiry_id', enquiry.id)
    .order('paid_at', { ascending: true });

  if (paymentsError) {
    throw new Error('Failed to load payment history.');
  }

  return {
    enquiry: enquiry as InvoiceEnquiry,
    payments: (payments || []) as InvoicePayment[],
  };
}

/** Prints already-built invoice HTML to a PDF buffer with an
 *  already-launched Puppeteer browser. The caller owns the browser's
 *  lifecycle (launch + close) because production and dev launch it very
 *  differently:
 *    - production (api/invoices/[id]/pdf.ts) uses puppeteer-core +
 *      @sparticuz/chromium's Lambda-optimized binary, which only runs
 *      inside the actual Vercel serverless (Linux/Lambda) environment.
 *    - local dev (vite-plugins/invoicePdfDevMiddleware.ts) uses the full
 *      `puppeteer` package's locally-installed Chromium instead, since the
 *      Lambda binary generally will not launch on a normal dev machine. */
export async function renderInvoicePdfBuffer(browser: PdfCapableBrowser, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    // Puppeteer's page.pdf() resolves a Uint8Array (not always a real Node
    // Buffer instance) — wrap it so callers always get a real Buffer.
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** A real PDF always starts with the "%PDF-" magic bytes. Use this before
 *  ever sending generated bytes to a client, so a blank/corrupt Chromium
 *  render fails loudly server-side instead of shipping a file that
 *  downloads fine but won't open. */
export function isValidPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > 0 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

/** Builds the same same-origin-logo data URL both entry points embed into
 *  the invoice so Puppeteer never needs a second network hop. Production
 *  fetches it over HTTP (same deployment, so no CORS issues); dev reads it
 *  straight off disk since there's no separate origin to fetch from. */
export async function logoDataUrlFromHttp(protocol: string, host: string): Promise<string | null> {
  try {
    const res = await fetch(`${protocol}://${host}/ULAA-logo.jpg`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
