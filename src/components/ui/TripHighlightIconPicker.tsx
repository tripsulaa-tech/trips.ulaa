import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import {
  TRIP_HIGHLIGHT_ICONS, getTripHighlightIcon,
  suggestTripHighlightIcons, searchTripHighlightIcons,
} from '../../constants/tripHighlightIcons';

interface TripHighlightIconPickerProps {
  /** Current icon value (library key, or legacy emoji). */
  value: string;
  onChange: (key: string) => void;
  /** Heading or description text used to auto-suggest matching icons (e.g. "Beaches" → palm tree, "24/7 on-ground support" → headset). */
  hintText: string;
}

/**
 * Dropdown icon picker shared by the "Why You'll Love This Trip" cards and
 * "Travel with Confidence" items in the admin trip editor. Shows icons
 * suggested from the heading/description text first (e.g. typing "Wild
 * Adventure" surfaces paw-print/compass/binoculars), plus a search box to
 * browse the full app icon library.
 */
export default function TripHighlightIconPicker({ value, onChange, hintText }: TripHighlightIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const suggested = useMemo(() => suggestTripHighlightIcons(hintText, 8), [hintText]);
  const results = useMemo(() => (query ? searchTripHighlightIcons(query) : TRIP_HIGHLIGHT_ICONS), [query]);
  const currentMeta = getTripHighlightIcon(value);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-background-warm rounded-md px-2.5 py-1.5 text-sm bg-white hover:border-primary/40 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-full bg-background-warm flex items-center justify-center flex-shrink-0">
            {currentMeta ? <currentMeta.Icon size={13} className="text-primary" /> : <span className="text-sm">{value || '—'}</span>}
          </span>
          <span className="truncate text-dark-muted">{currentMeta ? currentMeta.label : (value ? 'Custom' : 'Choose icon')}</span>
        </span>
        <ChevronDown size={14} className="text-dark-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-72 max-w-[90vw] bg-white border border-background-warm rounded-lg shadow-warm-lg p-3">
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-muted" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search icons…"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-background-warm rounded-md focus:outline-none focus:border-primary/50"
            />
          </div>

          {!query && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-dark-muted uppercase tracking-wide mb-1.5">
                Suggested{hintText ? ` for "${hintText}"` : ''}
              </p>
              <div className="grid grid-cols-6 gap-1.5">
                {suggested.map(meta => (
                  <button
                    key={meta.key}
                    type="button"
                    title={meta.label}
                    onClick={() => pick(meta.key)}
                    className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${value === meta.key ? 'bg-primary/10 text-primary' : 'bg-background-warm text-dark-muted hover:bg-primary/10 hover:text-primary'}`}
                  >
                    <meta.Icon size={16} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-dark-muted uppercase tracking-wide mb-1.5">
              {query ? 'Results' : 'All Icons'}
            </p>
            <div className="grid grid-cols-6 gap-1.5 max-h-48 overflow-y-auto app-scroll pr-1">
              {results.map(meta => (
                <button
                  key={meta.key}
                  type="button"
                  title={meta.label}
                  onClick={() => pick(meta.key)}
                  className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${value === meta.key ? 'bg-primary/10 text-primary' : 'bg-background-warm text-dark-muted hover:bg-primary/10 hover:text-primary'}`}
                >
                  <meta.Icon size={16} />
                </button>
              ))}
              {results.length === 0 && (
                <p className="col-span-6 text-xs text-dark-muted py-2">No icons match "{query}".</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
