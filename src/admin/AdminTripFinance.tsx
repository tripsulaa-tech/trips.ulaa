import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, MagnifyingGlass, PencilSimple } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import TripFinanceBreakdown from './trips/TripFinanceBreakdown';
import TripPricingSummary from './trips/TripPricingSummary';
import TripFinanceEditor from './trips/TripFinanceEditor';
import TripPricingEditor from './trips/TripPricingEditor';
import { pricingDraftFrom, pricingFromDraft, type PricingDraft } from './trips/tripPricingDraft';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { isBooked } from './enquiries/AdminEnquiriesShared';
import {
  getEnquiries,
  getAllUpcomingTripsAdmin,
  getAllCompletedTripsAdmin,
  getTripFinanceSnapshots,
  freezeTripFinance,
  updateUpcomingTrip,
  saveTripFinanceSnapshot,
} from '../services/api';
import { computeTripFinanceSummary, emptyTripFinance, foldLegacyCosts } from '../utils/tripFinance';
import { countOptionSelections } from '../utils/tripOptions';
import { formatDate, formatPrice } from '../utils/utils-index';
import { scrollToTextMatch } from '../utils/scroll';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import type {
  CompletedTrip,
  Enquiry,
  TripFinance,
  TripFinanceSnapshot,
  TripPricingSnapshot,
  TripRevenueSnapshot,
  UpcomingTrip,
} from '../types/types-index';

type StatusFilter = 'all' | 'upcoming' | 'completed';

