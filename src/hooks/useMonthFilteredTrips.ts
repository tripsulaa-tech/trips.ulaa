import { useMemo } from 'react';

export const MONTHS = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface SearchableByMonth {
  destination: string;
  title: string;
}

/**
 * Shared search + month-pill filtering logic for the Upcoming Trips and
 * Completed Trips pages. Filters `items` by a case-insensitive
 * destination/title search plus an optional month pill, and computes how
 * many items fall in each month.
 *
 * `getDate` picks which date field to group by (start_date vs trip_date).
 * `excludeFromMonth`, if provided, skips an item from month matching/counts
 * (e.g. Coming Soon trips, which don't have a confirmed date yet) while
 * still counting it toward "All".
 *
 * Pass stable (module-level, not inline) functions for `getDate` and
 * `excludeFromMonth` so the memoization below behaves the same as it did
 * before this was extracted.
 */
export function useMonthFilteredTrips<T extends SearchableByMonth>(
  items: T[],
  search: string,
  month: string,
  getDate: (item: T) => string,
  excludeFromMonth?: (item: T) => boolean
) {
  const filtered = useMemo(() => {
    return items.filter(item => {
      const matchSearch = search === '' ||
        item.destination.toLowerCase().includes(search.toLowerCase()) ||
        item.title.toLowerCase().includes(search.toLowerCase());
      const matchMonth = month === 'All' ||
        (!excludeFromMonth?.(item) && new Date(getDate(item)).toLocaleString('en', { month: 'long' }) === month);
      return matchSearch && matchMonth;
    });
  }, [items, search, month, getDate, excludeFromMonth]);

  // Respects the current search text but not the currently-selected month
  // (so switching months doesn't change every other pill's count out from
  // under you). "All" reflects the same search-filtered total as `filtered`
  // when month === 'All'.
  const monthCounts = useMemo(() => {
    const bySearch = items.filter(item =>
      search === '' ||
      item.destination.toLowerCase().includes(search.toLowerCase()) ||
      item.title.toLowerCase().includes(search.toLowerCase())
    );
    const counts: Record<string, number> = { All: bySearch.length };
    for (const item of bySearch) {
      if (excludeFromMonth?.(item)) continue;
      const m = new Date(getDate(item)).toLocaleString('en', { month: 'long' });
      counts[m] = (counts[m] || 0) + 1;
    }
    return counts;
  }, [items, search, getDate, excludeFromMonth]);

  return { filtered, monthCounts };
}
