import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

// Click-and-drag horizontal panning for the table's scroll container. Lets
// us hide the native scrollbar (scrollbar-hide) while still keeping the
// table reachable sideways — drag left/right with the mouse; vertical
// scrolling still works the normal way via the mouse wheel/trackpad.
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const drag = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });
  const [isDragging, setIsDragging] = useState(false);

  const onMouseDown = (e: ReactMouseEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { isDown: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, moved: false };
  };
  const stop = () => {
    if (drag.current.isDown) {
      drag.current.isDown = false;
      setIsDragging(false);
    }
  };
  const onMouseMove = (e: ReactMouseEvent) => {
    const el = ref.current;
    if (!el || !drag.current.isDown) return;
    const x = e.pageX - el.offsetLeft;
    const walk = x - drag.current.startX;
    if (!drag.current.moved && Math.abs(walk) > 4) {
      drag.current.moved = true;
      setIsDragging(true);
    }
    if (drag.current.moved) {
      e.preventDefault();
      el.scrollLeft = drag.current.scrollLeft - walk;
    }
  };

  return {
    ref,
    isDragging,
    handlers: { onMouseDown, onMouseMove, onMouseUp: stop, onMouseLeave: stop },
  };
}

// Small helper so both pages compute the same "Showing X–Y of N" + sliced
// page of rows from one filtered array, given the current page and a fixed
// page size.
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = items.length === 0 ? 0 : (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    pageItems,
    totalPages,
    safePage,
    rangeStart: items.length === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, items.length),
  };
}

export type SortDirection = 'asc' | 'desc';
