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
