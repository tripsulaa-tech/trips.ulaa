/**
 * Link-safety helper for URLs that come from the database (admin-entered CTA
 * links, map links, social links…).
 *
 * Anything that is not http(s), mailto or tel — most importantly `javascript:`
 * and `data:` — is rejected, so a bad value can never become a clickable
 * script link, even if the CSP were ever loosened.
 */
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

/** Returns the trimmed URL when its scheme is allowed, otherwise `undefined`. */
export function safeHref(value?: string | null): string | undefined {
  const v = value?.trim();
  return v && SAFE_SCHEME.test(v) ? v : undefined;
}
