// ULAA Reports .xlsx export — powers the "Export Excel" button on the
// Reports page (see AdminReports.tsx). Produces a single styled workbook,
// colored with the app's own brand palette (src/styles/globals.css's
// @theme block) rather than a one-off palette, containing:
//   1. A "Summary" sheet that mirrors every section the plain-text CSV
//      export produces (handleExportCsv, same file) — Lead Reports,
//      Booking Reports, Financial Reports, Trip Finance & Profitability,
//      Operational Reports, Lead Source Breakdown, Payment Method
//      Breakdown, Per-Trip Breakdown, and Outstanding Balances by Person —
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

export interface CostBreakdownItem {
  label: string;
  amount: number;
}

export interface TripExcelReportRow {
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
  outstandingByPerson: { name: string; total: number; paid: number; balance: number }[];
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
  opts: { align?: 'left' | 'center' | 'right'; tone?: 'positive' | 'negative'; columnSpan?: number } = {}
) {
  return {
    value,
    backgroundColor: COLORS.fieldBackground,
    textColor: opts.tone === 'positive' ? COLORS.positive : opts.tone === 'negative' ? COLORS.negative : COLORS.textDark,
    align: opts.align ?? (typeof value === 'number' ? 'right' as const : 'left' as const),
    borderColor: COLORS.border,
    borderStyle: 'thin' as const,
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
// narrow column) and a right-aligned amount in the last, matching the
// grey, borderless field style the reference layout uses for this section
// (as opposed to the bordered tables above it).
function breakdownItemRow(label: string, amount: number, cols: number, opts: { bold?: boolean } = {}): Row {
  const weight = opts.bold ? ({ fontWeight: 'bold' as const }) : {};
  const labelSpan = cols - 2;
  const nulls = Array.from({ length: labelSpan - 1 }, () => null);
  return padRow([
    { value: label, backgroundColor: COLORS.fieldBackground, textColor: COLORS.textDark, columnSpan: labelSpan, ...weight },
    ...nulls,
    { value: amount, backgroundColor: COLORS.fieldBackground, textColor: COLORS.textDark, align: 'right', ...weight },
  ] as Row, cols);
}

// Itemized cost breakdown block: a bold section label ("Organiser Costs" /
// "ULAA Costs"), one row per underlying TripFinance line item the admin
// actually entered on the Finances tab, and a bold Total row. `total` is
// passed in from the already-computed ulaaCosts/organiserCosts figure
// (not re-summed from `items`) so this can never drift from the summary
// row further up the sheet even if a future line item gets added to one
// but not the other.
function costBreakdownBlock(label: string, items: CostBreakdownItem[], total: number, cols: number): Row[] {
  const headerRow: Row = [{ value: label, backgroundColor: COLORS.fieldBackground, textColor: COLORS.textDark, fontWeight: 'bold', columnSpan: cols }];
  for (let i = 1; i < cols; i++) headerRow.push(null);
  const rows: Row[] = [headerRow];
  if (items.length === 0) {
    rows.push(fallbackRow('No costs entered', cols));
  } else {
    items.forEach(item => rows.push(breakdownItemRow(item.label, item.amount, cols)));
  }
  rows.push(breakdownItemRow('Total', total, cols, { bold: true }));
  return rows;
}

const TRIP_COLS = 6;
const TRIP_SHEET_COLUMNS = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }];

function buildTripSheetRows(trip: TripExcelReportRow): Row[] {
  const rows: Row[] = [];

  rows.push(bannerRow('ULAA Reports', TRIP_COLS));
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
  rows.push(columnHeaderRow(['Revenue', 'ULAA Costs', 'Organiser Costs', 'Total Costs', 'Net Profit', 'Profit/Person'], TRIP_COLS));
  rows.push(padRow([
    dataCell(trip.revenue, { tone: 'positive' }),
    dataCell(trip.ulaaCosts),
    dataCell(trip.organiserCosts),
    dataCell(trip.totalCosts),
    dataCell(trip.netProfit, { tone: trip.netProfit < 0 ? 'negative' : 'positive' }),
    dataCell(Math.round(trip.profitPerPerson)),
  ], TRIP_COLS));
  rows.push(blankRow(TRIP_COLS));

  rows.push(sectionTitleRow('Outstanding Balances by Person', TRIP_COLS));
  rows.push(columnHeaderRow(['Name', 'Total Amount', 'Paid So Far', 'Balance'], TRIP_COLS));
  if (trip.outstandingByPerson.length === 0) {
    rows.push(fallbackRow('No outstanding balances', 4));
  } else {
    trip.outstandingByPerson.forEach(p => {
      rows.push(padRow([
        dataCell(p.name, { align: 'left' }),
        dataCell(p.total),
        dataCell(p.paid),
        dataCell(p.balance, { tone: p.balance > 0 ? 'negative' : undefined }),
      ], TRIP_COLS));
    });
  }
  rows.push(blankRow(TRIP_COLS));

  rows.push(...costBreakdownBlock('Organiser Costs', trip.organiserCostBreakdown, trip.organiserCosts, TRIP_COLS));
  rows.push(...costBreakdownBlock('ULAA Costs', trip.ulaaCostBreakdown, trip.ulaaCosts, TRIP_COLS));

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

