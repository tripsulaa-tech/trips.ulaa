// =============================================================================
// Local-dev-only stand-in for api/invoices/[id]/pdf.ts.
//
// WHY THIS EXISTS ("Failed to generate invoice" in local dev):
// `npm run dev` runs plain `vite` — there is no Vercel serverless runtime
// locally, so a fetch to /api/invoices/:id/pdf was never reaching
// api/invoices/[id]/pdf.ts at all. Vite's dev server has no route for
// /api/*, so its SPA fallback middleware caught the request and served
// index.html instead (200 OK, text/html). The client's own "does this
// actually look like a PDF" guard in src/utils/invoicePdf.ts correctly
// noticed the response wasn't a real PDF (wrong content-type, body doesn't
// start with the "%PDF-" magic bytes) and threw "The server returned an
// invalid PDF" — which is exactly the error in the console/alert. The
// Puppeteer route itself was never buggy; it just never ran locally.
//
// This middleware registers a matching /api/invoices/:id/pdf route inside
// Vite's own dev server so the button works end-to-end locally too. It
// reuses the exact same Supabase fetch + HTML template
// (api/_lib/generateInvoicePdf.ts + src/lib/invoice/invoiceHtml.ts) as the
// real route, so the invoice looks identical — the one difference is which
// Chromium runs it: production uses puppeteer-core + @sparticuz/chromium's
// Lambda-optimized binary, which doesn't launch on a normal dev machine.
// This launches the dev machine's own already-installed Chrome (or Edge)
// via puppeteer-core instead — NOT the full `puppeteer` package, which
// tries to download its own Chromium on `npm install` and fails on
// corporate networks whose SSL-inspecting proxy breaks that download
// ("unable to get local issuer certificate"). puppeteer-core is already a
// normal dependency, so this needs no extra install step at all.
//
// Wired into vite.config.ts for the `dev` command only (see
// `command === 'serve'` there) — this file has zero effect on
// `npm run build` / production.
// =============================================================================
import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import {
  fetchInvoiceRecord,
  renderInvoicePdfBuffer,
  isValidPdfBuffer,
  buildInvoiceHtml,
  describeSupabaseProjectMismatch,
  isAuthNetworkError,
  supabaseProjectRef,
  InvoiceNotFoundError,
  type PdfCapableBrowser,
} from '../api/_lib/generateInvoicePdf.ts';

const ROUTE = /^\/api\/invoices\/([^/]+)\/pdf\/?(?:\?.*)?$/;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// puppeteer-core's `channel` launch option only auto-detects Chrome in this
// version (no 'msedge' channel), so Edge — the default browser on a lot of
// corporate Windows images — needs its usual install paths checked by hand.
const EDGE_PATH_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
};

