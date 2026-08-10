import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, Star, ChevronUp, ChevronDown, Save } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import ImageUploadField from '../components/ui/ImageUploadField';
import {
  getAllTestimonialsAdmin, createTestimonial, updateTestimonial, deleteTestimonial,
  getSiteContent, upsertSiteContent, deleteImageByUrl,
} from '../services/api';
import { useConfirm } from '../components/ui/useConfirm';
import type { Testimonial, TestimonialsSectionContent } from '../types/types-index';
import { slugify } from '../utils/utils-index';
import { DEFAULT_TESTIMONIALS_SECTION } from '../constants/testimonials-section';

interface TestimonialForm {
  name: string;
  photo: string;
  review: string;
  rating: number;
  destination: string;
  is_published: boolean;
}

const emptyForm: TestimonialForm = {
  name: '', photo: '', review: '', rating: 5, destination: '', is_published: true,
};

export default function AdminTestimonials() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TestimonialForm>(emptyForm);

  const [sectionText, setSectionText] = useState<TestimonialsSectionContent>(DEFAULT_TESTIMONIALS_SECTION);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionSaved, setSectionSaved] = useState(false);

  const load = () => {
    getAllTestimonialsAdmin().then(setItems).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getSiteContent<TestimonialsSectionContent>('testimonials_section')
      .then(data => setSectionText(data || DEFAULT_TESTIMONIALS_SECTION))
      .catch(() => setSectionText(DEFAULT_TESTIMONIALS_SECTION));
  }, []);

  const setSectionField = (key: keyof TestimonialsSectionContent, value: string) => {
    setSectionText(s => ({ ...s, [key]: value }));
  };

  const handleSectionSave = async () => {
    try {
      setSectionSaving(true);
      await upsertSiteContent('testimonials_section', sectionText);
      setSectionSaved(true);
      setTimeout(() => setSectionSaved(false), 2500);
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSectionSaving(false);
    }
  };

  // Tracks the photo URL that was already on the form when the modal opened
  // (empty for create, existing photo for edit). Any storage URL present at
  // close-time that wasn't in this snapshot was uploaded during the session
  // but never saved — delete it best-effort so it doesn't orphan in storage.
  const initialModalPhotoRef = useRef<string>('');
  const STORAGE_BUCKET = 'ulaa';
  const isStorageUrl = (url: string) => url.includes(`/object/public/${STORAGE_BUCKET}/`);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, is_published: true });
    initialModalPhotoRef.current = '';
    setModalOpen(true);
  };

  const openEdit = (t: Testimonial) => {
    setEditing(t);
    setForm({
      name: t.name, photo: t.photo || '', review: t.review, rating: t.rating,
      destination: t.destination || '', is_published: t.is_published,
    });
    initialModalPhotoRef.current = t.photo || '';
    setModalOpen(true);
  };

  const closeModal = () => {
    const current = form.photo;
    const initial = initialModalPhotoRef.current;
    if (current && current !== initial && isStorageUrl(current)) {
      deleteImageByUrl(STORAGE_BUCKET, current).catch(() => {});
    }
    initialModalPhotoRef.current = '';
    setModalOpen(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (editing) {
        await updateTestimonial(editing.id, form);
      } else {
        await createTestimonial({ ...form, sort_order: items.length });
      }
      // Upload is now committed to the DB — nothing to clean up on close.
      initialModalPhotoRef.current = '';
      setModalOpen(false);
      load();
    } catch {
      alert('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Delete this testimonial?', confirmLabel: 'Delete' }))) return;
    await deleteTestimonial(id);
    load();
  };

  const togglePublish = async (t: Testimonial) => {
    await updateTestimonial(t.id, { is_published: !t.is_published });
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    await Promise.all([
      updateTestimonial(a.id, { sort_order: b.sort_order }),
      updateTestimonial(b.id, { sort_order: a.sort_order }),
    ]);
    load();
  };

  const inputClass = `w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors`;

  return (
    <AdminLayout title="Testimonials" subtitle="Manage the 'Real Stories' shown on the homepage.">
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-card p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-dark">Section Text</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Sub Heading</label>
              <input
                value={sectionText.sub_heading}
                onChange={e => setSectionField('sub_heading', e.target.value)}
                className={inputClass}
                placeholder="Real Stories"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Section Heading</label>
              <input
                value={sectionText.heading}
                onChange={e => setSectionField('heading', e.target.value)}
                className={inputClass}
                placeholder="What our travelers say."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Subheading</label>
              <textarea
                value={sectionText.subheading}
                onChange={e => setSectionField('subheading', e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={handleSectionSave} loading={sectionSaving}>
              <Save size={14} /> Save Changes
            </Button>
            {sectionSaved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-dark-muted">{items.length} testimonials</p>
          <Button variant="primary" size="sm" onClick={openCreate}><Plus size={16} /> Add Testimonial</Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-dark-muted bg-white rounded-lg shadow-card">No testimonials yet.</div>
        ) : (
          <div className="bg-white rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-4 text-left">Traveler</th>
                    <th className="px-4 py-4 text-left hidden md:table-cell">Destination</th>
                    <th className="px-4 py-4 text-left hidden md:table-cell">Rating</th>
                    <th className="px-4 py-4 text-left hidden lg:table-cell">Review</th>
                    <th className="px-4 py-4 text-center">Status</th>
                    <th className="px-4 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-warm">
                  {items.map((t, index) => (
                    <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                      <td className="px-4 py-4 font-medium text-dark">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <button onClick={() => move(index, -1)} disabled={index === 0} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronUp size={12} /></button>
                            <button onClick={() => move(index, 1)} disabled={index === items.length - 1} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronDown size={12} /></button>
                          </div>
                          {t.photo && <img src={t.photo} alt={t.name} className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />}
                          <span className="truncate max-w-[140px]">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-dark-muted hidden md:table-cell">{t.destination}</td>
                      <td className="px-4 py-4 text-dark-muted hidden md:table-cell">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: t.rating }).map((_, i) => <Star key={i} size={12} className="fill-secondary text-secondary" />)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-dark-muted hidden lg:table-cell max-w-[280px] truncate">{t.review}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-xs font-button font-semibold px-3 py-1 rounded-md ${t.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                          {t.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => togglePublish(t)} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                            {t.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          <button onClick={() => openEdit(t)} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(t.id)} className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors"><Trash2 size={16} /></button>
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

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Testimonial' : 'Add Testimonial'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Destination</label>
            <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} placeholder="e.g. Spiti Valley" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Rating</label>
            <Select
              value={form.rating}
              onChange={val => setForm(f => ({ ...f, rating: val }))}
              options={[5, 4, 3, 2, 1].map(n => ({ value: n, label: `${n} star${n > 1 ? 's' : ''}` }))}
            />
          </div>
          <div>
            <ImageUploadField
              label="Photo"
              value={form.photo}
              onChange={url => setForm(f => ({ ...f, photo: url }))}
              bucket="ulaa"
              pathPrefix="testimonial-photos"
              fileNamePrefix={slugify(form.name) || undefined}
              hint="Square, at least 200×200px, with the face centered — shown as a small circular avatar."
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Review *</label>
            <textarea value={form.review} onChange={e => setForm(f => ({ ...f, review: e.target.value }))} rows={4} className={`${inputClass} resize-none`} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input type="checkbox" id="tpub" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <label htmlFor="tpub" className="text-sm font-medium text-dark">Publish immediately</label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={handleSave} loading={saving}>
            {editing ? 'Save Changes' : 'Add Testimonial'}
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
