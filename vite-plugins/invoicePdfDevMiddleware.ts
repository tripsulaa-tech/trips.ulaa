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
// real route, so the invoice looks identical — the one difference is the
// browser: production uses puppeteer-core + @sparticuz/chromium's
// Lambda-optimized binary, which does not launch on a normal dev machine,
// so this uses the full `puppeteer` package (bundles its own local
// Chromium) instead. `puppeteer` is a devDependency only — never bundled
// into the deployed site or the production function.
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
import {
  fetchInvoiceRecord,
  renderInvoicePdfBuffer,
  isValidPdfBuffer,
  buildInvoiceHtml,
  InvoiceNotFoundError,
  type PdfCapableBrowser,
} from '../api/_lib/generateInvoicePdf.ts';

const ROUTE = /^\/api\/invoices\/([^/]+)\/pdf\/?(?:\?.*)?$/;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !userData?.user) {
          sendJson(res, 401, { error: 'Invalid or expired session.' });
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

        // Narrowed to just the one function we call (rather than typing the
        // whole dynamically-imported module) to sidestep a messy
        // self-referential type puppeteer's own .d.ts produces for
        // `typeof import('puppeteer')` under project-reference type-checking.
        let launchBrowser: typeof import('puppeteer')['default']['launch'];
        try {
          launchBrowser = (await import('puppeteer')).default.launch;
        } catch {
          sendJson(res, 500, {
            error:
              'Local invoice preview needs the `puppeteer` package (bundles its own Chromium — puppeteer-core alone is not enough for local dev). Run: npm install puppeteer --save-dev, then restart `npm run dev`.',
          });
          return;
        }

        let browser: PdfCapableBrowser | undefined;
        try {
          browser = await launchBrowser({ headless: true });
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
          sendJson(res, 500, { error: 'Failed to generate PDF.' });
        } finally {
          if (browser) await browser.close();
        }
      });
    },
  };
}
