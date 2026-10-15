// One-time maintenance script: creates a small WebP thumbnail for every
// existing image in the 'ulaa' Storage bucket, so grids/cards/filmstrips
// (see src/utils/imageUrls.ts) stop downloading the full-size originals.
//
// Convention (must match thumbPath() in src/utils/imageUrls.ts):
//   albums/x/123-photo.jpg  ->  thumbs/albums/x/123-photo.webp
//
// Originals are never modified. Re-running is safe: thumbnails that already
// exist are skipped (use --force to rebuild them).
//
// SETUP (once, in the project folder)
// -----------------------------------
//   npm install --no-save sharp
//
// USAGE
// -----
//   # PowerShell
//   $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Service role key"
//   node scripts/make-thumbs.mjs --dry-run      # lists what it would do, uploads nothing
//   node scripts/make-thumbs.mjs                # does it
//
// Options
//   --dry-run          list work only, upload nothing
//   --force            rebuild thumbnails that already exist
//   --from-dir <path>  read originals from a local copy of the bucket instead of
//                      downloading them (e.g. .\ulaa-storage-transfer). The folder
//                      layout must match the bucket paths. This costs no download
//                      egress; only the small thumbnails are uploaded.
//   --out-dir <path>   also save the thumbnails to this local folder
//
// The service role key is needed to write to the bucket. Never commit it or
// put it in a VITE_-prefixed variable. Standalone one-off script: intentionally
// not wired into package.json or the build.

import { createClient } from '@supabase/supabase-js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const BUCKET = 'ulaa';
const THUMB_FOLDER = 'thumbs';
const THUMB_WIDTH = 720; // keep in sync with THUMB_WIDTH in src/services/api/shared.ts
const THUMB_QUALITY = 72; // sharp uses 1-100 (the browser code's 0.72)
const CACHE_CONTROL = '31536000'; // 1 year
const RASTER_EXT = /\.(jpe?g|png|webp|avif|heic|heif|tiff?)$/i; // gif/svg get no thumbnail
// Content types for the "original is already smaller" case (see below).
const PASSTHROUGH_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
};
const DRY_RUN = flag('--dry-run');
const FORCE = flag('--force');
const FROM_DIR = option('--from-dir');
const OUT_DIR = option('--out-dir');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('The "sharp" package is missing. Run:  npm install --no-save sharp');
  process.exit(1);
}

// Node's fetch ignores Windows proxy settings; honour HTTPS_PROXY if set.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  console.log(`Using proxy: ${proxyUrl}`);
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// storage.list() returns one folder level at a time (folders have id === null).
async function listAllFiles(prefix = '') {
  const files = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list(${prefix || '/'}) failed: ${error.message}`, { cause: error.cause ?? error });
    for (const entry of data ?? []) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAllFiles(fullPath)));
      else files.push(fullPath);
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return files;
}

// Must match thumbPath() in src/utils/imageUrls.ts
const thumbPathFor = (path) => `${THUMB_FOLDER}/${path.replace(/\.[A-Za-z0-9]+$/, '')}.webp`;

async function getOriginal(path) {
  if (FROM_DIR) return readFile(join(FROM_DIR, ...path.split('/')));
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function main() {
  console.log(`Listing objects in bucket "${BUCKET}"…`);
  const all = await listAllFiles();
  const existing = new Set(all.filter((p) => p.startsWith(`${THUMB_FOLDER}/`)));
  const originals = all.filter((p) => !p.startsWith(`${THUMB_FOLDER}/`));
  const candidates = originals.filter((p) => RASTER_EXT.test(p));
  const skippedType = originals.length - candidates.length;
  const todo = candidates.filter((p) => FORCE || !existing.has(thumbPathFor(p)));

  console.log(
    `${originals.length} original(s): ${candidates.length} image(s) eligible` +
      `${skippedType ? `, ${skippedType} skipped (gif/svg/other)` : ''}; ` +
      `${candidates.length - todo.length} already have a thumbnail; ${todo.length} to create.` +
      `${DRY_RUN ? '  [DRY RUN - nothing will be uploaded]' : ''}\n`,
  );

  let ok = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  const failed = [];

  for (const [i, path] of todo.entries()) {
    const target = thumbPathFor(path);
    process.stdout.write(`[${i + 1}/${todo.length}] ${path} -> ${target} … `);
    if (DRY_RUN) {
      console.log('would create');
      continue;
    }
    try {
      const input = await getOriginal(path);
      const output = await sharp(input)
        .rotate() // bake in EXIF orientation
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toBuffer();

      // If the resized copy is not smaller than the original (already-small
      // photos), store the original's bytes at the thumbnail path instead. The
      // page always requests the thumbnail path, so skipping the file would cost
      // a 404 plus a second request; this way a thumbnail is never bigger than
      // the original. Browsers decode by content, not by file extension.
      const ext = path.split('.').pop().toLowerCase();
      const passthroughType = PASSTHROUGH_TYPES[ext];
      const useOriginal = output.length >= input.length && passthroughType !== undefined;
      const body = useOriginal ? input : output;
      const { error } = await supabase.storage.from(BUCKET).upload(target, body, {
        upsert: true,
        cacheControl: CACHE_CONTROL,
        contentType: useOriginal ? passthroughType : 'image/webp',
      });
      if (error) throw new Error(`upload failed: ${error.message}`);

      if (OUT_DIR) {
        const local = join(OUT_DIR, ...target.split('/'));
        await mkdir(dirname(local), { recursive: true });
        await writeFile(local, body);
      }
      ok++;
      bytesIn += input.length;
      bytesOut += body.length;
      console.log(
        `done (${(input.length / 1024).toFixed(0)} KB -> ${(body.length / 1024).toFixed(0)} KB${useOriginal ? ', kept original: already small' : ''})`,
      );
    } catch (err) {
      failed.push({ path, message: err.message });
      console.log(`FAILED (${err.message})`);
    }
  }

  if (!DRY_RUN) {
    console.log(`\n${ok}/${todo.length} thumbnail(s) created.`);
    if (ok) console.log(`Originals ${(bytesIn / 1048576).toFixed(1)} MB -> thumbnails ${(bytesOut / 1048576).toFixed(1)} MB.`);
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} failure(s):`);
    for (const f of failed) console.log(`  - ${f.path}: ${f.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  if (err.cause) console.error('Underlying cause:', err.cause);
  process.exit(1);
});
