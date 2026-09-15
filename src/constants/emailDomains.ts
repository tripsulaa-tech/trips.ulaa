// Common email domains, ordered roughly by how often they show up on an
// Indian consumer form — used purely to power the Email field's domain
// suggestions in BookingForm once the user has typed "@". Not a
// validation source of truth; any domain can still be typed in full.
export const COMMON_EMAIL_DOMAINS: string[] = [
  'gmail.com',
  'yahoo.com',
  'yahoo.in',
  'outlook.com',
  'hotmail.com',
  'rediffmail.com',
  'icloud.com',
  'live.com',
  'aol.com',
  'protonmail.com',
];

/**
 * Derives the "localPart@domain" suggestions for an in-progress email
 * value, once the user has typed "@" — e.g. "priya@gm" -> ["priya@gmail.com", ...].
 * Returns an empty array whenever there's nothing to suggest: no "@" yet,
 * no local part typed, or the domain already matches a known one exactly.
 * Shared by AdminLogin and BookingForm, which previously each had an
 * identical copy of this derivation inline.
 */
export function getEmailDomainSuggestions(value: string, maxSuggestions = 6): string[] {
  const atIndex = value.indexOf('@');
  if (atIndex === -1) return [];

  const localPart = value.slice(0, atIndex);
  const domainPart = value.slice(atIndex + 1).toLowerCase();
  if (!localPart) return [];

  // Already a complete, exact match (typed or pasted in full) — nothing
  // left to suggest.
  if (COMMON_EMAIL_DOMAINS.includes(domainPart)) return [];

  const matches = (domainPart === ''
    ? COMMON_EMAIL_DOMAINS
    : COMMON_EMAIL_DOMAINS.filter(d => d.startsWith(domainPart))
  ).slice(0, maxSuggestions);

  return matches.map(d => `${localPart}@${d}`);
}
