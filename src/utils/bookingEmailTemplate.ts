// The editable wording of the booking confirmation email (Admin → Logo Studio → Email).
// Stored as one `site_content` row. Anything missing or invalid falls back to the
// default below, which is the text the email had before it became editable, so an
// untouched template sends exactly the same email as always.
//
// Text may contain {tokens} (see EMAIL_TOKENS), **bold** and line breaks.
import { getSiteContent } from '../services/api';

export const BOOKING_EMAIL_KEY = 'booking_email_template';

export interface BookingEmailTemplate {
  subjectConfirmed: string;     // subject while a balance is still due
  subjectFull: string;          // subject once fully paid
  tagline: string;              // italic line above the white card
  preheader: string;            // hidden inbox preview text
  badge: string;                // small capitals line above the trip name
  greeting: string;
  intro: string;
  confirmLine: string;
  paymentLabelPartial: string;
  paymentNotePartial: string;
  paymentLabelFull: string;
  paymentNoteFull: string;
  buttonLabel: string;
  closingLine: string;
  signOff: string;
  accentColour: string;         // button, badge line and highlighted amounts
  logoUrl: string;              // https image shown at the bottom; empty = the Ulaa logo
  logoDarkUrl: string;          // https image used instead in dark mode; empty = Ulaa's dark logo (or the logo above if you uploaded one)
  logoWidth: number;            // px, 60-240
}

export const DEFAULT_BOOKING_EMAIL_TEMPLATE: BookingEmailTemplate = {
  subjectConfirmed: 'Booking Confirmed - {trip}',
  subjectFull: 'Full Payment Received - {trip}',
  tagline: 'Your next adventure is waiting',
  preheader: 'Your booking for {trip} is confirmed — booking ID {booking_id}.',
  badge: 'Booking Confirmed',
  greeting: 'Dear {name},',
  intro: "Thank you for choosing Ulaa. We're delighted to have you join us on our {trip}.",
  confirmLine: 'Your booking is confirmed. Please find your invoice attached for your reference.',
  paymentLabelPartial: 'Payment Information',
  paymentNotePartial:
    'Please note that advance/installment payments are non-refundable, as they are used to confirm your booking. The remaining balance of **{balance}** must be paid on or before **{deadline}**.',
  paymentLabelFull: 'Payment Complete',
  paymentNoteFull: 'Payment for this booking has been received in full — **{total}** paid in total. Thank you!',
  buttonLabel: 'View Trip Details',
  closingLine: 'We look forward to welcoming you on the trip.',
  signOff: 'Best regards,\nTeam Ulaa',
  accentColour: '#A85A2A',
  logoUrl: '',
  logoDarkUrl: '',
  logoWidth: 110,
};

/** Values that can be written as {name} inside the wording. */
export const EMAIL_TOKENS: { token: string; meaning: string }[] = [
  { token: '{name}', meaning: "the traveller's name" },
  { token: '{trip}', meaning: 'the trip name' },
  { token: '{booking_id}', meaning: 'the booking ID' },
  { token: '{total}', meaning: 'total paid so far' },
  { token: '{balance}', meaning: 'remaining balance' },
  { token: '{deadline}', meaning: 'final payment date' },
];

const MAX_LEN = 1000;

export function normalizeBookingEmailTemplate(raw: unknown): BookingEmailTemplate {
  const out: BookingEmailTemplate = { ...DEFAULT_BOOKING_EMAIL_TEMPLATE };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  // Emails can only show images from a public https address.
  if (typeof r.logoUrl === 'string' && /^https:\/\/[^\s"'<>]+$/.test(r.logoUrl.trim())) out.logoUrl = r.logoUrl.trim();
  if (typeof r.logoDarkUrl === 'string' && /^https:\/\/[^\s"'<>]+$/.test(r.logoDarkUrl.trim())) out.logoDarkUrl = r.logoDarkUrl.trim();
  if (typeof r.logoWidth === 'number' && isFinite(r.logoWidth)) out.logoWidth = Math.round(Math.min(240, Math.max(60, r.logoWidth)));
  for (const key of Object.keys(out) as (keyof BookingEmailTemplate)[]) {
    if (key === 'logoUrl' || key === 'logoDarkUrl' || key === 'logoWidth') continue;
    const v = r[key];
    if (typeof v !== 'string') continue;
    if (key === 'accentColour') {
      if (/^#[0-9a-f]{6}$/i.test(v.trim())) out[key] = v.trim();
    } else if (v.trim()) {
      out[key] = v.slice(0, MAX_LEN);
    }
    // A blank field means "use the default", so the email never loses a whole line by accident.
  }
  return out;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fillTokens(text: string, vars: Record<string, string>, transform: (v: string) => string): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? transform(vars[key]) : whole));
}

/** Wording → safe HTML: values are escaped, **bold** and line breaks are kept. */
export function templateToHtml(text: string, vars: Record<string, string>): string {
  const escaped = fillTokens(escapeHtml(text), vars, v => escapeHtml(v));
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\r?\n/g, '<br>');
}

/** Wording → plain text (subject lines): tokens filled, nothing escaped. */
export function templateToText(text: string, vars: Record<string, string>): string {
  return fillTokens(text, vars, v => v).replace(/\*\*/g, '').replace(/\s*\r?\n\s*/g, ' ').trim();
}

// Shared copy so the editor's preview and the real send always use the same data.
let cached: BookingEmailTemplate = { ...DEFAULT_BOOKING_EMAIL_TEMPLATE };

export function getCachedBookingEmailTemplate(): BookingEmailTemplate {
  return cached;
}

export function setCachedBookingEmailTemplate(t: BookingEmailTemplate) {
  cached = t;
}

/** Reads the saved template (falling back to the defaults) and remembers it. */
export async function loadBookingEmailTemplate(): Promise<BookingEmailTemplate> {
  try {
    cached = normalizeBookingEmailTemplate(await getSiteContent<unknown>(BOOKING_EMAIL_KEY));
  } catch {
    /* keep the last known copy */
  }
  return cached;
}
