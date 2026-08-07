import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

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

// Generic kebab (⋮) action menu used to consolidate a row's scattered icon
// buttons into one dropdown — e.g. AdminEnquiries' per-booking Cancel/Mark
// No Show/View Invoice/View Details/Download Receipt/WhatsApp/Call actions.
// Closes on outside click; each item closes the menu before running its
// own onClick.
export default function ActionsMenu({ items, disabled, label = 'Actions' }: { items: ActionMenuItem[]; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const visibleItems = items.filter(i => !i.hidden);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-7 h-7 flex items-center justify-center rounded border border-background-warm text-dark-muted hover:bg-background-warm/60 disabled:opacity-50 transition-colors shrink-0"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 bg-white rounded-md shadow-lg border border-background-warm py-1"
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
              {item.icon && <item.icon size={13} className="shrink-0" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
