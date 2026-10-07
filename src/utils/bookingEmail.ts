import type { Enquiry, Payment } from '../types/types-index';
import { invoiceAsFile } from './invoicePdf';
import { supabase } from '../services/supabase';
import { logActivity, BOOKING_EMAIL_ACTION } from '../services/api/enquiries/activity';
import { formatDate, formatPrice, slugify } from './utils-index';
import { PAYMENT_TYPE_LABEL } from './pdf/invoice/shared';
import {
  getCachedBookingEmailTemplate,
  loadBookingEmailTemplate,
  templateToHtml,
  templateToText,
  type BookingEmailTemplate,
} from './bookingEmailTemplate';
import { SITE_ORIGIN } from '../constants/site';

// Same calculation as AdminEnquiriesShared's paymentBalance() — duplicated
// (rather than imported) so this utils/ module doesn't reach up into the
// admin/ feature folder for a one-line calculation.
function remainingBalance(enquiry: Enquiry): number | null {
  if (!enquiry.total_amount) return null;
  return Math.max(0, enquiry.total_amount - (enquiry.amount_paid || 0));
}

interface PaymentRow {
  label: string;
  amount: string;
}

// One row per real, collected transaction (paid, non-refund) — same filter
// the invoice PDF's payment table effectively distinguishes via its
// isPending/isRefund flags, just excluded outright here rather than shown
// greyed-out/negative: a booking-confirmation email should only list money
// actually in hand, not pending invoices or refund legs. Oldest first,
// matching getPaymentsForEnquiry's ledger order, so "Advance" always lands
// above any later "Installment"/"Balance" rows.
function paymentRows(payments: Payment[]): PaymentRow[] {
  return payments
    .filter(p => p.status === 'paid' && p.payment_type !== 'refund')
    .map(p => ({
      // An add-on says what it was for, e.g. "Add-on (Hotel upgrade) Received".
      label: `${PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}${p.payment_type === 'addon' && p.notes?.trim() ? ` (${p.notes.trim()})` : ''} Received`,
      amount: formatPrice(p.amount),
    }));
}

// Best-effort link to the trip's public page. Enquiry only carries
// trip_title (not the trip's actual slug), and a trip's slug is frozen to
// slugify(title) at creation time (see AdminTripFormModal.tsx /
// freeze_trip_and_album_slugs.sql) — so slugify-ing the title reproduces the
// real slug for any trip whose title hasn't been edited since it was
// created. Good enough for a "here's roughly where to click" link without
// threading the full trips list into every place this email can be sent
// from (list rows, mobile cards, the details popup, and the detail page).
function tripPageUrl(enquiry: Enquiry): string | null {
  if (!enquiry.trip_title) return null;
  const slug = slugify(enquiry.trip_title);
  if (!slug) return null;
  return `${window.location.origin}/trips/${slug}`;
}

interface BookingEmailFields {
  to: string;
  subject: string;
  tripName: string;
  rows: PaymentRow[];
  totalPaidText: string;
  balance: number | null;
  balanceText: string;
  isFullyPaid: boolean;
  deadlineText: string;
  tripUrl: string | null;
  bookingId: string | null;
}

