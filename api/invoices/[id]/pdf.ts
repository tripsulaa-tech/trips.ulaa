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
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { buildInvoiceHtml, type InvoiceEnquiry, type InvoicePayment } from '../../../src/lib/invoice/invoiceHtml';

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
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  // ── Fetch booking + payment ledger ─────────────────────────────────────
  const { data: enquiry, error: enquiryError } = await supabaseAdmin
    .from('enquiries')
    .select('id, booking_id, full_name, phone, email, city, trip_title, departure_date, package_type, total_amount, amount_paid, group_id, group_size, group_seq')
    .or(`id.eq.${id},booking_id.eq.${id}`)
    .single();

  if (enquiryError || !enquiry) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from('payments')
    .select('amount, payment_type, payment_method, paid_at')
    .eq('enquiry_id', enquiry.id)
    .order('paid_at', { ascending: true });

  if (paymentsError) {
    res.status(500).json({ error: 'Failed to load payment history.' });
    return;
  }

  // ── Logo (same-origin static asset, fetched as a data URL so Puppeteer
  //    doesn't need a second network hop or CORS handling) ────────────────
  let logoSrc: string | null = null;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const logoRes = await fetch(`${protocol}://${host}/ULAA-logo.jpg`);
    if (logoRes.ok) {
      const buf = Buffer.from(await logoRes.arrayBuffer());
      logoSrc = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  } catch {
    logoSrc = null;
  }

  const html = buildInvoiceHtml(enquiry as InvoiceEnquiry, (payments || []) as InvoicePayment[], { logoSrc });

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
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    // Puppeteer's page.pdf() resolves a Uint8Array (not always a real Node
    // Buffer instance). @vercel/node's res.send() only recognizes actual
    // Buffers as binary — anything else gets JSON.stringify'd into a text
    // blob of byte indices, which downloads fine but isn't a valid PDF.
    // Buffer.from(...) + res.end() sidesteps that body-sniffing entirely.
    const buffer = Buffer.from(pdf);

    // Guard against ever shipping a broken file to the browser: a real PDF
    // always starts with the "%PDF-" magic bytes. If Chromium produced a
    // blank/corrupt render (or the process was killed mid-render), fail
    // loudly server-side instead of handing the client bytes that download
    // fine but show "We can't open this file" in the PDF viewer.
    const isValidPdf = buffer.length > 0 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    if (!isValidPdf) {
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
