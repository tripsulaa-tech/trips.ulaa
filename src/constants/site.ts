/** The public website. Change the domain here only: emails, PDFs, page meta, the footer and the
 *  Logo Studio email preview all read it from this file. */
export const SITE_HOST = 'www.ulaatrips.com';
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** Public contact + social details. Change them here only: the footer, contact page, PDFs,
 *  page meta and index.html (via the Vite plugin) all read them from this file. */
export const CONTACT_EMAIL = 'trips.ulaa@gmail.com';
export const CONTACT_PHONE_E164 = '+916381336772';
export const CONTACT_PHONE_DISPLAY = '+91 63813 36772';
/** wa.me format: digits only, with country code, no "+". */
export const WHATSAPP_NUMBER = CONTACT_PHONE_E164.replace(/\D/g, '');
export const INSTAGRAM_HANDLE = 'ulaa.trips';
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`;
export const LOGO_URL = `${SITE_ORIGIN}/ULAA-logo.png`;
