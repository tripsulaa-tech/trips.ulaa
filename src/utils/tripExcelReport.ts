// Ulaa Reports .xlsx export — powers the "Export Excel" button on the
// Reports page (see AdminReports.tsx). Produces a single styled workbook,
// colored with the app's own brand palette (src/styles/globals.css's
// @theme block) rather than a one-off palette, containing:
//   1. A "Summary" sheet that mirrors every section the plain-text CSV
//      export produces (handleExportCsv, same file) — Lead Reports,
//      Booking Reports, Financial Reports, Trip Finance & Profitability,
//      Operational Reports, Lead Source Breakdown, Payment Method
//      Breakdown, Per-Trip Breakdown, and Balances by Person —
//      in the same order, so nothing visible in the CSV is missing here.
//   2. One sheet per trip that has a Finances tab filled in, itemizing
//      that trip's Organiser/ULAA cost breakdown and per-person balances
//      that the Summary sheet's finance table only shows totals for.
// Deliberately its own small "spreadsheet layout" module rather than
// reusing toCsvRow/downloadCsv from AdminReports.tsx — those helpers only
// know how to write plain, unstyled text rows, and every cell here needs
// its own fill/border/alignment, which a CSV format has no way to carry.
import writeXlsxFile from 'write-excel-file/browser';
import type { Row } from 'write-excel-file/browser';

// Not exported: knip confirms neither type is imported outside this file —
// AdminReports.tsx (the only other place that shapes this data) builds
// matching object literals structurally instead of importing these.
interface CostBreakdownItem {
  label: string;
  amount: number;
}

interface TripExcelReportRow {
  // The one thing this export needs that the Trip dropdown's UpcomingTrip
  // rows don't carry on their own: a title to put in the sheet header.
  // Passed in separately (rather than requiring a full UpcomingTrip) so
  // the same renderer works for a completed trip too.
  tripTitle: string;
  travelerCount: number;
  vegCount: number;
  nonVegCount: number;
  revenue: number;
  ulaaCosts: number;
  organiserCosts: number;
  totalCosts: number;
  netProfit: number;
  profitPerPerson: number;
  // Every booked, priced traveler on the trip — fully-paid travelers
  // (balance 0) included, not just the ones who still owe money. See
  // AdminReports.tsx's balancesByPerson/buildExcelRowForTrip for why: a
  // trip with 13 real booked travelers used to print as few as however
  // many of them still had a balance outstanding, silently dropping the
  // rest of the roster from this sheet.
  balancesByPerson: { name: string; total: number; paid: number; balance: number }[];
  // Line items behind the ulaaCosts / organiserCosts totals above — see
  // AdminReports.tsx's buildExcelRowForTrip for how these are derived from
  // the trip's raw TripFinance record. Each block's own line items are
  // expected to sum to that block's total (ulaaCosts / organiserCosts);
  // the sheet prints a "Total" row using the total passed in directly
  // rather than re-summing, so the two can never silently disagree.
  ulaaCostBreakdown: CostBreakdownItem[];
  organiserCostBreakdown: CostBreakdownItem[];
}

// Palette pulled straight from the app's own theme tokens
// (src/styles/globals.css's @theme block) instead of a one-off mockup
// palette, so the exported workbook reads as an extension of the admin UI
// rather than a differently branded document: --color-primary for the
// banner, --color-secondary for section headers, --color-primary-dark for
// column headers, and --color-background-warm for the field behind every
// section — matching how those same tokens are used across the admin
// (bg-primary pills, bg-background-warm rows, etc).
const COLORS = {
  banner: '#A85A2A', // --color-primary
  bannerText: '#FFFFFF',
  sectionHeader: '#D98A3A', // --color-secondary
  sectionHeaderText: '#FFFFFF',
  columnHeader: '#8B4820', // --color-primary-dark
  columnHeaderText: '#FFFFFF',
  fieldBackground: '#F2EBE0', // --color-background-warm
  border: '#D9C3AC', // a shade between background-warm and primary-light, for row separators
  textDark: '#2D2118', // --color-dark
  textMuted: '#4A3728', // --color-dark-muted
  positive: '#15803D', // matches the app's text-green-700, used for profit/collected figures
  negative: '#DC2626', // matches the app's text-red-600, used for loss/cancellation figures
} as const;

