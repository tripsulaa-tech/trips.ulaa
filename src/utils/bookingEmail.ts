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
// Getting to the Gmail *app* specifically, not just "whatever handles
// email" or "Gmail in a browser tab".
//
// The admin panel itself runs as an installed home-screen PWA (see
// admin.html's manifest-admin.json / apple-mobile-web-app-capable), and a
// plain `https://mail.google.com/mail/?view=cm&...` link — Google's own
// "compose by URL" format — doesn't reliably hand off to the Gmail app
// from inside that kind of standalone/embedded context the way it does
// from a normal Chrome or Safari tab. So each platform gets its more
// direct mechanism, with the plain Gmail-web link kept only as the final
// fallback:
//   - Android: an explicit `intent:` URL naming Gmail's package
//     (com.google.android.gm) directly. This goes straight through
//     Android's intent-resolution system rather than depending on
//     mail.google.com's "verified app link" status, which is the part
//     that standalone/embedded contexts tend to skip.
//   - iOS: Gmail's own registered `googlegmail://co` URL scheme for
//     composing. Same idea — a custom scheme is handled by iOS itself,
//     independent of whatever container the page is running in.
// Both still carry the Gmail-web link as a fallback (via
// `browser_fallback_url` on Android, a short timer on iOS) for the case
// where Gmail isn't installed at all.
//
// Two hard limits stay true no matter which of these fires, both on
// Google's/the OS's side rather than something this code can work around:
//   - no HTML param on any of these — the body is always plain text, so
//     the rich table/colour layout an actual sent email would use isn't
//     available here;
//   - no attachment param — a web page can't reach into the Gmail app and
//     attach a file for the admin. So the invoice PDF is downloaded first,
//     and attaching it in Gmail's compose screen (tap the paperclip, pick
//     the just-downloaded file) is the one manual step left.
// -----------------------------------------------------------------------

function detectMobilePlatform(): 'android' | 'ios' | 'other' {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

/** Downloads the invoice PDF, then jumps straight to the Gmail app (with a
 *  Gmail-on-the-web fallback if it's not installed) with the booking
 *  confirmation's To/Subject/Body prefilled and ready to send — the admin
 *  just attaches the downloaded invoice. */
export async function sendBookingEmail(enquiry: Enquiry, payments: Payment[]): Promise<void> {
  const { to, subject } = bookingEmailFields(enquiry);
  await downloadInvoicePdf(enquiry, payments);
  const body = buildBookingEmailPlainText(enquiry);

  const webUrl =
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  const platform = detectMobilePlatform();

  if (platform === 'android') {
    const intentUrl =
      `intent://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(to)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}` +
      `#Intent;scheme=https;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
    window.location.href = intentUrl;
    return;
  }

  if (platform === 'ios') {
    const iosUrl =
      `googlegmail://co?to=${encodeURIComponent(to)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    // If the Gmail app opens, this page gets backgrounded and the timer
    // below never gets to run (browsers pause/throttle timers once a page
    // is hidden). If nothing happens — Gmail isn't installed — the page
    // stays in the foreground and the fallback fires as normal.
    const fallbackTimer = window.setTimeout(() => {
      window.location.href = webUrl;
    }, 1200);
    window.addEventListener('pagehide', () => window.clearTimeout(fallbackTimer), { once: true });
    window.location.href = iosUrl;
    return;
  }

  // Desktop / anything else: Gmail on the web, same as before.
  window.open(webUrl, '_blank', 'noopener,noreferrer');
}
