/** Shared helpers for the "restore this page's filters/search/sort/page
 *  from sessionStorage on mount, and keep it in sync on every change"
 *  pattern used by each admin list page's filter hook (Enquiries, Waitlist,
 *  Travellers, Reports — see useEnquiryFilters.ts for the fullest example).
 *
 *  Session-scoped (not localStorage), same convention as
 *  useScrollRestoration's scroll-position memory and AdminEnquiries.tsx's
 *  expandedId restore: it clears itself at the end of the browser session
 *  instead of sticking around indefinitely across unrelated visits, and it
 *  never needs a version-migration story since a stale/incompatible shape
 *  just falls back to the field's own default (see loadPersisted below).
 *
 *  Usage inside a filter hook:
 *
 *    const [persisted] = useState(() => loadPersisted<Persisted>(KEY));
 *    const [foo, setFoo] = useState(persisted.foo ?? 'all');
 *    ...
 *    useEffect(() => {
 *      savePersisted<Persisted>(KEY, { foo, bar, ... });
 *    }, [foo, bar, ...]);
 */

/** Reads and JSON-parses whatever was last saved under `key`. Returns `{}`
 *  (never throws) if nothing's saved yet, the value isn't valid JSON, or
 *  storage itself is unavailable (private browsing, etc.) — callers should
 *  fall back to their own per-field defaults with `persisted.field ?? default`
 *  rather than assuming every field is present. */
export function loadPersisted<T>(key: string): Partial<T> {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Serializes `value` to sessionStorage under `key`. Silently does nothing
 *  on failure (storage unavailable/full) — persistence is a nice-to-have
 *  restore, not something the rest of the page depends on. */
export function savePersisted<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private browsing, quota) — state just
    // won't persist this session; nothing else depends on this write.
  }
}
