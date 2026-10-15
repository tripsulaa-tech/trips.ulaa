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
}