function bookingEmailFields(enquiry: Enquiry, payments: Payment[], t: BookingEmailTemplate): BookingEmailFields {
  const tripName = enquiry.trip_title || 'your trip';
  const balance = remainingBalance(enquiry);
  const isFullyPaid = balance != null && balance <= 0;
  const balanceText = balance != null ? formatPrice(balance) : '—';
  const deadlineText = enquiry.balance_due_date ? formatDate(enquiry.balance_due_date, { month: 'short' }) : 'TBD';
  return {
    to: enquiry.email || '',
    subject: templateToText(isFullyPaid ? t.subjectFull : t.subjectConfirmed, {
      trip: tripName,
      name: enquiry.full_name,
      booking_id: enquiry.booking_id || '',
      total: formatPrice(enquiry.amount_paid || 0),
      balance: balanceText,
      deadline: deadlineText,
    }),
    tripName,
    rows: paymentRows(payments),
    totalPaidText: formatPrice(enquiry.amount_paid || 0),
    balance,
    balanceText,
    isFullyPaid,
    deadlineText,
    tripUrl: tripPageUrl(enquiry),
    bookingId: enquiry.booking_id || null,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Brand palette, kept in sync with the `@theme` block in
// src/styles/globals.css (--color-primary, --color-dark, etc.) so the email
// reads as the same brand family as the site and the invoice PDF. Email
// clients can't read CSS custom properties reliably, so these are the same
// values inlined directly instead of referenced as variables.

// Hosted logo asset — same file the public site's navbar and the invoice
// PDF already use. Wrapped in an explicit white card wherever it's placed
// below (rather than sitting directly on the surrounding background),
// because several clients — Gmail's Android app among them — apply their
// own dark-mode inversion to a mail's colors regardless of the
// color-scheme meta tags in <head>, which would otherwise make a
// dark-wordmark logo vanish against an auto-darkened background.
const LOGO_URL = `${SITE_ORIGIN}/ULAA-logo.png`;
// Dark-mode variant made for the email sign-off (light lettering on a transparent
// background, file: public/ULAA-logo-mail-dark.png), shown instead of LOGO_URL in
// clients that support prefers-color-scheme — see the .logo-dark rule in <style>.
// The site's footer logo is left as it was.
const LOGO_FOOTER_URL = `${SITE_ORIGIN}/ULAA-logo-mail-dark.png`;

/** Rich, production-ready HTML email — table-based layout, inline styles,
 *  and a bulletproof VML button for Outlook. One fixed light-mode design
 *  (no dark-mode variant): most sends are opened in Gmail, which doesn't
 *  auto-invert author-specified colors, so a single tested appearance is
 *  simpler to maintain and verify than a light/dark pair.
 *  `color-scheme`/`supported-color-schemes` below tell the handful of
 *  clients that do support a dark mode (Apple Mail, Outlook.com) to render
 *  this in light mode rather than auto-inverting it. */
function buildBookingEmailHtml(enquiry: Enquiry, payments: Payment[], t: BookingEmailTemplate): string {
  const f = bookingEmailFields(enquiry, payments, t);
  const BRAND_COLOR = t.accentColour;
  const vars = {
    name: enquiry.full_name,
    trip: f.tripName,
    booking_id: f.bookingId || '',
    total: f.totalPaidText,
    balance: f.balanceText,
    deadline: f.deadlineText,
  };
  const words = (text: string) => templateToHtml(text, vars);
  const lw = t.logoWidth;
  // Light and dark logos are chosen separately in Logo Studio → Email. A custom light logo
  // with no dark one is used in both modes; with nothing uploaded, Ulaa's own pair is used.
  const lightLogo = t.logoUrl || LOGO_URL;
  const darkLogo = t.logoDarkUrl || (t.logoUrl ? '' : LOGO_FOOTER_URL);
  const logoImg = (src: string, cls: string, display: string) =>
    `<img src="${src}" width="${lw}" alt="Ulaa"${cls ? ` class="${cls}"` : ''} style="display: ${display}; width: ${lw}px; max-width: ${lw}px; height: auto;">`;
  const logoHtml = darkLogo
    ? `${logoImg(lightLogo, 'logo-light', 'block')}
                          ${logoImg(darkLogo, 'logo-dark', 'none')}`
    : logoImg(lightLogo, '', 'block');
  const trip = escapeHtml(f.tripName);
  const bookingIdRow = f.bookingId
    ? `
              <tr>
                <td align="center" style="padding: 18px 24px 22px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse: collapse;">
                    <tr>
                      <td style="background-color: #FAF7F2; border: 1px solid #E8DFD3; border-radius: 10px; padding: 14px 28px; text-align: center;">
                        <p style="margin: 0 0 4px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A7864;">Booking ID</p>
                        <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 700; color: #2D2118; letter-spacing: 0.02em;">${escapeHtml(f.bookingId)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`
    : '';
  const tripLinkHref = f.tripUrl ?? SITE_ORIGIN;

  // One row per real payment received so far (Advance, Installment,
  // Balance, Full Payment — whatever the ledger actually contains), rather
  // than a single hardcoded "Advance Payment Received" line that misrepresented
  // every later installment/balance email as if it were the original advance.
  const paymentRowsHtml = f.rows.map(row => `
                      <tr>
                        <td style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #2D2118; border-bottom: 1px solid #F0E9DC;">${escapeHtml(row.label)}</td>
                        <td align="right" style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #2D2118; border-bottom: 1px solid #F0E9DC;">${row.amount}</td>
                      </tr>`).join('');

  // Total-paid summary row, styled two ways: once the balance hits zero it
  // takes over the highlighted slot the "Remaining Balance" row used to
  // occupy (with an explicit "Full Payment" tag, since that's the one thing
  // the itemized rows above don't spell out on their own — three
  // installments summing to the total isn't obviously "done" at a glance).
  // While balance remains, it's a plain running-total row sitting above the
  // still-highlighted Remaining Balance/deadline rows.
  const summaryRowsHtml = f.isFullyPaid ? `
                      <tr>
                        <td style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4;">Total Paid &mdash; Full Payment&nbsp;&#10003;</td>
                        <td align="right" style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4;">${f.totalPaidText}</td>
                      </tr>` : `
                      <tr>
                        <td style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #2D2118; border-bottom: 1px solid #F0E9DC;">Total Paid So Far</td>
                        <td align="right" style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #2D2118; border-bottom: 1px solid #F0E9DC;">${f.totalPaidText}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4; border-bottom: 1px solid #F0E9DC;">Remaining Balance</td>
                        <td align="right" style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4; border-bottom: 1px solid #F0E9DC;">${f.balanceText}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #2D2118;">Final Payment Deadline</td>
                        <td align="right" style="padding: 10px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #2D2118;">${f.deadlineText}</td>
                      </tr>`;

  const paymentInfoLabel = words(f.isFullyPaid ? t.paymentLabelFull : t.paymentLabelPartial);
  const paymentInfoText = words(f.isFullyPaid ? t.paymentNoteFull : t.paymentNotePartial);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<title>${escapeHtml(f.subject)}</title>
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }

  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
    .mobile-padding { padding-left: 24px !important; padding-right: 24px !important; }
    .trip-title { font-size: 20px !important; }
  }

  /* Clients that honor prefers-color-scheme (Apple Mail, newer webmail
     Gmail) swap in the footer-style logo, which reads better once the
     surrounding card gets dark-mode-inverted. Clients that ignore this
     (older Gmail Android among them) just keep showing .logo-light,
     which is why it also sits inside its own white card below — that's
     the fallback for everyone this media query doesn't reach. */
  .logo-dark { display: none; }
  /* Dark mode follows the app's own dark surface (the site footer: warm dark brown
     #2D2118 with cream text and the orange accents), not a generic black-and-white
     inversion. Only clients that honour prefers-color-scheme see this. */
  @media (prefers-color-scheme: dark) {
    .logo-light { display: none !important; }
    .logo-dark { display: block !important; }
    body, center, [style*="background-color: #F2EBE0"] { background-color: #211912 !important; }
    td[style*="background-color: #FFFFFF"] { background-color: #2D2118 !important; }
    td[style*="background-color: #FAF7F2"], table[style*="background-color: #FAF7F2"] { background-color: #3A2B20 !important; }
    td[style*="background-color: #FAF1E4"] { background-color: #3D2C1F !important; }
    [style*="solid #E8DFD3"], [style*="solid #EEE6D8"], [style*="solid #F0E9DC"] { border-color: #4A3728 !important; }
    p[style*="color: #2D2118"], h1[style*="color: #2D2118"], td[style*="color: #2D2118"] { color: #F8F4EC !important; }
    p[style*="color: #4A3728"], p[style*="color: #6B5744"] { color: #DDD2C4 !important; }
    p[style*="color: #8A7864"], td[style*="color: #8A7864"] { color: #BBAA92 !important; }
    p[style*="color: ${BRAND_COLOR}"], span[style*="color: ${BRAND_COLOR}"], td[style*="color: ${BRAND_COLOR}"], a[style*="text-decoration: underline"] { color: #E39A4F !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #F2EBE0;">
<div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #F2EBE0; opacity: 0;">
  ${words(t.preheader)}
</div>
<center style="width: 100%; background-color: #F2EBE0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F2EBE0;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="email-container" style="width: 600px; max-width: 600px;">
          <tr>
            <td align="center" style="padding: 4px 4px 26px;">
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 16px; letter-spacing: 0.01em; color: #8A7864;">${words(t.tagline)}</p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #FFFFFF; border-radius: 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

                <tr>
                  <td class="mobile-padding" align="center" style="padding: 40px 40px 4px;">
                    <p style="margin: 0 0 10px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND_COLOR};">${words(t.badge)}</p>
                    <h1 class="trip-title" style="margin: 0 0 18px; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #2D2118;">${trip}</h1>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px;">
                    <p style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">${words(t.greeting)}</p>
                    <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">${words(t.intro)}</p>
                    <p style="margin: 14px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">${words(t.confirmLine)}</p>
                  </td>
                </tr>
${bookingIdRow}

                <tr>
                  <td class="mobile-padding" style="padding: 24px 40px 24px; border-top: 1px solid #EEE6D8; padding-top: 24px;">
                    <p style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A7864;">Booking Details</p>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
                      <tr>
                        <td style="padding: 0 0 10px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #8A7864; border-bottom: 1px solid #EEE6D8;">Description</td>
                        <td align="right" style="padding: 0 0 10px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #8A7864; border-bottom: 1px solid #EEE6D8;">Amount</td>
                      </tr>
${paymentRowsHtml}${summaryRowsHtml}
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #FAF7F2; border: 1px solid #E8DFD3; border-radius: 10px;">
                      <tr>
                        <td width="20" valign="top" style="padding: 18px 0 18px 20px;">
                          <span style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${BRAND_COLOR};">&#9432;</span>
                        </td>
                        <td style="padding: 18px 20px 18px 8px;">
                          <p style="margin: 0 0 8px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${BRAND_COLOR};">${paymentInfoLabel}</p>
                          <p style="margin: 0 0 8px; font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #4A3728;">${paymentInfoText}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px 8px;">
                    <p style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A7864;">Trip Details</p>
                    <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #6B5744;">For complete details regarding our Terms &amp; Conditions, Cancellation Policy, and Trip Policies, please refer to the <a href="${tripLinkHref}" style="color: ${BRAND_COLOR}; text-decoration: underline;">${trip} trip page</a>.</p>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding: 8px 40px 40px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${tripLinkHref}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="12%" strokecolor="${BRAND_COLOR}" fillcolor="${BRAND_COLOR}">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Helvetica, Arial, sans-serif;font-size:15px;font-weight:bold;">${words(t.buttonLabel)} &#8594;</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${tripLinkHref}" target="_blank" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #FFFFFF; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 40px; border-radius: 8px; mso-hide: all;">${words(t.buttonLabel)} &#8594;</a>
                    <!--<![endif]-->
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 24px 40px 16px; border-top: 1px solid #EEE6D8;">
                    <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">${words(t.closingLine)}</p>
                    <p style="margin: 14px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">${words(t.signOff)}</p>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" align="left" style="padding: 0 40px 32px; text-align: left;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding: 0;">
${logoHtml}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</center>
</body>
</html>`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Builds the exact subject/recipient/HTML body that `sendBookingEmail`
 *  below would send, without actually sending anything — for an admin
 *  "preview before you send" view. Safe to call as often as needed (no
 *  network/edge-function calls, no invoice PDF generation). */
export function bookingEmailPreview(enquiry: Enquiry, payments: Payment[]): { to: string; subject: string; html: string } {
  const t = getCachedBookingEmailTemplate();
  void loadBookingEmailTemplate(); // refresh for the next preview if it was edited elsewhere
  const { to, subject } = bookingEmailFields(enquiry, payments, t);
  return { to, subject, html: buildBookingEmailHtml(enquiry, payments, t) };
}

/** A made-up booking rendered with the given wording, for the Logo Studio email editor's live preview. */
export function bookingEmailSample(t: BookingEmailTemplate, fullyPaid: boolean): { subject: string; html: string } {
  const enquiry = {
    id: 'sample',
    full_name: 'Priya Sharma',
    email: 'priya@example.com',
    trip_title: 'Sri Lanka: Girls-Only Luxury Escape',
    booking_id: 'ULA-1042',
    total_amount: 45000,
    amount_paid: fullyPaid ? 45000 : 15000,
    balance_due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  } as unknown as Enquiry;
  const payments: Payment[] = [
    { id: 'p1', enquiry_id: 'sample', amount: 15000, payment_type: 'advance', paid_at: '', created_at: '', status: 'paid' },
    ...(fullyPaid
      ? [{ id: 'p2', enquiry_id: 'sample', amount: 30000, payment_type: 'balance' as const, paid_at: '', created_at: '', status: 'paid' as const }]
      : []),
  ];
  return { subject: bookingEmailFields(enquiry, payments, t).subject, html: buildBookingEmailHtml(enquiry, payments, t) };
}

/** supabase.functions.invoke() reports any non-2xx reply as a generic
 *  "Edge Function returned a non-2xx status code" and keeps the real answer in
 *  `error.context` (the Response). Read it so the admin sees WHY a send
 *  failed (not signed in as an admin, bad payload, Resend rejected it…). */
async function describeEmailError(error: { message?: string; context?: unknown }): Promise<string> {
  const res = error.context;
  if (res instanceof Response) {
    try {
      const body = (await res.clone().json()) as { error?: string; field?: string; detail?: string };
      const parts = [body.error, body.field && `(${body.field})`, body.detail].filter(Boolean);
      if (parts.length) return `${res.status}: ${parts.join(' ')}`;
    } catch {
      /* body wasn't JSON — fall through */
    }
    return `${res.status} ${res.statusText || 'error'}`;
  }
  return error.message || 'Unknown error';
}

/** Sends the booking confirmation for real, via the `send-booking-email`
 *  Supabase Edge Function (which relays it through Resend) — the rich HTML
 *  body (logo, formatted payment card, a real "View Trip Details" button)
 *  and the invoice PDF as a genuine attachment, landing directly in the
 *  customer's inbox with no manual step for the admin at all.
 *
 *  Requires the edge function to be deployed and RESEND_API_KEY /
 *  RESEND_FROM_EMAIL to be set — see supabase/functions/send-booking-email/
 *  index.ts for one-time setup. Until that's done, this will throw and the
 *  caller's catch block will surface the error. */
export async function sendBookingEmail(enquiry: Enquiry, payments: Payment[]): Promise<void> {
  const template = await loadBookingEmailTemplate(); // always the latest saved wording
  const { to, subject } = bookingEmailFields(enquiry, payments, template);
  if (!to) throw new Error('This enquiry has no email address on file.');

  const html = buildBookingEmailHtml(enquiry, payments, template);
  const pdfFile = await invoiceAsFile(enquiry, payments);
  const attachmentBase64 = await fileToBase64(pdfFile);

  const { data, error } = await supabase.functions.invoke('send-booking-email', {
    body: {
      to,
      subject,
      html,
      attachmentBase64,
      attachmentFilename: pdfFile.name,
    },
  });

  if (error) throw new Error(await describeEmailError(error));
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to send email');

  // Only reached when the send succeeded: one timeline entry per email, so the
  // admin screens can show whether (and how many times) it has gone out.
  await logActivity(enquiry.id, BOOKING_EMAIL_ACTION, to);
}
