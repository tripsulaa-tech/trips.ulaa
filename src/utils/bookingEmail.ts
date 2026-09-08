import type { Enquiry, Payment } from '../types/types-index';
import { downloadInvoicePdf } from './invoicePdf';
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

// Plain-text body — Gmail's "compose by URL" endpoint (used below) only
// accepts a plain `body` param, so this intentionally mirrors the old rich
// HTML email's content (greeting, payment summary, deadline, trip link)
// without any of its formatting.
function buildBookingEmailPlainText(enquiry: Enquiry): string {
  const f = bookingEmailFields(enquiry);
  const lines = [
    `Dear ${enquiry.full_name},`,
    '',
    `Thank you for choosing Ulaa. We're delighted to have you join us on our ${f.tripName}. Your booking is confirmed — please attach the invoice PDF you just downloaded before sending.`,
    '',
    f.bookingId ? `Booking ID: ${f.bookingId}` : null,
    `Advance Payment Received: ${f.advance}`,
    `Remaining Balance: ${f.balanceText}`,
    `Final Payment Deadline: ${f.deadlineText}`,
    '',
    `Please note the advance payment of ${f.advance} is non-refundable, as it is used to confirm your booking. The remaining balance of ${f.balanceText} must be paid on or before ${f.deadlineText}.`,
    '',
    f.tripUrl ? `Trip details: ${f.tripUrl}` : null,
    '',
    'We look forward to welcoming you on the trip.',
    '',
    'Best regards,',
    'Team Ulaa',
  ].filter((line): line is string => line !== null);
  return lines.join('\n');
}

// -----------------------------------------------------------------------
// Gmail compose-by-URL — https://mail.google.com/mail/?view=cm&...
// This is Google's own documented link format for launching a prefilled
// compose window, and it's the one link that reliably opens the Gmail app
// itself on Android/iOS when it's installed (falling back to Gmail on the
// web otherwise) — unlike a plain `mailto:` link, which just hands off to
// whatever the OS has set as the default mail app.
//
// Two hard limits, both on Google's/the OS's side rather than something
// this code can work around:
//   - no HTML param — the body must be plain text, so the rich table/
//     colour layout an actual sent email would use isn't available here;
//   - no attachment param — a web page can't reach into the Gmail app and
//     attach a file for the admin. So the invoice PDF is downloaded first,
//     and attaching it in Gmail's compose screen (tap the paperclip, pick
//     the just-downloaded file) is the one manual step left.
// -----------------------------------------------------------------------

/** Downloads the invoice PDF, then opens Gmail (app on mobile, web as a
 *  fallback) with the booking confirmation's To/Subject/Body prefilled and
 *  ready to send — the admin just attaches the downloaded invoice. */
export async function sendBookingEmail(enquiry: Enquiry, payments: Payment[]): Promise<void> {
  const { to, subject } = bookingEmailFields(enquiry);
  await downloadInvoicePdf(enquiry, payments);
  const body = buildBookingEmailPlainText(enquiry);
  const url =
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
