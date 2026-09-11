import { useState, useEffect } from 'react';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import type { SortDirection } from '../../components/ui/dataTableUtils';
import { PACKAGE_CONFIG } from './AdminEnquiryCommon';
import { paymentStatus, isGroupEntry, isBooked } from './AdminEnquiriesShared';
import { formatDate } from '../../utils/utils-index';
import { computeTripFinanceSummary } from '../../utils/tripFinance';
import { loadPersisted, savePersisted } from '../../utils/sessionState';

export type EnquirySortKey = 'name' | 'group' | 'food' | 'source' | 'date' | 'package' | 'payment' | 'status' | 'follow_up';

// Every filter/search/sort/page knob this hook owns, persisted as one JSON
// blob (see utils/sessionState.ts) so leaving this page (switching admin
// tabs, opening "View Full CRM" and coming back, a hard refresh) and
// returning lands the admin back on the exact same filtered/sorted/paged
// view instead of resetting to "all enquiries".
const FILTERS_STORAGE_KEY = 'ulaa:admin-enquiries:filters';

type PersistedEnquiryFilters = {
  filter: 'all' | Enquiry['status'];
  journeyFilter: 'all' | Exclude<Enquiry['journey_stage'], 'cancelled'>;
  payFilter: 'all' | 'paid' | 'partial' | 'unpaid' | 'not_set';
  bookedFilter: 'all' | 'booked' | 'not_booked' | 'cancelled';
  groupFilter: 'all' | 'group' | 'solo';
  foodFilter: 'all' | 'veg' | 'non_veg' | 'not_set';
  packageFilter: 'all' | 'early_bird' | 'normal';
  sourceFilter: 'all' | Enquiry['source'];
  followUpDueOnly: boolean;
  searchQuery: string;
  selectedTripKey: string | null;
  currentPage: number;
  sortKey: EnquirySortKey | null;
  sortDir: SortDirection;
};