interface TripFinanceRow {
  id: string;
  title: string;
  destination: string;
  date: string;
  status: 'upcoming' | 'completed';
  finance: TripFinance | null;
  pricing: TripPricingSnapshot | null;
  revenue: TripRevenueSnapshot | null;
  summary: ReturnType<typeof computeTripFinanceSummary> | null;
  totalSeats: number | null;
  seatsBooked: number | null;
  // false once the upcoming trip is gone: pricing & seats are then edited here
  // and kept in the saved copy.
  hasUpcomingRow: boolean;
  // true = numbers come from the trip's live data; false = the saved copy
  // kept in trip_finance_snapshots (the upcoming trip no longer exists).
  live: boolean;
  capturedAt?: string;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const pricingFromTrip = (t: UpcomingTrip): TripPricingSnapshot => ({
  price: t.price ?? null,
  early_bird_price: t.early_bird_price ?? null,
  early_bird_deadline: t.early_bird_deadline ?? null,
  strike_through_price: t.strike_through_price ?? null,
  advance_amount: t.advance_amount ?? null,
  special_offer_name: t.special_offer_name ?? null,
  special_offer_price: t.special_offer_price ?? null,
  special_offer_date: t.special_offer_date ?? null,
  special_offer_end_date: t.special_offer_end_date ?? null,
  trip_options: t.trip_options ?? null,
});

/** Finds a typed value (e.g. a cost line named "Food") in the dialog's inputs and scrolls to it. */
function scrollToInputValue(container: HTMLElement, query: string): boolean {
  const q = query.trim().toLowerCase();
  const match = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    .find(el => el.type !== 'number' && el.value.toLowerCase().includes(q));
  if (!match) return false;
  const box = container.getBoundingClientRect();
  const at = match.getBoundingClientRect();
  container.scrollTo({ top: container.scrollTop + (at.top - box.top) - container.clientHeight / 2 + match.clientHeight / 2, behavior: 'smooth' });
  const prev = match.style.backgroundColor;
  match.style.transition = 'background-color 0.3s ease';
  match.style.backgroundColor = '#FDE9D9';
  window.setTimeout(() => { match.style.backgroundColor = prev; }, 1500);
  return true;
}

const fmtDate = (d: string) => formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' });

function buildRows(
  upcoming: UpcomingTrip[],
  completed: CompletedTrip[],
  snapshots: TripFinanceSnapshot[],
  enquiries: Enquiry[],
): TripFinanceRow[] {
  const today = todayLocal();
  const upById = new Map(upcoming.map(t => [t.id, t]));
  const doneById = new Map(completed.map(t => [t.id, t]));
  const snapById = new Map(snapshots.map(s => [s.trip_id, s]));
  const ids = new Set<string>([...upById.keys(), ...doneById.keys(), ...snapById.keys()]);

  const rows: TripFinanceRow[] = [];
  ids.forEach(id => {
    const up = upById.get(id);
    const done = doneById.get(id);
    const snap = snapById.get(id);

    const bookings = enquiries.filter(e => e.trip_id === id && isBooked(e));
    const liveRevenue: TripRevenueSnapshot = {
      bookedCount: bookings.length,
      totalRevenue: bookings.reduce((sum, e) => sum + (e.total_amount || 0), 0),
      childFareCount: bookings.filter(e => e.has_child_addon).length,
      optionCounts: countOptionSelections(bookings),
    };

    // Live data wins while the upcoming trip (or its bookings) still exist;
    // the saved copy takes over once they are gone.
    const live = !!up || bookings.length > 0 || !snap;
    const revenue = live ? liveRevenue : snap?.trip_revenue ?? liveRevenue;
    const finance = (up ? up.trip_finance : snap?.trip_finance) ?? null;
    const pricing = up ? pricingFromTrip(up) : snap?.trip_pricing ?? null;
    const date = up?.start_date ?? done?.trip_date ?? snap?.trip_date ?? '';
    const status: TripFinanceRow['status'] = done || (date && date <= today) ? 'completed' : 'upcoming';

    rows.push({
      id,
      title: up?.title ?? done?.title ?? snap?.title ?? 'Untitled trip',
      destination: up?.destination ?? done?.destination ?? snap?.destination ?? '',
      date,
      status,
      finance,
      pricing,
      revenue,
      summary: finance
        ? computeTripFinanceSummary(finance, revenue.bookedCount, revenue.totalRevenue, revenue.childFareCount, revenue.optionCounts)
        : null,
      totalSeats: up?.total_seats ?? snap?.total_seats ?? null,
      seatsBooked: up?.seats_booked ?? snap?.seats_booked ?? null,
      hasUpcomingRow: !!up,
      live,
      capturedAt: snap?.captured_at,
    });
  });

  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** Admin → Trips → Trip Finance. One place for every trip's Finances & Profit
 *  and Pricing — upcoming and completed — so the numbers don't disappear once
 *  a trip has finished and its upcoming-trip row is gone. */
export default function AdminTripFinance() {
  const [upcoming, setUpcoming] = useState<UpcomingTrip[]>([]);
  const [completed, setCompleted] = useState<CompletedTrip[]>([]);
  const [snapshots, setSnapshots] = useState<TripFinanceSnapshot[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TripFinance>(emptyTripFinance);
  const [pricingDraft, setPricingDraft] = useState<PricingDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // "Search fields" box in the Add/Edit finances dialog, same idea as the Edit Trip dialog's.
  const [modalSearch, setModalSearch] = useState('');
  const [modalSearchNoMatch, setModalSearchNoMatch] = useState(false);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [enq, up, done, snaps] = await Promise.all([
          getEnquiries(),
          getAllUpcomingTripsAdmin(),
          getAllCompletedTripsAdmin(),
          getTripFinanceSnapshots().catch(() => null),
        ]);
        if (cancelled) return;
        setEnquiries(enq);
        setUpcoming(up);
        setCompleted(done);
        setSnapshots(snaps ?? []);
        setNeedsMigration(snaps === null);
        setLoading(false);

        // Keep the saved copy of every started trip fresh while its upcoming
        // trip still exists, so the last look before deletion is the final one.
        if (snaps !== null) {
          const today = todayLocal();
          for (const t of up.filter(x => x.start_date && x.start_date <= today)) {
            if (cancelled) return;
            try { await freezeTripFinance(t.id); } catch { break; }
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => buildRows(upcoming, completed, snapshots, enquiries), [upcoming, completed, snapshots, enquiries]);
  const editingRow = rows.find(r => r.id === editingId) ?? null;

  const openEdit = (row: TripFinanceRow) => {
    setDraft(foldLegacyCosts(row.finance ?? emptyTripFinance));
    // A finished trip's pricing, seats and packages live only here.
    setPricingDraft(row.hasUpcomingRow ? null : pricingDraftFrom(row.pricing, row.totalSeats, row.seatsBooked ?? row.revenue?.bookedCount ?? null));
    setSaveError('');
    setModalSearch('');
    setModalSearchNoMatch(false);
    setEditingId(row.id);
  };

  // Upcoming trip still exists -> its own trip_finance is the source of truth
  // (same field the Edit Trip modal writes), and the saved copy is refreshed
  // from it. Otherwise (trip already finished) the saved copy IS the record.
  const saveEdit = async () => {
    if (!editingRow) return;
    setSaving(true);
    setSaveError('');
    try {
      const up = upcoming.find(t => t.id === editingRow.id);
      if (up) {
        await updateUpcomingTrip(up.id, { trip_finance: draft });
        await freezeTripFinance(up.id).catch(() => {});
        setUpcoming(prev => prev.map(t => (t.id === up.id ? { ...t, trip_finance: draft } : t)));
      } else {
        await saveTripFinanceSnapshot({
          trip_id: editingRow.id,
          title: editingRow.title,
          destination: editingRow.destination || null,
          trip_date: editingRow.date || null,
          trip_finance: draft,
          ...(pricingDraft ? pricingFromDraft(pricingDraft) : {}),
          // A trip with no saved copy yet gets its revenue recorded now.
          ...(snapshots.some(sn => sn.trip_id === editingRow.id) ? {} : { trip_revenue: editingRow.revenue }),
        });
        setSnapshots(await getTripFinanceSnapshots());
      }
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setSaveError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // Jumps to the first matching section, field label or typed cost-line name as the admin types.
  useEffect(() => {
    if (!editingId) return;
    const timeout = window.setTimeout(() => {
      const query = modalSearch.trim();
      const container = modalBodyRef.current;
      if (!query || !container) {
        setModalSearchNoMatch(false);
        return;
      }
      setModalSearchNoMatch(!(scrollToTextMatch(container, query, 'label, h4, h5') || scrollToInputValue(container, query)));
    }, modalSearch.trim() ? 350 : 0);
    return () => window.clearTimeout(timeout);
  }, [modalSearch, editingId]);

  const counts = useMemo(() => ({
    all: rows.length,
    upcoming: rows.filter(r => r.status === 'upcoming').length,
    completed: rows.filter(r => r.status === 'completed').length,
  }), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (filter === 'all' || r.status === filter) &&
      (!q || `${r.title} ${r.destination}`.toLowerCase().includes(q)));
  }, [rows, filter, search]);

  const totals = useMemo(() => visible.reduce(
    (acc, r) => r.summary
      ? { revenue: acc.revenue + r.summary.totalRevenue, costs: acc.costs + r.summary.totalCosts, profit: acc.profit + r.summary.netProfit, trips: acc.trips + 1 }
      : acc,
    { revenue: 0, costs: 0, profit: 0, trips: 0 },
  ), [visible]);
  const margin = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 100) : 0;

  const kpis = [
    { label: 'Total Revenue', value: formatPrice(totals.revenue) },
    { label: 'Total Costs', value: formatPrice(totals.costs) },
    { label: 'Net Profit', value: formatPrice(totals.profit), tone: totals.profit >= 0 ? 'text-green-700' : 'text-red-600' },
    { label: 'Profit Margin', value: `${margin}%`, tone: totals.profit >= 0 ? 'text-green-700' : 'text-red-600' },
  ];

  const filters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <AdminLayout title="Trip Finance" scrollRestorationReady={!loading}>
      <div className="space-y-5">
        {needsMigration && (
          <div role="alert" className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
            Finance is not being saved after trips complete yet. Run <span className="font-mono">supabase/migration/add_trip_finance_snapshots.sql</span> once in the Supabase SQL Editor. Until then this tab only shows trips that still exist under Upcoming Trips.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-white rounded-lg p-4 shadow-card min-w-0">
              <p className={`font-display text-xl sm:text-2xl font-bold leading-tight truncate ${k.tone ?? 'text-dark'}`}>{k.value}</p>
              <p className="text-dark-muted text-xs font-medium truncate mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-dark-muted -mt-2">
          Totals cover the {totals.trips} {totals.trips === 1 ? 'trip' : 'trips'} below that have finances entered.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-1.5" role="group" aria-label="Filter by trip status">
            {filters.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === f.id ? 'bg-primary text-white' : 'bg-white text-dark-muted hover:text-dark shadow-card'
                }`}
              >
                {f.label} <span className="opacity-70">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-72">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted" aria-hidden="true" />
            <label htmlFor="trip-finance-search" className="sr-only">Search trips</label>
            <input
              id="trip-finance-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search trips"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        {loading ? (
          <div role="status" className="text-center py-16 text-dark-muted">Loading...</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-dark-muted bg-white rounded-lg shadow-card">No trips to show.</div>
        ) : (
          <div className="space-y-3">
            {visible.map(r => {
              const open = openId === r.id;
              const s = r.summary;
              const profitTone = s && s.netProfit < 0 ? 'text-red-600' : 'text-green-700';
              return (
                <div key={r.id} className="bg-white rounded-lg shadow-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.id)}
                    aria-expanded={open}
                    className="w-full text-left p-4 flex items-center gap-3 hover:bg-background/60 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-dark">{r.title}</span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${r.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
                          {r.status === 'completed' ? 'Completed' : 'Upcoming'}
                        </span>
                      </div>
                      <p className="text-xs text-dark-muted truncate">
                        {[r.destination, r.date ? fmtDate(r.date) : ''].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {s ? (
                      <>
                        <div className="hidden md:grid grid-cols-3 gap-8 text-right">
                          <div><p className="text-sm text-dark">{formatPrice(s.totalRevenue)}</p><p className="text-[11px] text-dark-muted">Revenue</p></div>
                          <div><p className="text-sm text-dark">{formatPrice(s.totalCosts)}</p><p className="text-[11px] text-dark-muted">Costs</p></div>
                          <div><p className={`text-sm font-semibold ${profitTone}`}>{formatPrice(s.netProfit)}</p><p className="text-[11px] text-dark-muted">Net profit</p></div>
                        </div>
                        <div className="md:hidden text-right">
                          <p className={`text-sm font-semibold ${profitTone}`}>{formatPrice(s.netProfit)}</p>
                          <p className="text-[11px] text-dark-muted">Net profit</p>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-dark-muted text-right">No finances entered</span>
                    )}
                    <CaretDown size={16} className={`flex-shrink-0 text-dark-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>

                  {open && (
                    <div className="border-t border-background-warm p-4 grid gap-4 lg:grid-cols-2">
                      <section>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="text-xs font-medium text-dark-muted">Finances & Profit <span className="text-dark-muted/70">(internal only)</span></h3>
                          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                            <PencilSimple size={14} aria-hidden="true" /> {r.finance ? 'Edit finances' : 'Add finances'}
                          </Button>
                        </div>
                        <div className="bg-background rounded-md p-3 space-y-1.5 text-sm">
                          {r.finance && s
                            ? <TripFinanceBreakdown finance={r.finance} summary={s} />
                            : <p className="text-dark-muted">No finances were entered for this trip.</p>}
                        </div>
                      </section>
                      <section>
                        <h3 className="text-xs font-medium text-dark-muted mb-2">Pricing</h3>
                        <div className="bg-background rounded-md p-3 space-y-1.5 text-sm">
                          {r.pricing
                            ? <TripPricingSummary pricing={r.pricing} totalSeats={r.totalSeats} optionCounts={r.revenue?.optionCounts} />
                            : <p className="text-dark-muted">No pricing was saved for this trip.</p>}
                        </div>
                      </section>
                      <p className="lg:col-span-2 text-xs text-dark-muted">
                        {r.live
                          ? 'Live — updates as bookings, costs and prices change.'
                          : `Saved copy${r.capturedAt ? ` from ${fmtDate(r.capturedAt)}` : ''} — kept after the upcoming trip was removed.`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!editingRow}
        onClose={() => !saving && setEditingId(null)}
        title={editingRow ? `${pricingDraft ? 'Pricing, Finances & Profit' : 'Finances & Profit'} — ${editingRow.title}` : 'Finances & Profit'}
        size="2xl"
        mobileFullScreen
        compactHeader
        bodyRef={modalBodyRef}
        headerContent={
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="finance-field-search" className="sr-only">Search fields</label>
            <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              id="finance-field-search"
              type="text"
              value={modalSearch}
              onChange={e => setModalSearch(e.target.value)}
              placeholder="Search fields..."
              className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
        }
        footer={
          <div className="space-y-2">
            {saveError && <p role="alert" className="text-xs text-red-600">{saveError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={() => setEditingId(null)} disabled={saving}>Cancel</Button>
              <Button variant="primary" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={saveEdit} loading={saving}>Save Changes</Button>
            </div>
          </div>
        }
      >
        {modalSearchNoMatch && (
          <p role="status" className="text-xs text-red-500 -mt-2 mb-3">No matching field found for "{modalSearch}".</p>
        )}
        {editingRow && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {pricingDraft && (
              <div className="md:col-span-2 pb-4 mb-1 border-b border-background-warm">
                <TripPricingEditor value={pricingDraft} onChange={setPricingDraft} />
              </div>
            )}
            <TripFinanceEditor
              finance={draft}
              onChange={setDraft}
              options={pricingDraft ? pricingDraft.trip_options.options : editingRow.pricing?.trip_options?.options ?? []}
              revenue={editingRow.revenue}
              estimate={{ seats: 0, price: 0 }}
            />
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
