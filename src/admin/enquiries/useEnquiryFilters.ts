import { useState } from 'react';
import type { Enquiry } from '../../types/types-index';
import type { SortDirection } from '../../components/ui/dataTableUtils';
import { PACKAGE_CONFIG } from './AdminEnquiryCommon';
import { paymentStatus, isGroupEntry } from './AdminEnquiriesShared';
import { formatDate, downloadCsv } from '../../utils/utils-index';

export type EnquirySortKey = 'name' | 'group' | 'food' | 'source' | 'date' | 'package' | 'payment' | 'status' | 'follow_up';
type FilterPanelKey = 'trip' | 'query' | 'journey' | 'pay' | 'booked' | 'group' | 'food' | 'package' | 'more' | null;

// Table pagination — 50 rows per page, matching the reference table design.
export const ENQUIRIES_PAGE_SIZE = 10;

/** Owns every filter/search/sort/pagination knob for the enquiries list —
 *  Lead Status, Booking Journey, Payment, Booked, Group, Food, Package,
 *  Source, "follow-ups due", search text, selected trip scope, column sort,
 *  and current page — plus the actions that operate purely on that state
 *  (clearAllFilters, the auto-reset-to-page-1-on-filter-change adjustment)
 *  or export exactly what's currently filtered (handleExportCsv).
 *
 *  Deliberately does NOT own the actual filtering/sorting of `enquiries`
 *  itself: that still happens in AdminEnquiries.tsx, since it's interleaved
 *  with trip-group scoping, group-lettering, and other derived data this
 *  hook has no visibility into. handleExportCsv instead takes the already-
 *  filtered rows (and a couple of derived helpers) as arguments each time
 *  it's called, rather than owning that computation itself.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEnquiryFilters() {
  const [filter, setFilter] = useState<'all' | Enquiry['status']>('all');
  // Booking Journey filter — a separate, finer-grained dimension from
  // `filter` above (Lead Status: new/contacted/closed only). Lets an admin
  // isolate a specific stage of the pipeline the Status column already
  // shows per row (e.g. just "Fully Paid" or "Checked In"), which the
  // existing Lead Status/Booking filters couldn't reach on their own.
  // Excludes 'cancelled' — that's Booking State, already covered by the
  // Booking filter's Cancelled option (isCancelled()), not a journey stage
  // going forward (see JOURNEY_STAGE_CONFIG's comment on that legacy value).
  const [journeyFilter, setJourneyFilter] = useState<'all' | Exclude<Enquiry['journey_stage'], 'cancelled'>>('all');
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'not_set'>('all');
  const [bookedFilter, setBookedFilter] = useState<'all' | 'booked' | 'not_booked' | 'cancelled'>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | 'group' | 'solo'>('all');
  const [foodFilter, setFoodFilter] = useState<'all' | 'veg' | 'non_veg' | 'not_set'>('all');
  const [packageFilter, setPackageFilter] = useState<'all' | 'early_bird' | 'normal'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | Enquiry['source']>('all');
  // Quick toggle for "follow-ups due" — deliberately just a boolean chip
  // (not a full FilterDropdown like Payment/Booking above) since there's
  // only ever one meaningful thing to isolate here: reminders that are due
  // today or overdue. See followUpStatus() in AdminEnquiryCommon.tsx for what
  // counts as "due".
  const [followUpDueOnly, setFollowUpDueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const [selectedTripKey, setSelectedTripKey] = useState<string | null>(null);
  // Which single filter's dropdown is open — only one at a time. 'more'
  // is the overflow menu for less-frequently-used filters (currently just
  // Source), keeping the main bar to five compact boxes.
  const [openFilterPanel, setOpenFilterPanel] = useState<FilterPanelKey>(null);

  // Table pagination state.
  const [currentPage, setCurrentPage] = useState(1);

  // Column sorting — clicking a sortable header sorts the filtered list by
  // that column; clicking the same header again flips the direction.
  const [sortKey, setSortKey] = useState<EnquirySortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const handleSort = (key: EnquirySortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Any change to what's being filtered/searched can shrink the result set
  // out from under the current page, so land back on page 1 whenever the
  // filters, trip scope, or search term change. Done during render
  // (comparing against the previous filter signature) rather than in an
  // effect — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const filterSignature = `${filter}|${journeyFilter}|${payFilter}|${bookedFilter}|${groupFilter}|${foodFilter}|${packageFilter}|${sourceFilter}|${followUpDueOnly}|${selectedTripKey}|${trimmedSearch}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setCurrentPage(1);
  }

  const activeFilterCount = (selectedTripKey !== null ? 1 : 0) + (filter !== 'all' ? 1 : 0) + (journeyFilter !== 'all' ? 1 : 0) + (payFilter !== 'all' ? 1 : 0) + (bookedFilter !== 'all' ? 1 : 0) + (groupFilter !== 'all' ? 1 : 0) + (foodFilter !== 'all' ? 1 : 0) + (packageFilter !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0) + (followUpDueOnly ? 1 : 0) + (trimmedSearch ? 1 : 0);

  // Drives the "Clear all" action in the filter bar below.
  const clearAllFilters = () => {
    setSelectedTripKey(null);
    setFilter('all');
    setJourneyFilter('all');
    setPayFilter('all');
    setBookedFilter('all');
    setGroupFilter('all');
    setFoodFilter('all');
    setPackageFilter('all');
    setSourceFilter('all');
    setFollowUpDueOnly(false);
    setSearchQuery('');
    setOpenFilterPanel(null);
  };

  // Exports exactly what's on screen: the current search/filter/sort, and —
  // since "Trip" is itself one of the filters (selectedTripKey) — scoping to
  // one trip before exporting gives a per-trip passenger list for free, no
  // separate "export this trip" button needed. All client-side: serializes
  // the already-filtered/sorted rows straight to a download, no backend
  // round-trip. Takes `sortedFiltered` (and the couple of helpers needed to
  // label rows) as arguments since computing them requires trip-group/
  // group-lettering data this hook doesn't own — see the module doc above.
  const handleExportCsv = (
    sortedFiltered: Enquiry[],
    activeGroupTitle: string | null,
    groupLabel: (e: Enquiry) => string
  ) => {
    const headers = [
      'Name', 'Phone', 'Email', 'Age', 'City', 'Trip', 'Group',
      'Package', 'Food Preference', 'Total Amount', 'Amount Paid',
      'Payment Status', 'Booking Status', 'Refund Amount', 'Lead Status',
      'Source', 'Cancelled', 'Created At',
    ];
    const rows = sortedFiltered.map(e => [
      e.full_name,
      e.phone,
      e.email,
      e.age ?? '',
      e.city ?? '',
      e.trip_id ? (e.trip_title ?? '') : 'General (No Trip)',
      isGroupEntry(e) ? groupLabel(e) : '',
      PACKAGE_CONFIG[e.package_type]?.label ?? e.package_type,
      e.food_preference ?? 'Not set',
      e.total_amount ?? '',
      e.amount_paid,
      paymentStatus(e).label,
      e.booking_status ?? '',
      e.refund_amount,
      e.status,
      e.source,
      e.cancelled_at ? 'Yes' : 'No',
      formatDate(e.created_at),
    ]);
    const scopeSuffix = activeGroupTitle ? `-${activeGroupTitle.replace(/\s+/g, '_')}` : '';
    downloadCsv(`enquiries${scopeSuffix}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  return {
    filter, setFilter,
    journeyFilter, setJourneyFilter,
    payFilter, setPayFilter,
    bookedFilter, setBookedFilter,
    groupFilter, setGroupFilter,
    foodFilter, setFoodFilter,
    packageFilter, setPackageFilter,
    sourceFilter, setSourceFilter,
    followUpDueOnly, setFollowUpDueOnly,
    searchQuery, setSearchQuery, trimmedSearch,
    selectedTripKey, setSelectedTripKey,
    openFilterPanel, setOpenFilterPanel,
    currentPage, setCurrentPage,
    sortKey, sortDir, handleSort,
    activeFilterCount,
    clearAllFilters,
    handleExportCsv,
  };
}
