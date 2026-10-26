// Copies storage files from the OLD Supabase project to the NEW one.
// Only files that do NOT already exist in the new bucket are copied. Nothing is overwritten.
//
// Setup (PowerShell, from the ULAA project folder, where @supabase/supabase-js is already installed):
//   (the two project URLs are already filled in below; only the keys are needed)
//   $env:OLD_KEY="<old project (wephglgonrmtcmhfbjqe) service_role key>"
//   $env:NEW_KEY="<new project (xoeqzwpcpnzghdmafoyt) service_role key>"
//   node copy-missing-storage.mjs --dry     # only lists what would be copied
//   node copy-missing-storage.mjs           # does the copy
//
// Keep the service_role keys private. Do not commit them or put them in the app.

import { createClient } from '@supabase/supabase-js';

const {
  OLD_URL = 'https://wephglgonrmtcmhfbjqe.supabase.co',
  NEW_URL = 'https://xoeqzwpcpnzghdmafoyt.supabase.co',
  OLD_KEY, NEW_KEY, BUCKET = 'ulaa',
} = process.env;
if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error('Set OLD_KEY and NEW_KEY (service_role keys) first.');
  process.exit(1);
}
const dry = process.argv.includes('--dry');

const oldDb = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const newDb = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

/** Every file path under `prefix` in a bucket, with its mime type and size. */
async function listAll(client, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list "${prefix}": ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listAll(client, path))); // a folder
      else if (item.name !== '.emptyFolderPlaceholder') files.push({ path, type: item.metadata?.mimetype, size: item.metadata?.size ?? 0 });
    }
    if (data.length < 100) break;
  }
  return files;
}

console.log(`Bucket "${BUCKET}": reading both projects...`);
const [oldFiles, newFiles] = await Promise.all([listAll(oldDb), listAll(newDb)]);
const have = new Set(newFiles.map(f => f.path));
const missing = oldFiles.filter(f => !have.has(f.path));
const mb = missing.reduce((s, f) => s + f.size, 0) / 1048576;

console.log(`Old: ${oldFiles.length} files. New: ${newFiles.length} files. Missing in new: ${missing.length} (${mb.toFixed(1)} MB).`);
if (dry) {
  missing.forEach(f => console.log('  would copy', f.path));
  console.log('Dry run only. Nothing copied.');
  process.exit(0);
}

let ok = 0, skipped = 0, failed = 0;
for (const f of missing) {
  try {
    const { data: blob, error: dErr } = await oldDb.storage.from(BUCKET).download(f.path);
    if (dErr) throw new Error(`download: ${dErr.message}`);
    // upsert:false means an existing file in the new project is never replaced.
    const { error: uErr } = await newDb.storage.from(BUCKET).upload(f.path, blob, { contentType: f.type || blob.type, upsert: false });
    if (uErr) {
      if (/already exists|Duplicate/i.test(uErr.message)) { skipped++; console.log('skip (exists)', f.path); continue; }
      throw new Error(`upload: ${uErr.message}`);
    }
    ok++;
    console.log('copied', f.path);
  } catch (e) {
    failed++;
    console.error('FAILED', f.path, '-', e.message);
  }
}
console.log(`Done. Copied ${ok}, skipped ${skipped}, failed ${failed}. Re-run it any time: it only fills what is still missing.`);
