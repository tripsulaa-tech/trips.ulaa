import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TripSearchFilterBar } from './TripSearchFilterBar';
import { SkeletonGrid } from './Skeletons';

// Single source of truth for the sticky filter bar's offset — it needs to
// sit exactly below the fixed navbar (Navbar.tsx's `h-20`), on both pages
// that use this shell and on TripQuickNav. Keeping it here (rather than
// each page hand-rolling `sticky top-20`) is what stops that offset from
// drifting out of sync in just one place the next time the navbar's height
// changes.
export const STICKY_FILTER_TOP_CLASS = 'top-20';

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  month: string;
  onMonthChange: (month: string) => void;
  monthCounts: Record<string, number>;
  showFilters: boolean;
  onToggleFilters: () => void;
}

interface EmptyStateCopy {
  title: string;
  message: string;
}

interface BrowseShellProps<T> {
  hero: {
    image: string;
    imageAlt: string;
    label: string;
    title: string;
    subtitle: string;
  };
  /** Rendered between the hero and the sticky filter bar (e.g. a stats strip + section intro). */
  beforeFilters?: ReactNode;
  filters: FilterBarProps;
  /** Background for the sticky filter bar's wrapper — pages use slightly different tints. */
  filterBarClassName?: string;
  /** Rendered directly below the sticky filter bar, above the grid (e.g. a live special-offer banner). */
  afterFilters?: ReactNode;
  loading: boolean;
  skeletonType: 'trip' | 'album';
  /** The full unfiltered list — used to tell "nothing published yet" apart from "no results for this filter". */
  items: T[];
  filteredItems: T[];
  emptyState: EmptyStateCopy;
  noResultsState: EmptyStateCopy;
  /** Whether a filter is currently active — controls whether "Clear filters" shows in the no-results state. */
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  /** e.g. the bottom-nav tab's live label ("Upcoming" / "Journey"), shown before "Showing N …". */
  countLabel: string;
  /** Singular noun for the count line, e.g. "trip" or "album" — pluralized automatically. */
  countNoun: string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Grid item key extractor. */
  itemKey: (item: T) => string;
}

export default function BrowseShell<T>({
  hero,
  beforeFilters,
  filters,
  filterBarClassName = 'bg-white',
  afterFilters,
  loading,
  skeletonType,
  items,
  filteredItems,
  emptyState,
  noResultsState,
  hasActiveFilters,
  onClearFilters,
  countLabel,
  countNoun,
  renderItem,
  itemKey,
}: BrowseShellProps<T>) {
  return (
    <>
      {/* Hero */}
      <div className="relative h-80 md:h-96 overflow-hidden">
        <img src={hero.image} alt={hero.imageAlt} className="w-full h-full object-cover" loading="eager" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/60 to-dark/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4 sm:px-6 lg:px-8 pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-secondary font-script font-medium text-2xl sm:text-3xl md:text-4xl block">{hero.label}</span>
            <h1 className="font-display text-4xl md:text-6xl font-bold mt-3">{hero.title}</h1>
            <p className="text-white/80 mt-3 text-lg max-w-xl">{hero.subtitle}</p>
          </motion.div>
        </div>
      </div>

      {beforeFilters}

      {/* Search & Filters */}
      <div className={`${filterBarClassName} border-b border-background-warm sticky ${STICKY_FILTER_TOP_CLASS} z-30 px-4 sm:px-6 lg:px-8`}>
        <div className="max-w-[1344px] mx-auto py-4">
          <TripSearchFilterBar
            search={filters.search}
            onSearchChange={filters.onSearchChange}
            month={filters.month}
            onMonthChange={filters.onMonthChange}
            monthCounts={filters.monthCounts}
            showFilters={filters.showFilters}
            onToggleFilters={filters.onToggleFilters}
          />
        </div>
      </div>

      {afterFilters}

      {/* Grid */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-6 md:py-16">
        <div className="max-w-[1344px] mx-auto">
          {loading ? (
            <SkeletonGrid count={6} type={skeletonType} />
          ) : (
            <div aria-live="polite">
              {items.length === 0 ? (
                <div className="text-center py-24">
                  <p className="font-display text-2xl text-dark-muted">{emptyState.title}</p>
                  <p className="text-sm text-dark-muted mt-2">{emptyState.message}</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-24">
                  <p className="font-display text-2xl text-dark-muted">{noResultsState.title}</p>
                  <p className="text-sm text-dark-muted mt-2">{noResultsState.message}</p>
                  {hasActiveFilters && (
                    <button
                      onClick={onClearFilters}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white font-button text-sm font-semibold hover:bg-primary-dark transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-dark-muted text-base sm:text-lg mb-6 md:mb-8">
                    <span className="font-semibold text-primary">{countLabel}</span>{' '}
                    <span className="text-sm sm:text-base">
                      Showing <span className="font-semibold text-dark">{filteredItems.length}</span> {countNoun}
                      {filteredItems.length !== 1 ? 's' : ''}
                    </span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                    {filteredItems.map((item, i) => (
                      <div key={itemKey(item)}>{renderItem(item, i)}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
