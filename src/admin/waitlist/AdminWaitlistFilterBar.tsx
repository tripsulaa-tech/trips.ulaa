import {
  CaretDown as ChevronDown,
  SlidersHorizontal,
  ArrowsClockwise as RefreshCw,
  MagnifyingGlass as Search,
  X,
} from '@phosphor-icons/react';
import FilterDropdown from '../enquiries/AdminFilterDropdown';
import type { WaitlistEntry } from '../../types/types-index';
import { STATUS_CONFIG } from './waitlistShared';

interface TripOption { value: string; label: string; isCompleted: boolean }

interface AdminWaitlistFilterBarProps {
  trips: TripOption[];
  statusFilter: 'all' | WaitlistEntry['status'];
  setStatusFilter: (v: 'all' | WaitlistEntry['status']) => void;
  tripFilter: string;
  setTripFilter: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  openFilterPanel: 'status' | 'trip' | null;
  setOpenFilterPanel: (v: 'status' | 'trip' | null) => void;
  mobileFiltersOpen: boolean;
  setMobileFiltersOpen: (fn: (o: boolean) => boolean) => void;
  counts: Record<'all' | WaitlistEntry['status'], number>;
  tripCounts: Record<string, number>;
  activeFilterCount: number;
  clearAllFilters: () => void;
}

/** The mobile search bar plus the Status/Trip filter row and its "N active"
 *  / "Clear All" chrome — same single-row layout as the Enquiries page's
 *  filter bar.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export default function AdminWaitlistFilterBar({
  trips, statusFilter, setStatusFilter, tripFilter, setTripFilter,
  searchQuery, setSearchQuery, openFilterPanel, setOpenFilterPanel,
  mobileFiltersOpen, setMobileFiltersOpen, counts, tripCounts,
  activeFilterCount, clearAllFilters,
}: AdminWaitlistFilterBarProps) {
  return (
    <>
      {/* Mobile-only search bar — reachable with a thumb without hunting
          through the (collapsed-by-default) filter panel below. Bound to
          the same searchQuery state the desktop TableHeaderBar search uses. */}
      <div className="relative sm:hidden">
        <label htmlFor="waitlist-mobile-search" className="sr-only">Search name, trip, or contact</label>
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
        <input
          id="waitlist-mobile-search"
          type="text"
          value={searchQuery}
          onChange={ev => setSearchQuery(ev.target.value)}
          placeholder="Search name, trip, contact..."
          className="w-full pl-10 pr-10 py-3 rounded-lg border-2 border-background-warm bg-white font-body text-dark text-sm focus:border-primary outline-none transition-colors shadow-card"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark p-1"
            aria-label="Clear search"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Filters — one single row: Search | Filters | Clear All, same
          layout as the Enquiries page's filter bar. */}
      {openFilterPanel && (
        <div className="fixed inset-0 z-20" onClick={() => setOpenFilterPanel(null)} />
      )}
      <div className="bg-white rounded-lg shadow-card p-4">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(o => !o)}
          aria-expanded={mobileFiltersOpen}
          aria-controls="waitlist-mobile-filters-panel"
          className="w-full flex items-center gap-2 sm:pointer-events-none sm:cursor-default"
        >
          <SlidersHorizontal size={16} className="text-dark shrink-0" aria-hidden="true" />
          <span className="font-button font-bold text-dark text-[15px] whitespace-nowrap flex-1 text-left">Filters</span>
          {activeFilterCount > 0 && (
            <span className="shrink-0 inline-flex items-center justify-center px-2 h-[22px] rounded-md bg-primary/10 text-primary text-[11px] font-button font-semibold">
              {activeFilterCount} active
            </span>
          )}
          <ChevronDown size={18} className={`sm:hidden shrink-0 text-dark-muted transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        <div id="waitlist-mobile-filters-panel" className={`${mobileFiltersOpen ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row sm:items-end gap-3 mt-4`}>
          {/* Filters + Clear All — sit together in one row at the bottom
              of the panel. */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 flex-1 min-w-0">
            {/* Status */}
            <div className="relative w-full sm:w-auto sm:min-w-[140px]">
              <label htmlFor="waitlist-filter-status" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Status</label>
              <button
                id="waitlist-filter-status"
                aria-haspopup="listbox"
                aria-expanded={openFilterPanel === 'status'}
                onClick={() => setOpenFilterPanel(openFilterPanel === 'status' ? null : 'status')}
                className={`w-full flex items-center justify-between gap-2 rounded-md border-2 px-3 py-2 bg-white transition-colors ${
                  openFilterPanel === 'status' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                }`}
              >
                <span className="text-sm font-button font-medium text-primary truncate">{statusFilter === 'all' ? 'All' : STATUS_CONFIG[statusFilter].label}</span>
                <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'status' ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {openFilterPanel === 'status' && (
                <FilterDropdown
                  value={statusFilter}
                  onSelect={key => { setStatusFilter(key as 'all' | WaitlistEntry['status']); setOpenFilterPanel(null); }}
                  options={(['all', 'waiting', 'notified', 'converted', 'declined', 'expired'] as const).map(key => ({
                    key, label: key === 'all' ? 'All' : STATUS_CONFIG[key].label, count: counts[key],
                  }))}
                />
              )}
            </div>

            {/* Trip */}
            {trips.length > 0 && (
              <div className="relative w-full sm:w-auto sm:min-w-[160px]">
                <label htmlFor="waitlist-filter-trip" className="block text-[10px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1">Trip</label>
                <button
                  id="waitlist-filter-trip"
                  aria-haspopup="listbox"
                  aria-expanded={openFilterPanel === 'trip'}
                  onClick={() => setOpenFilterPanel(openFilterPanel === 'trip' ? null : 'trip')}
                  className={`w-full flex items-center justify-between gap-2 rounded-md border-2 px-3 py-2 bg-white transition-colors ${
                    openFilterPanel === 'trip' ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
                  }`}
                >
                  <span className="text-sm font-button font-medium text-primary truncate">
                    {tripFilter === 'all' ? 'All' : trips.find(t => t.value === tripFilter)?.label || 'All'}
                  </span>
                  <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'trip' ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {openFilterPanel === 'trip' && (
                  <FilterDropdown
                    value={tripFilter}
                    onSelect={key => { setTripFilter(key); setOpenFilterPanel(null); }}
                    options={[
                      { key: 'all', label: 'All trips', count: tripCounts.all },
                      ...trips.map(t => ({ key: t.value, label: t.label, count: tripCounts[t.value] || 0, section: t.isCompleted ? 'Completed' : undefined })),
                    ]}
                  />
                )}
              </div>
            )}
          </div>

          {/* Clear All — sits at the end of the row; disabled (and
              dimmed) whenever no filter or search term is active. */}
          <button
            onClick={clearAllFilters}
            disabled={activeFilterCount === 0}
            className={`w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold rounded-md border-2 px-3 py-2 transition-colors whitespace-nowrap ${
              activeFilterCount === 0
                ? 'border-background-warm text-dark-muted/40 cursor-default'
                : 'border-background-warm text-dark hover:border-primary/30'
            }`}
          >
            <RefreshCw size={13} aria-hidden="true" /> Clear All
          </button>
        </div>
      </div>
    </>
  );
}
