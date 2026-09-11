import type { Enquiry, Payment } from '../types/types-index';
import { invoiceAsFile } from './invoicePdf';
import { supabase } from '../services/supabase';
import { formatDate, formatPrice, slugify } from './utils-index';
import { PAYMENT_TYPE_LABEL } from './pdf/invoice/shared';

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
      label: `${PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type} Received`,
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

function bookingEmailFields(enquiry: Enquiry, payments: Payment[]): BookingEmailFields {
  const tripName = enquiry.trip_title || 'your trip';
  const balance = remainingBalance(enquiry);
  const isFullyPaid = balance != null && balance <= 0;
  const balanceText = balance != null ? formatPrice(balance) : '—';
  const deadlineText = enquiry.balance_due_date ? formatDate(enquiry.balance_due_date, { month: 'short' }) : 'TBD';
  return {
    to: enquiry.email || '',
    subject: `${isFullyPaid ? 'Full Payment Received' : 'Booking Confirmed'} - ${tripName}`,
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
const BRAND_COLOR = '#A85A2A'; // --color-primary

// Hosted logo asset — same file the public site's navbar and the invoice
// PDF already use. Wrapped in an explicit white card wherever it's placed
// below (rather than sitting directly on the surrounding background),
// because several clients — Gmail's Android app among them — apply their
// own dark-mode inversion to a mail's colors regardless of the
// color-scheme meta tags in <head>, which would otherwise make a
// dark-wordmark logo vanish against an auto-darkened background.
const LOGO_URL = 'https://www.ulaatrips.com/ULAA-logo.png';
// Dark-mode variant (same asset the site's own Footer.tsx and the
// itinerary PDF cover use), shown instead of LOGO_URL in clients that
// support prefers-color-scheme — see the .logo-dark rule in <style>.
const LOGO_FOOTER_URL = 'https://www.ulaatrips.com/ULAA-logo-Footer.png';

/** Rich, production-ready HTML email — table-based layout, inline styles,
 *  and a bulletproof VML button for Outlook. One fixed light-mode design
 *  (no dark-mode variant): most sends are opened in Gmail, which doesn't
 *  auto-invert author-specified colors, so a single tested appearance is
 *  simpler to maintain and verify than a light/dark pair.
 *  `color-scheme`/`supported-color-schemes` below tell the handful of
 *  clients that do support a dark mode (Apple Mail, Outlook.com) to render
 *  this in light mode rather than auto-inverting it. */
function buildBookingEmailHtml(enquiry: Enquiry, payments: Payment[]): string {
  const f = bookingEmailFields(enquiry, payments);
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

  const paymentInfoLabel = f.isFullyPaid ? 'Payment Complete' : 'Payment Information';
  const paymentInfoText = f.isFullyPaid
    ? `Payment for this booking has been received in full &mdash; <strong>${f.totalPaidText}</strong> paid in total. Thank you!`
    : `Please note that advance/installment payments are non-refundable, as they are used to confirm your booking. The remaining balance of <strong>${f.balanceText}</strong> must be paid on or before <strong>${f.deadlineText}</strong>.`;

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

  /* Clients that honor prefers-color-scheme (Apple Mail, newer webmail
     Gmail) swap in the footer-style logo, which reads better once the
     surrounding card gets dark-mode-inverted. Clients that ignore this
     (older Gmail Android among them) just keep showing .logo-light,
     which is why it also sits inside its own white card below — that's
     the fallback for everyone this media query doesn't reach. */
  .logo-dark { display: none; }
  @media (prefers-color-scheme: dark) {
    .logo-light { display: none !important; }
    .logo-dark { display: block !important; }
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
                    <center style="color:#ffffff;font-family:Helvetica, Arial, sans-serif;font-size:15px;font-weight:bold;">View Trip Details &#8594;</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${tripLinkHref}" target="_blank" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #FFFFFF; font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 40px; border-radius: 8px; mso-hide: all;">View Trip Details &#8594;</a>
                    <!--<![endif]-->
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" style="padding: 24px 40px 16px; border-top: 1px solid #EEE6D8;">
                    <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">We look forward to welcoming you on the trip.</p>
                    <p style="margin: 14px 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2D2118;">Best regards,<br>Team Ulaa</p>
                  </td>
                </tr>

                <tr>
                  <td class="mobile-padding" align="left" style="padding: 0 40px 32px; text-align: left;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#FFFFFF" style="background-color: #FFFFFF; border: 1px solid #EEE6D8; border-radius: 10px; padding: 10px 22px;">
                          <img src="${LOGO_URL}" width="110" alt="Ulaa" class="logo-light" style="display: block; width: 110px; max-width: 110px; height: auto;">
                          <img src="${LOGO_FOOTER_URL}" width="110" alt="Ulaa" class="logo-dark" style="display: none; width: 110px; max-width: 110px; height: auto;">
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
  const { to, subject } = bookingEmailFields(enquiry, payments);
  return { to, subject, html: buildBookingEmailHtml(enquiry, payments) };
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
  const { to, subject } = bookingEmailFields(enquiry, payments);
  if (!to) throw new Error('This enquiry has no email address on file.');

  const html = buildBookingEmailHtml(enquiry, payments);
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
