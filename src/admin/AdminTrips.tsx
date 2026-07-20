import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ImageUploadField from '../components/ui/ImageUploadField';
import { getAllUpcomingTripsAdmin, createUpcomingTrip, updateUpcomingTrip, deleteUpcomingTrip } from '../services/api';

import type { UpcomingTrip } from '../types';
import { formatDate, slugify } from '../utils';

interface TripForm {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
  total_seats: number;
  cover_image: string;
  is_published: boolean;
}

export default function AdminTrips() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<UpcomingTrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripForm>({
    title: '', destination: '', start_date: '', end_date: '',
    duration: '', description: '', total_seats: 15, cover_image: '', is_published: false,
  });

  const load = () => {
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingTrip(null);
    setForm({ title: '', destination: '', start_date: '', end_date: '', duration: '', description: '', total_seats: 15, cover_image: '', is_published: false });
    setModalOpen(true);
  };

  const openEdit = (trip: UpcomingTrip) => {
    setEditingTrip(trip);
    setForm({
      title: trip.title, destination: trip.destination,
      start_date: trip.start_date, end_date: trip.end_date,
      duration: trip.duration, description: trip.description,
      total_seats: trip.total_seats, cover_image: trip.cover_image || '',
      is_published: trip.is_published,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = { ...form, slug: slugify(form.title), highlights: [], itinerary: [], included: [], not_included: [], things_to_carry: [], faqs: [], gallery_images: [], seats_booked: editingTrip?.seats_booked || 0 };
      if (editingTrip) {
        await updateUpcomingTrip(editingTrip.id, data);
      } else {
        await createUpcomingTrip(data);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert('Failed to save trip.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trip? This cannot be undone.')) return;
    await deleteUpcomingTrip(id);
    load();
  };

  const togglePublish = async (trip: UpcomingTrip) => {
    await updateUpcomingTrip(trip.id, { is_published: !trip.is_published });
    load();
  };

  const inputClass = `w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors`;

  return (
    <AdminLayout title="Upcoming Trips">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-dark-muted">{trips.length} trips</p>
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus size={16} /> Add Trip
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading...</div>
        ) : trips.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <p className="font-display text-xl text-dark-muted mb-4">No trips yet.</p>
            <Button variant="primary" onClick={openCreate}><Plus size={16} /> Add Your First Trip</Button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Trip</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Destination</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Seats</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-warm">
                  {trips.map(trip => (
                    <motion.tr key={trip.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                      <td className="px-4 py-3 font-medium text-dark max-w-[200px] truncate">{trip.title}</td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell">{trip.destination}</td>
                      <td className="px-4 py-3 text-dark-muted hidden lg:table-cell">{formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell">{trip.seats_booked}/{trip.total_seats}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block text-xs font-button font-semibold px-3 py-1 rounded-full ${trip.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                          {trip.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => togglePublish(trip)} className="p-2 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors" title={trip.is_published ? 'Unpublish' : 'Publish'}>
                            {trip.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          <button onClick={() => openEdit(trip)} className="p-2 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(trip.id)} className="p-2 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTrip ? 'Edit Trip' : 'Add Trip'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Trip Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="e.g. Spiti Valley Winter Expedition" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Destination *</label>
            <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} placeholder="e.g. Spiti, Himachal Pradesh" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Duration *</label>
            <input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} className={inputClass} placeholder="e.g. 7 Days / 6 Nights" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Start Date *</label>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">End Date *</label>
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Total Seats</label>
            <input type="number" value={form.total_seats} onChange={e => setForm(f => ({ ...f, total_seats: +e.target.value }))} className={inputClass} />
          </div>
          <div>
            <ImageUploadField
              label="Cover Image"
              value={form.cover_image}
              onChange={url => setForm(f => ({ ...f, cover_image: url }))}
              bucket="ulaa"
              pathPrefix="trip-covers"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${inputClass} resize-none`} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input type="checkbox" id="is_published" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <label htmlFor="is_published" className="text-sm font-medium text-dark">Publish immediately</label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleSave} loading={saving}>
            {editingTrip ? 'Save Changes' : 'Create Trip'}
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
