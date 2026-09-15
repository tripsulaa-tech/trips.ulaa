import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useClickOutsideAndEscape } from '@/lib/useClickOutsideAndEscape';

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  label?: string;
  minWidth?: number;
}

/**
 * SearchableSelect — a type-to-filter dropdown for long option lists
 * (currently just the Team page's Owner picker). Functional 1:1 port of
 * the legacy `SearchableSelect.create()` (js/modules/ui/searchable-select.js):
 * a read-only trigger input that opens a search box + filtered option
 * list, closing on selection, Escape, or an outside click. The legacy
 * version renders its panel into a fixed-position portal so it can flip
 * above the trigger near the bottom of the viewport; this port renders
 * the panel inline (absolutely positioned under the trigger) since the
 * app's dashboard filter bars don't sit near the viewport edge — visual
 * behavior is otherwise the same.
 */
export function SearchableSelect({ value, onChange, options, placeholder = '— Select —', label, minWidth = 180 }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The visible label was previously a plain <span> with no programmatic
  // connection to the trigger input — a screen reader landing on the
  // input announced only "edit text, read only" with no field name at
  // all. useId gives every instance of this component (there can be
  // several on one page, e.g. multiple filter-bar selects) a unique,
  // stable id to wire label -> input via htmlFor/id, same as any other
  // labeled form control in the app.
  const triggerId = useId();
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  useClickOutsideAndEscape(rootRef, open, () => setOpen(false));

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function select(v: string) {
    onChange(v);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label htmlFor={triggerId} className="mb-1 block text-xs text-text-tertiary">
          {label}
        </label>
      )}
      <div className="relative" style={{ minWidth }}>
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <input
          id={triggerId}
          type="text"
          readOnly
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label={label ? undefined : placeholder}
          value={selected?.label ?? ''}
          placeholder={placeholder}
          onClick={() => setOpen((o) => !o)}
          className={`h-8 w-full cursor-pointer rounded-sm border border-border-mid bg-bg-input pl-7 text-xs text-text-primary outline-none focus:border-ibm-blue-50 ${selected ? 'pr-7' : 'pr-2'}`}
        />
        {selected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              select('');
            }}
            aria-label="Clear owner"
            className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 flex max-h-[300px] w-full min-w-[220px] flex-col overflow-hidden rounded-sm border border-border-mid bg-bg-ui shadow-lg"
        >
          <div className="border-b border-border-subtle p-1.5">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${label ?? placeholder}`}
              autoComplete="off"
              className="h-8 w-full rounded-sm border border-border-mid bg-bg-input px-2 text-xs text-text-primary outline-none focus:border-ibm-blue-50"
            />
          </div>
          <div id={listboxId} role="listbox" aria-label={label ?? placeholder} className="overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => select('')}
              className="block w-full px-3 py-1.5 text-left text-xs text-text-tertiary hover:bg-bg-hover"
            >
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-tertiary" role="status">No matches</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => select(o.value)}
                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-bg-hover ${o.value === value ? 'bg-bg-selected text-ibm-blue-60 font-medium' : 'text-text-primary'}`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
