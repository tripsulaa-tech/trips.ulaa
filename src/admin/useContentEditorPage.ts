import { useState, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { getSiteContent, upsertSiteContent, deleteImageByUrl } from '../services/api';
import { collectStorageUrls } from '../utils/utils-index';
import { useSectionTabChrome } from './useSectionTabChrome';

// Shared by every "single site_content record, edited on its own admin
// page" screen (About, Founder, Why Ulaa, ...): load-on-mount with a
// defaults fallback, a save that diffs+cleans up orphaned storage images,
// an unsaved-changes snapshot for AdminLayout's navigate-away guard, and
// the tab bar / page-search / scroll-spy chrome (delegated to
// useSectionTabChrome, shared with useAdminHomePage — see that file for the
// duplication this replaces). Extracted here because AdminAbout,
// AdminFounder, and AdminWhyULAA each carried their own copy of this — see
// PR history / cleanup audit for the duplication this replaces. Field-
// specific setters (setHero, setFounder, updateFeature, ...) stay in each
// page, since those depend on that page's own content shape.

interface UseContentEditorPageOptions<T> {
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

interface UseContentEditorPageResult<T> {
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

  const {
    activeSection, setSectionRef, tabBarRef, tabButtonRefs, showLeftFade, showRightFade,
    handleTabSelect, pageSearch, setPageSearch, pageSearchNoMatch, scrollBodyRef,
  } = useSectionTabChrome(loading, sectionCount);

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
