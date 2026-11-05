// =============================================
// Shared validation rules for public-facing forms (BookingForm)
// Centralized here so both forms enforce the exact same rules and error
// copy instead of drifting apart over time.
// =============================================

import { INDIAN_CITIES } from '../constants/indianCities';

/** Letters, spaces, apostrophes and hyphens only — no digits. Covers names
 * like "Mary-Jane" or "O'Brien" while still rejecting things like "John123".
 * Requires at least 3 actual letters (spaces/punctuation don't count
 * toward that minimum), so e.g. "A." or "- -" aren't accepted. */
export function validateFullName(value: string): true | string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter your full name';
  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(trimmed)) return 'Name can only contain letters, spaces, and - \' .';
  const letterCount = (trimmed.match(/[A-Za-z]/g) || []).length;
  if (letterCount < 3) return 'Name must have at least 3 letters';
  return true;
}

/** Same shape as validateFullName — city is a required field, letters only.
 * Also cross-checks against INDIAN_CITIES (the same list that powers the
 * City field's suggestion dropdown): if what's typed so far prefix-matches
 * one or more cities in that list, the value must land on an exact match
 * (i.e. one of those suggestions, picked from the dropdown or typed out in
 * full) — free-typing a near-miss like "Bangalor" isn't accepted while
 * "Bangalore" is still an offered suggestion. Once nothing in the list
 * matches (a smaller town not on it, or a typo far enough off), the field
 * falls back to plain free text, subject only to the letters-only check
 * above — so anyone whose city isn't in the list can still just type it. */
export function validateCity(value: string): true | string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'City is required';
  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(trimmed)) return 'City can only contain letters';
  const lower = trimmed.toLowerCase();
  const matches = INDIAN_CITIES.filter(c => c.toLowerCase().startsWith(lower));
  if (matches.length > 0 && !matches.some(c => c.toLowerCase() === lower)) {
    return 'Select a city from the list, or keep typing if yours isn\'t listed';
  }
  return true;
}

/** Indian mobile number: optional +91/91 country code, then exactly 10
 * digits starting with 6-9. Strips spaces/hyphens/parens before checking,
 * so "+91 63813 36772" and "6381336772" both pass. Also rejects numbers
 * where all 10 digits are the same (e.g. "9999999999") — technically
 * matches the shape above but is never a real number. */
export function validatePhone(value: string): true | string {
  const digits = value.replace(/[^\d]/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) return 'Enter a valid 10-digit phone number';
  if (/^(\d)\1{9}$/.test(local)) return 'Enter a valid phone number';
  return true;
}

/** Same as validatePhone but for an optional field (emergency contact). */
export function validateOptionalPhone(value: string): true | string {
  if (!value || value.trim().length === 0) return true;
  return validatePhone(value);
}

/** Same as validateCity but for fields where city itself is optional (e.g.
 * admin-side enquiry forms, which don't require it the way the public
 * booking form does) — an empty value passes, but whatever *is* typed
 * still has to satisfy the same letters-only + INDIAN_CITIES cross-check
 * as the required version, so the rules can't quietly drift between the
 * two forms. */
export function validateOptionalCity(value: string): true | string {
  if (!value || value.trim().length === 0) return true;
  return validateCity(value);
}

/** Standard local@domain.tld shape, plus a minimum of 2 characters before
 * the "@" — blocks throwaway-looking addresses like "k@gmail.com" while
 * still allowing any real domain the user finishes typing themselves. */
export function validateEmail(value: string): true | string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Email is required';
  const atIndex = trimmed.indexOf('@');
  const localPart = atIndex === -1 ? trimmed : trimmed.slice(0, atIndex);
  if (localPart.length < 2) return 'Email must have at least 2 characters before the @';
  if (!/^\S+@\S+\.\S+$/.test(trimmed)) return 'Invalid email address';
  return true;
}

/** Same as validateEmail but for fields where email itself is optional
 * (e.g. admin-side enquiry forms) — an empty value passes, but a
 * partially/incorrectly typed one still gets caught by the same check the
 * public booking form uses. */
export function validateOptionalEmail(value: string): true | string {
  if (!value || value.trim().length === 0) return true;
  return validateEmail(value);
}

// Ulaa is age-free: there is no minimum or maximum age anywhere. Age is
// just an optional detail — whatever is entered only has to be a whole
// number (no letters, no decimals).

/** Age is optional: blank passes, anything entered must be a whole number. */
export function validateAge(value: string | number): true | string {
  const raw = String(value).trim();
  if (raw.length === 0) return true;
  if (!/^\d{1,3}$/.test(raw)) return 'Age must be a whole number';
  return true;
}

/** Kept as an alias of validateAge (both are optional now) so the admin
 * forms that already call it keep working. */
export function validateOptionalAge(value: string | number): true | string {
  return validateAge(value);
}
