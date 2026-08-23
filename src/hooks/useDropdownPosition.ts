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
// more room above than below). Shared by Select and DatePicker, both of
// which render their panel through a portal and need to re-measure on
// scroll/resize while open.
export function useDropdownPosition(
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  panelHeight: number,
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
      setCoords({
        top: openUp ? rect.top : rect.bottom,
        left: rect.left,
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
  }, [isOpen, panelHeight]);

  return coords;
}