function findLocalEdgePath(): string | null {
  const candidates = EDGE_PATH_CANDIDATES[process.platform] || [];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/** Launches whatever Chromium-based browser is already installed on this
 *  machine — no download, so this works the same whether or not the
 *  network trusts npm's/Google's TLS certs. Order: an explicit
 *  PUPPETEER_EXECUTABLE_PATH override, then installed Chrome (via
 *  puppeteer-core's own detection), then a locally-installed Edge. */
async function launchLocalBrowser(explicitPath: string | undefined): Promise<PdfCapableBrowser> {
  if (explicitPath) {
    return puppeteer.launch({ headless: true, executablePath: explicitPath });
  }

  try {
    return await puppeteer.launch({ headless: true, channel: 'chrome' });
  } catch (chromeErr) {
    const edgePath = findLocalEdgePath();
    if (edgePath) {
      return puppeteer.launch({ headless: true, executablePath: edgePath });
    }
    throw new Error(
      "No local Chrome or Edge browser found to render the invoice preview. Install Google Chrome, or set PUPPETEER_EXECUTABLE_PATH in .env to your browser's .exe path. " +
        (chromeErr instanceof Error ? chromeErr.message : String(chromeErr)),
      { cause: chromeErr }
    );
  }
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function invoicePdfDevMiddleware(env: Record<string, string>): Plugin {
  return {
    name: 'ulaa-invoice-pdf-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.method === 'GET' && req.url ? req.url.match(ROUTE) : null;
        if (!match) {
          next();
          return;
        }

        const id = decodeURIComponent(match[1]);
        const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supabaseUrl || !serviceRoleKey) {
          sendJson(res, 500, {
            error:
              'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env. These are server-only (no VITE_ prefix — see .env.example) and are required to preview invoices locally; restart `npm run dev` after adding them.',
          });
          return;
        }

        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (!token) {
          sendJson(res, 401, { error: 'Missing bearer token.' });
          return;
        }

        // Check this before spending a network round-trip on a token
        // verification that's guaranteed to fail — see
        // describeSupabaseProjectMismatch's doc comment for why this
        // specific misconfiguration otherwise looks identical to an
        // expired session no matter how many times you refresh it.
        const mismatch = describeSupabaseProjectMismatch(supabaseUrl, env.VITE_SUPABASE_URL);
        if (mismatch) {
          console.error('[dev] Invoice auth misconfigured:', mismatch);
          sendJson(res, 500, { error: mismatch });
          return;
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !userData?.user) {
          if (authError && isAuthNetworkError(authError)) {
            // The Auth API was never reached — a broken/refreshed token
            // can't explain this, so don't suggest re-logging-in. On a dev
            // machine this is almost always a corporate proxy intercepting
            // outbound HTTPS (see the puppeteer-download comment above for
            // the same class of issue), no internet access at all, or the
            // Supabase project itself being paused (free-tier projects
            // auto-pause after inactivity).
            console.error('[dev] Could not reach Supabase Auth API:', authError.message);
            sendJson(res, 502, {
              error:
                `Could not reach Supabase's Auth API (${authError.message}) to verify your session — this is a ` +
                `network problem on this machine, not an expired session. Check your internet connection, any ` +
                `corporate proxy/VPN that might intercept HTTPS to *.supabase.co, and that the Supabase project ` +
                `("${supabaseProjectRef(supabaseUrl)}") isn't paused in the dashboard.`,
            });
            return;
          }
          // Local dev only, so it's safe to hand back the real reason
          // (e.g. "invalid JWT: unable to parse or verify signature" vs.
          // "Invalid API key") instead of a message that reads the same
          // whether the session actually expired or something's
          // misconfigured.
          console.error('[dev] Invoice token verification failed:', authError?.message || 'no user returned');
          sendJson(res, 401, {
            error: `Invalid or expired session.${authError?.message ? ` (${authError.message})` : ''}`,
          });
          return;
        }

        let record: Awaited<ReturnType<typeof fetchInvoiceRecord>>;
        try {
          record = await fetchInvoiceRecord(supabaseAdmin, id);
        } catch (err) {
          if (err instanceof InvoiceNotFoundError) {
            sendJson(res, 404, { error: err.message });
            return;
          }
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to load payment history.' });
          return;
        }

        // Read the logo straight off disk — dev is same-process, so no HTTP
        // round trip needed the way the deployed route needs one.
        let logoSrc: string | null;
        try {
          const logoPath = path.resolve(__dirname, '..', 'public', 'ULAA-logo.jpg');
          logoSrc = `data:image/jpeg;base64,${fs.readFileSync(logoPath).toString('base64')}`;
        } catch {
          logoSrc = null;
        }

        const html = buildInvoiceHtml(record.enquiry, record.payments, { logoSrc });

        let browser: PdfCapableBrowser | undefined;
        try {
          browser = await launchLocalBrowser(env.PUPPETEER_EXECUTABLE_PATH);
          const buffer = await renderInvoicePdfBuffer(browser, html);

          if (!isValidPdfBuffer(buffer)) {
            console.error('[dev] Invoice PDF generation produced an invalid PDF buffer', {
              length: buffer.length,
              head: buffer.subarray(0, 20).toString('hex'),
            });
            sendJson(res, 500, { error: 'Generated file was not a valid PDF. Please try again.' });
            return;
          }

          const ref = (record.enquiry.booking_id || record.enquiry.id).replace(/[^a-zA-Z0-9-]/g, '');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="ULAA-Invoice-${ref}.pdf"`);
          res.setHeader('Content-Length', buffer.length);
          res.end(buffer);
        } catch (err) {
          console.error('[dev] Invoice PDF generation failed:', err);
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to generate PDF.' });
        } finally {
          if (browser) await browser.close();
        }
      });
    },
  };
}