function blankRow(cols: number): Row {
  return Array.from({ length: cols }, () => ({ value: '', backgroundColor: COLORS.fieldBackground }));
}

// Pads a row of real cells out to `cols` with grey filler cells, so e.g. a
// 4-column table (Name/Total/Paid/Balance) still fills the same visual
// rectangle as a wider row above it — one uniform field behind every
// section regardless of how many columns that particular row actually
// uses.
function padRow(cells: Row, cols: number): Row {
  const padded = [...cells];
  while (padded.length < cols) {
    padded.push({ value: '', backgroundColor: COLORS.fieldBackground });
  }
  return padded;
}

function bannerRow(title: string, cols: number): Row {
  const row: Row = [{
    value: title, columnSpan: cols, backgroundColor: COLORS.banner, textColor: COLORS.bannerText,
    fontWeight: 'bold', fontSize: 16, align: 'center', alignVertical: 'center', height: 32,
  }];
  for (let i = 1; i < cols; i++) row.push(null);
  return row;
}

function sectionTitleRow(title: string, cols: number): Row {
  const row: Row = [{
    value: title, columnSpan: cols, backgroundColor: COLORS.sectionHeader, textColor: COLORS.sectionHeaderText,
    fontWeight: 'bold', align: 'center',
  }];
  for (let i = 1; i < cols; i++) row.push(null);
  return row;
}

function columnHeaderRow(labels: string[], cols: number): Row {
  return padRow(labels.map(label => ({
    value: label,
    backgroundColor: COLORS.columnHeader,
    textColor: COLORS.columnHeaderText,
    fontWeight: 'bold',
    align: 'center',
    borderColor: COLORS.border,
    borderStyle: 'thin',
  })), cols);
}

// `type` is deliberately left unset — write-excel-file derives String vs.
// Number from the JS value itself, so a plain number here renders as a
// real numeric cell (right-aligned, safe to SUM in a formula) without
// having to redeclare that per call site. `tone` lets a figure like Net
// Profit or a Balance print in the same green/red the admin UI already
// uses for positive vs. negative money (see AdminReports.tsx's
// `t.netProfit < 0 ? 'text-red-600' : 'text-green-700'`).
function dataCell(
  value: string | number,
  opts: { align?: 'left' | 'center' | 'right'; tone?: 'positive' | 'negative'; columnSpan?: number; bold?: boolean } = {}
) {
  return {
    value,
    backgroundColor: COLORS.fieldBackground,
    textColor: opts.tone === 'positive' ? COLORS.positive : opts.tone === 'negative' ? COLORS.negative : COLORS.textDark,
    align: opts.align ?? (typeof value === 'number' ? 'right' as const : 'left' as const),
    borderColor: COLORS.border,
    borderStyle: 'thin' as const,
    ...(opts.bold ? { fontWeight: 'bold' as const } : {}),
    ...(opts.columnSpan ? { columnSpan: opts.columnSpan } : {}),
  };
}

function fallbackRow(label: string, cols: number): Row {
  const row: Row = [{ value: label, backgroundColor: COLORS.fieldBackground, fontStyle: 'italic', textColor: COLORS.textMuted, columnSpan: cols }];
  for (let i = 1; i < cols; i++) row.push(null);
  return row;
}

// One line of an itemized cost breakdown: a label spanning all but the
// last column (long agency/organiser names routinely overflow a single
// narrow column) and a right-aligned amount in the last. Built on the
// same bordered `dataCell` used by every other table on the sheet
// (Trip/Travelers, Cost & Profit Summary, Balances by Person) so this
// section reads as part of the same themed workbook instead of a plain
// unstyled dump of label/amount pairs. `cols` is expected to be exactly
// COST_COLS — the label spans everything except the last (Amount)
// column, with no extra filler column past it.
function costItemRow(label: string, amount: number, cols: number, opts: { bold?: boolean } = {}): Row {
  const labelSpan = cols - 1;
  const nulls = Array.from({ length: labelSpan - 1 }, () => null);
  return [
    dataCell(label, { align: 'left', columnSpan: labelSpan, bold: opts.bold }),
    ...nulls,
    dataCell(amount, { bold: opts.bold }),
  ] as Row;
}

