// Copies the rarely-changing site images (logos, hero banners, founder photo,
// About-page photos) from the 'ulaa' Storage bucket into public/site-images/,
// so the website serves them itself instead of Supabase Storage.
//
// Why: every visit used to download these from Supabase and count toward the
// cached-egress quota. Served from public/ they cost Supabase nothing, and a
// traffic spike on them can no longer take login and data down.
//
// How it fits together
//   * Files are saved at public/site-images/<bucket path>, e.g.
//     public/site-images/branding/1700-logo.png
//   * src/generated/siteImageManifest.json lists every mirrored path. The site
//     (localSiteImage() in src/utils/imageUrls.ts) swaps a Supabase URL for the
//     local one ONLY if its path is in that list.
//   * The database is never touched, so admin editing works as before. A photo
//     the admin uploads later keeps loading from Supabase until you run this
//     script again (then commit + deploy). Re-running only fetches new files.
//
// USAGE (PowerShell, in the project folder)
//   $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Service role key"
//   node scripts/mirror-site-images.mjs --dry-run
//   node scripts/mirror-site-images.mjs
//   git add public/site-images src/generated/siteImageManifest.json   # then commit + deploy
//
// Options
//   --dry-run          list what would be copied, change nothing
//   --force            re-download files that already exist locally
//   --folders a,b,c    bucket folders to mirror (default below)
//
// The service role key is only used to list/read the bucket. Never commit it.
// Standalone one-off script: intentionally not wired into package.json or the build.

import { createClient } from '@supabase/supabase-js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUCKET = 'ulaa';
// Folders whose images are the same for every visitor and change rarely.
// (Per-trip photos, albums and the gallery are NOT here: they change often.)
const DEFAULT_FOLDERS = ['branding', 'founder', 'home-hero', 'home-hero-mobile', 'about'];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'site-images');
const MANIFEST = join(ROOT, 'src', 'generated', 'siteImageManifest.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const foldersArg = args.indexOf('--folders');
const FOLDERS = foldersArg !== -1 && args[foldersArg + 1] ? args[foldersArg + 1].split(',').map((f) => f.trim()).filter(Boolean) : DEFAULT_FOLDERS;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
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
async function listAllFiles(prefix) {
  const files = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list(${prefix}) failed: ${error.message}`, { cause: error.cause ?? error });
    for (const entry of data ?? []) {
      const fullPath = `${prefix}/${entry.name}`;
      if (entry.id === null) files.push(...(await listAllFiles(fullPath)));
      else files.push(fullPath);
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return files;
}

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// Every file currently under public/site-images/ becomes part of the manifest,
// so the manifest always matches what is actually on disk (and gets committed).
async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && !e.name.startsWith('.')) out.push(relative(OUT_DIR, full).split(sep).join('/'));
  }
  return out;
}

async function main() {
  console.log(`Mirroring folders [${FOLDERS.join(', ')}] from bucket "${BUCKET}" into public/site-images/${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

  const remote = [];
  for (const folder of FOLDERS) {
    const found = await listAllFiles(folder);
    console.log(`  ${folder}: ${found.length} file(s)`);
    remote.push(...found);
  }

  const todo = [];
  for (const path of remote) {
    if (FORCE || !(await exists(join(OUT_DIR, ...path.split('/'))))) todo.push(path);
  }
  console.log(`\n${remote.length} file(s) in the bucket; ${remote.length - todo.length} already copied; ${todo.length} to copy.\n`);

  let ok = 0;
  let bytes = 0;
  const failed = [];
  for (const [i, path] of todo.entries()) {
    process.stdout.write(`[${i + 1}/${todo.length}] ${path} … `);
    if (DRY_RUN) {
      console.log('would copy');
      continue;
    }
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error) throw new Error(`download failed: ${error.message}`);
      const buf = Buffer.from(await data.arrayBuffer());
      const dest = join(OUT_DIR, ...path.split('/'));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok++;
      bytes += buf.length;
      console.log(`done (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failed.push({ path, message: err.message });
      console.log(`FAILED (${err.message})`);
    }
  }

  if (!DRY_RUN) {
    const manifest = (await walk(OUT_DIR)).sort();
    await mkdir(dirname(MANIFEST), { recursive: true });
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\n${ok}/${todo.length} file(s) copied (${(bytes / 1048576).toFixed(1)} MB). Manifest now lists ${manifest.length} file(s).`);
    console.log('Next: commit public/site-images and src/generated/siteImageManifest.json, then deploy.');
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
