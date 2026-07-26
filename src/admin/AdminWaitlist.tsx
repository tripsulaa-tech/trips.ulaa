import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, Mail, Phone, MessageSquare, Users, Bell, CheckCircle2, XCircle, Circle, PartyPopper } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Select from '../components/ui/Select';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { getWaitlistEntries, updateWaitlistStatus, deleteWaitlistEntry, getAllUpcomingTripsAdmin } from '../services/api';
import { formatDate, seatsLeft } from '../utils';
import type { WaitlistEntry } from '../types';

const STATUS_CONFIG = {
  waiting: { label: 'Waiting', color: 'bg-amber-100 text-amber-700', icon: Circle },
  notified: { label: 'Notified', color: 'bg-blue-100 text-blue-700', icon: Bell },
  converted: { label: 'Converted', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700', icon: XCircle },
} as const;

const STATUS_OPTIONS = (Object.keys(STATUS_CONFIG) as WaitlistEntry['status'][]).map(key => ({
  value: key,
  label: STATUS_CONFIG[key].label,
}));

export default function AdminWaitlist() {
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [seatsAvailable, setSeatsAvailable] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | WaitlistEntry['status']>('all');
  const [tripFilter, setTripFilter] = useState<string>(searchParams.get('trip') || 'all');

  const load = () => {
    Promise.all([getWaitlistEntries(), getAllUpcomingTripsAdmin()])
      .then(([waitlistData, trips]) => {
        setEntries(waitlistData);
        const map: Record<string, number> = {};
        trips.forEach(t => { map[t.id] = seatsLeft(t.total_seats, t.seats_booked); });
        setSeatsAvailable(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Clear the ?trip= param from the URL once we've picked it up, so it
  // doesn't stick around after the admin changes the filter manually.
  useEffect(() => {
    if (searchParams.get('trip')) {
      setSearchParams(params => { params.delete('trip'); return params; }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const trips = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach(e => map.set(e.trip_id, e.trip_title || 'Untitled trip'));
    return Array.from(map.entries()).map(([id, title]) => ({ value: id, label: title }));
  }, [entries]);

  const hasSeatOpen = (e: WaitlistEntry) => e.status === 'waiting' && (seatsAvailable[e.trip_id] ?? 0) > 0;

  const filtered = entries
    .filter(e => statusFilter === 'all' || e.status === statusFilter)
    .filter(e => tripFilter === 'all' || e.trip_id === tripFilter)
    // Waiting entries whose trip now has an open seat bubble to the top —
    // these are the ones that need action right now.
    .sort((a, b) => Number(hasSeatOpen(b)) - Number(hasSeatOpen(a)));

  const seatOpenCount = entries.filter(hasSeatOpen).length;

  const counts = {
    all: entries.length,
    waiting: entries.filter(e => e.status === 'waiting').length,
    notified: entries.filter(e => e.status === 'notified').length,
    converted: entries.filter(e => e.status === 'converted').length,
    declined: entries.filter(e => e.status === 'declined').length,
  };

  const handleStatusChange = async (id: string, status: WaitlistEntry['status']) => {
    setUpdating(id);
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, status } : e)));
    await updateWaitlistStatus(id, status).catch(console.error);
    setUpdating(null);
  };

  const handleDelete = async (entry: WaitlistEntry) => {
    if (!(await confirm({ message: `Remove ${entry.full_name} from the waitlist?`, confirmLabel: 'Remove' }))) return;
    setUpdating(entry.id);
    await deleteWaitlistEntry(entry.id).catch(console.error);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
    setUpdating(null);
  };

  return (
    <AdminLayout title="Waitlist" subtitle="Everyone who signed up to be notified when a sold-out trip frees a seat.">
      <div className="space-y-6">
        {/* Actionable banner — seats open for people still waiting */}
        {seatOpenCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3"
          >
            <PartyPopper size={18} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-800">
              <span className="font-semibold">
                {seatOpenCount} {seatOpenCount === 1 ? 'person is' : 'people are'} waiting
              </span>{' '}
              on a trip that now has an open seat — sorted to the top below.
            </p>
          </motion.div>
        )}

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {(['all', 'waiting', 'notified', 'converted', 'declined'] as const).map(key => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                statusFilter === key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background text-dark-muted border-background-warm hover:border-primary/50'
              }`}
            >
              {key === 'all' ? 'All' : STATUS_CONFIG[key].label}
              <span className={statusFilter === key ? 'text-white/80' : 'text-dark-muted/70'}>
                · {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* Trip filter */}
        {trips.length > 0 && (
          <div className="flex items-center gap-2">
            <Users size={14} className="text-dark-muted shrink-0" />
            <Select
              value={tripFilter}
              onChange={setTripFilter}
              options={[{ value: 'all', label: 'All trips' }, ...trips]}
              size="sm"
              className="max-w-xs"
            />
          </div>
        )}

        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <p className="font-display text-xl text-dark-muted">No waitlist signups found.</p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden sm:block bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-sm">
                  <thead className="bg-background-warm text-dark font-medium">
                    <tr>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left hidden lg:table-cell">Trip</th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">Contact</th>
                      <th className="px-4 py-3 text-left hidden lg:table-cell">Joined</th>
                      <th className="px-2 py-3 text-right whitespace-nowrap">Status</th>
                      <th className="px-2 py-3 text-right whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-background-warm">
                    {filtered.map(e => (
                      <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                        <td className="px-4 py-3 max-w-[160px] sm:max-w-none">
                          <p className="font-medium text-dark truncate">{e.full_name}</p>
                          <p className="text-dark-muted text-xs truncate md:hidden">{e.email}</p>
                          {e.message && (
                            <p className="text-dark-muted text-xs mt-1 flex items-start gap-1 max-w-xs">
                              <MessageSquare size={11} className="shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{e.message}</span>
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-dark-muted hidden lg:table-cell max-w-[180px]">
                          <p className="truncate">{e.trip_title || '—'}</p>
                          {hasSeatOpen(e) && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                              <PartyPopper size={10} className="shrink-0" />
                              {seatsAvailable[e.trip_id]} seat{seatsAvailable[e.trip_id] === 1 ? '' : 's'} open
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-dark-muted hidden md:table-cell">
                          <p className="flex items-center gap-1 text-xs"><Mail size={11} className="shrink-0" /> {e.email}</p>
                          <p className="flex items-center gap-1 text-xs mt-0.5"><Phone size={11} className="shrink-0" /> {e.phone}</p>
                        </td>
                        <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">
                          {formatDate(e.created_at, { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <Select
                            value={e.status}
                            disabled={updating === e.id}
                            onChange={val => handleStatusChange(e.id, val as WaitlistEntry['status'])}
                            options={STATUS_OPTIONS}
                            size="sm"
                          />
                        </td>
                        <td className="px-2 py-3 text-right">
                          <button
                            onClick={() => handleDelete(e)}
                            disabled={updating === e.id}
                            title="Remove from waitlist"
                            aria-label="Remove from waitlist"
                            className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {filtered.map(e => {
                const cfg = STATUS_CONFIG[e.status];
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-2xl shadow-card p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-dark truncate">{e.full_name}</p>
                        <p className="text-dark-muted text-xs truncate">{e.trip_title || 'Untitled trip'}</p>
                        {hasSeatOpen(e) && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                            <PartyPopper size={10} className="shrink-0" />
                            {seatsAvailable[e.trip_id]} seat{seatsAvailable[e.trip_id] === 1 ? '' : 's'} open
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                        <cfg.icon size={11} className="shrink-0" />
                        {cfg.label}
                      </span>
                    </div>

                    <div className="text-xs text-dark-muted space-y-1">
                      <p className="flex items-center gap-1.5"><Mail size={12} className="shrink-0" /> {e.email}</p>
                      <p className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {e.phone}</p>
                      <p>{formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      {e.message && (
                        <p className="flex items-start gap-1.5 mt-1.5">
                          <MessageSquare size={12} className="shrink-0 mt-0.5" />
                          <span>{e.message}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Select
                        value={e.status}
                        disabled={updating === e.id}
                        onChange={val => handleStatusChange(e.id, val as WaitlistEntry['status'])}
                        options={STATUS_OPTIONS}
                        size="sm"
                        className="flex-1"
                      />
                      <button
                        onClick={() => handleDelete(e)}
                        disabled={updating === e.id}
                        aria-label="Remove from waitlist"
                        className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
