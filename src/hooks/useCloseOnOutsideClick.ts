import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Closes an open dropdown/menu/popover when the user clicks (mousedown)
 * outside every one of the given container refs, and — when `escape` is
 * true — also when they press Escape.
 *
 * This is the same "attach mousedown/keydown listeners on document while
 * open, bail out if the click landed inside one of our own refs" pattern
 * that ActionsMenu, Select, PdfDownloadMenu, TripHighlightIconPicker,
 * DatePicker, and TripDetailPage's calendar menu each implemented
 * independently. Centralized here so they can't drift; each call site still
 * owns its own popover-positioning (scroll/resize) logic separately, since
 * that part isn't shared across all of them.
 *
 * `onClose` is intentionally NOT a dependency of the underlying effect
 * (matching the original call sites) — only `open`/`escape` retrigger it,
 * so passing an inline arrow function each render is fine and won't cause
 * listeners to be re-attached on every render.
 */
export function useCloseOnOutsideClick(
  open: boolean,
  refs: RefObject<HTMLElement | null>[],
  onClose: () => void,
  options?: { escape?: boolean }
): void {
  const escape = options?.escape ?? false;

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (refs.some(ref => ref.current?.contains(target))) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);

    let handleKey: ((e: KeyboardEvent) => void) | undefined;
    if (escape) {
      handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (handleKey) document.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, escape]);
}
