import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

interface DropdownCoords {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

// Positions a portaled dropdown/panel relative to its trigger element,
// flipping to open upward when there isn't enough room below (and there's
// more room above than below). Shared by Select, TimePicker and DatePicker,
// all of which render their panel through a portal and need to re-measure on
// scroll/resize while open.
//
// `panelWidth` is optional and only needed for panels with a fixed width
// (DatePicker, TimePicker) — it clamps `left` so the panel can't overflow
// past the right (or left) edge of the viewport when its trigger sits near
// the edge of a narrow container, e.g. a modal on mobile. Select omits it
// since its panel width always matches the trigger's own width/position.
export function useDropdownPosition(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  panelHeight: number,
  panelWidth?: number,
): DropdownCoords {
  const [coords, setCoords] = useState<DropdownCoords>({ top: 0, left: 0, width: 0, openUp: false });

  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;
      const margin = 8;
      let left = rect.left;
      if (panelWidth) {
        const maxLeft = window.innerWidth - panelWidth - margin;
        left = Math.min(left, Math.max(margin, maxLeft));
      }
      setCoords({
        top: openUp ? rect.top : rect.bottom,
        left,
        width: rect.width,
        openUp,
      });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, panelHeight, panelWidth]);

  return coords;
}
