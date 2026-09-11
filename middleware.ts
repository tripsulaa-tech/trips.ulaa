// Vercel Edge Middleware (framework-agnostic — this is a Vite SPA, not
// Next.js, but Vercel's middleware layer works the same way for any
// project: a `middleware.ts` at the repo root, run before vercel.json's
// rewrites).
//
// Why this exists: index.html only has one static og:image (the ULAA
// logo), and this app renders entirely client-side. Link-preview crawlers
// (WhatsApp, Instagram, Facebook, Twitter/X, LinkedIn, Slack, Telegram,
// Discord…) don't execute JS — they just read whatever meta tags are in
// the HTML they're served. So today, pasting any /trips/:slug or
// /completed-trips/:slug link always shows the generic ULAA logo, never
// the trip's own cover image.
//
// This middleware detects those crawler user-agents, looks up the trip by
// slug in Supabase, and serves index.html with og:title/og:description/
// og:image/og:url (and the matching twitter: tags + canonical link)
// swapped in for that trip. Regular visitors are untouched — they get the
// normal SPA, unchanged.
//
// Note: Vercel Edge Middleware for non-Next.js projects is a platform
// feature, not something buildable/typecheck-able via this project's own
// `tsc -b` (middleware.ts isn't part of any tsconfig project reference on
// purpose — Vercel bundles it separately at deploy time). Double-check
// against Vercel's current Middleware docs when you deploy, since this
// wasn't run against a live deployment.

export const config = {
  matcher: ['/trips/:path*', '/completed-trips/:path*'],
};

const CRAWLER_UA =
  /facebookexternalhit|Facebot|WhatsApp|Instagram|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|redditbot|Pinterest|SkypeUriPreview|vkShare|Viber|Applebot|W3C_Validator/i;

const SUPABASE_URL = 'https://wephglgonrmtcmhfbjqe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ryp0WUqL5_dg5v6gpo_zqw__Ibz6M5O';
const SITE_URL = 'https://www.ulaatrips.com';
const DEFAULT_IMAGE = `${SITE_URL}/ULAA-logo.png`;
const DEFAULT_DESCRIPTION =
  "Girls-only travel community organizing curated trips to India's hidden destinations.";

interface TripMeta {
  title: string;
  description: string;
  cover_image: string | null;
}

type TripTable = 'upcoming_trips' | 'completed_trips';

async function fetchTripMeta(slug: string, table: TripTable): Promise<TripMeta | null> {
  const statusFilter =
    table === 'upcoming_trips' ? '&status=in.(coming_soon,published)' : '&is_published=eq.true';
  const url =
    `${SUPABASE_URL}/rest/v1/${table}` +
    `?select=title,destination,description,cover_image&slug=eq.${encodeURIComponent(slug)}${statusFilter}&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return null;

    const rows = (await res.json()) as Array<{
      title?: string;
      destination?: string;
      description?: string;
      cover_image?: string | null;
    }>;
    const row = rows[0];
    if (!row) return null;

    return {
      title: row.title || row.destination || 'ULAA Trips',
      description: row.description || DEFAULT_DESCRIPTION,
      cover_image: row.cover_image || null,
    };
  } catch {
    return null;
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Trims to a clean og:description length without cutting a word in half.
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

function injectTripMeta(html: string, meta: TripMeta, pageUrl: string): string {
  const title = escapeAttr(`${meta.title} — ULAA Trips`);
  const description = escapeAttr(truncate(meta.description, 200));
  const image = escapeAttr(meta.cover_image || DEFAULT_IMAGE);
  const url = escapeAttr(pageUrl);

  return html
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta name="description" content=".*?"\s*\/>/,
      `<meta name="description" content="${description}" />`
    )
    .replace(
      /<meta property="og:title" content=".*?"\s*\/>/,
      `<meta property="og:title" content="${title}" />`
    )
    .replace(
      /<meta property="og:description" content=".*?"\s*\/>/,
      `<meta property="og:description" content="${description}" />`
    )
    .replace(/<meta property="og:url" content=".*?"\s*\/>/, `<meta property="og:url" content="${url}" />`)
    .replace(
      /<meta property="og:image" content=".*?"\s*\/>/,
      `<meta property="og:image" content="${image}" />`
    )
    .replace(
      /<meta name="twitter:title" content=".*?"\s*\/>/,
      `<meta name="twitter:title" content="${title}" />`
    )
    .replace(
      /<meta name="twitter:description" content=".*?"\s*\/>/,
      `<meta name="twitter:description" content="${description}" />`
    )
    .replace(
      /<meta name="twitter:image" content=".*?"\s*\/>/,
      `<meta name="twitter:image" content="${image}" />`
    )
    .replace(/<link rel="canonical" href=".*?"\s*\/>/, `<link rel="canonical" href="${url}" />`);
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const ua = request.headers.get('user-agent') || '';
  if (!CRAWLER_UA.test(ua)) return undefined; // real users: fall through to the normal SPA

  const url = new URL(request.url);
  const [, section, slug] = url.pathname.split('/'); // '', 'trips'|'completed-trips', ':slug'
  if (!slug) return undefined;

  const table: TripTable = section === 'completed-trips' ? 'completed_trips' : 'upcoming_trips';
  const meta = await fetchTripMeta(slug, table);
  if (!meta) return undefined; // unknown/unpublished slug: let the SPA show its own 404

  const indexRes = await fetch(new URL('/index.html', url));
  if (!indexRes.ok) return undefined;
  const html = await indexRes.text();

  return new Response(injectTripMeta(html, meta, url.toString()), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
