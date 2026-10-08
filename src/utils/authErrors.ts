import type { AuthError } from '@supabase/supabase-js';

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'not_confirmed'
  | 'no_enquiry'
  | 'rate_limited'
  | 'weak_password'
  | 'same_password'
  | 'invalid_email'
  | 'unknown';

/** Maps a Supabase auth error to something the UI can word properly.
 *  `during` matters because the signup trigger that blocks emails with no
 *  enquiry surfaces as a generic "Database error saving new user". */
export function classifyAuthError(error: unknown, during: 'signin' | 'signup' | 'other' = 'other'): AuthErrorKind {
  const e = (error ?? {}) as Partial<AuthError> & { code?: string };
  const code = e.code ?? '';
  const message = (e.message ?? '').toLowerCase();

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'not_confirmed';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || e.status === 429) return 'rate_limited';
  if (code === 'weak_password') return 'weak_password';
  if (code === 'same_password') return 'same_password';
  if (code === 'email_address_invalid') return 'invalid_email';
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'invalid_credentials';
  if (
    during === 'signup' &&
    (message.includes('signup_requires_enquiry') || message.includes('database error saving new user') || code === 'unexpected_failure')
  ) {
    return 'no_enquiry';
  }
  return 'unknown';
}

export interface AuthRedirectInfo {
  /** Set when the email link was a signup confirmation that worked. */
  confirmedSignup: boolean;
  /** Set when the email link failed (expired / already used / invalid). */
  linkError: boolean;
}

// The hash is read once, at module load: Supabase's client strips it from the
// URL after processing it.
const INITIAL_HASH = typeof window !== 'undefined' ? window.location.hash : '';

/** What the email link this page load came from said (same answer every call). */
export function getAuthRedirectInfo(): AuthRedirectInfo {
  const params = new URLSearchParams(INITIAL_HASH.replace(/^#/, ''));
  return {
    confirmedSignup: params.get('type') === 'signup',
    linkError: !!(params.get('error') || params.get('error_code')),
  };
}
