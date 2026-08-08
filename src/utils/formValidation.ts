// =============================================
// Shared validation rules for public-facing forms (BookingForm)
// Centralized here so both forms enforce the exact same rules and error
// copy instead of drifting apart over time.
// =============================================

/** Letters, spaces, apostrophes and hyphens only — no digits. Covers names
 * like "Mary-Jane" or "O'Brien" while still rejecting things like "John123". */
export function validateFullName(value: string): true | string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Enter your full name';
  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(trimmed)) return 'Name can only contain letters, spaces, and - \' .';
  return true;
}

/** Same shape as validateFullName but for an optional field (city) —
 * empty is fine, but if something is entered it must be letters only. */
export function validateCity(value: string): true | string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(trimmed)) return 'City can only contain letters';
  return true;
}

/** Indian mobile number: optional +91/91 country code, then exactly 10
 * digits starting with 6-9. Strips spaces/hyphens/parens before checking,
 * so "+91 63813 36772" and "6381336772" both pass. */
export function validatePhone(value: string): true | string {
  const digits = value.replace(/[^\d]/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) return 'Enter a valid 10-digit phone number';
  return true;
}

/** Same as validatePhone but for an optional field (emergency contact). */
export function validateOptionalPhone(value: string): true | string {
  if (!value || value.trim().length === 0) return true;
  return validatePhone(value);
}

// Fallback range used whenever a trip doesn't set its own min/max age —
// matches the app's original hardcoded rule, so trips with no age range
// configured in Admin behave exactly as before this feature existed.
export const DEFAULT_MIN_AGE = 18;
export const DEFAULT_MAX_AGE = 65;

/** Whole number only (no decimals, no letters — though type="number" already
 * blocks letters), within the given trip's age range. Either bound can be
 * omitted (e.g. an "18+" trip with no max) — an omitted bound falls back to
 * the app default for that side, not "unrestricted", so a trip that never
 * configured an age range at all keeps today's 18-65 behavior. */
export function validateAge(
  value: string | number,
  minAge: number = DEFAULT_MIN_AGE,
  maxAge: number = DEFAULT_MAX_AGE
): true | string {
  const raw = String(value).trim();
  if (!/^\d{1,3}$/.test(raw)) return 'Age must be a whole number';
  const n = Number(raw);
  if (n < minAge) return `Must be ${minAge} or older`;
  if (n > maxAge) return `Age must be ${maxAge} or under`;
  return true;
}
