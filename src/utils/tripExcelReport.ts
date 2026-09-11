// Styled "ULAA Reports" .xlsx export — the "Export Excel" button on the
// Reports page (see AdminReports.tsx). Unlike handleExportCsv (a plain,
// unstyled CSV meant for a full business-wide data dump), this produces a
// single-trip, presentation-ready workbook: a colored banner, a
// traveler/food-preference summary row, a cost/profit summary row, a
// per-person outstanding-balance table, and two free-text "Add breakdown"
// placeholder blocks an admin fills in by hand after export (organiser
// costs and ULAA costs breakdowns aren't itemized anywhere in the data
// model — the trip's Finances tab only stores already-rolled-up totals —
// so there's nothing to compute there; the export just leaves clearly
// labeled space for it instead of pretending to have a number).
//
// Deliberately its own small "spreadsheet layout" module rather than
// reusing toCsvRow/downloadCsv from AdminReports.tsx — those helpers only
// know how to write plain, unstyled text rows, and every cell here needs
// its own fill/border/alignment, which a CSV format has no way to carry.
import writeXlsxFile from 'write-excel-file/browser';
import type { Row } from 'write-excel-file/browser';

export interface TripExcelReportRow {
  // The one thing this export needs that the Trip dropdown's UpcomingTrip
  // rows don't carry on their own: a title to put in the banner. Passed
  // in separately (rather than requiring a full UpcomingTrip) so the same
  // renderer works for a completed trip too.
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
}

// Palette pulled straight from the reference mockup: a warm terracotta
// banner, a dusty-coral section header, a steel-blue column header, and a
// light grey field behind the whole block so the report reads as one
// self-contained card rather than bare cells floating on a white sheet.
const COLORS = {
  banner: '#B5651D',
  bannerText: '#FFFFFF',
  sectionHeader: '#E0A385',
  columnHeader: '#8DA9C4',
  fieldBackground: '#D9D9D9',
  border: '#B0B0B0',
} as const;

const COLUMN_COUNT = 6;

function blankRow(cols = COLUMN_COUNT): Row {
  return Array.from({ length: cols }, () => ({ value: '', backgroundColor: COLORS.fieldBackground }));
}

// Pads a row of real cells out to COLUMN_COUNT with grey filler cells, so
// e.g. a 4-column table (Name/Total/Paid/Balance) still fills the same
// visual rectangle as the 6-column finance row above it, matching how the
// reference mockup keeps one uniform grey field behind every section
// regardless of how many columns that particular row actually uses.
function padRow(cells: Row): Row {
  const padded = [...cells];
  while (padded.length < COLUMN_COUNT) {
    padded.push({ value: '', backgroundColor: COLORS.fieldBackground });
  }
  return padded;
}

function columnHeaderRow(labels: string[]): Row {
  return padRow(labels.map(label => ({
    value: label,
    backgroundColor: COLORS.columnHeader,
    fontWeight: 'bold',
    align: 'center',
    borderColor: COLORS.border,
    borderStyle: 'thin',
  })));
}

// `type` is deliberately left unset — write-excel-file derives String vs.
// Number from the JS value itself, so a plain number here renders as a
// real numeric cell (right-aligned, safe to SUM in a formula) without
// having to redeclare that per call site.
function dataCell(value: string | number, opts: { align?: 'left' | 'center' | 'right' } = {}) {
  return {
    value,
    backgroundColor: COLORS.fieldBackground,
    align: opts.align ?? (typeof value === 'number' ? 'right' as const : 'left' as const),
    borderColor: COLORS.border,
    borderStyle: 'thin' as const,
  };
}

function sectionTitleRow(title: string): Row {
  return [
    { value: title, columnSpan: COLUMN_COUNT, backgroundColor: COLORS.sectionHeader, fontWeight: 'bold', align: 'center' },
    null, null, null, null, null,
  ];
}

