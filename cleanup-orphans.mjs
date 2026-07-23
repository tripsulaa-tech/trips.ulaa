// cleanup-orphans.mjs
// Deletes orphaned files from the ULAA "ulaa" storage bucket.
// Usage:
//   node cleanup-orphans.mjs            -> dry run, just lists what would be deleted
//   node cleanup-orphans.mjs --delete   -> actually deletes

import { createClient } from '@supabase/supabase-js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first (service role key, not anon key).');
  process.exit(1);
}

// Bosch network requires routing through the local corporate proxy.
// Set PROXY_URL if 127.0.0.1:3128 isn't right for your setup, or NO_PROXY=1 to skip this.
const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:3128';
if (!process.env.NO_PROXY) {
  try {
    setGlobalDispatcher(new ProxyAgent(PROXY_URL));
    console.log(`Using proxy: ${PROXY_URL} (set NO_PROXY=1 to disable)\n`);
  } catch (e) {
    console.warn(`Could not set proxy dispatcher (${e.message}), continuing without it.\n`);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = 'ulaa';

// Paste the orphan list from the SQL query result here.
const ORPHAN_PATHS = [
  'albums/e1f20dfa-62b7-4716-9e3c-0391df48b87f/1784537062807-fb5ef4a3-a4d9-4c12-8a2f-b5f3a91830b1.png',
  'albums/e1f20dfa-62b7-4716-9e3c-0391df48b87f/1784537060933-22423fd5-47ce-4c79-8e4f-710e44296112.jpg',
  'trip-covers/1784535684253-IMG_6702.jpeg',
];

const isDelete = process.argv.includes('--delete');

console.log(`${isDelete ? 'DELETING' : 'DRY RUN — would delete'} ${ORPHAN_PATHS.length} file(s) from bucket "${BUCKET}":\n`);
ORPHAN_PATHS.forEach((p) => console.log('  -', p));

if (!isDelete) {
  console.log('\nNo changes made. Re-run with --delete to actually remove these files.');
  process.exit(0);
}

const { data, error } = await supabase.storage.from(BUCKET).remove(ORPHAN_PATHS);

if (error) {
  console.error('\nDelete failed:', error.message);
  process.exit(1);
}

console.log(`\nDeleted ${data.length} file(s) successfully.`);
