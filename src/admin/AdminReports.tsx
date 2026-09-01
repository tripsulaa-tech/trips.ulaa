// Reports page (CRM spec section 16).
//
// Deliberately reads the same data AdminEnquiries/AdminDashboard already
// fetch (getEnquiries / getAllUpcomingTripsAdmin / getAllCompletedTripsAdmin)
// and reuses their existing derivation helpers (isBooked, isCancelled,
// closedReasonBreakdown, JOURNEY_STAGE_CONFIG, ...) rather than introducing
// a parallel set of status checks — so a report can never silently drift
// out of sync with what the Enquiries table itself considers "booked" or
// "cancelled". Nothing here writes anything; this is a read-only rollup.
//
// The one thing genuinely new here vs. the existing per-trip KPI strip in
// AdminEnquiries.tsx is scope: that strip is always scoped to "whichever
// trip is selected right now". This page is business-wide and adds the one
// axis nothing else exposes — a time period — so "how are we trending this
// month" is answerable without exporting to a spreadsheet.
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Users,
  Phone,
  XCircle,
  TrendUp as TrendingUp,
  Clock,
  CurrencyInr as IndianRupee,
  Wallet,
  ArrowUUpLeft as Undo2,
  Wallet as Wallet2,
  SealCheck as BadgeCheck,
  Confetti as PartyPopper,
  CalendarX as CalendarX2,
  MapPin,
  ForkKnife as UtensilsCrossed,
  UserMinus as UserX,
  ChartPie as PieChart,
  DownloadSimple as Download,
  ChartBar as BarChart3,
  CreditCard,
  Compass,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import { getEnquiries, getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin, getAllPayments } from '../services/api';
import type { Enquiry, UpcomingTrip, CompletedTrip, Payment } from '../types/types-index';
import { isBooked, isCancelled } from './enquiries/AdminEnquiriesShared';
import { closedReasonBreakdown, isNotInterested } from './enquiries/AdminEnquiryCommon';
import { formatPrice } from '../utils/utils-index';

// Real, human-readable label for every value enquiries.source can actually
// hold. Deliberately not reusing enquiries/AdminEnquiriesShared's
// SOURCE_OPTIONS here — that list is scoped to the manual-entry form's
// dropdown and excludes 'website' on purpose (see enquiryGrouping.ts), but
// real enquiry rows very much do carry source: 'website', and a lead-source
// report that silently dropped the public booking form would be useless.
const SOURCE_LABELS: Record<Enquiry['source'], string> = {
  website: 'Website',
  whatsapp: 'WhatsApp',
  phone: 'Phone Call',
  instagram: 'Instagram',
  walk_in: 'Walk-in',
  other: 'Other',
};

type Period = 'all' | 'month' | '30d';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'month', label: 'This Month' },
  { value: '30d', label: 'Last 30 Days' },
];

