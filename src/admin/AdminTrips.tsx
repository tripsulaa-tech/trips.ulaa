import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ImageUploadField from '../components/ui/ImageUploadField';
import MultiImageUploadField from '../components/ui/MultiImageUploadField';
import TagListEditor from '../components/ui/TagListEditor';
import ItineraryEditor from '../components/ui/ItineraryEditor';
import FAQEditor from '../components/ui/FAQEditor';
import { getAllUpcomingTripsAdmin, createUpcomingTrip, updateUpcomingTrip, deleteUpcomingTrip } from '../services/api';

import type { UpcomingTrip, ItineraryDay, FAQ } from '../types';
import { formatDate, slugify } from '../utils';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../constants/terms';

interface TripForm {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
  highlights: string[];
  itinerary: ItineraryDay[];
  included: string[];
  not_included: string[];
  things_to_carry: string[];
  meeting_point: string;
  meeting_point_map_url: string;
  faqs: FAQ[];
  total_seats: number;
  seats_booked: number;
  price: number | '';
  early_bird_price: number | '';
  early_bird_deadline: string;
  cover_image: string;
  gallery_images: string[];
  terms_and_conditions: string;
  is_published: boolean;
}

const emptyForm: TripForm = {
  title: '', destination: '', start_date: '', end_date: '', duration: '',
  description: '', highlights: [], itinerary: [], included: [], not_included: [],
  things_to_carry: [], meeting_point: '', meeting_point_map_url: '', faqs: [], total_seats: 15, seats_booked: 0, price: '',
  early_bird_price: '', early_bird_deadline: '',
  cover_image: '', gallery_images: [], terms_and_conditions: DEFAULT_TERMS_AND_CONDITIONS, is_published: false,
};

