import { useEffect, useRef, useState } from 'react';
import { getSiteContent, upsertSiteContent } from '../services/api';
import { useConfirm } from '../components/ui/useConfirm';

/**
 * Shared by every simple "single site_content record, edited on its own
 * admin page, no tabs" screen (Bottom Nav Bar, Button Naming, ...):
 * load-on-mount with a defaults fallback, a save that alerts on failure, a
 * confirm-gated reset-to-defaults, and an unsaved-changes snapshot for
 * AdminLayout's navigate-away guard. Extracted because AdminBottomNav and
 * AdminButtonLabels each carried their own identical copy of this — see
 * cleanup audit for the duplication this replaces. For the tab-bar /
 * page-search / scroll-spy variant used by About, Founder, and Why ULAA,
 * see useContentEditorPage.ts instead.
 */
export function useSiteContentEditor<T>({
  contentKey,
  defaultContent,
  resolveLoaded,
  validate,
}: {
  /** site_content row key this page reads/writes, e.g. 'bottom_nav', 'button_labels'. */
  contentKey: string;
  /** Fallback shown while loading, and used if nothing has been saved yet, the fetch fails, or reset is clicked. */
  defaultContent: T;
  /** Decides whether loaded data looks usable, falling back to defaultContent otherwise (e.g. an empty array or a record missing a required field). */
  resolveLoaded: (data: T | null | undefined) => T;
  /** Optional pre-save check; return an error message to block the save (shown via alert) or null/undefined to proceed. */
  validate?: (content: T) => string | null | undefined;
}) {
  const confirm = useConfirm();
  const [content, setContent] = useState<T>(defaultContent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedContentRef = useRef<string>('');

  useEffect(() => {
    getSiteContent<T>(contentKey)
      .then(data => {
        const resolved = resolveLoaded(data);
        setContent(resolved);
        savedContentRef.current = JSON.stringify(resolved);
      })
      .catch(() => {
        setContent(defaultContent);
        savedContentRef.current = JSON.stringify(defaultContent);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const hasUnsavedChanges = () => !loading && JSON.stringify(content) !== savedContentRef.current;

  const handleSave = async () => {
    const error = validate?.(content);
    if (error) {
      alert(error);
      return;
    }
    try {
      setSaving(true);
      await upsertSiteContent(contentKey, content);
      savedContentRef.current = JSON.stringify(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    const ok = await confirm({
      title: 'Reset to defaults?',
      message: 'This will overwrite your edits below (not saved until you click Save).',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    setContent(defaultContent);
  };

  return { content, setContent, loading, saving, saved, hasUnsavedChanges, handleSave, resetToDefault };
}