function withinPeriod(dateStr: string, period: Period): boolean {
  if (period === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  // 30d
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
}

// Buckets paid ledger rows into a revenue-over-time series. Granularity
// follows the period toggle: daily buckets for the two short windows (30
// days / a month is few enough days to read as a bar each), monthly
// buckets for "All Time" (could span years — daily bars would be unreadable
// and mostly empty). Always returns buckets in chronological order, oldest
// first, including zero-revenue days/months in between so gaps in the
// timeline are visible rather than silently compressed out.
function buildRevenueTrend(paidRows: Payment[], period: Period): { label: string; amount: number }[] {
  if (paidRows.length === 0) return [];
  const daily = period !== 'all';
  const keyOf = (d: Date) => daily
    ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    : `${d.getFullYear()}-${d.getMonth()}`;
  const labelOf = (d: Date) => daily
    ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

  const sums = new Map<string, number>();
  paidRows.forEach(p => {
    const d = new Date(p.paid_at);
    const key = keyOf(d);
    sums.set(key, (sums.get(key) || 0) + p.amount);
  });

  // Walk every day/month between the earliest and latest payment so gaps
  // show as zero bars instead of disappearing.
  const dates = paidRows.map(p => new Date(p.paid_at));
  const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
  const latest = new Date(Math.max(...dates.map(d => d.getTime())));
  const buckets: { key: string; date: Date }[] = [];
  const cursor = new Date(earliest);
  if (daily) cursor.setHours(0, 0, 0, 0); else cursor.setDate(1);
  while (cursor <= latest) {
    buckets.push({ key: keyOf(cursor), date: new Date(cursor) });
    if (daily) cursor.setDate(cursor.getDate() + 1); else cursor.setMonth(cursor.getMonth() + 1);
  }
  // Cap at 31 bars even for "All Time" spanning many years — collapse to
  // the most recent 31 buckets rather than rendering an unreadable strip.
  const capped = buckets.slice(-31);
  return capped.map(b => ({ label: labelOf(b.date), amount: sums.get(b.key) || 0 }));
}

// Minimal dependency-free CSV export — quotes every field and escapes
// embedded quotes/commas so labels containing them (e.g. a destination
// name with a comma) don't corrupt column alignment when opened in Excel.
function toCsvRow(fields: (string | number)[]): string {
  return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',');
}
function downloadCsv(filename: string, rows: string[]): void {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Average time between an enquiry landing and an admin actually recording a
// contact outcome against it — the "Average Response Time" lead report.
// Only meaningful for rows that have been through the Record Contact
// Outcome popup at least once (last_contact_at set); a lead nobody has
// called yet isn't a response-time data point, it's a queue depth.
function averageResponseTime(list: Enquiry[]): string {
  const withResponse = list.filter(e => e.last_contact_at);
  if (withResponse.length === 0) return '—';
  const totalMs = withResponse.reduce((sum, e) => {
    return sum + (new Date(e.last_contact_at as string).getTime() - new Date(e.created_at).getTime());
  }, 0);
  const avgMs = totalMs / withResponse.length;
  const avgHours = avgMs / (1000 * 60 * 60);
  if (avgHours < 1) return `${Math.max(1, Math.round(avgMs / (1000 * 60)))} min`;
  if (avgHours < 48) return `${avgHours.toFixed(1)} hrs`;
  return `${(avgHours / 24).toFixed(1)} days`;
}

function StatCard({
  label, value, sub, icon: Icon,
}: { label: string; value: string | number; sub?: string; icon: typeof Users }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-card min-w-0">
      <div className="flex items-center gap-2">
        <Icon size={20} className="shrink-0 text-primary" aria-hidden="true" />
        <p className="font-display text-2xl font-bold text-dark leading-tight truncate">{value}</p>
      </div>
      <p className="text-dark-muted text-xs font-medium truncate mt-1">{label}</p>
      {sub && <p className="text-dark-muted/70 text-[11px] mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function ReportSection({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-display text-base sm:text-lg font-bold text-dark">{title}</h3>
        {subtitle && <p className="text-dark-muted text-xs">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// Lightweight bar chart, no charting dependency — the app doesn't already
// pull one in, and this is the only place that needs one so far. Renders
// as plain divs (not SVG/canvas) so bar heights, hover tooltips, and text
// stay simple, accessible, and easy to restyle alongside the rest of the
// admin's Tailwind-based UI.
function RevenueTrendChart({ data }: { data: { label: string; amount: number }[] }) {
  if (data.length === 0) {
    return <p className="text-dark-muted text-sm text-center py-8">No collected payments in this range yet.</p>;
  }
  const max = Math.max(...data.map(d => d.amount), 1);
  // Skip every other label once there are enough bars that every label
  // would overlap its neighbors.
  const labelEvery = data.length > 15 ? Math.ceil(data.length / 15) : 1;
  return (
    <div className="flex items-end gap-1 h-40 pt-2">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1 group relative">
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-dark text-white text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {formatPrice(d.amount)}
          </div>
          <div
            className="w-full bg-primary/80 hover:bg-primary rounded-t-sm transition-colors min-h-[2px]"
            style={{ height: `${Math.max(2, (d.amount / max) * 100)}%` }}
          />
          <span className="text-[9px] text-dark-muted truncate w-full text-center">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminReports() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [upcomingTrips, setUpcomingTrips] = useState<UpcomingTrip[]>([]);
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');

  useEffect(() => {
    Promise.all([getEnquiries(), getAllUpcomingTripsAdmin(), getAllCompletedTripsAdmin(), getAllPayments()])
      .then(([allEnquiries, upcoming, completed, allPayments]) => {
        setEnquiries(allEnquiries);
        setUpcomingTrips(upcoming);
        setCompletedTrips(completed);
        setPayments(allPayments);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Every metric below is derived from this one period-scoped list, so
  // switching the period toggle re-derives the whole page consistently
  // instead of some cards silently staying business-wide.
  const scoped = useMemo(
    () => enquiries.filter(e => withinPeriod(e.created_at, period)),
    [enquiries, period]
  );

  // trip_id -> destination, merged from both trip tables, so bookings on
  // completed trips (which no longer have an upcoming_trips row) still
  // resolve to a real place name instead of falling through to "Unknown".
  const destinationById = useMemo(() => {
    const map = new Map<string, string>();
    upcomingTrips.forEach(t => map.set(t.id, t.destination));
    completedTrips.forEach(t => map.set(t.id, t.destination));
    return map;
  }, [upcomingTrips, completedTrips]);

  const lead = useMemo(() => {
    const total = scoped.length;
    const newCount = scoped.filter(e => e.status === 'new').length;
    const contactedCount = scoped.filter(e => e.status === 'contacted').length;
    const closedCount = scoped.filter(isNotInterested).length;
    const bookedCount = scoped.filter(isBooked).length;
    return {
      total, newCount, contactedCount, closedCount, bookedCount,
      conversionPct: pct(bookedCount, total),
      closedBreakdown: closedReasonBreakdown(scoped),
      avgResponseTime: averageResponseTime(scoped),
    };
  }, [scoped]);

  const booking = useMemo(() => ({
    confirmed: scoped.filter(e => e.journey_stage === 'confirmed').length,
    completed: scoped.filter(e => e.journey_stage === 'completed').length,
    cancelled: scoped.filter(isCancelled).length,
  }), [scoped]);

  const financial = useMemo(() => {
    const revenue = scoped.reduce((sum, e) => sum + (e.amount_paid || 0) - (e.refund_amount || 0), 0);
    const refundAmount = scoped.reduce((sum, e) => sum + (e.refund_amount || 0), 0);
    const outstandingBalance = scoped
      .filter(e => isBooked(e) && e.total_amount)
      .reduce((sum, e) => sum + Math.max(0, (e.total_amount || 0) - (e.amount_paid || 0)), 0);
    const bookedWithPrice = scoped.filter(e => isBooked(e) && e.total_amount);
    const avgBookingValue = bookedWithPrice.length
      ? bookedWithPrice.reduce((sum, e) => sum + (e.total_amount || 0), 0) / bookedWithPrice.length
      : 0;
    return { revenue, refundAmount, outstandingBalance, avgBookingValue };
  }, [scoped]);

  const operational = useMemo(() => {
    const bookedList = scoped.filter(isBooked);
    const veg = bookedList.filter(e => e.food_preference === 'veg').length;
    const nonVeg = bookedList.filter(e => e.food_preference === 'non_veg').length;
    const notSet = bookedList.length - veg - nonVeg;

    // "Ever became a booking" (booking_id assigned) is the denominator for
    // Cancellation % — a lead that never paid anything was never at risk of
    // being cancelled, so including it would understate the real rate.
    const everBooked = scoped.filter(e => !!e.booking_id);
    const cancelledOfBooked = everBooked.filter(isCancelled).length;

    // No-show only has a meaningful denominator among travellers whose trip
    // actually reached the point attendance gets recorded (checked in, or
    // marked no-show) — everyone still earlier in the journey isn't a
    // no-show data point yet.
    const attendanceRecorded = scoped.filter(e => e.is_no_show || e.checked_in_at);
    const noShowCount = scoped.filter(e => e.is_no_show).length;

    // Occupancy is deliberately NOT read from trip.seats_booked — that
    // field is meant to stay DB-trigger-synced from real bookings, but
    // AdminTripFormModal also exposes it as a plain editable number an
    // admin can retype by hand, so it can drift from what was actually
    // paid and booked. Recomputing straight from isBooked enquiries (the
    // same real amount_paid/cancelled_at fields already trusted everywhere
    // else on this page) means Occupancy can't silently disagree with
    // Cancellation Rate or Revenue just because someone edited a trip.
    // Deliberately NOT scoped to `scoped`/period — like the trip's real
    // seat count, this is "how full are trips right now", not "how many
    // people booked in the selected window".
    const upcomingTripIds = new Set(upcomingTrips.map(t => t.id));
    const totalSeats = upcomingTrips.reduce((sum, t) => sum + (t.total_seats || 0), 0);
    const seatsBooked = enquiries.filter(e => isBooked(e) && e.trip_id && upcomingTripIds.has(e.trip_id)).length;

    const destCounts = new Map<string, number>();
    bookedList.forEach(e => {
      const dest = (e.trip_id && destinationById.get(e.trip_id)) || e.trip_title || 'Unknown';
      destCounts.set(dest, (destCounts.get(dest) || 0) + 1);
    });
    const topDestinations = Array.from(destCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      veg, nonVeg, notSet,
      cancellationPct: pct(cancelledOfBooked, everBooked.length),
      cancelledOfBooked, everBookedCount: everBooked.length,
      noShowPct: pct(noShowCount, attendanceRecorded.length),
      noShowCount, attendanceRecordedCount: attendanceRecorded.length,
      occupancyPct: pct(seatsBooked, totalSeats),
      totalSeats, seatsBooked,
      topDestinations,
    };
  }, [scoped, enquiries, upcomingTrips, destinationById]);

  // Paid ledger rows within the selected period — the source for both the
  // trend chart and the payment-method breakdown below. Filtered on
  // paid_at (when money actually moved), not the enquiry's created_at, and
  // restricted to status === 'paid' so pending/uncollected invoice rows
  // (see the Payment interface's status field) don't get counted as
  // revenue before they've actually been collected.
  const paidInPeriod = useMemo(
    () => payments.filter(p => p.status === 'paid' && withinPeriod(p.paid_at, period)),
    [payments, period]
  );

  const revenueTrend = useMemo(() => buildRevenueTrend(paidInPeriod, period), [paidInPeriod, period]);

  const sourceBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; booked: number }>();
    scoped.forEach(e => {
      const entry = map.get(e.source) || { total: 0, booked: 0 };
      entry.total += 1;
      if (isBooked(e)) entry.booked += 1;
      map.set(e.source, entry);
    });
    return Array.from(map.entries())
      .map(([source, v]) => ({
        source,
        label: SOURCE_LABELS[source as Enquiry['source']] || source,
        total: v.total,
        booked: v.booked,
        conversionPct: pct(v.booked, v.total),
      }))
      .sort((a, b) => b.total - a.total);
  }, [scoped]);

  const paymentMethodBreakdown = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    paidInPeriod.forEach(p => {
      const key = p.payment_method || 'Not specified';
      const entry = map.get(key) || { amount: 0, count: 0 };
      entry.amount += p.amount;
      entry.count += 1;
      map.set(key, entry);
    });
    const totalAmount = paidInPeriod.reduce((sum, p) => sum + p.amount, 0);
    return Array.from(map.entries())
      .map(([method, v]) => ({ method, amount: v.amount, count: v.count, sharePct: pct(v.amount, totalAmount) }))
      .sort((a, b) => b.amount - a.amount);
  }, [paidInPeriod]);

  // Per-trip rollup — same real-booking derivation as Occupancy above
  // (isBooked, not trip.seats_booked), so this table and the top-level
  // Occupancy card can never disagree about how full a given trip is.
  // Deliberately business-wide (all enquiries), not `scoped` — a trip's
  // collected/pending/occupancy is its current standing regardless of when
  // each individual booking came in, same reasoning as Occupancy itself.
  const tripBreakdown = useMemo(() => {
    return upcomingTrips
      .map(t => {
        const tripEnquiries = enquiries.filter(e => e.trip_id === t.id && isBooked(e));
        const collected = tripEnquiries.reduce((sum, e) => sum + (e.amount_paid || 0), 0);
        const pendingAmt = tripEnquiries
          .filter(e => e.total_amount)
          .reduce((sum, e) => sum + Math.max(0, (e.total_amount || 0) - (e.amount_paid || 0)), 0);
        return {
          id: t.id,
          title: t.title || t.destination,
          startDate: t.start_date,
          seatsBooked: tripEnquiries.length,
          totalSeats: t.total_seats || 0,
          occupancyPct: pct(tripEnquiries.length, t.total_seats || 0),
          collected,
          pending: pendingAmt,
        };
      })
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  }, [upcomingTrips, enquiries]);

  // Same isBooked + total_amount scoping as the Outstanding Balance card
  // itself, so the two can never disagree — this is that number broken out
  // person-by-person instead of just the business-wide total.
  const outstandingByPerson = useMemo(() => {
    return scoped
      .filter(e => isBooked(e) && e.total_amount && (e.total_amount - (e.amount_paid || 0)) > 0)
      .map(e => ({
        name: e.full_name,
        trip: (e.trip_id && destinationById.get(e.trip_id)) || e.trip_title || 'Unknown',
        total: e.total_amount || 0,
        paid: e.amount_paid || 0,
        balance: Math.max(0, (e.total_amount || 0) - (e.amount_paid || 0)),
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [scoped, destinationById]);

  const handleExportCsv = () => {
    const rows: string[] = [];
    rows.push(toCsvRow(['ULAA Reports', PERIOD_OPTIONS.find(p => p.value === period)?.label || period]));
    rows.push('');
    rows.push(toCsvRow(['Lead Reports']));
    rows.push(toCsvRow(['Total Leads', lead.total]));
    rows.push(toCsvRow(['Conversion Rate %', lead.conversionPct]));
    rows.push(toCsvRow(['New', lead.newCount]));
    rows.push(toCsvRow(['Contacted', lead.contactedCount]));
    rows.push(toCsvRow(['Avg Response Time', lead.avgResponseTime]));
    rows.push('');
    rows.push(toCsvRow(['Booking Reports']));
    rows.push(toCsvRow(['Confirmed', booking.confirmed]));
    rows.push(toCsvRow(['Completed', booking.completed]));
    rows.push(toCsvRow(['Cancelled', booking.cancelled]));
    rows.push('');
    rows.push(toCsvRow(['Financial Reports (net of refunds)']));
    rows.push(toCsvRow(['Revenue', financial.revenue]));
    rows.push(toCsvRow(['Refund Amount', financial.refundAmount]));
    rows.push(toCsvRow(['Outstanding Balance', financial.outstandingBalance]));
    rows.push(toCsvRow(['Avg Booking Value', Math.round(financial.avgBookingValue)]));
    rows.push('');
    rows.push(toCsvRow(['Operational Reports']));
    rows.push(toCsvRow(['Occupancy %', operational.occupancyPct]));
    rows.push(toCsvRow(['Seats Booked', operational.seatsBooked]));
    rows.push(toCsvRow(['Total Seats', operational.totalSeats]));
    rows.push(toCsvRow(['Cancellation Rate %', operational.cancellationPct]));
    rows.push(toCsvRow(['No-Show Rate %', operational.noShowPct]));
    rows.push('');
    rows.push(toCsvRow(['Lead Source Breakdown']));
    rows.push(toCsvRow(['Source', 'Total Leads', 'Booked', 'Conversion %']));
    sourceBreakdown.forEach(s => rows.push(toCsvRow([s.label, s.total, s.booked, s.conversionPct])));
    rows.push('');
    rows.push(toCsvRow(['Payment Method Breakdown']));
    rows.push(toCsvRow(['Method', 'Amount', 'Transactions', 'Share %']));
    paymentMethodBreakdown.forEach(m => rows.push(toCsvRow([m.method, m.amount, m.count, m.sharePct])));
    rows.push('');
    rows.push(toCsvRow(['Per-Trip Breakdown']));
    rows.push(toCsvRow(['Trip', 'Start Date', 'Seats Booked', 'Total Seats', 'Occupancy %', 'Collected', 'Pending']));
    tripBreakdown.forEach(t => rows.push(toCsvRow([t.title, t.startDate, t.seatsBooked, t.totalSeats, t.occupancyPct, t.collected, t.pending])));
    rows.push('');
    rows.push(toCsvRow(['Outstanding Balances by Person']));
    rows.push(toCsvRow(['Name', 'Trip', 'Total Amount', 'Paid So Far', 'Balance']));
    outstandingByPerson.forEach(p => rows.push(toCsvRow([p.name, p.trip, p.total, p.paid, p.balance])));
    downloadCsv(`ulaa-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <AdminLayout title="Reports">
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-dark-muted text-sm">
            Business-wide rollups across Lead, Booking, Financial and Operational activity.
          </p>
          <div className="flex gap-2 shrink-0 items-center">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                aria-pressed={period === opt.value}
                className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                  period === opt.value ? 'bg-primary text-white' : 'bg-white text-dark-muted shadow-card hover:text-dark'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {!loading && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap bg-white text-dark-muted shadow-card hover:text-dark transition-colors"
              >
                <Download size={14} aria-hidden="true" /> Export CSV
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p role="status" className="text-dark-muted text-sm py-12 text-center">Loading reports…</p>
        ) : (
          <>
            {/* ---- Lead Reports ---- */}
            <ReportSection title="Lead Reports" subtitle={`${lead.total} lead${lead.total === 1 ? '' : 's'} in range`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard label="Conversion Rate" value={`${lead.conversionPct}%`} sub={`${lead.bookedCount} of ${lead.total} booked`} icon={TrendingUp} />
                <StatCard label="New" value={lead.newCount} icon={Users} />
                <StatCard label="Contacted" value={lead.contactedCount} icon={Phone} />
                <StatCard label="Avg. Response Time" value={lead.avgResponseTime} sub="Enquiry → first contact" icon={Clock} />
              </div>

              {lead.closedBreakdown.length > 0 && (
                <div className="bg-white border border-background-warm rounded-lg px-4 py-3 mt-3">
                  <p className="text-[11px] font-button font-bold text-dark-muted uppercase tracking-wide mb-2">
                    Closed Reasons ({lead.closedCount} closed)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lead.closedBreakdown.map(r => (
                      <span key={r.label} className="inline-flex items-center gap-1.5 text-xs font-button font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-dark-muted">
                        {r.label} <span className="text-dark">{r.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sourceBreakdown.length > 0 && (
                <div className="bg-white rounded-lg shadow-card p-4 mt-3">
                  <p className="text-[11px] font-button font-bold text-dark-muted uppercase tracking-wide mb-3">
                    Lead Source Breakdown
                  </p>
                  <div className="space-y-2.5">
                    {sourceBreakdown.map(s => {
                      const max = sourceBreakdown[0].total || 1;
                      return (
                        <div key={s.source} className="flex items-center gap-3">
                          <span className="text-sm text-dark font-medium truncate flex-1 min-w-0">{s.label}</span>
                          <div className="hidden sm:block w-28 h-1.5 rounded-full bg-background-warm overflow-hidden shrink-0">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(6, (s.total / max) * 100)}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-dark w-6 text-right shrink-0">{s.total}</span>
                          <span className="text-xs text-dark-muted w-28 text-right shrink-0">{s.booked} booked ({s.conversionPct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ReportSection>

            {/* ---- Booking Reports ---- */}
            <ReportSection title="Booking Reports">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <StatCard label="Confirmed" value={booking.confirmed} sub="Currently at this stage" icon={BadgeCheck} />
                <StatCard label="Completed" value={booking.completed} icon={PartyPopper} />
                <StatCard label="Cancelled" value={booking.cancelled} icon={CalendarX2} />
              </div>
            </ReportSection>

            {/* ---- Financial Reports ---- */}
            <ReportSection title="Financial Reports" subtitle="Net of refunds">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard label="Revenue" value={formatPrice(financial.revenue)} icon={IndianRupee} />
                <StatCard label="Refund Amount" value={formatPrice(financial.refundAmount)} icon={Undo2} />
                <StatCard label="Outstanding Balance" value={formatPrice(financial.outstandingBalance)} sub="Active bookings only" icon={Wallet} />
                <StatCard label="Avg. Booking Value" value={formatPrice(Math.round(financial.avgBookingValue))} icon={Wallet2} />
              </div>

              <div className="bg-white rounded-lg shadow-card p-4 mt-3">
                <p className="text-[11px] font-button font-bold text-dark-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <BarChart3 size={13} aria-hidden="true" /> Collected Over Time
                </p>
                <RevenueTrendChart data={revenueTrend} />
              </div>

              {paymentMethodBreakdown.length > 0 && (
                <div className="bg-white rounded-lg shadow-card p-4 mt-3">
                  <p className="text-[11px] font-button font-bold text-dark-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <CreditCard size={13} aria-hidden="true" /> Collection by Payment Method
                  </p>
                  <div className="space-y-2.5">
                    {paymentMethodBreakdown.map(m => {
                      const max = paymentMethodBreakdown[0].amount || 1;
                      return (
                        <div key={m.method} className="flex items-center gap-3">
                          <span className="text-sm text-dark font-medium truncate flex-1 min-w-0 capitalize">{m.method}</span>
                          <div className="hidden sm:block w-28 h-1.5 rounded-full bg-background-warm overflow-hidden shrink-0">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(6, (m.amount / max) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-dark-muted w-10 text-right shrink-0">{m.count}×</span>
                          <span className="text-sm font-semibold text-dark w-24 text-right shrink-0">{formatPrice(m.amount)}</span>
                          <span className="text-xs text-dark-muted w-10 text-right shrink-0">{m.sharePct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ReportSection>

            {/* ---- Operational Reports ---- */}
            <ReportSection title="Operational Reports">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard label="Occupancy" value={`${operational.occupancyPct}%`} sub={`${operational.seatsBooked} of ${operational.totalSeats} seats · upcoming trips`} icon={PieChart} />
                <StatCard label="Cancellation Rate" value={`${operational.cancellationPct}%`} sub={`${operational.cancelledOfBooked} of ${operational.everBookedCount} bookings`} icon={XCircle} />
                <StatCard label="No-Show Rate" value={`${operational.noShowPct}%`} sub={`${operational.noShowCount} of ${operational.attendanceRecordedCount} arrivals tracked`} icon={UserX} />
                <StatCard label="Food Preference" value={`${operational.veg}V / ${operational.nonVeg}NV`} sub={operational.notSet ? `${operational.notSet} not set` : 'Booked travellers'} icon={UtensilsCrossed} />
              </div>

              {operational.topDestinations.length > 0 && (
                <div className="bg-white rounded-lg shadow-card p-4 mt-3">
                  <p className="text-[11px] font-button font-bold text-dark-muted uppercase tracking-wide mb-3">
                    Top Destinations
                  </p>
                  <div className="space-y-2.5">
                    {operational.topDestinations.map((d, i) => {
                      const max = operational.topDestinations[0].count || 1;
                      return (
                        <div key={d.label} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-dark-muted w-4 shrink-0">{i + 1}</span>
                          <MapPin size={14} className="text-primary shrink-0" aria-hidden="true" />
                          <span className="text-sm text-dark font-medium truncate flex-1 min-w-0">{d.label}</span>
                          <div className="hidden sm:block w-28 h-1.5 rounded-full bg-background-warm overflow-hidden shrink-0">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(6, (d.count / max) * 100)}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-dark w-6 text-right shrink-0">{d.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ReportSection>

            {/* ---- Per-Trip Breakdown ---- */}
            {tripBreakdown.length > 0 && (
              <ReportSection title="Per-Trip Breakdown" subtitle="Upcoming trips · current standing">
                <div className="bg-white rounded-lg shadow-card overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-background-warm text-left">
                        <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide">
                          <span className="inline-flex items-center gap-1.5"><Compass size={13} aria-hidden="true" /> Trip</span>
                        </th>
                        <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide text-right">Seats</th>
                        <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide text-right">Occupancy</th>
                        <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide text-right">Collected</th>
                        <th className="px-4 py-2.5 font-button font-bold text-dark-muted text-xs uppercase tracking-wide text-right">Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripBreakdown.map(t => (
                        <tr key={t.id} className="border-b border-background-warm last:border-0 hover:bg-background-warm/30">
                          <td className="px-4 py-2.5 text-dark font-medium truncate max-w-[220px]">{t.title}</td>
                          <td className="px-4 py-2.5 text-dark-muted text-right whitespace-nowrap">{t.seatsBooked}/{t.totalSeats}</td>
                          <td className="px-4 py-2.5 text-dark font-semibold text-right">{t.occupancyPct}%</td>
                          <td className="px-4 py-2.5 text-green-700 font-semibold text-right whitespace-nowrap">{formatPrice(t.collected)}</td>
                          <td className="px-4 py-2.5 text-amber-600 font-semibold text-right whitespace-nowrap">{formatPrice(t.pending)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ReportSection>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