export default function AdminTrips() {
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<UpcomingTrip | null>(null);
  const [viewingTrip, setViewingTrip] = useState<UpcomingTrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripForm>(emptyForm);

  const load = () => {
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingTrip(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (trip: UpcomingTrip) => {
    setEditingTrip(trip);
    setForm({
      title: trip.title, destination: trip.destination,
      start_date: trip.start_date, end_date: trip.end_date,
      duration: trip.duration, description: trip.description,
      highlights: trip.highlights || [], itinerary: trip.itinerary || [],
      included: trip.included || [], not_included: trip.not_included || [],
      things_to_carry: trip.things_to_carry || [], meeting_point: trip.meeting_point || '',
      meeting_point_map_url: trip.meeting_point_map_url || '',
      faqs: trip.faqs || [], total_seats: trip.total_seats, seats_booked: trip.seats_booked || 0,
      price: trip.price ?? '', early_bird_price: trip.early_bird_price ?? '',
      early_bird_deadline: trip.early_bird_deadline || '',
      cover_image: trip.cover_image || '',
      gallery_images: trip.gallery_images || [], is_published: trip.is_published,
      terms_and_conditions: trip.terms_and_conditions || DEFAULT_TERMS_AND_CONDITIONS,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = {
        ...form,
        slug: slugify(form.title),
        price: form.price === '' ? undefined : form.price,
        early_bird_price: form.early_bird_price === '' ? undefined : form.early_bird_price,
        early_bird_deadline: form.early_bird_deadline || undefined,
        seats_booked: Math.max(0, Math.min(form.seats_booked, form.total_seats)),
      };
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
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Trip</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Destination</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Seats</th>
                    <th className="px-2 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-warm">
                  {trips.map(trip => (
                    <motion.tr key={trip.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                      <td className="px-4 py-3 font-medium text-dark truncate max-w-[150px] sm:max-w-none">
                        <button
                          onClick={() => setViewingTrip(trip)}
                          className="text-left hover:text-primary hover:underline underline-offset-2 truncate"
                          title="View details"
                        >
                          {trip.title}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell truncate">{trip.destination}</td>
                      <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">{formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell whitespace-nowrap">
                        {trip.seats_booked}/{trip.total_seats}
                        <span className="text-xs text-dark-muted/70 ml-1">
                          ({Math.max(0, trip.total_seats - trip.seats_booked)} left)
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-block text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${trip.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                          {trip.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="pl-4 pr-3 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => togglePublish(trip)} className="p-1.5 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors" title={trip.is_published ? 'Unpublish' : 'Publish'}>
                            {trip.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button onClick={() => openEdit(trip)} className="p-1.5 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(trip.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors">
                            <Trash2 size={15} />
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
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTrip ? 'Edit Trip' : 'Add Trip'} size="xl">
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
            <input type="number" min={0} value={form.total_seats} onChange={e => setForm(f => ({ ...f, total_seats: +e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Seats Filled</label>
            <input
              type="number"
              min={0}
              max={form.total_seats}
              value={form.seats_booked}
              onChange={e => setForm(f => ({ ...f, seats_booked: Math.max(0, Math.min(+e.target.value, f.total_seats)) }))}
              className={inputClass}
            />
            <p className="text-xs text-dark-muted mt-1">
              {Math.max(0, form.total_seats - form.seats_booked)} of {form.total_seats} seats left
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Regular Price per person (₹)</label>
            <input
              type="number"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? '' : +e.target.value }))}
              className={inputClass}
              placeholder="e.g. 42999"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Early-Bird Price per person (₹)</label>
            <input
              type="number"
              value={form.early_bird_price}
              onChange={e => setForm(f => ({ ...f, early_bird_price: e.target.value === '' ? '' : +e.target.value }))}
              className={inputClass}
              placeholder="e.g. 39999 (optional)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Early-Bird Deadline</label>
            <input
              type="date"
              value={form.early_bird_deadline}
              onChange={e => setForm(f => ({ ...f, early_bird_deadline: e.target.value }))}
              className={inputClass}
            />
            <p className="text-xs text-dark-muted mt-1">The early-bird price shows automatically until this date, then the page switches to the regular price on its own.</p>
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
            <p className="text-xs text-dark-muted mb-1">Short overview only — put the day-by-day plan in Itinerary below, not here.</p>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${inputClass} resize-none`} />
          </div>

          <div className="md:col-span-2 border-t border-background-warm pt-4">
            <TagListEditor
              label="Trip Highlights"
              value={form.highlights}
              onChange={items => setForm(f => ({ ...f, highlights: items }))}
              placeholder="e.g. Chandratal Lake at dawn"
            />
          </div>

          <div className="md:col-span-2 border-t border-background-warm pt-4">
            <ItineraryEditor
              value={form.itinerary}
              onChange={days => setForm(f => ({ ...f, itinerary: days }))}
            />
          </div>

          <div className="border-t border-background-warm pt-4">
            <TagListEditor
              label="What's Included"
              value={form.included}
              onChange={items => setForm(f => ({ ...f, included: items }))}
              placeholder="e.g. All meals"
            />
          </div>
          <div className="border-t border-background-warm pt-4">
            <TagListEditor
              label="What's Not Included"
              value={form.not_included}
              onChange={items => setForm(f => ({ ...f, not_included: items }))}
              placeholder="e.g. Flights"
            />
          </div>

          <div className="md:col-span-2 border-t border-background-warm pt-4">
            <TagListEditor
              label="Things to Carry"
              value={form.things_to_carry}
              onChange={items => setForm(f => ({ ...f, things_to_carry: items }))}
              placeholder="e.g. Warm jacket"
            />
          </div>

          <div className="md:col-span-2 border-t border-background-warm pt-4">
            <label className="block text-sm font-medium text-dark mb-1">Meeting Point</label>
            <div className="flex gap-2">
              <input
                value={form.meeting_point}
                onChange={e => setForm(f => ({ ...f, meeting_point: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Shimla Bus Stand, Himachal Pradesh — 7:00 AM on Day 1"
              />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.meeting_point || form.destination)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { if (!form.meeting_point.trim() && !form.destination.trim()) e.preventDefault(); }}
                className="shrink-0 flex items-center gap-1.5 px-3 rounded-xl border-2 border-background-warm bg-background text-dark text-sm font-medium hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
                title="Opens Google Maps in a new tab, already searching for this"
              >
                Find on Maps ↗
              </a>
            </div>
            <p className="text-xs text-dark-muted mt-1.5">Shown as plain text on the trip page. Click "Find on Maps" to jump straight to a search for it.</p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Meeting Point — Google Maps Link</label>
            <input
              value={form.meeting_point_map_url}
              onChange={e => setForm(f => ({ ...f, meeting_point_map_url: e.target.value }))}
              className={inputClass}
              placeholder="Paste the link here"
            />
            <p className="text-xs text-dark-muted mt-1.5">
              In the Maps tab that opened: confirm the pin is on the right spot (search again if not) → tap <span className="font-medium text-dark">Share</span> → <span className="font-medium text-dark">Copy link</span> → paste it above.
              {form.meeting_point_map_url.trim() && (
                <>
                  {' '}
                  <a
                    href={form.meeting_point_map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-medium hover:underline"
                  >
                    Open this link ↗
                  </a>
                </>
              )}
            </p>
          </div>

          <div className="md:col-span-2 border-t border-background-warm pt-4">
            <MultiImageUploadField
              label="Photo Gallery"
              value={form.gallery_images}
              onChange={urls => setForm(f => ({ ...f, gallery_images: urls }))}
              bucket="ulaa"
              pathPrefix={`trips/${editingTrip ? editingTrip.id : 'new'}`}
            />
          </div>

          <div className="md:col-span-2 border-t border-background-warm pt-4">
            <FAQEditor
              value={form.faqs}
              onChange={faqs => setForm(f => ({ ...f, faqs }))}
            />
          </div>

          <div className="md:col-span-2 border-t border-background-warm pt-4">
            <label className="block text-sm font-medium text-dark mb-1">Terms & Conditions</label>
            <p className="text-xs text-dark-muted mb-1.5">
              Shown to participants on the booking form for this trip — they must tick a checkbox agreeing to these before they can submit an enquiry. Pre-filled with the standard terms; edit freely for this trip.
            </p>
            <textarea
              value={form.terms_and_conditions}
              onChange={e => setForm(f => ({ ...f, terms_and_conditions: e.target.value }))}
              rows={10}
              className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-3 border-t border-background-warm pt-4">
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

      {/* View-only details popup — no editable fields, just a clean read-out */}
      <Modal isOpen={!!viewingTrip} onClose={() => setViewingTrip(null)} title={viewingTrip?.title || 'Trip Details'} size="lg">
        {viewingTrip && (
          <div className="space-y-5">
            {viewingTrip.cover_image && (
              <img src={viewingTrip.cover_image} alt={viewingTrip.title} className="w-full h-48 object-cover rounded-xl" />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${viewingTrip.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                {viewingTrip.is_published ? 'Published' : 'Draft'}
              </span>
              <span className="text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap bg-background-warm text-dark-muted">
                {viewingTrip.seats_booked}/{viewingTrip.total_seats} seats booked
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Destination</p>
                <p className="text-dark">{viewingTrip.destination}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Duration</p>
                <p className="text-dark">{viewingTrip.duration}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Dates</p>
                <p className="text-dark">
                  {formatDate(viewingTrip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' – '}
                  {formatDate(viewingTrip.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Price</p>
                <p className="text-dark">
                  {viewingTrip.price ? `₹${viewingTrip.price.toLocaleString('en-IN')}` : '—'}
                  {viewingTrip.early_bird_price ? ` (Early-bird ₹${viewingTrip.early_bird_price.toLocaleString('en-IN')})` : ''}
                </p>
              </div>
              {viewingTrip.meeting_point && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-dark-muted mb-0.5">Meeting Point</p>
                  <p className="text-dark">{viewingTrip.meeting_point}</p>
                </div>
              )}
            </div>

            {viewingTrip.description && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Description</p>
                <p className="text-sm text-dark whitespace-pre-line">{viewingTrip.description}</p>
              </div>
            )}

            {viewingTrip.highlights?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Highlights</p>
                <div className="flex flex-wrap gap-1.5">
                  {viewingTrip.highlights.map((h, i) => (
                    <span key={i} className="text-xs bg-background-warm text-dark px-2 py-1 rounded-full">{h}</span>
                  ))}
                </div>
              </div>
            )}

            {viewingTrip.itinerary?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Itinerary</p>
                <div className="space-y-2">
                  {viewingTrip.itinerary.map((d, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium text-dark">Day {d.day || i + 1}: {d.title}</p>
                      {d.description && <p className="text-dark-muted text-xs mt-0.5">{d.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(viewingTrip.included?.length > 0 || viewingTrip.not_included?.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {viewingTrip.included?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-dark-muted mb-1">What's Included</p>
                    <ul className="text-sm text-dark list-disc list-inside space-y-0.5">
                      {viewingTrip.included.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {viewingTrip.not_included?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-dark-muted mb-1">Not Included</p>
                    <ul className="text-sm text-dark list-disc list-inside space-y-0.5">
                      {viewingTrip.not_included.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {viewingTrip.things_to_carry?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Things to Carry</p>
                <div className="flex flex-wrap gap-1.5">
                  {viewingTrip.things_to_carry.map((t, i) => (
                    <span key={i} className="text-xs bg-background-warm text-dark px-2 py-1 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {viewingTrip.gallery_images?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Gallery ({viewingTrip.gallery_images.length})</p>
                <div className="grid grid-cols-4 gap-2">
                  {viewingTrip.gallery_images.slice(0, 8).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded-lg" />
                  ))}
                </div>
              </div>
            )}

            {(viewingTrip.terms_and_conditions || '').trim() && (
              <details className="group">
                <summary className="text-xs font-medium text-dark-muted mb-1 cursor-pointer select-none list-none flex items-center gap-1">
                  <span className="transition-transform group-open:rotate-90">▶</span> Terms & Conditions
                </summary>
                <p className="text-xs text-dark-muted whitespace-pre-line mt-2 bg-background rounded-xl p-3 max-h-64 overflow-y-auto">
                  {viewingTrip.terms_and_conditions}
                </p>
              </details>
            )}

            <div className="flex gap-3 pt-2 border-t border-background-warm">
              <Button
                variant="primary"
                size="md"
                onClick={() => { const t = viewingTrip; setViewingTrip(null); openEdit(t); }}
              >
                Edit Trip
              </Button>
              <Button variant="outline" size="md" onClick={() => setViewingTrip(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
