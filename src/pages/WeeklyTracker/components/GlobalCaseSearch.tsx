import { useEffect, useMemo, useRef, useState } from 'react';
import { weeklyApi } from '@/lib/api';
import type { WtAllData, WtAllRow } from '@/lib/api/endpoints/weekly';
import { Tooltip } from '@/components/ui/Tooltip';
import { severityColor } from '@/lib/caseStatus';

interface FlatRow extends WtAllRow {
  _year: number;
  _week: string;
}

interface GlobalCaseSearchProps {
  /** Jump to a case's week (and year) and pin the tracker table to it —
   * reuses the same mechanism as the Reopened/Follow-Up panels'
   * onFocusCase. */
  onNavigate: (week: string, caseNumber: string, year: number) => void;
}

/** "Search all cases across all years" box in the tab bar — 1:1 port of
 * `_setupGlobalSearch()` in WTTrackerData.js. Flattens the full
 * `GET /api/v2/weekly-tracker` payload once, then filters client-side as
 * the user types (debounced), deduped to the most recent week per case
 * number, capped at 15 results. */
export function GlobalCaseSearch({ onNavigate }: GlobalCaseSearchProps) {
  const [all, setAll] = useState<WtAllData | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    weeklyApi
      .getWeeklyTrackerAll()
      .then(setAll)
      .catch(() => {
        // non-fatal — search box just returns no results if this fails
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const flat = useMemo<FlatRow[]>(() => {
    if (!all) return [];
    const out: FlatRow[] = [];
    for (const yr of Object.keys(all)) {
      for (const wk of Object.keys(all[yr])) {
        for (const row of all[yr][wk]) {
          out.push({ ...row, _year: Number(yr), _week: wk });
        }
      }
    }
    return out;
  }, [all]);

  const results = useMemo(() => {
    const ql = debounced.toLowerCase().trim();
    if (!ql) return { unique: [] as FlatRow[], total: 0 };
    const matches = flat.filter(
      (r) =>
        (r.caseNumber || '').toLowerCase().includes(ql) ||
        (r.title || '').toLowerCase().includes(ql) ||
        (r.owner || '').toLowerCase().includes(ql) ||
        (r.category || '').toLowerCase().includes(ql) ||
        (r.comments || '').toLowerCase().includes(ql) ||
        (r.product || '').toLowerCase().includes(ql) ||
        (r.status || '').toLowerCase().includes(ql),
    );
    const byCase = new Map<string, FlatRow>();
    matches.forEach((r) => {
      const existing = byCase.get(r.caseNumber);
      if (!existing || r._year > existing._year || (r._year === existing._year && r._week > existing._week)) {
        byCase.set(r.caseNumber, r);
      }
    });
    return { unique: [...byCase.values()].slice(0, 15), total: byCase.size };
  }, [flat, debounced]);

  const hasQuery = query.trim().length > 0;
  const list = hasQuery ? results.unique : [];
  const total = hasQuery ? results.total : 0;

  function activate(r: FlatRow) {
    setOpen(false);
    setQuery('');
    onNavigate(r._week, r.caseNumber, r._year);
  }

  return (
    <div ref={wrapRef} className="relative inline-flex min-w-[260px] items-center">
      <div className="relative w-full">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          aria-label="Search all cases"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
          placeholder="Search all cases across all years…"
          autoComplete="off"
          className="h-8 w-full rounded-sm border border-border-mid bg-bg-input py-1 pl-7 pr-16 text-[11px] text-text-primary outline-none focus:border-ibm-blue-50"
        />
        {hasQuery && (
          <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-text-tertiary">
            {total} result{total === 1 ? '' : 's'}
          </span>
        )}
        {hasQuery && (
          <Tooltip content="Clear search" className="absolute right-0.5 top-1/2 -translate-y-1/2">
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setOpen(false);
              }}
              className="flex h-6 w-6 items-center justify-center text-text-tertiary hover:text-text-primary"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </Tooltip>
        )}
      </div>

      {open && hasQuery && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[420px] min-w-[360px] overflow-y-auto rounded-sm border border-border-mid bg-bg-ui shadow-lg">
          {list.length === 0 ? (
            <div className="px-4 py-3.5 text-center text-xs text-text-tertiary">
              No results found for &ldquo;<strong>{query}</strong>&rdquo;
            </div>
          ) : (
            <>
              {list.map((r) => {
                const isClosed = (r.status || '').toLowerCase().includes('closed') || (r.status || '').toLowerCase().includes('cancel');
                const comments = (r.comments || '').slice(0, 80);
                return (
                  <button
                    key={r.caseNumber}
                    type="button"
                    onClick={() => activate(r)}
                    className="flex w-full items-start gap-2.5 border-b border-border-subtle px-3.5 py-2.5 text-left hover:bg-ibm-blue-10"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={`font-mono text-xs font-bold ${isClosed ? 'text-text-tertiary' : 'text-ibm-blue-50'}`}>
                          {r.caseNumber}
                        </span>
                        {r.severity && (
                          <span className={`font-mono text-[10px] font-bold ${severityColor(String(r.severity))}`}>S{r.severity}</span>
                        )}
                        <span className="rounded-sm border border-border-subtle bg-bg-layer px-1.5 py-px text-[10px] text-text-tertiary">
                          {r._year} · {r._week}
                        </span>
                        {r.category && (
                          <span className="rounded-sm bg-ibm-blue-10 px-1.5 py-px text-[10px] text-ibm-blue-50">{r.category}</span>
                        )}
                      </div>
                      <div className="mb-0.5 truncate text-xs text-text-primary">{(r.title || '—').slice(0, 80)}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-text-tertiary">{r.owner || '—'}</span>
                        {r.status && (
                          <>
                            <span className="text-[11px] text-text-disabled">·</span>
                            <span className="text-[11px] text-text-tertiary">{r.status}</span>
                          </>
                        )}
                        {comments && (
                          <>
                            <span className="text-[11px] text-text-disabled">·</span>
                            <span className="max-w-[200px] truncate text-[11px] italic text-text-tertiary">
                              {comments}
                              {r.comments.length > 80 ? '…' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 self-center whitespace-nowrap text-[10px] text-ibm-blue-50 opacity-70">Go to week →</span>
                  </button>
                );
              })}
              {total > 15 && (
                <div className="px-3.5 py-2 text-center text-[11px] text-text-tertiary">Showing top 15 of {total} unique cases</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