// Column header for a cost breakdown block — "Item" spanning the same
// label width costItemRow uses, "Amount" over the amount column — in the
// same columnHeader color every other table's header row on this sheet
// uses, rather than the plain bold-on-cream text the plain layout had.
function costHeaderRow(cols: number): Row {
  const labelSpan = cols - 1;
  const nulls = Array.from({ length: labelSpan - 1 }, () => null);
  const headerCell = (value: string, columnSpan?: number) => ({
    value,
    backgroundColor: COLORS.columnHeader,
    textColor: COLORS.columnHeaderText,
    fontWeight: 'bold' as const,
    align: 'center' as const,
    borderColor: COLORS.border,
    borderStyle: 'thin' as const,
    ...(columnSpan ? { columnSpan } : {}),
  });
  return [
    headerCell('Item', labelSpan),
    ...nulls,
    headerCell('Amount'),
  ] as Row;
}

// Itemized cost breakdown block: an orange section banner ("Organiser
// Costs" / "Ulaa Costs") matching every other section title on the sheet,
// a themed column header, one bordered row per underlying TripFinance
// line item the admin actually entered on the Finances tab, and a bold
// Total row. `total` is passed in from the already-computed
// ulaaCosts/organiserCosts figure (not re-summed from `items`) so this
// can never drift from the summary row further up the sheet even if a
// future line item gets added to one but not the other. Every row is
// widened to TRIP_COLS with a plain cream fill and no border past the
// real Item/Amount columns — the banner/header/borders themselves stay
// sized to `cols` (COST_COLS), but the row's own background still
// reaches the sheet's full width, matching the cream wash every other
// section (Cost & Profit Summary, the blank spacer rows) already carries
// all the way across — instead of leaving the unused columns E/F with no
// fill at all, which read as a gray gap in the sheet.
function costBreakdownBlock(label: string, items: CostBreakdownItem[], total: number, cols: number): Row[] {
  const rows: Row[] = [sectionTitleRow(label, cols), costHeaderRow(cols)];
  if (items.length === 0) {
    rows.push(fallbackRow('No costs entered', cols));
  } else {
    items.forEach(item => rows.push(costItemRow(item.label, item.amount, cols)));
  }
  rows.push(costItemRow('Total', total, cols, { bold: true }));
  return rows.map(row => padRow(row, TRIP_COLS));
}

const TRIP_COLS = 6;
// Narrower widths for sections that don't actually have 6 real columns of
// data — Balances by Person only ever has Name/Total/Paid/Balance, and a
// cost breakdown only ever has Item/Amount (Item just needs several
// columns of span for long agency/organiser names to not get clipped).
// Passing TRIP_COLS into these used to pad every row out with 1-2 extra
// blank cream cells past the real data, which visually stretched those
// tables the full width of the sheet for no reason. Building them at
// their own natural width instead means each block ends exactly where
// its last real column (Balance / Amount) ends.
const BALANCE_COLS = 4;
const COST_COLS = 5;
const TRIP_SHEET_COLUMNS = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }];

