import {
  MagnifyingGlass as Search,
  Funnel as Filter,
} from '@phosphor-icons/react';
import { MONTHS } from '../../hooks/useMonthFilteredTrips';

// Renders the pill-style month filter buttons shared by the desktop
// (always-visible) and mobile (toggle-to-reveal) layouts below — same
// button markup, just different sizing/spacing per layout.
function MonthPills({
  month,
  onMonthChange,
  monthCounts,
  size,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  monthCounts: Record<string, number>;
  size: 'desktop' | 'mobile';
}) {
  return (
    <>
      {MONTHS.filter(m => m === 'All' || (monthCounts[m] ?? 0) > 0).map(m => (
        <button
          key={m}
          onClick={() => onMonthChange(m)}
          aria-pressed={month === m}
          className={
            size === 'desktop'
              ? `flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-button font-medium transition-all whitespace-nowrap ${
                  month === m
                    ? 'bg-primary text-white'
                    : 'bg-background-warm text-dark hover:bg-primary/10 hover:text-primary'
                }`
              : `flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-button font-medium transition-all ${
                  month === m ? 'bg-primary text-white' : 'bg-background-warm text-dark'
                }`
          }
        >
          {m}
          <span
            className={
              size === 'desktop'
                ? `inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-semibold ${
                    month === m ? 'bg-white/25 text-white' : 'bg-white text-primary'
                  }`
                : `inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold ${
                    month === m ? 'bg-white/25 text-white' : 'bg-white text-primary'
                  }`
            }
          >
            {monthCounts[m] ?? 0}
          </span>
        </button>
      ))}
    </>
  );
}

// Search input + month-filter row shared by UpcomingTripsPage and
// CompletedTripsPage: a search box, a desktop pill row, and a mobile
// toggle that reveals the same pills below. Callers keep their own
// containing/sticky wrapper (background color and padding differ between
// the two pages) and just render this inside it.
export function TripSearchFilterBar({
  search,
  onSearchChange,
  month,
  onMonthChange,
  monthCounts,
  showFilters,
  onToggleFilters,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  month: string;
  onMonthChange: (month: string) => void;
  monthCounts: Record<string, number>;
  showFilters: boolean;
  onToggleFilters: () => void;
}) {
  return (
    <>
      <div className="flex gap-3 sm:gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <label htmlFor="trip-search" className="sr-only">Search by destination or trip name</label>
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-muted" aria-hidden="true" />
          <input
            id="trip-search"
            type="text"
            placeholder="Search destination or trip..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-12 pr-4 py-2 rounded-lg border-2 border-background-warm bg-background focus:border-primary focus:outline-none font-body text-dark"
          />
        </div>
        {/* Month filter - desktop */}
        <div className="hidden md:flex gap-2 flex-wrap" role="group" aria-label="Filter by month">
          <MonthPills month={month} onMonthChange={onMonthChange} monthCounts={monthCounts} size="desktop" />
        </div>
        {/* Filter toggle - mobile */}
        <button
          onClick={onToggleFilters}
          aria-expanded={showFilters}
          aria-controls="mobile-month-filters"
          className="md:hidden flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-background-warm text-dark font-button text-sm shrink-0"
        >
          <Filter size={16} aria-hidden="true" />
          Filter
        </button>
      </div>
      {/* Mobile filters */}
      {showFilters && (
        <div id="mobile-month-filters" className="md:hidden flex gap-2 flex-wrap mt-3" role="group" aria-label="Filter by month">
          <MonthPills month={month} onMonthChange={onMonthChange} monthCounts={monthCounts} size="mobile" />
        </div>
      )}
    </>
  );
}
