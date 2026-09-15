import { useEffect, type RefObject } from 'react';

/**
 * Closes an open dropdown/popover when the user clicks outside `ref`'s
 * subtree, and (by default) also on Escape. Extracted from three
 * byte-for-byte-identical copies of this effect in DatePicker,
 * SearchableSelect, and InstanceCombobox.
 *
 * Pass `{ escape: false }` for callers that already handle Escape
 * themselves (e.g. inside an `onKeyDown` on the trigger input) and only
 * need the outside-click half — this keeps behavior identical to a
 * caller's pre-existing hand-rolled effect rather than adding a second,
 * redundant Escape handler.
 */
export function useClickOutsideAndEscape(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
  options?: { escape?: boolean },
): void {
  const escape = options?.escape ?? true;

  useEffect(() => {
    if (!active) return;

    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', onDocMouseDown);
    if (escape) document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      if (escape) document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
