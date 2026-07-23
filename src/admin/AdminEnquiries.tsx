import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, RefreshCw, Plus, CheckCircle2, Circle, MessageCircle, Phone, Camera, MapPin, Globe, HelpCircle } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { getEnquiries, updateEnquiryStatus, createManualEnquiry, setEnquiryPaid, getAllUpcomingTripsAdmin } from '../services/api';
import type { Enquiry, UpcomingTrip } from '../types';
import { formatDate } from '../utils';

const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Contacted', color: 'bg-amber-100 text-amber-700', icon: RefreshCw },
  closed: { label: 'Closed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

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
};

const emptyForm: EnquiryForm = {
  full_name: '', phone: '', email: '', age: '', city: '', trip_id: '', source: 'whatsapp', message: '',
};

export default function AdminEnquiries() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Enquiry['status']>('all');
  const [updating, setUpdating] = useState<string | null>(null);
  const [payUpdating, setPayUpdating] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EnquiryForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error);
  }, []);

  const handleStatusChange = async (id: string, status: Enquiry['status']) => {
    setUpdating(id);
    await updateEnquiryStatus(id, status).catch(console.error);
    load();
    setUpdating(null);
  };

  const handleTogglePaid = async (enquiry: Enquiry) => {
    const nextPaid = !enquiry.is_paid;
    if (nextPaid && !enquiry.trip_id) {
      alert("This enquiry has no trip attached, so seats can't be updated automatically. You can still mark it paid, but link it to a trip to auto-fill seats.");
    }
    setPayUpdating(enquiry.id);
    try {
      await setEnquiryPaid(enquiry, nextPaid);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to update paid status.');
    } finally {
      setPayUpdating(null);
    }
  };

  const openAdd = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) {
      alert('Name and phone are required.');
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
      });
      setModalOpen(false);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to save enquiry.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === 'all' ? enquiries : enquiries.filter(e => e.status === filter);
  const counts = {
    all: enquiries.length,
    new: enquiries.filter(e => e.status === 'new').length,
    contacted: enquiries.filter(e => e.status === 'contacted').length,
    closed: enquiries.filter(e => e.status === 'closed').length,
  };

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

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([['all', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`bg-white rounded-2xl p-4 text-left shadow-card transition-all ${filter === key ? 'ring-2 ring-primary' : 'hover:shadow-card-hover'}`}
            >
              <p className="font-display text-2xl font-bold text-dark">{counts[key]}</p>
              <p className="text-dark-muted text-sm">{label}</p>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading enquiries...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <p className="font-display text-xl text-dark-muted">No enquiries found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Phone</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Trip</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Source</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                    <th className="px-2 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-2 py-3 text-center whitespace-nowrap">Paid</th>
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
                        <td className="px-4 py-3 text-dark-muted hidden md:table-cell truncate">{e.trip_title || '—'}</td>
                        <td className="px-4 py-3 text-dark-muted hidden lg:table-cell truncate">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <srcCfg.icon size={12} className="shrink-0" />
                            {srcCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">{formatDate(e.created_at, { day: 'numeric', month: 'short' })}</td>
                        <td className="px-2 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                            <cfg.icon size={12} className="shrink-0" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => handleTogglePaid(e)}
                            disabled={payUpdating === e.id}
                            title={e.is_paid ? 'Paid — click to undo' : 'Mark as paid (adds 1 seat to the trip)'}
                            className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
                              e.is_paid ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-background-warm text-dark-muted hover:bg-background'
                            }`}
                          >
                            {e.is_paid ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                            {e.is_paid ? 'Paid' : 'Mark Paid'}
                          </button>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <select
                            value={e.status}
                            disabled={updating === e.id}
                            onChange={ev => handleStatusChange(e.id, ev.target.value as Enquiry['status'])}
                            className="w-full text-xs px-1.5 py-1.5 rounded-lg border border-background-warm bg-background text-dark cursor-pointer outline-none focus:border-primary"
                          >
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="closed">Closed</option>
                          </select>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
            <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as Enquiry['source'] }))} className={inputClass}>
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone Call</option>
              <option value="instagram">Instagram</option>
              <option value="walk_in">Walk-in</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Trip</label>
            <select value={form.trip_id} onChange={e => setForm(f => ({ ...f, trip_id: e.target.value }))} className={inputClass}>
              <option value="">— No specific trip —</option>
              {trips.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
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
    </AdminLayout>
  );
}
