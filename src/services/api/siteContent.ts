import { supabase } from '../supabase';

// =============================================
// Site Content (editable copy for pages like About)
// =============================================
// Short-lived cache + request de-duplication for the public site. The same key
// can be wanted by several components at once, and each used to make its own
// request on every page load. That
// added up to thousands of requests a day against the Free plan's cached-egress
// quota. Callers opt in with { cached: true }; admin editors keep reading fresh
// data so they never edit (and then save over) a stale copy.
const SITE_CONTENT_TTL_MS = 5 * 60 * 1000;
const siteContentCache = new Map<string, { value: unknown; at: number }>();
const siteContentInflight = new Map<string, Promise<unknown>>();

// Last-known copy kept in localStorage so a returning visitor's page can paint
// its text AND start downloading its images immediately, instead of waiting
// for the database round trip first. It is only ever a head start: pages still
// fetch the live copy and swap it in if it differs.
const PERSIST_PREFIX = 'ulaa:site-content:';

function persistSiteContent(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(PERSIST_PREFIX + key);
    else localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify(value));
  } catch { /* storage full / blocked: harmless */ }
}

/** Synchronous, last-known copy of a site_content row (memory first, then localStorage), or null. */
export function peekSiteContent<T = unknown>(key: string): T | null {
  const hit = siteContentCache.get(key);
  if (hit) return hit.value as T | null;
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

interface GetSiteContentOptions {
  /** Reuse a copy fetched in the last few minutes instead of asking the database again. */
  cached?: boolean;
}

export async function getSiteContent<T = unknown>(key: string, options: GetSiteContentOptions = {}): Promise<T | null> {
  if (options.cached) {
    const hit = siteContentCache.get(key);
    if (hit && Date.now() - hit.at < SITE_CONTENT_TTL_MS) return hit.value as T | null;
  }

  // Callers asking for the same key at the same moment share one request.
  const pending = siteContentInflight.get(key);
  if (pending) return pending as Promise<T | null>;

  const request = (async () => {
    const { data, error } = await supabase
      .from('site_content')
      .select('content')
      .eq('key', key)
      .maybeSingle();
    if (error) return null; // not cached, so the next call tries again
    const value = data ? data.content : null;
    siteContentCache.set(key, { value, at: Date.now() });
    persistSiteContent(key, value);
    return value;
  })().finally(() => siteContentInflight.delete(key));

  siteContentInflight.set(key, request);
  return request as Promise<T | null>;
}

export async function upsertSiteContent(key: string, content: unknown): Promise<void> {
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, content }, { onConflict: 'key' });
  if (error) throw error;
  // Drop the cached copy so this tab sees the change straight away.
  siteContentCache.delete(key);
  persistSiteContent(key, content);
}