function buildTripSheetRows(trip: TripExcelReportRow): Row[] {
  const rows: Row[] = [];

  rows.push(bannerRow('Ulaa Reports', TRIP_COLS));
  rows.push(blankRow(TRIP_COLS));

  rows.push(columnHeaderRow(['Trip', 'Travelers', 'Veg', 'Non Veg'], TRIP_COLS));
  rows.push(padRow([
    dataCell(trip.tripTitle, { align: 'left' }),
    dataCell(trip.travelerCount),
    dataCell(trip.vegCount),
    dataCell(trip.nonVegCount),
  ], TRIP_COLS));
  rows.push(blankRow(TRIP_COLS));

  rows.push(sectionTitleRow('Cost & Profit Summary', TRIP_COLS));
  rows.push(columnHeaderRow(['Revenue', 'Ulaa Costs', 'Organiser Costs', 'Total Costs', 'Net Profit', 'Profit/Person'], TRIP_COLS));
  rows.push(padRow([
    dataCell(trip.revenue, { align: 'center', tone: 'positive' }),
    dataCell(trip.ulaaCosts, { align: 'center' }),
    dataCell(trip.organiserCosts, { align: 'center' }),
    dataCell(trip.totalCosts, { align: 'center' }),
    dataCell(trip.netProfit, { align: 'center', bold: true, tone: trip.netProfit < 0 ? 'negative' : 'positive' }),
    dataCell(Math.round(trip.profitPerPerson), { align: 'center' }),
  ], TRIP_COLS));
  rows.push(blankRow(TRIP_COLS));

  const balancesSectionStart = rows.length;
  rows.push(sectionTitleRow('Balances by Person', BALANCE_COLS));
  rows.push(columnHeaderRow(['Name', 'Total Amount', 'Paid So Far', 'Balance'], BALANCE_COLS));
  if (trip.balancesByPerson.length === 0) {
    rows.push(fallbackRow('No priced bookings yet', BALANCE_COLS));
  } else {
    trip.balancesByPerson.forEach(p => {
      rows.push([
        dataCell(p.name, { align: 'left' }),
        dataCell(p.total),
        // Fully paid travelers (balance 0) print "Paid" in green instead
        // of a bare 0 — same distinction the on-screen table now draws —
        // so a fully-settled row reads as settled at a glance rather than
        // looking like a data gap next to the real outstanding amounts.
        dataCell(p.paid),
        p.balance > 0
          ? dataCell(p.balance, { tone: 'negative' })
          : dataCell('Paid', { tone: 'positive', align: 'right' }),
      ] as Row);
    });
    // Bold roll-up across every traveler in the table above (paid and
    // still-owing alike) — Total Amount and Paid So Far always sum
    // cleanly since every row has a real number in each; Balance sums to
    // just what's still outstanding business-wide for this trip, since
    // fully-paid rows contribute 0 to it.
    const personTotals = trip.balancesByPerson.reduce(
      (acc, p) => ({ total: acc.total + p.total, paid: acc.paid + p.paid, balance: acc.balance + p.balance }),
      { total: 0, paid: 0, balance: 0 }
    );
    rows.push([
      dataCell('Total', { align: 'left', bold: true }),
      dataCell(personTotals.total, { bold: true }),
      dataCell(personTotals.paid, { bold: true }),
      dataCell(personTotals.balance, { tone: personTotals.balance > 0 ? 'negative' : 'positive', bold: true }),
    ] as Row);
  }
  // Widen every row just pushed for this section (banner, header, each
  // traveler, the Total row) out to TRIP_COLS with plain cream fill and
  // no border past column D — same reasoning as costBreakdownBlock above:
  // the table's own borders/colors stay sized to BALANCE_COLS, but the
  // row background still reaches the sheet's full width instead of
  // leaving E/F with no fill.
  for (let i = balancesSectionStart; i < rows.length; i++) {
    rows[i] = padRow(rows[i], TRIP_COLS);
  }
  rows.push(blankRow(TRIP_COLS));

  rows.push(...costBreakdownBlock('Organiser Costs', trip.organiserCostBreakdown, trip.organiserCosts, COST_COLS));
  rows.push(blankRow(TRIP_COLS));
  rows.push(...costBreakdownBlock('Ulaa Costs', trip.ulaaCostBreakdown, trip.ulaaCosts, COST_COLS));

  return rows;
}

// Filesystem/sheet-name-safe slug for a trip title, used in the downloaded
// filename for the single-trip export below.
function slugifyTripTitle(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'trip';
}

// Single-trip export: just that trip's own sheet (see buildTripSheetRows),
// no business-wide Summary sheet — used when the Reports page's Trip
// dropdown has one specific trip selected rather than "All Trips".
export async function downloadTripExcelReport(trip: TripExcelReportRow): Promise<void> {
  const sheetName = trip.tripTitle.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Trip';
  await writeXlsxFile([{ data: buildTripSheetRows(trip), sheet: sheetName, columns: TRIP_SHEET_COLUMNS }])
    .toFile(`ulaa-trip-report-${slugifyTripTitle(trip.tripTitle)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// "All Trips" export: one sheet per trip, deduping sheet names (Excel sheet
// names are unique and capped at 31 chars) — no Summary sheet, since the
// Reports page's Export Excel button no longer builds one.
export async function downloadAllTripsExcelReport(trips: TripExcelReportRow[]): Promise<void> {
  const usedNames = new Set<string>();
  const sheets = trips.map(trip => {
    let name = trip.tripTitle.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Trip';
    let suffix = 2;
    while (usedNames.has(name)) {
      const base = name.slice(0, 28 - String(suffix).length);
      name = `${base} (${suffix})`;
      suffix += 1;
    }
    usedNames.add(name);
    return { data: buildTripSheetRows(trip), sheet: name, columns: TRIP_SHEET_COLUMNS };
  });
  await writeXlsxFile(sheets).toFile(`ulaa-all-trips-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

