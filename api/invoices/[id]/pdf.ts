// GET /api/invoices/:id/pdf
//
// Vercel Serverless Function (Node.js runtime). Given an `enquiries.id` (or
// `booking_id`), fetches the booking + its payment ledger straight from
// Supabase with the service-role key (bypassing RLS — this route does its
// own auth check below instead), renders the shared invoice HTML template,
// and prints it to a PDF with headless Chromium via Puppeteer.
//
// Auth: requires `Authorization: Bearer <supabase access token>` for a
// signed-in admin (this app treats any authenticated Supabase user as
// admin — see supabase/schema.sql RLS policies on `enquiries`/`payments`).
// Never expose this endpoint without that check: it returns travellers'
// PII (name/phone/email) and payment amounts.
//
// Env vars required (server-only — do NOT prefix with VITE_ or they'd be
// bundled into the public client):
//   SUPABASE_URL                 (same value as VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    (Supabase dashboard → Settings → API)
//
// NOTE: `npm run dev` runs plain `vite`, which does not run Vercel
// serverless functions — this file is never invoked locally. For local
// invoice-PDF testing see vite-plugins/invoicePdfDevMiddleware.ts, which
// reuses fetchInvoiceRecord/renderInvoicePdfBuffer from
// api/_lib/generateInvoicePdf.ts so both stay in sync.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {
  fetchInvoiceRecord,
  renderInvoicePdfBuffer,
  isValidPdfBuffer,
  logoDataUrlFromHttp,
  buildInvoiceHtml,
  describeSupabaseProjectMismatch,
  isAuthNetworkError,
  InvoiceNotFoundError,
} from '../../_lib/generateInvoicePdf';

// Memory/duration for this function are configured in vercel.json's
// "functions" block (headless Chromium needs more of both than the
// platform default).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars.' });
    return;
  }

  const id = typeof req.query.id === 'string' ? req.query.id : Array.isArray(req.query.id) ? req.query.id[0] : '';
  if (!id) {
    res.status(400).json({ error: 'Missing booking id.' });
    return;
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Auth: verify the caller's Supabase session token ──────────────────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }
  // Same env-var mismatch this route's SUPABASE_URL comment warns about:
  // if it and VITE_SUPABASE_URL (what the browser actually signs admins in
  // against) ever point at different Supabase projects, every token fails
  // verification — and looks exactly like an expired session no matter how
  // many times the client refreshes it. Caught here as a 500 (config
  // problem) instead of a misleading 401 (auth problem). Kept generic in
  // the response since this is production, but the real cause is logged.
  const mismatch = describeSupabaseProjectMismatch(SUPABASE_URL, process.env.VITE_SUPABASE_URL);
  if (mismatch) {
    console.error('Invoice auth misconfigured:', mismatch);
    res.status(500).json({ error: 'Server misconfigured: invoice auth cannot verify sessions. See function logs.' });
    return;
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    if (authError && isAuthNetworkError(authError)) {
      // The Auth API itself was unreachable (DNS/connect/TLS failure, or
      // the Supabase project is paused) — this has nothing to do with the
      // admin's session, so don't tell them to log back in.
      console.error('Could not reach Supabase Auth API:', authError.message);
      res.status(502).json({ error: "Could not verify your session: Supabase's Auth API is unreachable right now. Please try again shortly." });
      return;
    }
    console.error('Invoice token verification failed:', authError?.message || 'no user returned');
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  // ── Fetch booking + payment ledger ─────────────────────────────────────
  let record: Awaited<ReturnType<typeof fetchInvoiceRecord>>;
  try {
    record = await fetchInvoiceRecord(supabaseAdmin, id);
  } catch (err) {
    if (err instanceof InvoiceNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Failed to load payment history.' });
    return;
  }
  const { enquiry, payments } = record;

  // ── Logo (same-origin static asset, fetched as a data URL so Puppeteer
  //    doesn't need a second network hop or CORS handling) ────────────────
  const host = (req.headers['x-forwarded-host'] || req.headers.host) as string;
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
  const logoSrc = await logoDataUrlFromHttp(protocol, host);

  const html = buildInvoiceHtml(enquiry, payments, { logoSrc });

  // ── Render with headless Chromium ──────────────────────────────────────
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      // IMPORTANT: use chromium.headless, not a hardcoded `true`.
      // @sparticuz/chromium's `args` are built to match whatever headless
      // mode `chromium.headless` reports for the bundled Chromium build.
      // Hardcoding `true` (the legacy boolean headless mode) can mismatch
      // those args on newer @sparticuz/chromium versions (which default to
      // the new "shell" headless mode) — Chromium then launches with an
      // inconsistent flag set and can silently render a blank/truncated
      // page, which still produces *a* PDF, just not a valid/openable one.
      headless: chromium.headless,
    });

    const buffer = await renderInvoicePdfBuffer(browser, html);

    // Guard against ever shipping a broken file to the browser: a real PDF
    // always starts with the "%PDF-" magic bytes. If Chromium produced a
    // blank/corrupt render (or the process was killed mid-render), fail
    // loudly server-side instead of handing the client bytes that download
    // fine but show "We can't open this file" in the PDF viewer.
    if (!isValidPdfBuffer(buffer)) {
      console.error('Invoice PDF generation produced an invalid PDF buffer', {
        length: buffer.length,
        head: buffer.subarray(0, 20).toString('hex'),
      });
      res.status(500).json({ error: 'Generated file was not a valid PDF. Please try again.' });
      return;
    }

    const ref = (enquiry.booking_id || enquiry.id).replace(/[^a-zA-Z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ULAA-Invoice-${ref}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.status(200).end(buffer);
  } catch (err) {
    console.error('Invoice PDF generation failed:', err);
    res.status(500).json({ error: 'Failed to generate PDF.' });
  } finally {
    if (browser) await browser.close();
  }
}
