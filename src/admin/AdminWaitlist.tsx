import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, Mail, Phone, MessageSquare, Users, Bell, CheckCircle2, XCircle, Circle, PartyPopper, UserPlus, Search, X, ChevronDown, SlidersHorizontal, RefreshCw } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Select from '../components/ui/Select';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { getWaitlistEntries, updateWaitlistStatus, deleteWaitlistEntry, getAllUpcomingTripsAdmin, getEnquiries } from '../services/api';
import { formatDate, seatsLeft } from '../utils';
import type { WaitlistEntry } from '../types';

const STATUS_CONFIG = {
  waiting: { label: 'Waiting', color: 'bg-amber-100 text-amber-700', icon: Circle },
  notified: { label: 'Notified', color: 'bg-blue-100 text-blue-700', icon: Bell },
  converted: { label: 'Converted', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700', icon: XCircle },
} as const;

// 'converted' is deliberately excluded here — it's never manually
// selectable. It's only ever set by the app itself once a linked enquiry
// with an actual advance payment exists (see AdminEnquiries.handleSave /
// markWaitlistConverted). The DB trigger enforces this too, but the point
// is to not even offer the option that led to the bug in the first place.
const EDITABLE_STATUS_OPTIONS = (['waiting', 'notified', 'declined'] as const).map(key => ({
  value: key,
  label: STATUS_CONFIG[key].label,
}));

// Shared dropdown menu used by every filter box in the filter bar — a
// vertical list of options with counts, the selected one highlighted.
// Mirrors the one on the Enquiries page so both filter bars look and
// behave the same way.
function FilterDropdown<T extends string>({
  options,
  value,
  onSelect,
  align = 'left',
}: {
  options: { key: T; label: string; count: number }[];
  value: T;
  onSelect: (key: T) => void;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-full sm:w-52 bg-white rounded-xl shadow-warm-lg border border-background-warm py-1.5 z-30 max-h-72 overflow-y-auto`}
    >
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => onSelect(opt.key)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-button text-left transition-colors ${
            value === opt.key ? 'bg-primary/10 text-primary font-semibold' : 'text-dark-muted hover:bg-background-warm'
          }`}
        >
          <span className="truncate">{opt.label}</span>
          <span className="opacity-60 shrink-0">{opt.count}</span>
        </button>
      ))}
    </div>
  );
}

