import { useEffect } from 'react';

// Fallback OG/Twitter image — the same one index.html ships as the
// site-wide default, used whenever a page doesn't have its own (a trip or
// album with no cover image yet, say).
const DEFAULT_IMAGE = 'https://www.ulaatrips.com/ULAA-logo.png';

interface PageMetaOptions {
  /** Full document title for this page, e.g. "Upcoming Trips | ULAA Trips". */
  title: string;
  /** Meta/OG description. Falls back to index.html's site-wide description when omitted. */
  description?: string;
  /** OG/Twitter image URL. Falls back to the ULAA logo when omitted. */
  image?: string;
  /** Route path (not the live URL) used to build the canonical link and og:url,
   *  e.g. '/trips' or `/trips/${slug}`. Defaults to the current location. */
  path?: string;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Captured once, from whatever index.html actually shipped for the first
// page this hook ever runs on in this session — so every page that adopts
// this hook can restore the site-wide defaults on unmount, and a route that
// DOESN'T use it (e.g. /admin, reached by following a trip/album link
// straight there) never inherits a previous page's title or OG tags.
const ORIGINAL = {
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
  ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
  ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '',
  ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? '',
  ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? DEFAULT_IMAGE,
  twitterTitle: document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ?? '',
  twitterDescription: document.querySelector('meta[name="twitter:description"]')?.getAttribute('content') ?? '',
  twitterImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ?? DEFAULT_IMAGE,
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? window.location.origin + '/',
};

/**
 * Sets this page's document title, meta description, canonical link and
 * Open Graph/Twitter tags — so sharing a trip or album link (WhatsApp,
 * Instagram, iMessage) renders that trip's own title/photo instead of the
 * generic homepage card every route used to inherit from index.html, and
 * so search results show a page-specific title instead of one repeated
 * across the whole site.
 *
 * Restores the site-wide defaults on unmount, so navigating away to a
 * route that doesn't call this hook never leaves a previous page's meta
 * behind.
 */
export function usePageMeta({ title, description, image, path }: PageMetaOptions) {
  useEffect(() => {
    const resolvedDescription = description || ORIGINAL.description;
    const resolvedImage = image || DEFAULT_IMAGE;
    const resolvedUrl = window.location.origin + (path ?? window.location.pathname);

    document.title = title;
    upsertMeta('name', 'description', resolvedDescription);
    upsertCanonical(resolvedUrl);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', resolvedDescription);
    upsertMeta('property', 'og:url', resolvedUrl);
    upsertMeta('property', 'og:image', resolvedImage);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', resolvedDescription);
    upsertMeta('name', 'twitter:image', resolvedImage);

    return () => {
      document.title = ORIGINAL.title;
      upsertMeta('name', 'description', ORIGINAL.description);
      upsertCanonical(ORIGINAL.canonical);
      upsertMeta('property', 'og:title', ORIGINAL.ogTitle);
      upsertMeta('property', 'og:description', ORIGINAL.ogDescription);
      upsertMeta('property', 'og:url', ORIGINAL.ogUrl);
      upsertMeta('property', 'og:image', ORIGINAL.ogImage);
      upsertMeta('name', 'twitter:title', ORIGINAL.twitterTitle);
      upsertMeta('name', 'twitter:description', ORIGINAL.twitterDescription);
      upsertMeta('name', 'twitter:image', ORIGINAL.twitterImage);
    };
  }, [title, description, image, path]);
}
