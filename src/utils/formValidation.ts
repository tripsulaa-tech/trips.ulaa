// =============================================
// Shared validation rules for public-facing forms (BookingForm, WaitlistForm)
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

/** Whole number only (no decimals, no letters — though type="number" already
 * blocks letters), within a sane travel-booking age range. */
export function validateAge(value: string | number): true | string {
  const raw = String(value).trim();
  if (!/^\d{1,3}$/.test(raw)) return 'Age must be a whole number';
  const n = Number(raw);
  if (n < 18) return 'Must be 18 or older';
  if (n > 65) return 'Age must be under 65';
  return true;
}
