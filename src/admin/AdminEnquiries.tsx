import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, RefreshCw, Plus, CheckCircle2, Circle, XCircle, MessageCircle, Phone, Camera, MapPin, Globe, HelpCircle, ChevronDown, IndianRupee, Zap, SlidersHorizontal } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import { getEnquiries, updateEnquiryStatus, createManualEnquiry, recordPayment, getAllUpcomingTripsAdmin, cancelEnquiry, uncancelEnquiry, recordRefund } from '../services/api';
import type { Enquiry, UpcomingTrip } from '../types';
import { formatDate, formatPrice } from '../utils';

const PACKAGE_CONFIG = {
  early_bird: { label: 'Early Bird', color: 'bg-purple-100 text-purple-700' },
  normal: { label: 'Normal', color: 'bg-slate-100 text-slate-700' },
} as const;

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
];

const SOURCE_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'other', label: 'Other' },
];

const PACKAGE_OPTIONS = [
  { value: 'normal', label: 'Normal Price' },
  { value: 'early_bird', label: 'Early Bird' },
];

function paymentStatus(e: Enquiry): { label: string; color: string } {
  if (!e.total_amount) return { label: 'Not set', color: 'bg-slate-100 text-dark-muted' };
  if (e.amount_paid <= 0) return { label: 'Unpaid', color: 'bg-red-100 text-red-700' };
  if (e.amount_paid >= e.total_amount) return { label: 'Paid in full', color: 'bg-green-100 text-green-700' };
  return { label: 'Partial', color: 'bg-amber-100 text-amber-700' };
}

function paymentBalance(e: Enquiry): number | null {
  if (!e.total_amount) return null;
  return Math.max(0, e.total_amount - (e.amount_paid || 0));
}

function paymentFilterKey(e: Enquiry): 'paid' | 'partial' | 'unpaid' | 'not_set' {
  if (!e.total_amount) return 'not_set';
  if (e.amount_paid <= 0) return 'unpaid';
  if (e.amount_paid >= e.total_amount) return 'paid';
  return 'partial';
}

// A seat is only actually held when money's been paid AND the booking
// hasn't been cancelled since. amount_paid itself is left untouched by
// cancellation — it's the historical record of what they paid — so
// "booked" can't just check amount_paid > 0 anymore.
function isBooked(e: Enquiry): boolean {
  return !e.cancelled_at && e.amount_paid > 0;
}

// Only relevant for cancelled bookings that had money on them. Tracks
// refund_amount against amount_paid independently, so partial refunds
// (processed in installments) show correctly as "pending" until they
// fully catch up.
function refundStatus(e: Enquiry): { label: string; color: string } | null {
  if (!e.cancelled_at || e.amount_paid <= 0) return null;
  const refunded = e.refund_amount || 0;
  if (refunded >= e.amount_paid) return { label: 'Refunded', color: 'bg-green-100 text-green-700' };
  if (refunded > 0) return { label: `Refund pending — ${formatPrice(e.amount_paid - refunded)} left`, color: 'bg-amber-100 text-amber-700' };
  return { label: `Refund pending — ${formatPrice(e.amount_paid)}`, color: 'bg-red-100 text-red-700' };
}

