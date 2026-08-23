import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortDirection } from '../../components/ui/dataTableUtils';
import { paginate } from '../../components/ui/dataTableUtils';
import { formatDate, downloadCsv } from '../../utils/utils-index';
import type { WaitlistEntry, CompletedTrip } from '../../types/types-index';
import { foodBadge, hasSeatOpen, messageWithoutFoodBreakdown, seatsNeeded, convertedCount } from './waitlistShared';

export type WaitlistSortKey = 'name' | 'group' | 'food' | 'trip' | 'joined' | 'status';

// Table pagination — 10 rows per page.
const WAITLIST_PAGE_SIZE = 10;

/** Owns every filter/search/sort/pagination knob for the waitlist list —
 *  Status, Trip, search text, column sort, and current page — plus the
 *  actions that operate purely on that state (clearAllFilters, the
 *  auto-reset-to-page-1-on-filter-change adjustment) and the derived
 *  filtered/sorted/paginated rows, counts, and CSV export.
 *
 *  Takes `entries`, `completedTrips`, and `seatsAvailable` from
 *  useWaitlistData and `groupLabel` from useWaitlistGroups as inputs, since
 *  filtering/sorting/exporting all need to read the underlying rows.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export function useWaitlistFilters(
  entries: WaitlistEntry[],
  completedTrips: CompletedTrip[],
  seatsAvailable: Record<string, number>,
  groupLabel: (e: WaitlistEntry) => string
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | WaitlistEntry['status']>('all');
  const [tripFilter, setTripFilter] = useState<string>(searchParams.get('trip') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  // Which single filter's dropdown is open — only one at a time, same
  // pattern as the Enquiries page's filter bar.
  const [openFilterPanel, setOpenFilterPanel] = useState<'status' | 'trip' | null>(null);
  // Mobile only: filter panel collapsed by default, opened via the toggle
  // in the Filters header — same pattern as the Enquiries page.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<WaitlistSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const handleSort = (key: WaitlistSortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Clear the ?trip= param from the URL once we've picked it up, so it
  // doesn't stick around after the admin changes the filter manually.
  useEffect(() => {
    if (searchParams.get('trip')) {
      setSearchParams(params => { params.delete('trip'); return params; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trips = useMemo(() => {
    const completedIds = new Set(completedTrips.map(t => t.id));
    const map = new Map<string, string>();
    entries.forEach(e => { if (!map.has(e.trip_id)) map.set(e.trip_id, e.trip_title || 'Untitled trip'); });
    return Array.from(map.entries())
      .map(([id, title]) => ({ value: id, label: title, isCompleted: completedIds.has(id) }))
      .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
  }, [entries, completedTrips]);

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const filtered = entries
    .filter(e => statusFilter === 'all' || e.status === statusFilter)
    .filter(e => tripFilter === 'all' || e.trip_id === tripFilter)
    .filter(e => !trimmedSearch
      || e.full_name?.toLowerCase().includes(trimmedSearch)
      || e.phone?.toLowerCase().includes(trimmedSearch)
      || e.email?.toLowerCase().includes(trimmedSearch)
      || e.trip_title?.toLowerCase().includes(trimmedSearch))
    // Waiting entries whose trip now has an open seat bubble to the top —
    // these are the ones that need action right now.
    .sort((a, b) => Number(hasSeatOpen(b, seatsAvailable)) - Number(hasSeatOpen(a, seatsAvailable)));

  const sortedFiltered = sortKey ? [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name': return dir * (a.full_name || '').localeCompare(b.full_name || '');
      case 'group': return dir * ((a.group_size || 1) - (b.group_size || 1));
      case 'food': return dir * foodBadge(a).key.localeCompare(foodBadge(b).key);
      case 'trip': return dir * (a.trip_title || '').localeCompare(b.trip_title || '');
      case 'joined': return dir * (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
      case 'status': return dir * (a.status || '').localeCompare(b.status || '');
      default: return 0;
    }
  }) : filtered;

  const {
    pageItems: paginatedEntries,
    totalPages: waitlistTotalPages,
    safePage: waitlistSafePage,
    rangeStart: waitlistRangeStart,
    rangeEnd: waitlistRangeEnd,
  } = paginate(sortedFiltered, currentPage, WAITLIST_PAGE_SIZE);

  // Land back on page 1 whenever the filters or search term change, so the
  // admin never gets stuck on a page that no longer has any rows. Done
  // during render (comparing against the previous filter signature) rather
  // than in an effect — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const filterSignature = `${statusFilter}|${tripFilter}|${trimmedSearch}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setCurrentPage(1);
  }

  const counts = {
    all: entries.length,
    waiting: entries.filter(e => e.status === 'waiting').length,
    notified: entries.filter(e => e.status === 'notified').length,
    converted: entries.filter(e => e.status === 'converted').length,
    declined: entries.filter(e => e.status === 'declined').length,
    expired: entries.filter(e => e.status === 'expired').length,
  };

  const tripCounts: Record<string, number> = { all: entries.length };
  trips.forEach(t => { tripCounts[t.value] = entries.filter(e => e.trip_id === t.value).length; });

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (tripFilter !== 'all' ? 1 : 0) + (trimmedSearch ? 1 : 0);
  const clearAllFilters = () => {
    setStatusFilter('all');
    setTripFilter('all');
    setSearchQuery('');
    setOpenFilterPanel(null);
  };

  // Exports exactly what's currently filtered/sorted — scoping to one trip
  // via the Trip filter before exporting gives a per-trip waitlist export
  // for free. All client-side, no backend round-trip.
  const handleExportCsv = () => {
    const headers = [
      'Name', 'Phone', 'Email', 'Age', 'City', 'Trip', 'Group',
      'Seats Needed', 'Seats Converted', 'Food / Notes', 'Status', 'Joined At',
    ];
    const rows = sortedFiltered.map(e => [
      e.full_name,
      e.phone,
      e.email,
      e.age ?? '',
      e.city ?? '',
      e.trip_title ?? '',
      e.group_size && e.group_size > 1 ? groupLabel(e) : '',
      seatsNeeded(e),
      convertedCount(e),
      foodBadge(e).key === 'not_set' ? (messageWithoutFoodBreakdown(e) || 'Not set') : foodBadge(e).label,
      e.status,
      formatDate(e.created_at),
    ]);
    const tripName = tripFilter !== 'all' ? trips.find(t => t.value === tripFilter)?.label : undefined;
    const scopeSuffix = tripName ? `-${tripName.replace(/\s+/g, '_')}` : '';
    downloadCsv(`waitlist${scopeSuffix}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  return {
    trips,
    statusFilter, setStatusFilter,
    tripFilter, setTripFilter,
    searchQuery, setSearchQuery, trimmedSearch,
    openFilterPanel, setOpenFilterPanel,
    mobileFiltersOpen, setMobileFiltersOpen,
    currentPage, setCurrentPage,
    sortKey, sortDir, handleSort,
    filtered, sortedFiltered,
    paginatedEntries,
    waitlistTotalPages, waitlistSafePage, waitlistRangeStart, waitlistRangeEnd,
    counts, tripCounts,
    activeFilterCount, clearAllFilters,
    handleExportCsv,
  };
}
