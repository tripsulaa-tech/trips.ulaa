// One-time maintenance script: re-uploads every object in the 'ulaa' Storage
// bucket in place so it picks up the 1-year cacheControl header added in
// src/services/api.ts (commit 9520e04, "egress fix").
//
// WHY THIS IS NEEDED
// -------------------
// That fix only changed what NEW uploads do. Every file uploaded before it
// landed is still stored with Supabase's old default cacheControl (3600s =
// 1 hour), so browsers and the CDN were re-validating/re-fetching those
// files from origin at least once an hour on every repeat view — this is
// almost certainly what burned through the org's 5GB/month Cached Egress
// quota (Storage Size is only ~68MB, so ~7GB of cached egress means the
// existing files were effectively re-served ~100x over).
//
// Supabase doesn't expose an API to patch an object's cacheControl metadata
// without re-sending the file bytes (confirmed via Supabase's own storage
// discussions — there's no "update headers only" endpoint, and hand-editing
// the storage.objects table directly is explicitly unsupported/discouraged).
// So the only supported fix is: download each object, re-upload it to the
// same path with upsert + the correct cacheControl. Total bucket size here
// is small (well under 100MB), so the one-time egress cost of doing this is
// negligible next to what's already been spent.
//
// USAGE
// -----
//   SUPABASE_URL=https://wephglgonrmtcmhfbjqe.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key, NOT the anon key> \
//   node scripts/refresh-storage-cache-control.mjs
//
// The service role key is required (not the anon key) because this needs to
// read/write every object in the bucket regardless of RLS/ownership. Find it
// in Supabase Dashboard → Project Settings → API → service_role secret.
// Never commit this key or put it in a VITE_-prefixed env var.
//
// This is a standalone one-off script — intentionally NOT wired into
// package.json "scripts" or the build, so it never runs by accident.

import { createClient } from '@supabase/supabase-js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const BUCKET = 'ulaa';
const CACHE_CONTROL = '31536000'; // 1 year, matches src/services/api.ts uploadImage()

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.'
  );
  process.exit(1);
}

// Node's built-in fetch (undici) does NOT read Windows/system proxy settings
// the way a browser does — on a corporate network behind a proxy/firewall,
// this is the #1 cause of a bare "fetch failed" here. If HTTPS_PROXY or
// HTTP_PROXY is set, route all requests through it explicitly.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  console.log(`Using proxy: ${proxyUrl}`);
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// storage.list() only returns one folder level at a time (folders come back
// as entries with id === null), so we walk the tree ourselves to collect
// every file's full path.
async function listAllFiles(prefix = '') {
  const files = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw new Error(`list(${prefix || '/'}) failed: ${error.message}`, { cause: error.cause ?? error });

  for (const entry of data ?? []) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      // Folder placeholder — recurse into it.
      const nested = await listAllFiles(fullPath);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function refreshFile(path) {
  const { data: blob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(path);
  if (downloadError) throw new Error(`download failed: ${downloadError.message}`);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    cacheControl: CACHE_CONTROL,
    contentType: blob.type || undefined,
  });
  if (uploadError) throw new Error(`re-upload failed: ${uploadError.message}`);
}

async function main() {
  console.log(`Listing objects in bucket "${BUCKET}"…`);
  const files = await listAllFiles();
  console.log(`Found ${files.length} object(s). Refreshing cacheControl to ${CACHE_CONTROL}s (1 year)…\n`);

  let ok = 0;
  const failed = [];

  for (const [i, path] of files.entries()) {
    process.stdout.write(`[${i + 1}/${files.length}] ${path} … `);
    try {
      await refreshFile(path);
      ok++;
      console.log('done');
    } catch (err) {
      failed.push({ path, message: err.message });
      console.log(`FAILED (${err.message})`);
    }
  }

  console.log(`\n${ok}/${files.length} object(s) refreshed.`);
  if (failed.length > 0) {
    console.log(`\n${failed.length} failure(s):`);
    for (const f of failed) console.log(`  - ${f.path}: ${f.message}`);
    process.exitCode = 1;
  } else {
    console.log('All objects now serve with a 1-year cacheControl header.');
  }
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  // undici's "fetch failed" is a wrapper — the actual reason (proxy refused,
  // DNS lookup failed, TLS error, etc.) lives on err.cause and is otherwise
  // invisible.
  if (err.cause) console.error('Underlying cause:', err.cause);
  process.exit(1);
});