const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  closed: { label: 'Closed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

const PAY_FILTER_LABELS = {
  all: 'All',
  paid: 'Paid in full',
  partial: 'Partial',
  unpaid: 'Unpaid',
  not_set: 'Price not set',
} as const;

const SOURCE_CONFIG = {
  website: { label: 'Website', icon: Globe },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  phone: { label: 'Phone Call', icon: Phone },
  instagram: { label: 'Instagram', icon: Camera },
  walk_in: { label: 'Walk-in', icon: MapPin },
  other: { label: 'Other', icon: HelpCircle },
} as const;

type EnquiryForm = {
  full_name: string;
  phone: string;
  email: string;
  age: number | '';
  city: string;
  trip_id: string;
  source: Enquiry['source'];
  message: string;
  package_type: Enquiry['package_type'];
  total_amount: number | '';
  amount_paid: number | '';
};

const emptyForm: EnquiryForm = {
  full_name: '', phone: '', email: '', age: '', city: '', trip_id: '', source: 'whatsapp', message: '',
  package_type: 'normal', total_amount: '', amount_paid: '',
};

type PaymentForm = {
  package_type: Enquiry['package_type'];
  total_amount: number | '';
  amount_paid: number | '';
  refund_amount: number | '';
};

export default function AdminEnquiries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Enquiry['status']>('all');
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'not_set'>('all');
  const [bookedFilter, setBookedFilter] = useState<'all' | 'booked' | 'not_booked'>('all');
  const [showQueryFilter, setShowQueryFilter] = useState(false);
  const [showPayFilter, setShowPayFilter] = useState(false);
  const [showBookedFilter, setShowBookedFilter] = useState(false);
  const [selectedTripKey, setSelectedTripKey] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EnquiryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paymentTarget, setPaymentTarget] = useState<Enquiry | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ package_type: 'normal', total_amount: '', amount_paid: '', refund_amount: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Enquiry | null>(null);
  const [cancelCharges, setCancelCharges] = useState<number | ''>('');
  const [cancelling, setCancelling] = useState(false);

  const load = () => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error);
  }, []);

  useEffect(() => {
    if (enquiries.length === 0) return;
    const tripParam = searchParams.get('trip');
    const enquiryParam = searchParams.get('enquiry');
    if (tripParam) setSelectedTripKey(tripParam);
    if (enquiryParam) setExpandedId(enquiryParam);
    if (tripParam || enquiryParam) setSearchParams({}, { replace: true });
  }, [enquiries, searchParams]);

  useEffect(() => {
    if (!expandedId) return;
    const el = cardRefs.current[expandedId];
    if (!el) return;
    // Wait a beat for the expand animation/layout to settle, then decide
    // whether the page needs to move at all.
    const t = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const fitsAlready = rect.top >= 0 && rect.bottom <= viewportHeight;

      // Plenty of room below (or above) already — expanding in place is all
      // that's needed, so don't move the page and cause an unnecessary jump.
      if (fitsAlready) return;

      // Not enough room below: bring the card fully into view. If the whole
      // expanded card is taller than the viewport itself, prioritize showing
      // its header/top details ('start'); otherwise align its bottom edge to
      // the viewport bottom ('end'), which is what makes the card appear to
      // slide up just enough to reveal the newly expanded content.
      const cardTallerThanViewport = rect.height > viewportHeight;
      el.scrollIntoView({ behavior: 'smooth', block: cardTallerThanViewport ? 'start' : 'end' });
    }, 80);
    return () => clearTimeout(t);
  }, [expandedId]);

  const handleStatusChange = async (id: string, status: Enquiry['status']) => {
    setUpdating(id);
    await updateEnquiryStatus(id, status).catch(console.error);
    load();
    setUpdating(null);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  // Looks up what a trip actually charges for a given package (early-bird or
  // normal). Returns undefined if the trip or that price isn't set.
  const getTripPrice = (tripId: string | undefined, packageType: Enquiry['package_type']): number | undefined => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return undefined;
    const price = packageType === 'early_bird' ? trip.early_bird_price : trip.price;
    return price ?? undefined;
  };

  // Suggests the trip's active price (early-bird or normal) as a starting
  // point for total_amount whenever the trip or package changes. The admin
  // can still type over it — this is just to save a lookup.
  const applySuggestedAmount = (tripId: string, packageType: Enquiry['package_type']) => {
    const suggested = getTripPrice(tripId, packageType);
    if (suggested != null) {
      setForm(f => ({ ...f, total_amount: suggested }));
    }
  };

  const openPayment = (enquiry: Enquiry) => {
    setPaymentTarget(enquiry);
    const packageType = enquiry.package_type || 'normal';
    // If no amount has been recorded yet, pull the trip's price for whichever
    // package this booking is under so the admin isn't starting from blank.
    const suggested = enquiry.total_amount ?? getTripPrice(enquiry.trip_id, packageType);
    setPaymentForm({
      package_type: packageType,
      total_amount: suggested ?? '',
      amount_paid: enquiry.amount_paid ?? 0,
      refund_amount: enquiry.refund_amount ?? 0,
    });
  };

  // Reactivates a previously cancelled enquiry. Re-books the seat if
  // something had been paid, and resets booking_status via uncancelEnquiry.
  const handleReactivate = async (e: Enquiry) => {
    setUpdating(e.id);
    try {
      await uncancelEnquiry(e);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to reactivate booking.');
    } finally {
      setUpdating(null);
    }
  };

  // Cancel/reactivate entry point for the row-level button. Reactivating
  // happens immediately; cancelling opens a modal first so third-party
  // charges (airline/hotel penalties) can be recorded up front — cancelEnquiry
  // uses them to compute suggested_refund_amount.
  const handleCancelToggle = (e: Enquiry) => {
    if (e.cancelled_at) {
      handleReactivate(e);
    } else {
      setCancelTarget(e);
      setCancelCharges('');
    }
  };

  // Cancels an enquiry. Frees the trip seat immediately but never touches
  // amount_paid — that stays as the record of what was actually collected,
  // separate from whatever gets refunded.
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const charges = cancelCharges === '' ? undefined : Number(cancelCharges);
      await cancelEnquiry(cancelTarget, charges);
      setCancelTarget(null);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to cancel booking.');
    } finally {
      setCancelling(false);
    }
  };

  const handleSavePayment = async () => {
    if (!paymentTarget) return;
    const totalAmount = paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
    const amountPaid = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
    if (totalAmount != null && amountPaid > totalAmount) {
      alert("Amount paid can't be more than the total amount.");
      return;
    }
    const refundAmount = paymentForm.refund_amount === '' ? 0 : Number(paymentForm.refund_amount);
    if (refundAmount > amountPaid) {
      alert("Refund amount can't be more than what was actually paid.");
      return;
    }
    try {
      setSavingPayment(true);
      await recordPayment(paymentTarget, {
        amount_paid: amountPaid,
        total_amount: totalAmount,
        package_type: paymentForm.package_type,
      });
      if (paymentTarget.cancelled_at) {
        await recordRefund(paymentTarget, refundAmount);
      }
      setPaymentTarget(null);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to save payment details.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) {
      alert('Name and phone are required.');
      return;
    }
    const totalAmount = form.total_amount === '' ? undefined : Number(form.total_amount);
    const amountPaid = form.amount_paid === '' ? 0 : Number(form.amount_paid);
    if (totalAmount != null && amountPaid > totalAmount) {
      alert("Amount paid can't be more than the total amount.");
      return;
    }
    try {
      setSaving(true);
      const trip = trips.find(t => t.id === form.trip_id);
      await createManualEnquiry({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || 'not-provided@ulaa.local',
        age: form.age === '' ? undefined : form.age,
        city: form.city.trim() || undefined,
        trip_id: form.trip_id || undefined,
        trip_title: trip?.title,
        source: form.source,
        message: form.message.trim() || undefined,
        status: 'new',
        package_type: form.package_type,
        total_amount: totalAmount,
        amount_paid: amountPaid,
      });
      setModalOpen(false);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to save enquiry.');
    } finally {
      setSaving(false);
    }
  };

  // Group enquiries by trip so the admin can see, per trip, how many people
  // enquired/contacted/closed and how much has been collected vs is pending —
  // instead of one long undifferentiated list.
  type TripGroup = {
    key: string;
    title: string;
    trip?: UpcomingTrip;
    enquiries: Enquiry[];
  };

  const tripGroups: TripGroup[] = (() => {
    const map = new Map<string, TripGroup>();
    enquiries.forEach(e => {
      const key = e.trip_id || 'unlinked';
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: e.trip_title || 'No Trip Linked',
          trip: e.trip_id ? trips.find(t => t.id === e.trip_id) : undefined,
          enquiries: [],
        });
      }
      map.get(key)!.enquiries.push(e);
    });
    return Array.from(map.values()).sort((a, b) => b.enquiries.length - a.enquiries.length);
  })();

  const activeGroup = tripGroups.find(g => g.key === selectedTripKey) || null;
  const scopedEnquiries = activeGroup ? activeGroup.enquiries : enquiries;

  const filtered = scopedEnquiries
    .filter(e => filter === 'all' || e.status === filter)
    .filter(e => payFilter === 'all' || paymentFilterKey(e) === payFilter)
    .filter(e => bookedFilter === 'all' || (bookedFilter === 'booked' ? isBooked(e) : !isBooked(e)));
  const counts = {
    all: scopedEnquiries.length,
    new: scopedEnquiries.filter(e => e.status === 'new').length,
    contacted: scopedEnquiries.filter(e => e.status === 'contacted').length,
    closed: scopedEnquiries.filter(e => e.status === 'closed').length,
  };
  const payCounts = {
    all: scopedEnquiries.length,
    paid: scopedEnquiries.filter(e => paymentFilterKey(e) === 'paid').length,
    partial: scopedEnquiries.filter(e => paymentFilterKey(e) === 'partial').length,
    unpaid: scopedEnquiries.filter(e => paymentFilterKey(e) === 'unpaid').length,
    not_set: scopedEnquiries.filter(e => paymentFilterKey(e) === 'not_set').length,
  };
  const bookedCounts = {
    all: scopedEnquiries.length,
    booked: scopedEnquiries.filter(isBooked).length,
    not_booked: scopedEnquiries.filter(e => !isBooked(e)).length,
  };
  const activeFilterCount = (filter !== 'all' ? 1 : 0) + (payFilter !== 'all' ? 1 : 0) + (bookedFilter !== 'all' ? 1 : 0);

  const paymentTotals = (list: Enquiry[]) => ({
    collected: list.reduce((sum, e) => sum + (e.amount_paid || 0), 0),
    pending: list.reduce((sum, e) => {
      if (!e.total_amount) return sum;
      return sum + Math.max(0, e.total_amount - (e.amount_paid || 0));
    }, 0),
    paidFull: list.filter(e => e.total_amount && e.amount_paid >= e.total_amount).length,
    partial: list.filter(e => e.total_amount && e.amount_paid > 0 && e.amount_paid < e.total_amount).length,
    unpaid: list.filter(e => e.total_amount && e.amount_paid <= 0).length,
    notSet: list.filter(e => !e.total_amount).length,
  });

  const totalCollected = enquiries.reduce((sum, e) => sum + (e.amount_paid || 0), 0);
  const totalPending = enquiries.reduce((sum, e) => {
    if (!e.total_amount) return sum;
    return sum + Math.max(0, e.total_amount - (e.amount_paid || 0));
  }, 0);

  const inputClass = `w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors`;

  return (
    <AdminLayout title="Enquiries">
      <div className="space-y-6">
        <div className="flex justify-between items-center gap-3">
          <p className="text-dark-muted text-sm hidden sm:block">Log a WhatsApp, phone, or walk-in enquiry that didn't come through the website.</p>
          <Button variant="primary" size="sm" onClick={openAdd} className="ml-auto">
            <Plus size={16} /> Add Enquiry
          </Button>
        </div>

        {/* Payment summary (business-wide — hidden once drilled into a single trip, which shows its own) */}
        {!activeGroup && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-4 shadow-card">
              <p className="text-dark-muted text-sm">Total Collected</p>
              <p className="font-display text-2xl font-bold text-green-700">{formatPrice(totalCollected)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-card">
              <p className="text-dark-muted text-sm">Pending Balance</p>
              <p className="font-display text-2xl font-bold text-amber-600">{formatPrice(totalPending)}</p>
            </div>
          </div>
        )}

        {/* Trip overview: pick a trip to see its enquiries, or "All Trips" to see everything */}
        {!activeGroup ? (
          <div>
            <p className="text-dark-muted text-sm mb-3">Tap a trip to see who's coming, who's paid, and who's still owed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tripGroups.map(g => {
                const c = {
                  new: g.enquiries.filter(e => e.status === 'new').length,
                  contacted: g.enquiries.filter(e => e.status === 'contacted').length,
                  closed: g.enquiries.filter(e => e.status === 'closed').length,
                };
                const pay = paymentTotals(g.enquiries);
                return (
                  <button
                    key={g.key}
                    onClick={() => { setSelectedTripKey(g.key); setFilter('all'); setPayFilter('all'); setBookedFilter('all'); }}
                    className="bg-white rounded-2xl p-5 text-left shadow-card hover:shadow-card-hover transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display font-bold text-dark leading-tight">{g.title}</p>
                      {g.trip && (
                        <span className="shrink-0 text-xs font-button font-semibold text-dark-muted whitespace-nowrap">
                          {g.trip.seats_booked}/{g.trip.total_seats} seats
                        </span>
                      )}
                    </div>
                    <p className="text-dark-muted text-xs mt-0.5">{g.enquiries.length} {g.enquiries.length === 1 ? 'enquiry' : 'enquiries'}</p>

                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700"><Clock size={10} /> {c.new} new</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"><RefreshCw size={10} /> {c.contacted} contacted</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700"><CheckCircle size={10} /> {c.closed} closed</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {pay.paidFull > 0 && <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{pay.paidFull} paid in full</span>}
                      {pay.partial > 0 && <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{pay.partial} partial</span>}
                      {pay.unpaid > 0 && <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{pay.unpaid} unpaid</span>}
                      {pay.notSet > 0 && <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-dark-muted">{pay.notSet} amount not set</span>}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-background-warm">
                      <div>
                        <p className="text-[10px] text-dark-muted">Collected</p>
                        <p className="font-semibold text-green-700 text-sm">{formatPrice(pay.collected)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-dark-muted">Pending</p>
                        <p className="font-semibold text-amber-600 text-sm">{formatPrice(pay.pending)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => { setSelectedTripKey(null); setFilter('all'); setPayFilter('all'); setBookedFilter('all'); }}
              className="inline-flex items-center gap-1 text-sm font-button font-semibold text-primary hover:underline"
            >
              ← All Trips
            </button>

            {/* Trip header: name, seats, and money — all in one compact card */}
            <div className="bg-white rounded-2xl p-4 shadow-card flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-display font-bold text-dark">{activeGroup.title}</p>
                {activeGroup.trip && (
                  <p className="text-dark-muted text-xs">{activeGroup.trip.seats_booked}/{activeGroup.trip.total_seats} seats booked</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-dark-muted text-xs">Collected · Pending</p>
                <p className="text-sm font-semibold whitespace-nowrap">
                  <span className="text-green-700">{formatPrice(paymentTotals(activeGroup.enquiries).collected)}</span>
                  {' · '}
                  <span className="text-amber-600">{formatPrice(paymentTotals(activeGroup.enquiries).pending)}</span>
                </p>
              </div>
            </div>

            {/* Filters — collapsed by default into two tappable toggles
                (Query Status / Payment), each expanding its own pill row
                on demand, so the card stays compact until you need it. */}
            <div className="bg-white rounded-2xl shadow-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={13} className="text-dark-muted shrink-0" />
                <p className="text-[11px] font-button font-semibold text-dark-muted uppercase tracking-wide">Filters</p>
                <span className={`inline-flex items-center text-[10px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  activeFilterCount > 0 ? 'bg-primary/10 text-primary' : 'bg-background-warm text-dark-muted'
                }`}>
                  {activeFilterCount} Active
                </span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setFilter('all'); setPayFilter('all'); setBookedFilter('all'); setShowQueryFilter(false); setShowPayFilter(false); setShowBookedFilter(false); }}
                    className="ml-auto text-[11px] font-button font-semibold text-primary hover:underline shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                <button
                  onClick={() => { setShowQueryFilter(v => !v); setShowPayFilter(false); setShowBookedFilter(false); }}
                  className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                    showQueryFilter ? 'bg-background-warm text-dark border-primary/40' : 'bg-background text-dark-muted border-background-warm'
                  }`}
                >
                  Query Status{filter !== 'all' && <span className="text-primary">· {STATUS_CONFIG[filter].label}</span>}
                  <ChevronDown size={12} className={`transition-transform ${showQueryFilter ? 'rotate-180' : ''}`} />
                </button>
                <button
                  onClick={() => { setShowPayFilter(v => !v); setShowQueryFilter(false); setShowBookedFilter(false); }}
                  className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                    showPayFilter ? 'bg-background-warm text-dark border-primary/40' : 'bg-background text-dark-muted border-background-warm'
                  }`}
                >
                  Payment{payFilter !== 'all' && <span className="text-primary">· {PAY_FILTER_LABELS[payFilter]}</span>}
                  <ChevronDown size={12} className={`transition-transform ${showPayFilter ? 'rotate-180' : ''}`} />
                </button>
                <button
                  onClick={() => { setShowBookedFilter(v => !v); setShowQueryFilter(false); setShowPayFilter(false); }}
                  className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                    showBookedFilter ? 'bg-background-warm text-dark border-primary/40' : 'bg-background text-dark-muted border-background-warm'
                  }`}
                >
                  Booking{bookedFilter !== 'all' && <span className="text-primary">· {bookedFilter === 'booked' ? 'Booked' : 'Not booked'}</span>}
                  <ChevronDown size={12} className={`transition-transform ${showBookedFilter ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {showQueryFilter && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pt-1">
                  {([['all', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                        filter === key ? 'bg-primary text-white border-primary' : 'bg-background text-dark-muted border-background-warm hover:border-primary/50'
                      }`}
                    >
                      {label} <span className="opacity-70">{counts[key]}</span>
                    </button>
                  ))}
                </div>
              )}

              {showPayFilter && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pt-1">
                  {([
                    ['all', 'All'],
                    ['paid', 'Paid in full'],
                    ['partial', 'Partial'],
                    ['unpaid', 'Unpaid'],
                    ['not_set', 'Price not set'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPayFilter(key)}
                      className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                        payFilter === key ? 'bg-primary text-white border-primary' : 'bg-background text-dark-muted border-background-warm hover:border-primary/50'
                      }`}
                    >
                      {label} <span className="opacity-70">{payCounts[key]}</span>
                    </button>
                  ))}
                </div>
              )}

              {showBookedFilter && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pt-1">
                  {([
                    ['all', 'All'],
                    ['booked', 'Booked'],
                    ['not_booked', 'Not booked'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setBookedFilter(key)}
                      className={`shrink-0 inline-flex items-center gap-1 text-xs font-button font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                        bookedFilter === key ? 'bg-primary text-white border-primary' : 'bg-background text-dark-muted border-background-warm hover:border-primary/50'
                      }`}
                    >
                      {label} <span className="opacity-70">{bookedCounts[key]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeGroup && (loading ? (
          <div className="text-center py-16 text-dark-muted">Loading enquiries...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <p className="font-display text-xl text-dark-muted">No enquiries found.</p>
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
                      <th className="px-4 py-3 text-left hidden sm:table-cell">Phone</th>
                      <th className="px-4 py-3 text-left hidden lg:table-cell">Source</th>
                      <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                      <th className="px-2 py-3 text-center whitespace-nowrap">Package</th>
                      <th className="px-2 py-3 text-left whitespace-nowrap">Payment</th>
                      <th className="px-2 py-3 text-center whitespace-nowrap">Status</th>
                      <th className="px-2 py-3 text-center whitespace-nowrap">Seat</th>
                      <th className="px-2 py-3 text-right whitespace-nowrap">Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-background-warm">
                    {filtered.map(e => {
                      const cfg = STATUS_CONFIG[e.status];
                      const srcCfg = SOURCE_CONFIG[e.source] || SOURCE_CONFIG.other;
                      return (
                        <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                          <td className="px-4 py-3 max-w-[150px] sm:max-w-none">
                            <p className="font-medium text-dark truncate">{e.full_name}</p>
                            <p className="text-dark-muted text-xs truncate">{e.email}</p>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden sm:table-cell truncate">{e.phone}</td>
                          <td className="px-4 py-3 text-dark-muted hidden lg:table-cell truncate">
                            <span className="inline-flex items-center gap-1 text-xs">
                              <srcCfg.icon size={12} className="shrink-0" />
                              {srcCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">{formatDate(e.created_at, { day: 'numeric', month: 'short' })}</td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${PACKAGE_CONFIG[e.package_type || 'normal'].color}`}>
                              {e.package_type === 'early_bird' && <Zap size={12} className="shrink-0" />}
                              {PACKAGE_CONFIG[e.package_type || 'normal'].label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-left whitespace-nowrap">
                            <button onClick={() => openPayment(e)} className="text-left hover:opacity-75 transition-opacity">
                              <p className="text-dark font-medium text-xs">
                                {formatPrice(e.amount_paid || 0)}{e.total_amount ? ` / ${formatPrice(e.total_amount)}` : ''}
                              </p>
                              <span className={`inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${paymentStatus(e).color}`}>
                                {paymentStatus(e).label}
                              </span>
                              {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                                <p className="text-amber-600 text-[10px] font-medium mt-0.5">
                                  Balance {formatPrice(paymentBalance(e)!)}
                                </p>
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                              <cfg.icon size={12} className="shrink-0" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span
                              title={isBooked(e) ? 'Seat booked automatically from payment' : e.cancelled_at ? 'Cancelled — seat released' : 'No payment recorded yet, so no seat is held'}
                              className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                                isBooked(e) ? 'bg-green-100 text-green-700' : e.cancelled_at ? 'bg-red-100 text-red-700' : 'bg-background-warm text-dark-muted'
                              }`}
                            >
                              {isBooked(e) ? <CheckCircle2 size={12} /> : e.cancelled_at ? <XCircle size={12} /> : <Circle size={12} />}
                              {isBooked(e) ? 'Booked' : e.cancelled_at ? 'Cancelled' : 'Not booked'}
                            </span>
                            {refundStatus(e) && (
                              <p className={`text-[10px] font-medium mt-1 px-1.5 py-0.5 rounded-full inline-block whitespace-nowrap ${refundStatus(e)!.color}`}>
                                {refundStatus(e)!.label}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-3 text-right">
                            <Select
                              value={e.status}
                              disabled={updating === e.id}
                              onChange={val => handleStatusChange(e.id, val as Enquiry['status'])}
                              options={STATUS_OPTIONS}
                              size="sm"
                            />
                            <button
                              onClick={() => handleCancelToggle(e)}
                              disabled={updating === e.id}
                              className={`mt-1.5 w-full text-[11px] font-button font-semibold px-1.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                                e.cancelled_at
                                  ? 'border-green-200 text-green-700 hover:bg-green-50'
                                  : 'border-red-200 text-red-600 hover:bg-red-50'
                              }`}
                            >
                              {e.cancelled_at ? 'Reactivate' : 'Cancel'}
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: tap a card to expand full details */}
            <div className="sm:hidden space-y-3">
              {filtered.map(e => {
                const cfg = STATUS_CONFIG[e.status];
                const srcCfg = SOURCE_CONFIG[e.source] || SOURCE_CONFIG.other;
                const isOpen = expandedId === e.id;
                return (
                  <motion.div
                    key={e.id}
                    ref={(el) => { cardRefs.current[e.id] = el; }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-2xl shadow-card overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedId(isOpen ? null : e.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-dark truncate flex items-center gap-1.5">
                          {e.full_name}
                          {e.package_type === 'early_bird' && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">
                              <Zap size={9} /> Early Bird
                            </span>
                          )}
                          {e.cancelled_at && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
                              <XCircle size={9} /> Cancelled
                            </span>
                          )}
                        </p>
                        <p className="text-dark-muted text-xs truncate">{e.phone}</p>
                        <div className="flex items-center flex-wrap gap-1 mt-1">
                          <span className={`inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${paymentStatus(e).color}`}>
                            {formatPrice(e.amount_paid || 0)}{e.total_amount ? ` / ${formatPrice(e.total_amount)}` : ''} · {paymentStatus(e).label}
                          </span>
                          {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                            <span className="inline-flex items-center text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-amber-50 text-amber-700">
                              Balance {formatPrice(paymentBalance(e)!)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                          <cfg.icon size={12} className="shrink-0" />
                          {cfg.label}
                        </span>
                        <ChevronDown size={16} className={`text-dark-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 border-t border-background-warm space-y-3">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm pt-2">
                          <div>
                            <p className="text-dark-muted text-xs">Phone</p>
                            <p className="text-dark truncate">{e.phone}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Email</p>
                            <p className="text-dark truncate">{e.email}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">City</p>
                            <p className="text-dark truncate">{e.city || '—'}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Age</p>
                            <p className="text-dark truncate">{e.age ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Source</p>
                            <p className="text-dark truncate inline-flex items-center gap-1">
                              <srcCfg.icon size={12} className="shrink-0" /> {srcCfg.label}
                            </p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Date</p>
                            <p className="text-dark truncate">{formatDate(e.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                          <div>
                            <p className="text-dark-muted text-xs">Package</p>
                            <p className="text-dark truncate">{PACKAGE_CONFIG[e.package_type || 'normal'].label}</p>
                          </div>
                        </div>

                        {e.message && (
                          <div>
                            <p className="text-dark-muted text-xs">Notes</p>
                            <p className="text-dark text-sm">{e.message}</p>
                          </div>
                        )}

                        {paymentFilterKey(e) === 'partial' && paymentBalance(e) != null && (
                          <div className="bg-amber-50 rounded-xl px-3 py-2">
                            <p className="text-amber-700 text-xs font-medium">Balance due: {formatPrice(paymentBalance(e)!)}</p>
                          </div>
                        )}

                        {refundStatus(e) && (
                          <div className={`rounded-xl px-3 py-2 ${refundStatus(e)!.color}`}>
                            <p className="text-xs font-medium">{refundStatus(e)!.label}</p>
                          </div>
                        )}

                        <div className="flex items-center flex-wrap gap-2 pt-1">
                          <button
                            onClick={() => openPayment(e)}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-xl whitespace-nowrap bg-background-warm text-dark-muted"
                          >
                            <IndianRupee size={14} /> Payment
                          </button>
                          <span
                            title={isBooked(e) ? 'Seat booked automatically from payment' : e.cancelled_at ? 'Cancelled — seat released' : 'No payment recorded yet, so no seat is held'}
                            className={`flex-1 inline-flex items-center justify-center gap-1 text-xs font-button font-semibold px-3 py-2 rounded-xl whitespace-nowrap ${
                              isBooked(e) ? 'bg-green-100 text-green-700' : e.cancelled_at ? 'bg-red-100 text-red-700' : 'bg-background-warm text-dark-muted'
                            }`}
                          >
                            {isBooked(e) ? <CheckCircle2 size={14} /> : e.cancelled_at ? <XCircle size={14} /> : <Circle size={14} />}
                            {isBooked(e) ? 'Booked' : e.cancelled_at ? 'Cancelled' : 'Not booked'}
                          </span>
                          <div className="flex-1">
                            <Select
                              value={e.status}
                              disabled={updating === e.id}
                              onChange={val => handleStatusChange(e.id, val as Enquiry['status'])}
                              options={STATUS_OPTIONS}
                              size="sm"
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => handleCancelToggle(e)}
                          disabled={updating === e.id}
                          className={`w-full text-xs font-button font-semibold px-3 py-2 rounded-xl border transition-colors ${
                            e.cancelled_at
                              ? 'border-green-200 text-green-700 hover:bg-green-50'
                              : 'border-red-200 text-red-600 hover:bg-red-50'
                          }`}
                        >
                          {e.cancelled_at ? 'Reactivate Booking' : 'Mark as Cancelled'}
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </>
        ))}
      </div>

      {/* Manual Add Enquiry Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Log an Enquiry" size="md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Full Name *</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputClass} placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Phone *</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} placeholder="e.g. 98765 43210" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Email</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Age</label>
            <input type="number" min={0} value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value === '' ? '' : +e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">City</label>
            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
            <Select
              value={form.source}
              onChange={val => setForm(f => ({ ...f, source: val as Enquiry['source'] }))}
              options={SOURCE_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Trip</label>
            <Select
              value={form.trip_id}
              onChange={val => {
                setForm(f => ({ ...f, trip_id: val }));
                applySuggestedAmount(val, form.package_type);
              }}
              options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Package</label>
            <Select
              value={form.package_type}
              onChange={val => {
                const packageType = val as Enquiry['package_type'];
                setForm(f => ({ ...f, package_type: packageType }));
                applySuggestedAmount(form.trip_id, packageType);
              }}
              options={PACKAGE_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
            <input
              type="number"
              min={0}
              value={form.total_amount}
              onChange={e => setForm(f => ({ ...f, total_amount: e.target.value === '' ? '' : +e.target.value }))}
              className={inputClass}
              placeholder="e.g. 15000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
            <input
              type="number"
              min={0}
              value={form.amount_paid}
              onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value === '' ? '' : +e.target.value }))}
              className={inputClass}
              placeholder="e.g. 5000 (advance) — leave blank if unpaid"
            />
            <p className="text-[11px] text-dark-muted mt-1">Any amount here books a seat right away. Full amount auto-closes the enquiry.</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this enquiry" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleSave} loading={saving}>Save Enquiry</Button>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal isOpen={!!paymentTarget} onClose={() => setPaymentTarget(null)} title="Track Payment" size="sm">
        {paymentTarget && (
          <div className="space-y-4">
            <div className="bg-background-warm rounded-xl px-4 py-3">
              <p className="font-medium text-dark">{paymentTarget.full_name}</p>
              <p className="text-dark-muted text-xs">{paymentTarget.trip_title || 'No trip linked'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Package</label>
              <Select
                value={paymentForm.package_type}
                onChange={val => {
                  const packageType = val as Enquiry['package_type'];
                  const suggested = getTripPrice(paymentTarget.trip_id, packageType);
                  setPaymentForm(f => ({ ...f, package_type: packageType, total_amount: suggested ?? f.total_amount }));
                }}
                options={PACKAGE_OPTIONS}
              />
              {paymentTarget.trip_id && (
                <div className="text-xs mt-1">
                  {(() => {
                    const normal = getTripPrice(paymentTarget.trip_id, 'normal');
                    const earlyBird = getTripPrice(paymentTarget.trip_id, 'early_bird');
                    const parts = [];
                    if (normal != null) parts.push(`Normal ${formatPrice(normal)}`);
                    if (earlyBird != null) parts.push(`Early Bird ${formatPrice(earlyBird)}`);
                    const missingOne = normal == null || earlyBird == null;
                    const missingField = normal == null && earlyBird == null
                      ? 'Regular Price per person and Early-Bird Price per person'
                      : normal == null
                        ? 'Regular Price per person'
                        : 'Early-Bird Price per person';

                    return (
                      <>
                        {parts.length > 0 && (
                          <p className="text-dark-muted">Trip price — {parts.join(' · ')}</p>
                        )}
                        {missingOne && (
                          <p className="text-amber-600 mt-0.5">
                            {parts.length === 0
                              ? "This trip has no price set, so we can't suggest an amount. "
                              : `This trip's ${missingField} isn't set yet. `}
                            Add it under{' '}
                            <Link to="/admin/trips" className="underline font-medium" onClick={() => setPaymentTarget(null)}>
                              Upcoming Trips → edit this trip → {missingField}
                            </Link>.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={paymentForm.total_amount}
                  onChange={e => setPaymentForm(f => ({ ...f, total_amount: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 15000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={paymentForm.amount_paid}
                  onChange={e => setPaymentForm(f => ({ ...f, amount_paid: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 5000 (advance)"
                />
              </div>
            </div>

            {paymentForm.total_amount !== '' && paymentForm.amount_paid !== '' && (
              <p className="text-sm text-dark-muted">
                Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, Number(paymentForm.total_amount) - Number(paymentForm.amount_paid)))}</span>
              </p>
            )}

            {paymentTarget.cancelled_at && (
              <div className="bg-red-50 rounded-xl p-3 space-y-2">
                <p className="text-red-700 text-xs font-medium">This booking is cancelled. Track any refund here as you process it.</p>
                {paymentTarget.suggested_refund_amount != null && (
                  <p className="text-xs text-dark-muted bg-white/60 rounded-lg px-2 py-1.5">
                    Suggested refund (estimate — not binding, confirm before use): <span className="font-semibold text-dark">{formatPrice(paymentTarget.suggested_refund_amount)}</span>
                    {paymentTarget.third_party_charges ? ` — after ${formatPrice(paymentTarget.third_party_charges)} in third-party charges` : ''}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">Refund Amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={paymentForm.refund_amount}
                    onChange={e => setPaymentForm(f => ({ ...f, refund_amount: e.target.value === '' ? '' : +e.target.value }))}
                    className={inputClass}
                    placeholder="How much has been refunded so far"
                  />
                  <p className="text-[11px] text-dark-muted mt-1">
                    They paid {formatPrice(paymentTarget.amount_paid || 0)} in total.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="md" onClick={() => setPaymentTarget(null)}>Cancel</Button>
              <Button variant="primary" size="md" onClick={handleSavePayment} loading={savingPayment}>Save Payment</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel Booking Modal */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Booking" size="sm">
        {cancelTarget && (
          <div className="space-y-4">
            <div className="bg-background-warm rounded-xl px-4 py-3">
              <p className="font-medium text-dark">{cancelTarget.full_name}</p>
              <p className="text-dark-muted text-xs">{cancelTarget.trip_title || 'No trip linked'}</p>
            </div>

            <p className="text-sm text-dark-muted">
              This frees up their seat right away. {cancelTarget.amount_paid > 0 && `They've paid ${formatPrice(cancelTarget.amount_paid)} so far — `}
              amount paid stays on record; refunds are tracked separately from the Payment screen.
            </p>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Third-Party Charges (₹)</label>
              <input
                type="number"
                min={0}
                value={cancelCharges}
                onChange={ev => setCancelCharges(ev.target.value === '' ? '' : +ev.target.value)}
                className={inputClass}
                placeholder="Airline/hotel penalties, if known — optional"
              />
              <p className="text-[11px] text-dark-muted mt-1">
                Used to compute the suggested refund estimate. You can leave this blank and add it later.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="md" onClick={() => setCancelTarget(null)}>Back</Button>
              <Button variant="primary" size="md" onClick={handleConfirmCancel} loading={cancelling}>Confirm Cancellation</Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