// "Add breakdown" placeholder block: a bold label row (e.g. "Organiser
// Costs") immediately followed by an italic, muted prompt row the admin
// types over once they've opened the file — deliberately not computed
// from trip_finance, since that record only stores pre-summed totals, not
// a line-item breakdown.
function breakdownBlock(label: string): Row[] {
  return [
    padRow([{ value: label, backgroundColor: COLORS.fieldBackground, fontWeight: 'bold' }]),
    padRow([{ value: 'Add breakdown', backgroundColor: COLORS.fieldBackground, fontStyle: 'italic', textColor: '#7A7A7A' }]),
  ];
}

function buildTripSheetRows(trip: TripExcelReportRow): Row[] {
  const rows: Row[] = [];

  rows.push([
    { value: 'ULAA Reports', columnSpan: COLUMN_COUNT, backgroundColor: COLORS.banner, textColor: COLORS.bannerText, fontWeight: 'bold', fontSize: 16, align: 'center', alignVertical: 'center', height: 32 },
    null, null, null, null, null,
  ]);
  rows.push(blankRow());

  rows.push(columnHeaderRow(['Trip', 'Travelers', 'Veg', 'Non Veg']));
  rows.push(padRow([
    dataCell(trip.tripTitle, { align: 'left' }),
    dataCell(trip.travelerCount),
    dataCell(trip.vegCount),
    dataCell(trip.nonVegCount),
  ]));
  rows.push(blankRow());

  rows.push(sectionTitleRow('Outstanding Balances by Person'));
  rows.push(columnHeaderRow(['Revenue', 'ULAA Costs', 'Organiser Costs', 'Total Costs', 'Net Profit', 'Profit/Person']));
  rows.push(padRow([
    dataCell(trip.revenue),
    dataCell(trip.ulaaCosts),
    dataCell(trip.organiserCosts),
    dataCell(trip.totalCosts),
    dataCell(trip.netProfit),
    dataCell(Math.round(trip.profitPerPerson)),
  ]));
  rows.push(blankRow());

  rows.push(columnHeaderRow(['Name', 'Total Amount', 'Paid So Far', 'Balance']));
  if (trip.outstandingByPerson.length === 0) {
    rows.push(padRow([{ value: 'No outstanding balances', backgroundColor: COLORS.fieldBackground, fontStyle: 'italic', textColor: '#7A7A7A', columnSpan: 4 }, null, null, null]));
  } else {
    trip.outstandingByPerson.forEach(p => {
      rows.push(padRow([
        dataCell(p.name, { align: 'left' }),
        dataCell(p.total),
        dataCell(p.paid),
        dataCell(p.balance),
      ]));
    });
  }
  rows.push(blankRow());

  rows.push(...breakdownBlock('Organiser Costs'));
  rows.push(...breakdownBlock('ULAA Costs'));

  return rows;
}

const SHEET_COLUMNS = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }];

// Single-trip export: one sheet named after the trip.
export async function downloadTripExcelReport(trip: TripExcelReportRow): Promise<void> {
  const rows = buildTripSheetRows(trip);
  const safeSheetName = trip.tripTitle.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Trip';
  await writeXlsxFile(rows, { sheet: safeSheetName, columns: SHEET_COLUMNS }).toFile(
    `ulaa-report-${trip.tripTitle.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

// "All Trips" export: same layout, one sheet per trip, so picking "All
// Trips" in the Trip dropdown before hitting Export Excel doesn't lose
// per-trip detail to a single flattened table the way the CSV export's
// business-wide summary table does.
export async function downloadAllTripsExcelReport(trips: TripExcelReportRow[]): Promise<void> {
  const usedNames = new Set<string>();
  const sheets: { data: Row[]; sheet: string; columns: typeof SHEET_COLUMNS }[] = trips.map(trip => {
    let name = trip.tripTitle.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Trip';
    let suffix = 2;
    while (usedNames.has(name)) {
      const base = name.slice(0, 28 - String(suffix).length);
      name = `${base} (${suffix})`;
      suffix += 1;
    }
    usedNames.add(name);
    return { data: buildTripSheetRows(trip), sheet: name, columns: SHEET_COLUMNS };
  });
  await writeXlsxFile(sheets).toFile(`ulaa-report-all-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
