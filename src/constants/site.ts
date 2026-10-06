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
export const BRAND_TAGLINE = 'Girls-Only Travel Community';

/** Brand copy used in page titles, meta tags, alt text and the footer. Change it here only.
 *  index.html reads SITE_NAME, SITE_SHORT_NAME, BRAND_MOTTO and SITE_DESCRIPTION through the
 *  Vite plugin, so the static HTML and the React pages never drift apart. */
export const SITE_NAME = 'Ulaa Trips';
export const SITE_SHORT_NAME = 'Ulaa';
export const BRAND_MOTTO = 'Unseen. Local. Adventures. Activities.';
export const SITE_DESCRIPTION = "Girls-only travel community organizing curated trips to India's hidden destinations.";

/** "About Us" -> "About Us | Ulaa Trips"; no argument -> "Ulaa Trips". */
export const pageTitle = (name?: string): string => (name ? `${name} | ${SITE_NAME}` : SITE_NAME);

/** The response-time promise shown on the contact page, booking section, About steps and PDFs.
 *  Reads as "…we'll get back to you {RESPONSE_TIME}." */
export const RESPONSE_TIME = 'within 24 hours';

/** Prefilled text when a visitor opens WhatsApp from the site or a PDF without a custom message. */
export const WHATSAPP_DEFAULT_MESSAGE = 'Hi! I am interested in Ulaa trips.';

/** Footer copy (the mobile and desktop layouts show different blurbs on purpose). */
export const FOOTER_TAGLINE = 'Girls-only travel experiences';
export const FOOTER_TAGLINE_SUB = 'Discover hidden destinations together.';
export const FOOTER_BLURB = "A girls-only travel community for curated trips to India's most beautiful hidden destinations.";
export const FOOTER_REGION = 'India';
export const FOOTER_REGION_LONG = 'India — Explore Everywhere';
export const FOOTER_SIGNOFF = 'for the fearless women of India.';
