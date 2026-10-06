/** Stored in place of an email when the person never gave one (the database requires a value).
 *  It is not a real address: never show it, never send mail to it. */
export const NO_EMAIL_PLACEHOLDER = 'not-provided@ulaa.local';

/** The email to show or use: '' when it is empty or the placeholder. */
export function realEmail(email: string | null | undefined): string {
  const trimmed = (email || '').trim();
  return trimmed.toLowerCase() === NO_EMAIL_PLACEHOLDER ? '' : trimmed;
}
