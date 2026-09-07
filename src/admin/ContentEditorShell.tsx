import type { ReactNode, RefObject } from 'react';
import { MagnifyingGlass as Search, CaretLeft, CaretRight } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import Select from '../components/ui/Select';

// The wrapper markup shared by every useContentEditorPage-based screen
// (About, Founder, Why ULAA, ...): bordered white card with its own scroll
// area (the thicker "app-scroll" scrollbar), a pinned search bar + tab bar
// up top, and a footer that blends into and sticks to the bottom of the
// card while the sections scroll — same skeleton as the Add Trip popup,
// just without the overlay since this is a full page. Extracted because
// AdminAbout, AdminFounder, and AdminWhyULAA each carried their own
// identical copy of this, differing only in id/placeholder/aria-label
// strings and one inner div's className — see cleanup audit for the
// duplication this replaces. The page-specific sections (the actual form
// fields) are passed as `children`; everything chrome-related comes from
// `useContentEditorPage`.
export default function ContentEditorShell({
  title,
  subtitle,
  hasUnsavedChanges,
  loading,
  searchId,
  searchPlaceholder,
  pageSearch,
  setPageSearch,
  pageSearchNoMatch,
  tabBarRef,
  tabButtonRefs,
  tabBarAriaLabel,
  sectionTitles,
  activeSection,
  handleTabSelect,
  showLeftFade,
  showRightFade,
  scrollBodyRef,
  bodyClassName = 'p-4 sm:p-6 space-y-6 sm:space-y-8',
  onSave,
  saving,
  saved,
  onSecondaryAction,
  children,
}: {
  title: string;
  subtitle?: string;
  hasUnsavedChanges: () => boolean;
  loading: boolean;
  searchId: string;
  searchPlaceholder: string;
  pageSearch: string;
  setPageSearch: (value: string) => void;
  pageSearchNoMatch: boolean;
  tabBarRef: RefObject<HTMLDivElement | null>;
  tabButtonRefs: RefObject<(HTMLButtonElement | null)[]>;
  tabBarAriaLabel: string;
  sectionTitles: string[];
  activeSection: number;
  handleTabSelect: (i: number) => void;
  showLeftFade: boolean;
  showRightFade: boolean;
  scrollBodyRef: RefObject<HTMLDivElement | null>;
  /** The section-list wrapper's className. Defaults to `p-6 space-y-8`; pass `p-6` for pages (like Founder) whose sections manage their own internal spacing. */
  bodyClassName?: string;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onSecondaryAction: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <AdminLayout title={title}>
        <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={title} subtitle={subtitle} hasUnsavedChanges={hasUnsavedChanges} fixedHeight>
      {/* Modal-style card: bordered white card with its own scroll area (the
          thicker "app-scroll" scrollbar), a pinned search bar + tab bar up
          top, and a footer that blends into and sticks to the bottom of the
          card while the sections scroll — same skeleton as the Add Trip
          popup, just without the overlay since this is a full page. Sized
          via flex-1/min-h-0 against AdminLayout's fixedHeight main (rather
          than a max-h calc guess) so it always fills exactly the remaining
          viewport space with zero slack for the page itself to scroll. */}
      <div className="w-full flex-1 min-h-0 bg-white rounded-md shadow-warm-lg border border-background-warm overflow-hidden flex flex-col">
        <div ref={scrollBodyRef} className="app-scroll overflow-y-auto flex-1 min-h-0">
          <div data-sticky-toolbar className="sticky top-0 z-10 bg-white p-4 pb-3 sm:p-6 sm:pb-4 border-b border-background-warm space-y-3 sm:space-y-4">
            <div className="relative w-full sm:max-w-xs">
              <label htmlFor={searchId} className="sr-only">Search fields</label>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
              <input
                id={searchId}
                type="text"
                value={pageSearch}
                onChange={e => setPageSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
              />
            </div>
            {/* Tab bar — jumps to a section rather than hiding the others
                (everything stays in one continuous scroll below), same
                behavior as the Add Trip modal's own tab bar. Mobile gets a
                compact prev/next stepper + jump-to dropdown instead of the
                horizontal pill scroll, same split as Tabs.tsx, since
                scrubbing through 8+ pills one-handed on a phone is awkward. */}
            <div className="sm:hidden space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTabSelect(Math.max(0, activeSection - 1))}
                  disabled={activeSection === 0}
                  aria-label="Previous section"
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-background text-dark-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:bg-background-warm"
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
                <span className="flex-1 min-w-0 text-center text-sm font-bold text-dark truncate">
                  {sectionTitles[activeSection]?.replace(/^\d+ · /, '')}
                </span>
                <button
                  type="button"
                  onClick={() => handleTabSelect(Math.min(sectionTitles.length - 1, activeSection + 1))}
                  disabled={activeSection === sectionTitles.length - 1}
                  aria-label="Next section"
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-background text-dark-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:bg-background-warm"
                >
                  <CaretRight size={16} weight="bold" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-background overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-[width]"
                    style={{ width: `${((activeSection + 1) / sectionTitles.length) * 100}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-dark-muted tabular-nums">{activeSection + 1}/{sectionTitles.length}</span>
              </div>
              <Select
                size="sm"
                value={activeSection}
                onChange={i => handleTabSelect(Number(i))}
                options={sectionTitles.map((title, i) => ({ value: i, label: title.replace(/^\d+ · /, '') }))}
              />
            </div>
            <div className="hidden sm:block relative">
              <div ref={tabBarRef} role="tablist" aria-label={tabBarAriaLabel} className="flex gap-2 overflow-x-auto scrollbar-hide">
                {sectionTitles.map((title, i) => (
                  <button
                    key={title}
                    ref={el => { tabButtonRefs.current[i] = el; }}
                    type="button"
                    role="tab"
                    aria-selected={activeSection === i}
                    onClick={() => handleTabSelect(i)}
                    className={`shrink-0 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${
                      activeSection === i
                        ? 'bg-primary text-white'
                        : 'bg-background text-dark-muted hover:text-dark'
                    }`}
                  >
                    {title.replace(/^\d+ · /, '')}
                  </button>
                ))}
              </div>
              {showLeftFade && (
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent" />
              )}
              {showRightFade && (
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent" />
              )}
            </div>
          </div>

          {pageSearchNoMatch && (
            <p role="alert" className="text-xs text-red-500 px-4 sm:px-6 pt-3 sm:pt-4">No matching field found for "{pageSearch}".</p>
          )}
          <div className={bodyClassName}>
            {children}
          </div>

          {/* Sticky footer — blended into and pinned to the bottom of the
              card's own scroll area (not the viewport), same pattern as the
              Add Trip modal's footer. */}
          <AdminEditorFooter onSave={onSave} saving={saving} saved={saved} onSecondaryAction={onSecondaryAction} />
        </div>
      </div>
    </AdminLayout>
  );
}
