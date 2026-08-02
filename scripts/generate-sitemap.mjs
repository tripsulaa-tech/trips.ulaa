// Regenerates public/sitemap.xml before every build.
//
// Combines the site's fixed pages with live slugs pulled from Supabase
// (published upcoming trips + published completed-trip albums), so new
// trips show up in the sitemap automatically on the next deploy instead
// of requiring someone to hand-edit sitemap.xml.
//
// Runs as a plain Node script (not through Vite), so it reads Supabase
// credentials straight from process.env. Vercel exposes every env var
// configured on the project to the build step regardless of the VITE_
// prefix, so the same VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY used by
// the app work here too — no separate script-only env vars to manage.
//
// Safe by design: if Supabase is unreachable or credentials are missing
// (e.g. a local build without a .env file), this logs a warning and
// falls back to writing just the static pages rather than failing the
// build.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '../public/sitemap.xml');
const SITE_URL = 'https://www.ulaatrips.com';

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/trips', changefreq: 'daily', priority: '0.9' },
  { path: '/completed-trips', changefreq: 'weekly', priority: '0.7' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
];

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;');
}

function urlEntry({ path, lastmod, changefreq, priority }) {
  const lines = [
    '  <url>',
    `    <loc>${xmlEscape(SITE_URL + path)}</loc>`,
  ];
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  lines.push('  </url>');
  return lines.join('\n');
}

async function fetchSlugs(supabase, table, pathPrefix) {
  const { data, error } = await supabase
    .from(table)
    .select('slug, updated_at')
    .eq('is_published', true);

  if (error) {
    console.warn(`[generate-sitemap] Couldn't fetch "${table}", skipping those pages: ${error.message}`);
    return [];
  }

  return (data ?? []).map(row => ({
    path: `${pathPrefix}/${row.slug}`,
    lastmod: row.updated_at ? row.updated_at.slice(0, 10) : undefined,
    changefreq: 'weekly',
    priority: '0.8',
  }));
}

async function main() {
  let dynamicEntries = [];

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[generate-sitemap] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — writing static pages only.');
  } else {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const [trips, albums] = await Promise.all([
      fetchSlugs(supabase, 'upcoming_trips', '/trips'),
      fetchSlugs(supabase, 'completed_trips', '/completed-trips'),
    ]);
    dynamicEntries = [...trips, ...albums];
  }

  const allEntries = [...STATIC_PAGES, ...dynamicEntries];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...allEntries.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');

  await writeFile(OUTPUT_PATH, xml, 'utf-8');
  console.log(`[generate-sitemap] Wrote ${allEntries.length} URLs (${STATIC_PAGES.length} static + ${dynamicEntries.length} dynamic) to public/sitemap.xml`);
}

main().catch(err => {
  console.error('[generate-sitemap] Failed, falling back to existing sitemap.xml:', err);
  // Non-fatal — don't block the build over a sitemap regeneration failure.
  process.exit(0);
});
