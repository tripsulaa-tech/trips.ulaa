import type { Enquiry, Payment } from '../types/types-index';
import { invoiceAsFile } from './invoicePdf';
import { formatDate, formatPrice, slugify } from './utils-index';

// Same calculation as AdminEnquiriesShared's paymentBalance() — duplicated
// (rather than imported) so this utils/ module doesn't reach up into the
// admin/ feature folder for a one-line calculation.
function remainingBalance(enquiry: Enquiry): number | null {
  if (!enquiry.total_amount) return null;
  return Math.max(0, enquiry.total_amount - (enquiry.amount_paid || 0));
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
  advance: string;
  balanceText: string;
  deadlineText: string;
  tripUrl: string | null;
  bookingId: string | null;
}

function bookingEmailFields(enquiry: Enquiry): BookingEmailFields {
  const tripName = enquiry.trip_title || 'your trip';
  const advance = formatPrice(enquiry.booking_amount || enquiry.amount_paid || 0);
  const balance = remainingBalance(enquiry);
  const balanceText = balance != null ? formatPrice(balance) : '—';
  const deadlineText = enquiry.balance_due_date ? formatDate(enquiry.balance_due_date) : 'TBD';
  return {
    to: enquiry.email || '',
    subject: `Booking Confirmation - ${tripName}`,
    tripName,
    advance,
    balanceText,
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

// Hosted logo asset — same file the public site's navbar and the invoice
// PDF already use (see Navbar.tsx / pdf/invoice/shared.ts loadLogo()), so
// the email stays in sync with the brand asset automatically rather than
// carrying its own copy. Needs an absolute URL: mail clients load images
// over the network, they can't resolve a root-relative site path.
const LOGO_URL = 'https://www.ulaatrips.com/ULAA-logo.png';

// Decorative footer banner (dunes/palm/birds illustration + the
// "WOMEN · EXPLORE · BELONG" tagline baked into the artwork) — supplied as
// separate light/dark exports, so both live in public/email-assets/ and get
// deployed to the site's root alongside ULAA-logo.png. Resized to 1200px
// wide (2x for a 600px-wide email) and palette-quantized down from the
// original ~2170px exports, since this is flat illustration art rather
// than a photo — same visual result at roughly a fifth of the file size.
const FOOTER_BANNER_LIGHT_URL = 'https://www.ulaatrips.com/email-assets/footer-banner-light.png';
const FOOTER_BANNER_DARK_URL = 'https://www.ulaatrips.com/email-assets/footer-banner-dark.png';

// Brand palette, kept in sync with the `@theme` block in
// src/styles/globals.css (--color-primary, --color-dark, etc.) so the email
// reads as the same brand family as the site and the invoice PDF. Email
// clients can't read CSS custom properties reliably, so these are the same
// values inlined directly instead of referenced as variables.
const BRAND_COLOR = '#A85A2A'; // --color-primary
const BRAND_COLOR_DARK_MODE = '#D98A3A'; // --color-secondary — brighter, for contrast on dark backgrounds

// Confirmed, real brand handle (see BRAND_BASE in pdf/shared.ts, also used
// on the invoice PDF footer) — the only social account verified for Ulaa,
// so it's the only one linked here rather than guessing at other platforms.
const INSTAGRAM_HANDLE = '@ulaa.trips';
const INSTAGRAM_URL = 'https://instagram.com/ulaa.trips';

/** Rich, production-ready HTML email — table-based layout, inline styles,
 *  a light/dark-mode-aware <style> block, and a bulletproof VML button for
 *  Outlook. Baked directly into the .eml file built below, not sent as-is
 *  anywhere else. */
function buildBookingEmailHtml(enquiry: Enquiry): string {
  const f = bookingEmailFields(enquiry);
  const trip = escapeHtml(f.tripName);
  const name = escapeHtml(enquiry.full_name);
  const bookingIdRow = f.bookingId
    ? `
              <tr>
                <td align="center" style="padding: 18px 24px 22px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse: collapse;">
                    <tr>
                      <td class="id-card" style="background-color: #FAF7F2; border: 1px solid #E8DFD3; border-radius: 10px; padding: 14px 28px; text-align: center;">
                        <p class="muted-text" style="margin: 0 0 4px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A7864;">Booking ID</p>
                        <p class="dark-text" style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 700; color: #2D2118; letter-spacing: 0.02em;">${escapeHtml(f.bookingId)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`
    : '';
  const tripLinkHref = f.tripUrl ?? `https://www.ulaatrips.com`;

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
    .mobile-stack { display: block !important; width: 100% !important; text-align: left !important; }
    .mobile-stack-right { text-align: left !important; padding-top: 2px !important; }
    .trip-title { font-size: 20px !important; }
  }

  @media (prefers-color-scheme: dark) {
    .body-bg { background-color: #17120C !important; }
    .card-bg { background-color: #221A12 !important; }
    .id-card { background-color: #2A2115 !important; border-color: #4A3728 !important; }
    .info-card { background-color: #2A2115 !important; border-color: #4A3728 !important; }
    .balance-bg { background-color: #3A2C1A !important; }
    .hairline { border-color: #3A2E22 !important; }
    .dark-text { color: #F5EFE4 !important; }
    .muted-text { color: #C9B79F !important; }
    .brand-text { color: ${BRAND_COLOR_DARK_MODE} !important; }
    .logo-chip { background-color: #FAF7F2 !important; }
    .footer-bg { background-color: #120D08 !important; }
    .footer-text { color: #8A7864 !important; }
    .banner-light { display: none !important; }
    .banner-dark { display: block !important; }
  }

  [data-ogsc] .body-bg { background-color: #17120C !important; }
  [data-ogsc] .card-bg { background-color: #221A12 !important; }
  [data-ogsc] .id-card { background-color: #2A2115 !important; border-color: #4A3728 !important; }
  [data-ogsc] .info-card { background-color: #2A2115 !important; border-color: #4A3728 !important; }
  [data-ogsc] .balance-bg { background-color: #3A2C1A !important; }
  [data-ogsc] .hairline { border-color: #3A2E22 !important; }
  [data-ogsc] .dark-text { color: #F5EFE4 !important; }
  [data-ogsc] .muted-text { color: #C9B79F !important; }
  [data-ogsc] .brand-text { color: ${BRAND_COLOR_DARK_MODE} !important; }
  [data-ogsc] .footer-bg { background-color: #120D08 !important; }
  [data-ogsc] .footer-text { color: #8A7864 !important; }
  [data-ogsc] .banner-light { display: none !important; }
  [data-ogsc] .banner-dark { display: block !important; }
</style>
</head>
<body class="body-bg" style="margin: 0; padding: 0; background-color: #F2EBE0;">
<div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #F2EBE0; opacity: 0;">
  Your booking for ${trip} is confirmed — booking ID ${f.bookingId ? escapeHtml(f.bookingId) : 'attached'}.
</div>
<center class="body-bg" style="width: 100%; background-color: #F2EBE0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color: #F2EBE0;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="email-container" style="width: 600px; max-width: 600px;">
          <tr>
            <td class="mobile-padding" align="left" style="padding: 0 4px 14px;">
              <p class="muted-text" style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #8A7864;">Your next adventure is waiting</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="logo-chip" style="background-color: #FFFFFF; border-radius: 10px; padding: 10px 20px;">
                    <img src="${LOGO_URL}" width="120" alt="Ulaa" style="display: block; width: 120px; max-width: 120px; height: auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="card-bg" style="background-color: #FFFFFF; border-radius: 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

                <tr>
                  <td class="mobile-padding" align="center" style="padding: 40px 40px 4px;">
                    <p class="brand-text" style="margin: 0 0 10px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND_COLOR};">Booking Confirmed</p>
                    <h1 class="dark-text trip-title" style="margin: 0 0 18px; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #2D2118;">${trip}</h1>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px;">
                    <p class="dark-text" style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">Dear ${name},</p>
                    <p class="dark-text" style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">Thank you for choosing Ulaa. We're delighted to have you join us on our ${trip}. Your booking is confirmed — please find your invoice attached for your reference.</p>
                  </td>
                </tr>
${bookingIdRow}

                <tr>
                  <td class="mobile-padding hairline" style="padding: 0 40px 24px; border-top: 1px solid #EEE6D8; padding-top: 24px;">
                    <p class="muted-text" style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A7864;">Payment Summary</p>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
                      <tr>
                        <td class="muted-text" style="padding: 0 0 10px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #8A7864; border-bottom: 1px solid #EEE6D8;">Description</td>
                        <td class="muted-text" align="right" style="padding: 0 0 10px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #8A7864; border-bottom: 1px solid #EEE6D8;">Amount</td>
                      </tr>
                      <tr>
                        <td class="dark-text" style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #2D2118; border-bottom: 1px solid #F0E9DC;">Advance Payment Received</td>
                        <td class="dark-text" align="right" style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #2D2118; border-bottom: 1px solid #F0E9DC;">${f.advance}</td>
                      </tr>
                      <tr>
                        <td class="balance-bg" style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4; border-bottom: 1px solid #F0E9DC;">Remaining Balance</td>
                        <td class="balance-bg brand-text" align="right" style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4; border-bottom: 1px solid #F0E9DC;">${f.balanceText}</td>
                      </tr>
                      <tr>
                        <td class="dark-text" style="padding: 10px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #2D2118;">Final Payment Deadline</td>
                        <td class="dark-text" align="right" style="padding: 10px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #2D2118;">${f.deadlineText}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="info-card" style="background-color: #FAF7F2; border: 1px solid #E8DFD3; border-radius: 10px;">
                      <tr>
                        <td width="20" valign="top" style="padding: 18px 0 18px 20px;">
                          <span class="brand-text" style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${BRAND_COLOR};">&#9432;</span>
                        </td>
                        <td style="padding: 18px 20px 18px 8px;">
                          <p class="brand-text" style="margin: 0 0 8px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${BRAND_COLOR};">Important Payment Information</p>
                          <p class="dark-text" style="margin: 0 0 8px; font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #4A3728;">Please note that the advance payment of <strong>${f.advance} is non-refundable</strong>, as it is used to confirm your booking. The remaining balance of <strong>${f.balanceText}</strong> must be paid on or before <strong>${f.deadlineText}</strong>.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px 28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="20" valign="top" style="padding-top: 1px;">
                          <span class="muted-text" style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #8A7864;">&#128196;</span>
                        </td>
                        <td style="padding-left: 8px;">
                          <p class="muted-text" style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #6B5744;">For complete details regarding our Terms &amp; Conditions, Cancellation Policy, and Trip Policies, please refer to the <a href="${tripLinkHref}" style="color: ${BRAND_COLOR}; text-decoration: underline;">${trip} trip page</a>.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding: 0 40px 40px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${tripLinkHref}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="12%" strokecolor="${BRAND_COLOR}" fillcolor="${BRAND_COLOR}">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Helvetica, Arial, sans-serif;font-size:15px;font-weight:bold;">View Trip Details &#8594;</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${tripLinkHref}" target="_blank" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #FFFFFF; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 40px; border-radius: 8px; mso-hide: all;">View Trip Details &#8594;</a>
                    <!--<![endif]-->
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding hairline" style="padding: 24px 40px 36px; border-top: 1px solid #EEE6D8;">
                    <p class="dark-text" style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">We look forward to welcoming you on the trip.</p>
                    <p class="dark-text" style="margin: 14px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">Best regards,<br>Team Ulaa</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <tr>
            <td align="center" class="footer-bg" style="padding: 28px 0 0; color: #8A7864;">
              <p class="footer-text" style="margin: 0 0 4px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: #8A7864;">ULAA</p>
              <p class="footer-text" style="margin: 0 0 24px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #A5947F;">
                <a href="https://www.ulaatrips.com" style="color: #A5947F; text-decoration: underline;">www.ulaatrips.com</a>
                &nbsp;&middot;&nbsp;
                <a href="${INSTAGRAM_URL}" style="color: #A5947F; text-decoration: underline;">${INSTAGRAM_HANDLE}</a>
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <div class="banner-light" style="display: block; font-size: 0; line-height: 0;">
                      <img src="${FOOTER_BANNER_LIGHT_URL}" width="600" alt="" style="display: block; width: 100%; max-width: 600px; height: auto;">
                    </div>
                    <div class="banner-dark" style="display: none; font-size: 0; line-height: 0;">
                      <img src="${FOOTER_BANNER_DARK_URL}" width="600" alt="" style="display: block; width: 100%; max-width: 600px; height: auto;">
                    </div>
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

// -----------------------------------------------------------------------
// .eml generation — a .eml is a plain MIME email file. Building one lets a
// single click produce a file that, once opened, is a fully-formed draft in
// Outlook (or any desktop mail app) with the To/Subject filled in, the rich
// HTML body (bold text, the payment table, the trip link) already rendered,
// and the invoice PDF already attached — no copy/paste, no separate
// "Attach file" step. That's as close as a web page can get to "one click,
// fully ready": browsers are not allowed to reach into a desktop app and
// compose something directly (that's an OS-level security boundary, not a
// limitation of this code), so opening the generated file is still one
// manual step — but it's a single double-click, not a multi-step paste.
// -----------------------------------------------------------------------

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

// MIME requires base64 body lines capped at 76 chars.
function wrapBase64(b64: string): string {
  return b64.replace(/.{1,76}/g, '$&\r\n').trim();
}

function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/** Builds a downloadable .eml file for this booking's confirmation email —
 *  To/Subject headers, the rich HTML body, and the invoice PDF as a real
 *  MIME attachment — and triggers the browser download. */
export async function sendBookingEmail(enquiry: Enquiry, payments: Payment[]): Promise<void> {
  const { to, subject, bookingId } = bookingEmailFields(enquiry);
  const html = buildBookingEmailHtml(enquiry);
  const pdfFile = await invoiceAsFile(enquiry, payments);
  const pdfBase64 = await fileToBase64(pdfFile);

  const boundary = `----ulaa-booking-${Date.now()}`;
  const eml = [
    `To: ${to}`,
    `Subject: ${subject}`,
    // Tells Outlook (and Apple Mail) to open this .eml as a live, editable
    // compose window with a Send button, instead of the read-only
    // "received message" preview .eml files open as by default — that
    // preview only offers Reply/Reply All/Forward, no direct way to send
    // the message itself. This is a real, widely-supported header for
    // exactly this case, not a workaround specific to this app.
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(utf8ToBase64(html)),
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFile.name}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${pdfFile.name}"`,
    '',
    wrapBase64(pdfBase64),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const blob = new Blob([eml], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Booking-Confirmation-${(bookingId || enquiry.full_name).replace(/[^a-zA-Z0-9-]/g, '-')}.eml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
