import type { ReactNode, RefObject } from 'react';
import { MagnifyingGlass as Search } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';

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
  bodyClassName = 'p-6 space-y-8',
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
    <AdminLayout title={title} subtitle={subtitle} hasUnsavedChanges={hasUnsavedChanges}>
      {/* Modal-style card: bordered white card with its own scroll area (the
          thicker "app-scroll" scrollbar), a pinned search bar + tab bar up
          top, and a footer that blends into and sticks to the bottom of the
          card while the sections scroll — same skeleton as the Add Trip
          popup, just without the overlay since this is a full page. */}
      <div className="max-w-4xl bg-white rounded-md shadow-warm-lg border border-background-warm max-h-[calc(100vh-160px)] overflow-hidden flex flex-col">
        <div className="p-6 pb-4 border-b border-background-warm flex-shrink-0 space-y-4">
          <div className="relative w-full max-w-xs">
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
              behavior as the Add Trip modal's own tab bar. */}
          <div className="relative">
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

        <div ref={scrollBodyRef} className="app-scroll overflow-y-auto flex-1 min-h-0">
          {pageSearchNoMatch && (
            <p role="alert" className="text-xs text-red-500 px-6 pt-4">No matching field found for "{pageSearch}".</p>
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
