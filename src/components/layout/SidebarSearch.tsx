import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV_GROUPS, type NavItem } from '@/config/navigation';
import { useCases } from '@/features/cases';
import type { ApiCase } from '@/lib/api/endpoints/cases';
import { severityColor } from '@/lib/caseStatus';
import { useClickOutsideAndEscape } from '@/lib/useClickOutsideAndEscape';

interface SidebarSearchResult {
  kind: 'case' | 'page';
  key: string;
  primary: string;
  secondary?: string;
  severity?: string | null;
  onSelect: () => void;
}

/** Flattened, searchable list of every nav destination (parents + their
 * children), so typing a page name like "weekly" or "rfe" jumps straight
 * there alongside case matches. */
const SEARCHABLE_PAGES: NavItem[] = NAV_GROUPS.flatMap((g) => g.items.flatMap((item) => (item.children ? item.children : [item])));

/** Sidebar "Search cases, KB, owners…" box. Was previously a plain
 * controlled input with no handler at all — it recorded keystrokes into
 * state and did nothing else. This wires it up to actually search: case
 * number/title/owner/product/status (via the same cases dataset every
 * dashboard already loads through `useCases`) plus nav page names, with a
 * results dropdown that jumps to the match on click. Case results reuse
 * the app's existing "jump to a case" mechanism — the Weekly Tracker's
 * `?focusCase=` route (see RfeTracking's rfeColumns.tsx / router.tsx). */
export function SidebarSearch() {
  const navigate = useNavigate();
  const { raw: cases } = useCases();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  useClickOutsideAndEscape(wrapRef, open, () => setOpen(false));

  function goToCase(c: ApiCase) {
    setOpen(false);
    setQuery('');
    navigate(`/weekly-tracker/tracker?focusCase=${encodeURIComponent(c.case_number)}`);
  }

  function goToPage(item: NavItem) {
    setOpen(false);
    setQuery('');
    navigate(item.path);
  }

  const results = useMemo<SidebarSearchResult[]>(() => {
    const ql = debounced.toLowerCase().trim();
    if (!ql) return [];

    const pageMatches: SidebarSearchResult[] = SEARCHABLE_PAGES.filter((p) => p.label.toLowerCase().includes(ql)).map((p) => ({
      kind: 'page',
      key: `page-${p.tab}`,
      primary: p.label,
      secondary: 'Go to page',
      onSelect: () => goToPage(p),
    }));

    const caseMatches: SidebarSearchResult[] = (cases as ApiCase[])
      .filter((c) => {
        const owner = c.display_name || c.owner_name || '';
        return (
          c.case_number.toLowerCase().includes(ql) ||
          (c.title || '').toLowerCase().includes(ql) ||
          owner.toLowerCase().includes(ql) ||
          (c.product || '').toLowerCase().includes(ql) ||
          (c.status || '').toLowerCase().includes(ql)
        );
      })
      .slice(0, 8)
      .map((c) => ({
        kind: 'case' as const,
        key: `case-${c.case_number}`,
        primary: c.case_number,
        secondary: `${c.title || '—'}${c.display_name || c.owner_name ? ` · ${c.display_name || c.owner_name}` : ''}`,
        severity: c.severity,
        onSelect: () => goToCase(c),
      }));

    return [...pageMatches.slice(0, 4), ...caseMatches];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, cases]);

  const hasQuery = query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative flex-shrink-0 px-3 pb-1.5 pt-2.5 transition-opacity">
      <div className="flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.07] px-2.5 py-1.5 transition-all focus-within:border-ibm-blue-50/60 focus-within:bg-white/[0.11] focus-within:shadow-[0_0_0_2px_rgba(15,98,254,0.18)]">
        <svg className="flex-shrink-0 text-white/35" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => hasQuery && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
              inputRef.current?.blur();
            } else if (e.key === 'Enter' && results.length > 0) {
              results[0].onSelect();
            }
          }}
          placeholder="Search cases, KB, owners…"
          autoComplete="off"
          className="w-full bg-transparent text-xs text-white/85 outline-none placeholder:text-white/30"
        />
        {hasQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            className="flex-shrink-0 text-white/35 hover:text-white/70"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {open && hasQuery && (
        <div className="absolute left-3 right-3 top-[calc(100%+2px)] z-50 max-h-[360px] overflow-y-auto rounded-sm border border-white/10 bg-bg-ui shadow-lg">
          {results.length === 0 ? (
            <div className="px-3.5 py-3 text-center text-[11px] text-text-tertiary">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={r.onSelect}
                className="flex w-full items-start gap-2 border-b border-border-subtle px-3 py-2 text-left last:border-b-0 hover:bg-ibm-blue-10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {r.kind === 'case' ? (
                      <span className="font-mono text-xs font-bold text-ibm-blue-50">{r.primary}</span>
                    ) : (
                      <span className="text-xs font-bold text-text-primary">{r.primary}</span>
                    )}
                    {r.kind === 'case' && r.severity && (
                      <span className={`font-mono text-[10px] font-bold ${severityColor(String(r.severity))}`}>S{r.severity}</span>
                    )}
                  </div>
                  {r.secondary && <div className="truncate text-[11px] text-text-tertiary">{r.secondary}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
