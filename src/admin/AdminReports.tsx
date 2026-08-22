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
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import { getEnquiries, getAllUpcomingTripsAdmin, getAllCompletedTripsAdmin } from '../services/api';
import type { Enquiry, UpcomingTrip, CompletedTrip } from '../types/types-index';
import { isBooked, isCancelled } from './enquiries/AdminEnquiriesShared';
import { closedReasonBreakdown, isNotInterested } from './enquiries/AdminEnquiryCommon';
import { formatPrice } from '../utils/utils-index';

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

export default function AdminReports() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [upcomingTrips, setUpcomingTrips] = useState<UpcomingTrip[]>([]);
  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');

  useEffect(() => {
    Promise.all([getEnquiries(), getAllUpcomingTripsAdmin(), getAllCompletedTripsAdmin()])
      .then(([allEnquiries, upcoming, completed]) => {
        setEnquiries(allEnquiries);
        setUpcomingTrips(upcoming);
        setCompletedTrips(completed);
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
      .filter(e => !isCancelled(e) && e.total_amount)
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

    const totalSeats = upcomingTrips.reduce((sum, t) => sum + (t.total_seats || 0), 0);
    const seatsBooked = upcomingTrips.reduce((sum, t) => sum + (t.seats_booked || 0), 0);

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
  }, [scoped, upcomingTrips, destinationById]);

  return (
    <AdminLayout title="Reports">
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-dark-muted text-sm">
            Business-wide rollups across Lead, Booking, Financial and Operational activity.
          </p>
          <div className="flex gap-2 shrink-0">
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
          </>
        )}
      </div>
    </AdminLayout>
  );
}
