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

/** Extracts the project ref ("abcdefgh" out of "https://abcdefgh.supabase.co")
 *  from a Supabase URL, or null if the URL is missing/malformed. Not a
 *  secret either way — VITE_SUPABASE_URL ships straight into the client
 *  bundle, and a Supabase project ref on its own grants no access. */
export function supabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

/** True when `error` (from a `supabase.auth.*` call) is supabase-js's
 *  AuthRetryableFetchError — the class it wraps around a failed *network*
 *  call to the Auth API (DNS failure, connection refused, TLS/proxy
 *  interception, the project being paused, etc.), as opposed to
 *  AuthApiError, which means the Auth API was reached and it rejected the
 *  token. Checked by duck-typing `.name` (what supabase-js's own
 *  `isAuthRetryableFetchError` does internally) rather than importing the
 *  class from `@supabase/auth-js`, since that package is only a transitive
 *  dependency here (pulled in by `@supabase/supabase-js`), not one this
 *  project installs directly. */
export function isAuthNetworkError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '__isAuthError' in error &&
    (error as { name?: unknown }).name === 'AuthRetryableFetchError'
  );
}

/** supabase-js's own error wrapping is a dead end for diagnosing *why* a
 *  network call failed: internally it does
 *  `throw new AuthRetryableFetchError(err.message, 0)`, which keeps only
 *  `err.message` (always the generic "fetch failed") and drops `err.cause`
 *  — the actual TLS/DNS/connection error Node's fetch attaches — on the
 *  floor. There's no way to recover that detail from the error
 *  `supabase.auth.getUser()` returns.
 *
 *  So when isAuthNetworkError() is true, this re-issues one plain `fetch`
 *  straight at the same Auth API host (no supabase-js involved) purely to
 *  read `.cause` off *that* failure and turn it into something a human can
 *  act on — "self-signed certificate in certificate chain" (a corporate
 *  SSL-inspecting proxy your browser trusts but Node doesn't — Node has its
 *  own certificate store, separate from the OS/browser one) reads very
 *  differently from "ENOTFOUND" (DNS / no network) or "ECONNREFUSED" (a
 *  firewall actively blocking the connection). Local-dev diagnostics only —
 *  never called from the production route. */
export async function probeNetworkFailureReason(supabaseUrl: string): Promise<string> {
  try {
    await fetch(`${supabaseUrl}/auth/v1/health`, { signal: AbortSignal.timeout(5000) });
    return 'the direct probe actually succeeded just now — this may have been transient, try the download again';
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined;
    const code = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code: unknown }).code) : undefined;
    const causeMessage = cause instanceof Error ? cause.message : undefined;
    const detail = causeMessage || (err instanceof Error ? err.message : String(err));
    const hint = explainNetworkErrorCode(code);
    return `${detail}${code ? ` [${code}]` : ''}${hint ? ` — ${hint}` : ''}`;
  }
}

/** A given Node network-error code always needs a specific, different fix —
 *  no point making someone map "ENOTFOUND" to "that's DNS" themselves when
 *  the message can just say so. */
function explainNetworkErrorCode(code: string | undefined): string | null {
  switch (code) {
    case 'ENOTFOUND':
      return (
        "Node couldn't resolve this hostname via the OS DNS resolver, even though your browser can reach it. " +
        'Chrome/Edge use "Secure DNS" (DNS-over-HTTPS) by default, which bypasses the OS resolver entirely — ' +
        "that's the most common reason a site loads fine in the browser while Node gets ENOTFOUND. Try " +
        '`nslookup <host>` (or `ping <host>`) in the same terminal running `npm run dev`; if that also fails, ' +
        "it's your OS/VPN DNS settings, not this app."
      );
    case 'ECONNREFUSED':
      return 'something on this network is actively refusing the connection — check a firewall or VPN blocking outbound HTTPS.';
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return 'the connection attempt timed out — likely a firewall silently dropping the packets rather than refusing them.';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
      return (
        "a certificate in the chain isn't trusted by Node — almost always a corporate SSL-inspecting proxy whose " +
        'root CA is trusted by your OS/browser but not by Node (separate trust stores). Set ' +
        "NODE_EXTRA_CA_CERTS to that proxy's root CA .pem file."
      );
    default:
      return null;
  }
}

/** Both invoice-PDF routes verify the admin's session token with a
 *  service-role client built from SUPABASE_URL — a *different* env var from
 *  the VITE_SUPABASE_URL the browser actually signs users in against. If
 *  those two ever point at different Supabase projects (an old project
 *  reused for SUPABASE_URL, a copy-pasted staging value, etc.), verification
 *  fails for every token, no matter how fresh — and the failure looks
 *  exactly like "your session expired," which sends whoever's debugging it
 *  down the wrong path (re-login, token refresh) instead of the real fix
 *  (env vars). This catches that specific case with an actionable message
 *  instead of the generic 401. Returns null when both are set and match, or
 *  when either is missing (some other check already covers that case). */
export function describeSupabaseProjectMismatch(serverUrl: string, clientUrl: string | undefined): string | null {
  const serverRef = supabaseProjectRef(serverUrl);
  const clientRef = supabaseProjectRef(clientUrl);
  if (!serverRef || !clientRef || serverRef === clientRef) return null;
  return (
    `Invoice auth is misconfigured: the server verifies session tokens against Supabase project "${serverRef}" ` +
    `(SUPABASE_URL), but the app signs admins in against project "${clientRef}" (VITE_SUPABASE_URL). ` +
    `Every token will be rejected until both env vars point at the same Supabase project.`
  );
}

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
