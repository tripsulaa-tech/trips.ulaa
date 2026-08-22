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
