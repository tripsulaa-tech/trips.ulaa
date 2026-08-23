import { useState, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { getSiteContent, upsertSiteContent, deleteImageByUrl } from '../services/api';
import { collectStorageUrls } from '../utils/utils-index';

// Shared by every "single site_content record, edited on its own admin
// page" screen (About, Founder, Why ULAA, ...): load-on-mount with a
// defaults fallback, a save that diffs+cleans up orphaned storage images,
// an unsaved-changes snapshot for AdminLayout's navigate-away guard, and
// the tab bar / page-search / scroll-spy chrome (all identical across
// these pages, see Tabs.tsx for the pattern they're based on). Extracted
// here because AdminAbout, AdminFounder, and AdminWhyULAA each carried
// their own copy of this — see PR history / cleanup audit for the
// duplication this replaces. Field-specific setters (setHero, setFounder,
// updateFeature, ...) stay in each page, since those depend on that page's
// own content shape.

export interface UseContentEditorPageOptions<T> {
  /** site_content row key this page reads/writes, e.g. 'about', 'founder', 'why_ulaa'. */
  contentKey: string;
  /** Fallback shown while loading, and used if nothing has been saved yet or the fetch fails. */
  defaultContent: T;
  /**
   * Reconciles data loaded from the DB with `defaultContent` (e.g. so a field added to the
   * shape after a record was last saved doesn't come back `undefined` and crash the form).
   * Called with whatever `getSiteContent` resolves with, including `null`/`undefined`.
   */
  mergeWithDefaults: (data: unknown) => T;
  /**
   * Number of tab-bar sections / scroll-spy targets, computed from the current content.
   * Return a fixed number for a static section list, or derive it from `content` (e.g.
   * `1 + content.features.length`) for a page whose sections grow/shrink with the data —
   * the tab-fade and scroll-spy effects re-run whenever the returned count changes.
   * Takes `content` as a parameter (rather than the caller closing over its own copy)
   * since the hook owns `content` internally — there's no external copy to close over
   * until the hook itself returns.
   */
  sectionCount: (content: T) => number;
  /** Storage bucket used for images embedded in this content, for orphaned-image cleanup on save. */
  storageBucket?: string;
}

export interface UseContentEditorPageResult<T> {
  content: T;
  setContent: Dispatch<SetStateAction<T>>;
  loading: boolean;
  saving: boolean;
  saved: boolean;

  activeSection: number;
  /** Registers/clears the section element at `index` for the scroll-spy — pass as `ref={el => setSectionRef(i, el)}` on each section's wrapper. */
  setSectionRef: (index: number, el: HTMLDivElement | null) => void;
  tabBarRef: RefObject<HTMLDivElement | null>;
  tabButtonRefs: RefObject<(HTMLButtonElement | null)[]>;
  showLeftFade: boolean;
  showRightFade: boolean;
  handleTabSelect: (i: number) => void;

  pageSearch: string;
  setPageSearch: (value: string) => void;
  pageSearchNoMatch: boolean;
  scrollBodyRef: RefObject<HTMLDivElement | null>;

  hasUnsavedChanges: () => boolean;
  handleSave: () => Promise<void>;
}

export function useContentEditorPage<T>({
  contentKey,
  defaultContent,
  mergeWithDefaults,
  sectionCount: getSectionCount,
  storageBucket = 'ulaa',
}: UseContentEditorPageOptions<T>): UseContentEditorPageResult<T> {
  const [content, setContent] = useState<T>(defaultContent);
  const sectionCount = getSectionCount(content);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Tab bar (pills): sections stay in one continuous scroll — clicking a
  // pill scrolls to that section, and the active pill updates automatically
  // as the admin scrolls past each one (same behavior as the Add Trip
  // modal's own tab bar / Tabs.tsx).
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastActiveRef = useRef(0);
  // Edge fades on the tab bar (matches the Add Trip modal's Tabs.tsx) so
  // it's obvious there are more tabs to scroll to in either direction.
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const suppressObserverRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollListenerRef = useRef<(() => void) | null>(null);

  // Page-wide field search (mirrors the Add Trip modal's search field) —
  // scans every label/section-heading in the page, scrolls the first match
  // into view with a brief highlight flash.
  const [pageSearch, setPageSearch] = useState('');
  const [pageSearchNoMatch, setPageSearchNoMatch] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  // Snapshot of every storage URL present in `content` as of the last
  // successful load or save. Compared against the live set on save (to
  // find newly-uploaded images that got swapped out again before saving)
  // and exposed via hasUnsavedChanges so navigating away mid-edit prompts
  // a confirmation instead of silently discarding an in-progress
  // upload/edit.
  const savedUrlsRef = useRef<Set<string>>(new Set());
  const savedContentRef = useRef<string>('');

  useEffect(() => {
    getSiteContent<unknown>(contentKey)
      .then(data => {
        const merged = mergeWithDefaults(data);
        setContent(merged);
        savedUrlsRef.current = collectStorageUrls(merged, storageBucket);
        savedContentRef.current = JSON.stringify(merged);
      })
      .catch(() => {
        setContent(defaultContent);
        savedUrlsRef.current = collectStorageUrls(defaultContent, storageBucket);
        savedContentRef.current = JSON.stringify(defaultContent);
      })
      .finally(() => setLoading(false));
    // Intentionally runs once on mount only, like every page this replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const handlePageSearch = () => {
    const query = pageSearch.trim().toLowerCase();
    const container = scrollBodyRef.current;
    if (!query || !container) {
      setPageSearchNoMatch(false);
      return;
    }
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('label, h2'));
    const match = candidates.find(el => el.textContent?.toLowerCase().includes(query));
    if (!match) {
      setPageSearchNoMatch(true);
      return;
    }
    setPageSearchNoMatch(false);
    const sectionEl = match.closest<HTMLElement>('[data-section]');
    if (sectionEl) setActiveSection(Number(sectionEl.dataset.section) - 1);
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const previousBackground = match.style.backgroundColor;
    const previousTransition = match.style.transition;
    match.style.transition = 'background-color 0.3s ease';
    match.style.backgroundColor = '#FDE9D9';
    setTimeout(() => {
      match.style.backgroundColor = previousBackground;
      match.style.transition = previousTransition;
    }, 1500);
  };

  useEffect(() => {
    const timeout = setTimeout(() => handlePageSearch(), pageSearch.trim() ? 350 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSearch]);

  // Scroll-spy: highlights whichever section pill matches what's currently
  // at the top of the scroll area, same approach as Tabs.tsx. Scrolls the
  // tab bar's own scrollLeft directly (centering the button) instead of
  // the button's native scrollIntoView — scrollIntoView's block dimension
  // considers this page's outer vertical scroll containers too (it can't
  // be scoped to just the tab bar's horizontal axis), which meant a tab
  // scrolled would sometimes settle only partially into view instead of
  // fully. Computing the scrollLeft ourselves touches only the tab bar.
  const scrollTabIntoView = (i: number) => {
    const bar = tabBarRef.current;
    const btn = tabButtonRefs.current[i];
    if (!bar || !btn) return;
    const target = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  };

  // Keeps the edge fades in sync with the tab bar's scroll position — same
  // approach as Tabs.tsx. Depends on sectionCount since the tab bar's
  // scrollWidth changes on pages whose section list grows/shrinks with the
  // data (e.g. Why ULAA's feature cards).
  const updateTabFades = () => {
    const el = tabBarRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateTabFades();
    const el = tabBarRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateTabFades);
    const resizeObserver = new ResizeObserver(updateTabFades);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateTabFades);
      resizeObserver.disconnect();
    };
  }, [sectionCount]);

  useEffect(() => {
    const container = scrollBodyRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      entries => {
        if (suppressObserverRef.current) return;
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        const idx = sectionRefs.current.indexOf(topMost.target as HTMLDivElement);
        if (idx !== -1 && idx !== lastActiveRef.current) {
          lastActiveRef.current = idx;
          setActiveSection(idx);
          scrollTabIntoView(idx);
        }
      },
      { root: container, rootMargin: '0px 0px -65% 0px', threshold: 0 }
    );
    sectionRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => () => {
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    if (suppressScrollListenerRef.current) scrollBodyRef.current?.removeEventListener('scroll', suppressScrollListenerRef.current);
  }, []);

  const handleTabSelect = (i: number) => {
    lastActiveRef.current = i;
    setActiveSection(i);
    suppressObserverRef.current = true;
    const container = scrollBodyRef.current;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    if (suppressScrollListenerRef.current) {
      container?.removeEventListener('scroll', suppressScrollListenerRef.current);
      suppressScrollListenerRef.current = null;
    }
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    scrollTabIntoView(i);
    // Re-enable the scroll-spy once scrolling has actually gone idle,
    // rather than after a fixed delay. A fixed delay that's shorter than a
    // long jump's scroll duration (e.g. last section back to the first, on
    // a page this tall) lets the observer catch an intermediate section
    // mid-scroll and immediately snap the active tab back to it — which is
    // what made clicking an earlier (left-side) tab appear to bounce back
    // to the right.
    const clearSuppression = () => {
      suppressObserverRef.current = false;
      if (suppressScrollListenerRef.current) {
        container?.removeEventListener('scroll', suppressScrollListenerRef.current);
        suppressScrollListenerRef.current = null;
      }
    };
    const onScroll = () => {
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = setTimeout(clearSuppression, 150);
    };
    suppressScrollListenerRef.current = onScroll;
    container?.addEventListener('scroll', onScroll);
    // Fallback in case no scroll event fires at all (e.g. already at the target).
    suppressTimeoutRef.current = setTimeout(clearSuppression, 150);
  };

  const setSectionRef = (index: number, el: HTMLDivElement | null) => {
    sectionRefs.current[index] = el;
  };

  const hasUnsavedChanges = () => JSON.stringify(content) !== savedContentRef.current;

  const handleSave = async () => {
    try {
      setSaving(true);
      await upsertSiteContent(contentKey, content);
      // Any image that was in the previously-saved content but isn't in
      // what we just saved (e.g. swapped for a new upload, or removed) is
      // now truly orphaned — clean it up best-effort.
      const newUrls = collectStorageUrls(content, storageBucket);
      for (const url of savedUrlsRef.current) {
        if (!newUrls.has(url)) deleteImageByUrl(storageBucket, url).catch(() => {});
      }
      savedUrlsRef.current = newUrls;
      savedContentRef.current = JSON.stringify(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return {
    content,
    setContent,
    loading,
    saving,
    saved,
    activeSection,
    setSectionRef,
    tabBarRef,
    tabButtonRefs,
    showLeftFade,
    showRightFade,
    handleTabSelect,
    pageSearch,
    setPageSearch,
    pageSearchNoMatch,
    scrollBodyRef,
    hasUnsavedChanges,
    handleSave,
  };
}
