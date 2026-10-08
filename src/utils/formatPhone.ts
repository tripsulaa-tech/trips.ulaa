/** Display-friendly phone number: "8778911368" -> "+91 87789 11368".
 *  Handles 10-digit Indian numbers, with or without a leading 91/+91/0.
 *  Anything else is returned unchanged. Display only: keep the raw value
 *  for tel:/wa.me links. */
export function formatPhone(phone: string | null | undefined): string {
  const raw = (phone || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) return raw;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** Country code assumed for numbers saved without one (the whole business is India-based).
 *  Change it here only; every WhatsApp link goes through toWhatsAppNumber below. */
const DEFAULT_COUNTRY_CODE = '91';

/** Digits-only number for a wa.me link, which needs the country code:
 *  "87789 11368", "08778911368" and "+91 87789 11368" all become "918778911368".
 *  Numbers that already look international (more than 10 digits after any leading 0) are kept as typed.
 *  Returns '' when there is no usable number. */
function toWhatsAppNumber(phone: string | null | undefined): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits;
  return digits;
}

/** wa.me link with a prefilled message. With no number it opens WhatsApp's own chat picker. */
export function whatsAppUrl(phone: string | null | undefined, text: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${text}`;
}
