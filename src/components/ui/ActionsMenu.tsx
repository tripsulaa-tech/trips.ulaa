import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DotsThreeVertical as MoreVertical,
} from '@phosphor-icons/react';

// One row in an ActionsMenu — pass `hidden: true` to omit the item entirely
// (e.g. "Reactivate" on a booking that isn't cancelled), or `disabled: true`
// to show it greyed out with a reason in `title`.
export interface ActionMenuItem {
  label: string;
  icon?: typeof MoreVertical;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  title?: string;
}

const MENU_WIDTH = 192; // w-48
const MENU_MARGIN = 4; // gap between button and menu, and menu and viewport edge

// Generic kebab (⋮) action menu used to consolidate a row's scattered icon
// buttons into one dropdown — e.g. AdminEnquiries' per-booking Cancel/Mark
// No Show/View Invoice/View Details/Download Receipt/WhatsApp/Call actions.
//
// The dropdown itself is rendered into a portal (document.body) with
// `position: fixed` coordinates computed from the trigger button, instead of
// being positioned `absolute` inside the button's own wrapper. Enquiry rows
// live inside cards with `overflow-hidden` (for their rounded corners), so
// an absolutely-positioned menu near the bottom of a card was getting
// clipped by the card's own edge — this portal approach isn't constrained
// by any ancestor's overflow, and also flips upward automatically when
// there isn't room below the button (e.g. the last row on screen).
//
// Closes on outside click / scroll / resize; each item closes the menu
// before running its own onClick.
export default function ActionsMenu({ items, disabled, label = 'Actions' }: { items: ActionMenuItem[]; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter(i => !i.hidden);

  const updatePosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? visibleItems.length * 33 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + MENU_MARGIN && rect.top > menuHeight + MENU_MARGIN;
    const left = Math.min(
      Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - MENU_MARGIN
    );
    const top = openUp ? rect.top - menuHeight - MENU_MARGIN : rect.bottom + MENU_MARGIN;
    setCoords({ top, left, openUp });
  };

  // Recompute once the menu has actually rendered (so we know its real
  // height for the flip-up check), then keep it pinned to the button while
  // open — cards can scroll independently of the page on mobile.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visibleItems.length]);

  useEffect(() => {
    if (!open) return;
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => updatePosition();
    document.addEventListener('mousedown', onClick);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-7 h-7 flex items-center justify-center rounded border border-background-warm text-dark-muted hover:bg-background-warm/60 disabled:opacity-50 transition-colors shrink-0"
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_WIDTH }}
          className="z-50 bg-white rounded-md shadow-lg border border-background-warm py-1"
        >
          {visibleItems.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              title={item.title}
              onClick={() => { setOpen(false); item.onClick(); }}
              disabled={item.disabled}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-button font-medium text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger ? 'text-red-600 hover:bg-red-50' : 'text-dark hover:bg-background-warm/60'
              }`}
            >
              {item.icon && <item.icon size={13} className="shrink-0" aria-hidden="true" />}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}