export default function AdminWaitlist() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [seatsAvailable, setSeatsAvailable] = useState<Record<string, number>>({});
  // Maps a converted entry's linked enquiry id -> whether that booking was
  // later cancelled. A waitlist entry is only ever marked 'converted' once
  // and never automatically flipped back, so without this a person whose
  // booking got cancelled after converting would still just show
  // "Converted" here with no sign the seat is free again.
  const [cancelledEnquiryIds, setCancelledEnquiryIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | WaitlistEntry['status']>('all');
  const [tripFilter, setTripFilter] = useState<string>(searchParams.get('trip') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  // Which single filter's dropdown is open — only one at a time, same
  // pattern as the Enquiries page's filter bar.
  const [openFilterPanel, setOpenFilterPanel] = useState<'status' | 'trip' | null>(null);

  const load = () => {
    Promise.all([getWaitlistEntries(), getAllUpcomingTripsAdmin(), getEnquiries()])
      .then(([waitlistData, trips, enquiries]) => {
        setEntries(waitlistData);
        const map: Record<string, number> = {};
        trips.forEach(t => { map[t.id] = seatsLeft(t.total_seats, t.seats_booked); });
        setSeatsAvailable(map);
        setCancelledEnquiryIds(new Set(enquiries.filter(en => !!en.cancelled_at).map(en => en.id)));
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

  // A solo entry (group_size null/1) is ready the moment any seat is free.
  // A group entry needs at least group_size seats free together before
  // it's actually convertible — e.g. a group of 3 isn't "ready" just
  // because 1 seat opened up from a single cancellation.
  const seatsNeeded = (e: WaitlistEntry) => e.group_size && e.group_size > 1 ? e.group_size : 1;
  // Every enquiry converted from this entry so far (falls back to the
  // legacy single-id column for any row a migration hasn't backfilled).
  const convertedIds = (e: WaitlistEntry): string[] =>
    e.converted_enquiry_ids ?? (e.converted_enquiry_id ? [e.converted_enquiry_id] : []);
  const convertedCount = (e: WaitlistEntry) => convertedIds(e).length;
  // What's still needed isn't the original group size once some of the
  // group has already converted — a group of 3 with 2 already converted
  // only needs 1 more seat, not 3.
  const seatsRemaining = (e: WaitlistEntry) => Math.max(seatsNeeded(e) - convertedCount(e), 0);
  const hasSeatOpen = (e: WaitlistEntry) =>
    e.status === 'waiting' && seatsRemaining(e) > 0 && (seatsAvailable[e.trip_id] ?? 0) >= seatsRemaining(e);

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const filtered = entries
    .filter(e => statusFilter === 'all' || e.status === statusFilter)
    .filter(e => tripFilter === 'all' || e.trip_id === tripFilter)
    .filter(e => !trimmedSearch
      || e.full_name?.toLowerCase().includes(trimmedSearch)
      || e.phone?.toLowerCase().includes(trimmedSearch)
      || e.email?.toLowerCase().includes(trimmedSearch)
      || e.trip_title?.toLowerCase().includes(trimmedSearch))
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

  const tripCounts: Record<string, number> = { all: entries.length };
  trips.forEach(t => { tripCounts[t.value] = entries.filter(e => e.trip_id === t.value).length; });

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (tripFilter !== 'all' ? 1 : 0) + (trimmedSearch ? 1 : 0);
  const clearAllFilters = () => {
    setStatusFilter('all');
    setTripFilter('all');
    setSearchQuery('');
    setOpenFilterPanel(null);
  };

  // KPI summary cards — same visual style as the Enquiries page, adapted
  // to waitlist statuses: Total signups, Waiting, Notified, Converted,
  // Declined.
  const kpiPct = (n: number) => (counts.all ? Math.round((n / counts.all) * 100) : 0);
  const KPI_CARDS = [
    { label: 'Total Signups', value: counts.all, sub: 'All time', icon: Users, iconBg: 'bg-rose-100', iconColor: 'text-rose-600' },
    { label: 'Waiting', value: counts.waiting, sub: `${kpiPct(counts.waiting)}% of total`, icon: Circle, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
    { label: 'Notified', value: counts.notified, sub: `${kpiPct(counts.notified)}% of total`, icon: Bell, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
    { label: 'Converted', value: counts.converted, sub: `${kpiPct(counts.converted)}% of total`, icon: CheckCircle2, iconBg: 'bg-green-100', iconColor: 'text-green-600' },
    { label: 'Declined', value: counts.declined, sub: `${kpiPct(counts.declined)}% of total`, icon: XCircle, iconBg: 'bg-red-100', iconColor: 'text-red-600' },
  ] as const;

  const renderKpiCards = (cards: typeof KPI_CARDS) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-white rounded-2xl p-4 shadow-card flex items-center gap-3 min-w-0"
          >
            <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${card.iconBg} ${card.iconColor}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-dark-muted text-xs font-medium truncate">{card.label}</p>
              <p className="font-display text-2xl font-bold text-dark leading-tight">{card.value}</p>
              <p className="text-dark-muted text-[11px] truncate">{card.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );

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

  // A seat freed up (e.g. someone else cancelled) — hand this person off to
  // Enquiries pre-filled, the same way a phone/WhatsApp lead would be
  // logged, so the admin can take payment and book the seat. The waitlist
  // entry itself is only marked "converted" once that enquiry is actually
  // saved (see AdminEnquiries), not the moment we navigate away.
  const canConvert = (e: WaitlistEntry) => e.status === 'waiting' || e.status === 'notified';

  const handleConvert = async (entry: WaitlistEntry) => {
    // canConvert() above only checks the entry's own status, not whether a
    // seat is actually free — so this can be reached even when the trip
    // has since filled up (e.g. someone else was converted first) or
    // doesn't have enough room for the whole group. Rather than let the
    // admin fill in the whole form and only find out from a failed save,
    // tell them up front how many seats are actually available.
    const needed = seatsRemaining(entry);
    const available = seatsAvailable[entry.trip_id] ?? 0;

    if (available <= 0) {
      await confirm({
        title: 'No slots available',
        message: 'All slots are filled. Unable to complete the conversion.',
        confirmLabel: 'OK',
        hideCancel: true,
        variant: 'default',
      });
      return;
    }

    if (available < needed) {
      const slotWord = available === 1 ? 'slot' : 'slots';
      const proceed = await confirm({
        title: 'Not enough slots for the full group',
        message: available === 1
          ? 'Only 1 slot is available. Only 1 person can be converted.'
          : `Only ${available} ${slotWord} available. You can convert up to ${available} people.`,
        confirmLabel: 'Continue',
        variant: 'default',
      });
      if (!proceed) return;
    }

    // How many people we can actually seat right now — never more than what's
    // still needed for the group, never more than what's physically free.
    const slots = Math.max(Math.min(needed, available), 1);

    navigate('/admin/enquiries', {
      state: {
        convertWaitlist: {
          id: entry.id,
          full_name: entry.full_name,
          phone: entry.phone,
          email: entry.email,
          age: entry.age,
          city: entry.city,
          food_preference: entry.food_preference,
          trip_id: entry.trip_id,
          trip_title: entry.trip_title,
          message: entry.message,
          group_size: entry.group_size,
          already_converted: convertedCount(entry),
          slots,
        },
      },
    });
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

        {/* KPI summary cards — same style as the Enquiries page */}
        {renderKpiCards(KPI_CARDS)}

        {/* Filters — one single row: Search | Filters | Clear All, same
            layout as the Enquiries page's filter bar. */}
        {openFilterPanel && (
          <div className="fixed inset-0 z-20" onClick={() => setOpenFilterPanel(null)} />
        )}
        <div className="bg-white rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal size={16} className="text-dark" />
            <span className="font-button font-bold text-dark text-[15px] whitespace-nowrap">Filters</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Search */}
            <div className="relative sm:w-64 sm:shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={ev => setSearchQuery(ev.target.value)}
                placeholder="Search by name, phone, email or trip..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              {/* Status */}
              <div className="relative">
                <button
                  onClick={() => setOpenFilterPanel(p => (p === 'status' ? null : 'status'))}
                  className={`w-full sm:w-auto flex items-center gap-2 rounded-xl border-2 pl-3 pr-2.5 py-2 sm:min-w-[128px] transition-colors ${
                    openFilterPanel === 'status' ? 'border-primary/50 bg-background-warm' : 'border-background-warm bg-background hover:border-primary/30'
                  }`}
                >
                  <div className="text-left leading-tight flex-1 min-w-0">
                    <p className="text-[10px] font-button font-medium text-dark-muted whitespace-nowrap">Status</p>
                    <p className="text-xs font-button font-semibold text-dark truncate">{statusFilter === 'all' ? 'All' : STATUS_CONFIG[statusFilter].label}</p>
                  </div>
                  <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'status' ? 'rotate-180' : ''}`} />
                </button>
                {openFilterPanel === 'status' && (
                  <FilterDropdown
                    value={statusFilter}
                    onSelect={key => { setStatusFilter(key); setOpenFilterPanel(null); }}
                    options={(['all', 'waiting', 'notified', 'converted', 'declined'] as const).map(key => ({
                      key, label: key === 'all' ? 'All' : STATUS_CONFIG[key].label, count: counts[key],
                    }))}
                  />
                )}
              </div>

              {/* Trip */}
              {trips.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOpenFilterPanel(p => (p === 'trip' ? null : 'trip'))}
                    className={`w-full sm:w-auto flex items-center gap-2 rounded-xl border-2 pl-3 pr-2.5 py-2 sm:min-w-[160px] transition-colors ${
                      openFilterPanel === 'trip' ? 'border-primary/50 bg-background-warm' : 'border-background-warm bg-background hover:border-primary/30'
                    }`}
                  >
                    <div className="text-left leading-tight flex-1 min-w-0">
                      <p className="text-[10px] font-button font-medium text-dark-muted whitespace-nowrap">Trip</p>
                      <p className="text-xs font-button font-semibold text-dark truncate">
                        {tripFilter === 'all' ? 'All trips' : trips.find(t => t.value === tripFilter)?.label || 'All trips'}
                      </p>
                    </div>
                    <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${openFilterPanel === 'trip' ? 'rotate-180' : ''}`} />
                  </button>
                  {openFilterPanel === 'trip' && (
                    <FilterDropdown
                      value={tripFilter}
                      onSelect={key => { setTripFilter(key); setOpenFilterPanel(null); }}
                      options={[
                        { key: 'all', label: 'All trips', count: tripCounts.all },
                        ...trips.map(t => ({ key: t.value, label: t.label, count: tripCounts[t.value] || 0 })),
                      ]}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Clear All */}
            <button
              onClick={clearAllFilters}
              disabled={activeFilterCount === 0}
              className={`w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold rounded-xl border-2 px-3 py-2 transition-colors whitespace-nowrap ${
                activeFilterCount === 0
                  ? 'border-background-warm text-dark-muted/40 cursor-default'
                  : 'border-background-warm text-dark hover:border-primary/30'
              }`}
            >
              <RefreshCw size={13} /> Clear All
            </button>
          </div>
        </div>

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
                          <p className="font-medium text-dark truncate flex items-center gap-1.5">
                            {e.full_name}
                            {e.group_size && e.group_size > 1 && (
                              <span
                                title={`Waiting for ${e.group_size} seats together`}
                                className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-background-warm text-dark-muted whitespace-nowrap"
                              >
                                <Users size={9} /> Group of {e.group_size}
                              </span>
                            )}
                            {e.status !== 'converted' && convertedCount(e) > 0 && (
                              <span
                                title={`${convertedCount(e)} of ${seatsNeeded(e)} in this group converted so far — ${seatsRemaining(e)} left to go`}
                                className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap"
                              >
                                <CheckCircle2 size={9} /> {convertedCount(e)}/{seatsNeeded(e)} converted
                              </span>
                            )}
                          </p>
                          <p className="text-dark-muted text-xs truncate md:hidden">{e.email}</p>
                          {(e.age || e.food_preference) && (
                            <p className="text-dark-muted text-xs mt-0.5">
                              {e.age && `${e.age} yrs`}
                              {e.age && e.food_preference && ' · '}
                              {e.food_preference && (e.food_preference === 'veg' ? 'Veg' : 'Non-veg')}
                            </p>
                          )}
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
                          {!hasSeatOpen(e) && e.status === 'waiting' && seatsRemaining(e) > 1 && (seatsAvailable[e.trip_id] ?? 0) > 0 && (
                            <span
                              title={`Needs ${seatsRemaining(e)} more seats free together — only ${seatsAvailable[e.trip_id]} open so far`}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap"
                            >
                              {seatsAvailable[e.trip_id]}/{seatsRemaining(e)} seats open
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-dark-muted hidden md:table-cell">
                          <p className="flex items-center gap-1 text-xs"><Mail size={11} className="shrink-0" /> {e.email}</p>
                          <p className="flex items-center gap-1 text-xs mt-0.5"><Phone size={11} className="shrink-0" /> {e.phone}</p>
                          {e.city && <p className="text-xs mt-0.5">{e.city}</p>}
                          {e.emergency_contact && <p className="text-xs mt-0.5">Emergency: {e.emergency_contact}</p>}
                        </td>
                        <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">
                          {formatDate(e.created_at, { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {e.status === 'converted' ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                                <CheckCircle2 size={12} className="shrink-0" />
                                Converted{convertedCount(e) > 1 ? ` (${convertedCount(e)}/${convertedCount(e)})` : ''}
                              </span>
                              {convertedIds(e).some(id => cancelledEnquiryIds.has(id)) && (
                                <span
                                  title="At least one of this group's bookings was cancelled after converting — that seat is free again."
                                  className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 whitespace-nowrap"
                                >
                                  <XCircle size={12} className="shrink-0" />
                                  {convertedIds(e).length > 1
                                    ? `${convertedIds(e).filter(id => cancelledEnquiryIds.has(id)).length}/${convertedIds(e).length} cancelled`
                                    : 'Booking cancelled'}
                                </span>
                              )}
                              <div className="flex flex-col items-end gap-0.5">
                                {convertedIds(e).map((id, i) => (
                                  <button
                                    key={id}
                                    onClick={() => navigate(`/admin/enquiries?enquiry=${id}`)}
                                    className="text-xs font-button font-semibold text-primary underline underline-offset-2 whitespace-nowrap"
                                  >
                                    View booking{convertedIds(e).length > 1 ? ` ${i + 1}` : ''}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <Select
                              value={e.status}
                              disabled={updating === e.id}
                              onChange={val => handleStatusChange(e.id, val as WaitlistEntry['status'])}
                              options={EDITABLE_STATUS_OPTIONS}
                              size="sm"
                            />
                          )}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canConvert(e) && (
                              <button
                                onClick={() => handleConvert(e)}
                                title="Convert to enquiry"
                                className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 h-7 rounded-lg border transition-colors whitespace-nowrap ${
                                  hasSeatOpen(e)
                                    ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                                    : 'border-primary/40 text-primary hover:bg-primary/10'
                                }`}
                              >
                                <UserPlus size={12} className="shrink-0" />
                                Convert
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(e)}
                              disabled={updating === e.id}
                              title="Remove from waitlist"
                              aria-label="Remove from waitlist"
                              className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
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
                        <p className="font-medium text-dark truncate flex items-center gap-1.5">
                          {e.full_name}
                          {e.group_size && e.group_size > 1 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-background-warm text-dark-muted whitespace-nowrap">
                              <Users size={9} /> Group of {e.group_size}
                            </span>
                          )}
                          {e.status !== 'converted' && convertedCount(e) > 0 && (
                            <span
                              title={`${convertedCount(e)} of ${seatsNeeded(e)} in this group converted so far — ${seatsRemaining(e)} left to go`}
                              className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap"
                            >
                              <CheckCircle2 size={9} /> {convertedCount(e)}/{seatsNeeded(e)} converted
                            </span>
                          )}
                        </p>
                        <p className="text-dark-muted text-xs truncate">{e.trip_title || 'Untitled trip'}</p>
                        {hasSeatOpen(e) && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                            <PartyPopper size={10} className="shrink-0" />
                            {seatsAvailable[e.trip_id]} seat{seatsAvailable[e.trip_id] === 1 ? '' : 's'} open
                          </span>
                        )}
                        {!hasSeatOpen(e) && e.status === 'waiting' && seatsRemaining(e) > 1 && (seatsAvailable[e.trip_id] ?? 0) > 0 && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                            {seatsAvailable[e.trip_id]}/{seatsRemaining(e)} seats open
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
                      {(e.age || e.food_preference) && (
                        <p>
                          {e.age && `${e.age} yrs`}
                          {e.age && e.food_preference && ' · '}
                          {e.food_preference && (e.food_preference === 'veg' ? 'Veg' : 'Non-veg')}
                        </p>
                      )}
                      {e.city && <p>{e.city}</p>}
                      {e.emergency_contact && <p>Emergency: {e.emergency_contact}</p>}
                      <p>{formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      {e.message && (
                        <p className="flex items-start gap-1.5 mt-1.5">
                          <MessageSquare size={12} className="shrink-0 mt-0.5" />
                          <span>{e.message}</span>
                        </p>
                      )}
                    </div>

                    {canConvert(e) && (
                      <button
                        onClick={() => handleConvert(e)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 text-sm font-button font-semibold py-2 rounded-lg border transition-colors ${
                          hasSeatOpen(e)
                            ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                            : 'border-primary/40 text-primary hover:bg-primary/10'
                        }`}
                      >
                        <UserPlus size={14} className="shrink-0" />
                        Convert to Enquiry
                      </button>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {e.status === 'converted' ? (
                        <div className="flex-1 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                              <CheckCircle2 size={12} className="shrink-0" />
                              Converted{convertedCount(e) > 1 ? ` (${convertedCount(e)}/${convertedCount(e)})` : ''}
                            </span>
                            {convertedIds(e).some(id => cancelledEnquiryIds.has(id)) && (
                              <span className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 whitespace-nowrap">
                                <XCircle size={12} className="shrink-0" />
                                {convertedIds(e).length > 1
                                  ? `${convertedIds(e).filter(id => cancelledEnquiryIds.has(id)).length}/${convertedIds(e).length} cancelled`
                                  : 'Booking cancelled'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {convertedIds(e).map((id, i) => (
                              <button
                                key={id}
                                onClick={() => navigate(`/admin/enquiries?enquiry=${id}`)}
                                className="text-xs font-button font-semibold text-primary underline underline-offset-2 whitespace-nowrap"
                              >
                                View booking{convertedIds(e).length > 1 ? ` ${i + 1}` : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Select
                          value={e.status}
                          disabled={updating === e.id}
                          onChange={val => handleStatusChange(e.id, val as WaitlistEntry['status'])}
                          options={EDITABLE_STATUS_OPTIONS}
                          size="sm"
                          className="flex-1"
                        />
                      )}
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
