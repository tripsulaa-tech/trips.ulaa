// Automatic photo lookup for the trip Import flow (see processImportedImages). Searches Openverse, a
// free index of openly licensed photos, and returns candidates; the caller picks and uploads one.

export type OpenverseHit = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  license: string;
  creator?: string;
  title?: string;
  foreign_landing_url?: string;
};

const searchCache = new Map<string, OpenverseHit[]>();
let searchGate: Promise<unknown> = Promise.resolve();
const SEARCH_GAP_MS = 1200; // be polite: anonymous use has a request limit

/** Searches run one at a time with a short pause between them, and repeats are served from memory. */
export function openverseSearch(query: string, license: string, aspect: 'wide' | 'tall' | undefined, source?: string): Promise<OpenverseHit[]> {
  const key = `${license}|${aspect ?? ''}|${source ?? ''}|${query}`;
  const cached = searchCache.get(key);
  if (cached) return Promise.resolve(cached);
  const run = async () => {
    const params = new URLSearchParams({ q: query, license, size: 'large', category: 'photograph', mature: 'false', page_size: '20' });
    if (aspect) params.set('aspect_ratio', aspect);
    if (source) params.set('source', source);
    const res = await fetch(`https://api.openverse.org/v1/images/?${params}`);
    if (res.status === 429) throw new Error('rate-limited');
    if (!res.ok) throw new Error(`search failed (${res.status})`);
    const json = await res.json() as { results?: OpenverseHit[] };
    const hits = json.results ?? [];
    searchCache.set(key, hits);
    return hits;
  };
  const next = searchGate.then(() => new Promise(r => setTimeout(r, SEARCH_GAP_MS))).then(run);
  searchGate = next.catch(() => undefined);
  return next;
}

export const searchQueryOf = (source: string): string => source.replace(/^search:\s*/i, '').replace(/\s+#\d+$/, '').trim();

// Sites whose images the browser is not allowed to read (no CORS header). Remembered so each is tried once, not 30 times.
const blockedHosts = new Set<string>();
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ''; } };

const NOISE = new Set(['cinematic', 'landscape', 'portrait', 'wide', 'photography', 'photo', 'photograph', 'scenic', 'travel', 'stock', 'hd', 'ultra', 'beautiful', 'view']);

/** "Kannur Theyyam ritual performer traditional costume cinematic landscape" -> a full and a shorter keyword query. */
export function queryVariants(query: string): string[] {
  const words = query.split(/\s+/).filter(w => w && !NOISE.has(w.toLowerCase()));
  const full = words.join(' ');
  const mid = words.slice(0, 3).join(' ');
  const short = words.slice(0, 2).join(' ');
  return Array.from(new Set([full, mid, short].filter(Boolean)));
}

export type FoundPhoto =
  | { ok: true; blob: Blob; hit: OpenverseHit; needsCredit: boolean }
  | { ok: false; reason: string };

const measureBlob = async (blob: Blob): Promise<{ w: number; h: number } | null> => {
  try { const b = await createImageBitmap(blob); const r = { w: b.width, h: b.height }; b.close(); return r; } catch { return null; }
};

/**
 * Finds one good photo for `query`. CC0 / public-domain results are preferred; CC BY / BY-SA are used
 * only if nothing else works (they need credit). Photos with unknown size are accepted but measured
 * after download, so a too-small one is still rejected. Returns the reason when nothing fits.
 */
export async function findOpenPhoto(opts: {
  query: string;
  aspect?: 'wide' | 'tall';
  fits: (w: number, h: number) => boolean;
  used: Set<string>;
}): Promise<FoundPhoto> {
  let reason = 'no results for that search';
  // Wikimedia Commons (and Flickr) images can be downloaded by the browser; many other sites cannot. Look there first, then anywhere.
  const sources: Array<string | undefined> = ['wikimedia,flickr', undefined];
  for (const q of queryVariants(opts.query)) {
    for (const source of sources) {
      let hits: OpenverseHit[];
      try {
        hits = await openverseSearch(q, 'cc0,pdm,by,by-sa', opts.aspect, source);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'rate-limited') return { ok: false, reason: 'the free search limit was reached (try again in a while)' };
        reason = `the photo search could not be reached (${msg || 'network or browser block'})`;
        continue;
      }
      const free = (h: OpenverseHit) => h.license === 'cc0' || h.license === 'pdm';
      const area = (h: OpenverseHit) => (h.width ?? 0) * (h.height ?? 0);
      const candidates = hits
        .filter(h => !opts.used.has(h.id) && !blockedHosts.has(hostOf(h.url)) && (h.width == null || h.height == null || opts.fits(h.width, h.height)))
        .sort((a, b) => Number(free(b)) - Number(free(a)) || area(b) - area(a));
      if (candidates.length === 0 && hits.length > 0) reason = 'the photos found were too small, the wrong shape, or on sites that block downloads';
      for (const hit of candidates.slice(0, 5)) {
        try {
          const res = await fetch(hit.url);
          if (!res.ok) { reason = 'the photos found could not be downloaded'; continue; }
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) continue;
          const dims = await measureBlob(blob);
          if (dims && !opts.fits(dims.w, dims.h)) { reason = 'the photos found were too small or the wrong shape'; continue; }
          return { ok: true, blob, hit, needsCredit: !free(hit) };
        } catch {
          blockedHosts.add(hostOf(hit.url));
          reason = 'the photo sites found block downloads from the browser';
        }
      }
    }
  }
  console.warn(`Photo search "${opts.query}" found nothing: ${reason}`);
  return { ok: false, reason };
}