// Local CSV writer, not utils-index's downloadCsv — that helper is
// fixed-shape (one header row + uniform data rows), which is right for the
// normal passenger list but can't express the extra "Trip Finance &
// Profitability" mini-table this export sometimes needs above the
// passenger rows (see handleExportCsv below). Mirrors downloadCsv's
// escaping/BOM behaviour exactly (see utils/utils-index.ts) so both
// exports round-trip into Excel/Sheets identically.
function csvCell(v: string | number | null | undefined): string {
  const str = v == null ? '' : String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvCell).join(',');
}
function downloadCsvLines(filename: string, lines: string[]): void {
  const csvContent = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Business-wide per-trip profit rollup for the "all enquiries" export —
// same computeTripFinanceSummary math as the Reports page's Trip Finance
// section: revenue is the sum of each booked enquiry's real total_amount
// (not bookedCount x listed price), since actual bookings routinely differ
// from the regular price (early-bird, discounts, manual deals). Only trips
// with the Finances tab actually filled in are included.
function financeSummaryByTrip(allTrips: UpcomingTrip[], allEnquiries: Enquiry[]) {
  return allTrips
    .filter(t => !!t.trip_finance)
    .map(t => {
      const tripBookings = allEnquiries.filter(e => e.trip_id === t.id && isBooked(e));
      const totalRevenue = tripBookings.reduce((sum, e) => sum + (e.total_amount || 0), 0);
      const childFareCount = tripBookings.filter(e => e.has_child_addon).length;
      const summary = computeTripFinanceSummary(t.trip_finance, tripBookings.length, totalRevenue, childFareCount);
      return { title: t.title || t.destination, ...summary };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

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
  // Read once per mount (not once per field) so every lazy useState
  // initializer below agrees on the same saved snapshot — a plain module-
  // level read would go stale after the first mount, since this hook stays
  // loaded for the life of the SPA session rather than being re-imported.
  const [persisted] = useState(() => loadPersisted<PersistedEnquiryFilters>(FILTERS_STORAGE_KEY));

  const [filter, setFilter] = useState<'all' | Enquiry['status']>(persisted.filter ?? 'all');
  // Booking Journey filter — a separate, finer-grained dimension from
  // `filter` above (Lead Status: new/contacted/closed only). Lets an admin
  // isolate a specific stage of the pipeline the Status column already
  // shows per row (e.g. just "Fully Paid" or "Checked In"), which the
  // existing Lead Status/Booking filters couldn't reach on their own.
  // Excludes 'cancelled' — that's Booking State, already covered by the
  // Booking filter's Cancelled option (isCancelled()), not a journey stage
  // going forward (see JOURNEY_STAGE_CONFIG's comment on that legacy value).
  const [journeyFilter, setJourneyFilter] = useState<'all' | Exclude<Enquiry['journey_stage'], 'cancelled'>>(persisted.journeyFilter ?? 'all');
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'not_set'>(persisted.payFilter ?? 'all');
  const [bookedFilter, setBookedFilter] = useState<'all' | 'booked' | 'not_booked' | 'cancelled'>(persisted.bookedFilter ?? 'all');
  const [groupFilter, setGroupFilter] = useState<'all' | 'group' | 'solo'>(persisted.groupFilter ?? 'all');
  const [foodFilter, setFoodFilter] = useState<'all' | 'veg' | 'non_veg' | 'not_set'>(persisted.foodFilter ?? 'all');
  const [packageFilter, setPackageFilter] = useState<'all' | 'early_bird' | 'normal'>(persisted.packageFilter ?? 'all');
  const [sourceFilter, setSourceFilter] = useState<'all' | Enquiry['source']>(persisted.sourceFilter ?? 'all');
  // Quick toggle for "follow-ups due" — deliberately just a boolean chip
  // (not a full FilterDropdown like Payment/Booking above) since there's
  // only ever one meaningful thing to isolate here: reminders that are due
  // today or overdue. See followUpStatus() in AdminEnquiryCommon.tsx for what
  // counts as "due".
  const [followUpDueOnly, setFollowUpDueOnly] = useState(persisted.followUpDueOnly ?? false);
  const [searchQuery, setSearchQuery] = useState(persisted.searchQuery ?? '');
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const [selectedTripKey, setSelectedTripKey] = useState<string | null>(persisted.selectedTripKey ?? null);
  // Which single filter's dropdown is open — only one at a time. 'more'
  // is the overflow menu for less-frequently-used filters (currently just
  // Source), keeping the main bar to five compact boxes. Deliberately NOT
  // restored from sessionStorage like the fields above — it's a transient
  // "is this popover open" UI flag, not part of the filtered view itself,
  // and reopening a dropdown on the admin's behalf on return would be
  // surprising rather than helpful.
  const [openFilterPanel, setOpenFilterPanel] = useState<FilterPanelKey>(null);

  // Table pagination state.
  const [currentPage, setCurrentPage] = useState(persisted.currentPage ?? 1);

  // Column sorting — clicking a sortable header sorts the filtered list by
  // that column; clicking the same header again flips the direction.
  const [sortKey, setSortKey] = useState<EnquirySortKey | null>(persisted.sortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>(persisted.sortDir ?? 'asc');
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

  // Persist every filter/search/sort/page value as one JSON blob whenever
  // any of them change, so navigating away from this page (another admin
  // tab, "View Full CRM" into a single enquiry, a hard refresh) and coming
  // back restores the exact same view instead of resetting to "all
  // enquiries" — this is the actual fix for that; useScrollRestoration
  // separately handles putting the scroll position back once this same
  // data has re-rendered the list. sessionStorage (not localStorage), same
  // as the rest of this page's restore-on-return state, so it clears
  // itself at the end of the browser session rather than sticking around
  // indefinitely across unrelated visits.
  useEffect(() => {
    savePersisted<PersistedEnquiryFilters>(FILTERS_STORAGE_KEY, {
      filter, journeyFilter, payFilter, bookedFilter, groupFilter, foodFilter,
      packageFilter, sourceFilter, followUpDueOnly, searchQuery, selectedTripKey,
      currentPage, sortKey, sortDir,
    });
  }, [
    filter, journeyFilter, payFilter, bookedFilter, groupFilter, foodFilter,
    packageFilter, sourceFilter, followUpDueOnly, searchQuery, selectedTripKey,
    currentPage, sortKey, sortDir,
  ]);

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
    groupLabel: (e: Enquiry) => string,
    trip?: UpcomingTrip,
    allTrips?: UpcomingTrip[],
    allEnquiries?: Enquiry[]
  ) => {
    // Trip Finance columns — only meaningful (and only included) when the
    // export is scoped to a single trip (the Trip filter picked one row of
    // tripGroups, see AdminEnquiries.tsx) AND that trip actually has its
    // Add/Edit Trip → "Finances & Profit" tab filled in. Same
    // computeTripFinanceSummary rollup the Reports page's Trip Finance
    // section and the read-only Trip Details view use, so a passenger-list
    // export handed to the organiser/agency carries the same cost/profit
    // picture as the rest of the admin — not a second, drifting copy of it.
    // Both travelerCount and totalRevenue intentionally come from THIS
    // export's own rows (real total_amount summed across isBooked rows in
    // sortedFiltered, not the trip's business-wide numbers or bookedCount x
    // listed price), so the figures agree with the passenger list sitting
    // right next to them even if the admin has filtered down to e.g. one
    // group, and reflect what each booking was actually invoiced for.
    const scopedBookings = sortedFiltered.filter(isBooked);
    const financeSummary = trip?.trip_finance
      ? computeTripFinanceSummary(
          trip.trip_finance,
          scopedBookings.length,
          scopedBookings.reduce((sum, e) => sum + (e.total_amount || 0), 0),
          scopedBookings.filter(e => e.has_child_addon).length
        )
      : null;

    const lines: string[] = [];

    // Business-wide "Trip Finance & Profitability" mini-table — this is
    // the multi-trip counterpart to the per-row Trip Revenue/Costs/Profit
    // columns above: when the export spans more than one trip there's no
    // single trip to hang those columns off, so instead this prepends one
    // summary row per trip (same numbers as the Reports page's Trip
    // Finance section) above the passenger list. Only rendered when no
    // single trip is selected (an export already scoped to one trip gets
    // the per-row columns instead, not both) and at least one trip
    // actually has finance data entered.
    if (!trip && allTrips && allEnquiries) {
      const byTrip = financeSummaryByTrip(allTrips, allEnquiries);
      if (byTrip.length > 0) {
        lines.push(csvRow(['Trip Finance & Profitability (business-wide, all trips with Finances tab filled in)']));
        lines.push(csvRow(['Trip', 'Travelers', 'Revenue', 'Total Costs', 'Net Profit', 'Profit/Person']));
        byTrip.forEach(t => lines.push(csvRow([
          t.title, t.travelerCount, t.totalRevenue, t.totalCosts, t.netProfit, Math.round(t.profitPerPerson),
        ])));
        lines.push('');
      }
    }

    const headers = [
      'Name', 'Phone', 'Email', 'Age', 'City', 'Trip', 'Group',
      'Package', 'Food Preference', 'Total Amount', 'Amount Paid',
      'Payment Status', 'Booking Status', 'Refund Amount', 'Lead Status',
      'Source', 'Cancelled', 'Created At',
      ...(financeSummary ? [
        'Trip Revenue (this export)', 'Trip Total Costs', 'Trip Net Profit', 'Trip Profit/Person',
      ] : []),
    ];
    lines.push(csvRow(headers));
    sortedFiltered.forEach((e, idx) => lines.push(csvRow([
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
      // Repeated on every row (rather than a separate summary block) so
      // the figures survive being opened straight in Excel/Sheets — and
      // shown only on the first row so a quick glance at the sheet reads
      // as one trip-level summary, not one profit figure per traveller.
      ...(financeSummary ? [
        idx === 0 ? financeSummary.totalRevenue : '',
        idx === 0 ? financeSummary.totalCosts : '',
        idx === 0 ? financeSummary.netProfit : '',
        idx === 0 ? Math.round(financeSummary.profitPerPerson) : '',
      ] : []),
    ])));
    const scopeSuffix = activeGroupTitle ? `-${activeGroupTitle.replace(/\s+/g, '_')}` : '';
    downloadCsvLines(`enquiries${scopeSuffix}-${new Date().toISOString().slice(0, 10)}`, lines);
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
