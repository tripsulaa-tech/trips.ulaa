import type { Enquiry, Payment } from '../types/types-index';
import { invoiceAsFile } from './invoicePdf';
import { supabase } from '../services/supabase';
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
    subject: `Booking Confirmed - ${tripName}`,
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

// Decorative footer banner (dunes/palm/birds illustration + the
// "WOMEN · EXPLORE · BELONG" tagline baked into the artwork). Lives in
// public/email-assets/ and deploys to the site's root alongside
// ULAA-logo.png. Resized to 1200px wide (2x for a 600px-wide email) and
// palette-quantized down from the original ~2170px export, since this is
// flat illustration art rather than a photo — same visual result at
// roughly a fifth of the file size.
const FOOTER_BANNER_URL = 'https://www.ulaatrips.com/email-assets/footer-banner-light.png';

// Brand palette, kept in sync with the `@theme` block in
// src/styles/globals.css (--color-primary, --color-dark, etc.) so the email
// reads as the same brand family as the site and the invoice PDF. Email
// clients can't read CSS custom properties reliably, so these are the same
// values inlined directly instead of referenced as variables.
const BRAND_COLOR = '#A85A2A'; // --color-primary

/** Rich, production-ready HTML email — table-based layout, inline styles,
 *  and a bulletproof VML button for Outlook. One fixed light-mode design
 *  (no dark-mode variant): most sends are opened in Gmail, which doesn't
 *  auto-invert author-specified colors, so a single tested appearance is
 *  simpler to maintain and verify than a light/dark pair.
 *  `color-scheme`/`supported-color-schemes` below tell the handful of
 *  clients that do support a dark mode (Apple Mail, Outlook.com) to render
 *  this in light mode rather than auto-inverting it. */
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
                      <td style="background-color: #FAF7F2; border: 1px solid #E8DFD3; border-radius: 10px; padding: 14px 28px; text-align: center;">
                        <p style="margin: 0 0 4px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A7864;">Booking ID</p>
                        <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 700; color: #2D2118; letter-spacing: 0.02em;">${escapeHtml(f.bookingId)}</p>
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
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
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
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #F2EBE0;">
<div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #F2EBE0; opacity: 0;">
  Your booking for ${trip} is confirmed — booking ID ${f.bookingId ? escapeHtml(f.bookingId) : 'attached'}.
</div>
<center style="width: 100%; background-color: #F2EBE0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F2EBE0;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="email-container" style="width: 600px; max-width: 600px;">
          <tr>
            <td align="center" style="padding: 4px 4px 26px;">
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 16px; letter-spacing: 0.01em; color: #8A7864;">Your next adventure is waiting</p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #FFFFFF; border-radius: 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

                <tr>
                  <td class="mobile-padding" align="center" style="padding: 40px 40px 4px;">
                    <p style="margin: 0 0 10px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND_COLOR};">Booking Confirmed</p>
                    <h1 class="trip-title" style="margin: 0 0 18px; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #2D2118;">${trip}</h1>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px;">
                    <p style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">Dear ${name},</p>
                    <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">Thank you for choosing Ulaa. We're delighted to have you join us on our ${trip}.</p>
                    <p style="margin: 14px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2D2118;">Your booking is confirmed. Please find your invoice attached for your reference.</p>
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
                      <tr>
                        <td style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #2D2118; border-bottom: 1px solid #F0E9DC;">Advance Payment Received</td>
                        <td align="right" style="padding: 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #2D2118; border-bottom: 1px solid #F0E9DC;">${f.advance}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4; border-bottom: 1px solid #F0E9DC;">Remaining Balance</td>
                        <td align="right" style="padding: 10px 12px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: ${BRAND_COLOR}; background-color: #FAF1E4; border-bottom: 1px solid #F0E9DC;">${f.balanceText}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #2D2118;">Final Payment Deadline</td>
                        <td align="right" style="padding: 10px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #2D2118;">${f.deadlineText}</td>
                      </tr>
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
                          <p style="margin: 0 0 8px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${BRAND_COLOR};">Payment Information</p>
                          <p style="margin: 0 0 8px; font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #4A3728;">Please note that the advance payment of <strong>${f.advance} is non-refundable</strong>, as it is used to confirm your booking. The remaining balance of <strong>${f.balanceText}</strong> must be paid on or before <strong>${f.deadlineText}</strong>.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 0 40px 8px;">
                    <p style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A7864;">Trip Details</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="20" valign="top" style="padding-top: 1px;">
                          <span style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #8A7864;">&#128196;</span>
                        </td>
                        <td style="padding-left: 8px;">
                          <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #6B5744;">For complete details regarding our Terms &amp; Conditions, Cancellation Policy, and Trip Policies, please refer to the <a href="${tripLinkHref}" style="color: ${BRAND_COLOR}; text-decoration: underline;">${trip} trip page</a>.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding: 8px 40px 40px;">
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
                  <td class="mobile-padding" style="padding: 24px 40px 36px; border-top: 1px solid #EEE6D8;">
                    <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">We look forward to welcoming you on the trip.</p>
                    <p style="margin: 14px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">Best regards,<br>Team Ulaa</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 28px 0 0; color: #8A7864;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size: 0; line-height: 0;">
                    <img src="${FOOTER_BANNER_URL}" width="600" alt="" style="display: block; width: 100%; max-width: 600px; height: auto;">
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
  const { to, subject } = bookingEmailFields(enquiry);
  if (!to) throw new Error('This enquiry has no email address on file.');

  const html = buildBookingEmailHtml(enquiry);
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

  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to send email');
}
