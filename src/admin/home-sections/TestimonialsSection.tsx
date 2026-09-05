import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  PencilSimple as Edit2,
  Trash as Trash2,
  Eye,
  EyeSlash as EyeOff,
  Star,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
  MapPin,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import ImageUploadField from '../../components/ui/ImageUploadField';
import { deleteImageByUrl } from '../../services/api';
import { useConfirm } from '../../components/ui/useConfirm';
import type { Testimonial, TestimonialsSectionContent } from '../../types/types-index';
import { slugify } from '../../utils/utils-index';
import { makeTempId } from '../useAdminHomePage';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

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

const STORAGE_BUCKET = 'ulaa';

export default function TestimonialsSection({
  sectionText,
  setSectionText,
  items,
  setItems,
  sectionRef,
}: {
  sectionText: TestimonialsSectionContent;
  setSectionText: React.Dispatch<React.SetStateAction<TestimonialsSectionContent>>;
  items: Testimonial[];
  setItems: React.Dispatch<React.SetStateAction<Testimonial[]>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TestimonialForm>(emptyForm);

  const setSectionField = (key: keyof TestimonialsSectionContent, value: string) => {
    setSectionText(s => ({ ...s, [key]: value }));
  };

  // Tracks the photo URL that was already on the form when the modal opened
  // (empty for create, existing photo for edit). Any storage URL present at
  // close-time that wasn't in this snapshot was uploaded during the session
  // but never committed — delete it best-effort so it doesn't orphan in storage.
  const initialModalPhotoRef = useRef<string>('');
  const isStorageUrl = (url: string) => url.includes(`/object/public/${STORAGE_BUCKET}/`);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, is_published: true });
    initialModalPhotoRef.current = '';
    setModalOpen(true);
  };

  const openEdit = (t: Testimonial) => {
    setEditingId(t.id);
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

  // Commits the form into the local list only — the actual create/update
  // DB call happens when the page's Save button is clicked (see
  // useAdminHomePage.handleSave).
  const handleFormSave = () => {
    if (editingId) {
      setItems(prev => prev.map(t => (t.id === editingId ? { ...t, ...form } : t)));
    } else {
      setItems(prev => [...prev, {
        id: makeTempId(),
        ...form,
        sort_order: prev.length,
        created_at: new Date().toISOString(),
      }]);
    }
    initialModalPhotoRef.current = '';
    setModalOpen(false);
  };

  // Existing (already-saved) testimonials are only removed from the
  // working list here — the DB row + photo cleanup happen on the page's
  // Save (see useAdminHomePage.handleSave). A brand new, not-yet-saved
  // testimonial's photo can be cleaned up immediately.
  const handleDelete = async (t: Testimonial) => {
    if (!(await confirm({ message: 'Delete this testimonial?', confirmLabel: 'Delete' }))) return;
    if (t.id.startsWith('new-') && t.photo) {
      deleteImageByUrl(STORAGE_BUCKET, t.photo).catch(() => {});
    }
    setItems(prev => prev.filter(i => i.id !== t.id));
  };

  const togglePublish = (t: Testimonial) => {
    setItems(prev => prev.map(i => (i.id === t.id ? { ...i, is_published: !i.is_published } : i)));
  };

  const move = (index: number, dir: -1 | 1) => {
    setItems(prev => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const arr = [...prev];
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  return (
    <div ref={sectionRef} data-section={3} className="scroll-mt-4 space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Testimonials</h2>
        <p className="text-xs text-dark-muted mt-2">The "Real Stories" section shown on the homepage.</p>
      </div>

      <div className="bg-white rounded-lg shadow-card p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-dark">Section Text</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="test-sub-heading" className="block text-sm font-medium text-dark mb-1">Eyebrow Text</label>
            <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Small script tagline shown above the heading.</p>
            <textarea
              id="test-sub-heading"
              value={sectionText.sub_heading}
              onChange={e => setSectionField('sub_heading', e.target.value)}
              rows={1}
              className={`${inputClass} h-16 resize-none`}
              placeholder="Real Stories"
            />
          </div>
          <div>
            <label htmlFor="test-heading" className="block text-sm font-medium text-dark mb-1">Main Heading</label>
            <p className="text-[11px] text-dark-muted leading-snug mb-1.5">The big bold heading itself.</p>
            <textarea
              id="test-heading"
              value={sectionText.heading}
              onChange={e => setSectionField('heading', e.target.value)}
              rows={1}
              className={`${inputClass} h-16 resize-none`}
              placeholder="What our travelers say."
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="test-subheading" className="block text-sm font-medium text-dark mb-1">Supporting Text</label>
            <p className="text-[11px] text-dark-muted leading-snug mb-1.5">Paragraph shown below the heading.</p>
            <textarea
              id="test-subheading"
              value={sectionText.subheading}
              onChange={e => setSectionField('subheading', e.target.value)}
              rows={2}
              className={`${inputClass} h-16 resize-none`}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-dark-muted">{items.length} testimonials</p>
        <Button variant="primary" size="sm" onClick={openCreate}><Plus size={16} aria-hidden="true" /> Add Testimonial</Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-dark-muted bg-white rounded-lg shadow-card">No testimonials yet.</div>
      ) : (
        <>
          {/* Mobile (below sm): a card per testimonial — the desktop table's
              hidden md/lg columns (destination, rating, review) meant a phone
              was left with only a cramped name/status/actions row, so this
              gives every field room to breathe instead. */}
          <div className="sm:hidden space-y-3">
            {items.map((t, index) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-lg shadow-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {t.photo ? (
                      <img src={t.photo} alt={t.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-background-warm flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-dark truncate">{t.name}</p>
                      {t.destination && (
                        <p className="flex items-center gap-1 text-xs text-dark-muted truncate">
                          <MapPin size={11} className="flex-shrink-0" aria-hidden="true" />
                          {t.destination}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${t.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                    {t.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>

                <div className="flex items-center gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                  {Array.from({ length: t.rating }).map((_, i) => <Star key={i} size={13} className="fill-secondary text-secondary" aria-hidden="true" />)}
                </div>

                <p className="text-sm text-dark-muted leading-relaxed line-clamp-3">{t.review}</p>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-background-warm">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${t.name}'s testimonial up`}
                      className="p-2 rounded text-dark-muted hover:bg-background disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <ChevronUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label={`Move ${t.name}'s testimonial down`}
                      className="p-2 rounded text-dark-muted hover:bg-background disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => togglePublish(t)} aria-label={t.is_published ? `Unpublish ${t.name}'s testimonial` : `Publish ${t.name}'s testimonial`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                      {t.is_published ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                    <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}'s testimonial`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} aria-hidden="true" /></button>
                    <button onClick={() => handleDelete(t)} aria-label={`Delete ${t.name}'s testimonial`} className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors"><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Desktop (sm and up): the full table. */}
          <div className="hidden sm:block bg-white rounded-lg shadow-card overflow-hidden">
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
                            <button onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${t.name}'s testimonial up`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronUp size={12} aria-hidden="true" /></button>
                            <button onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${t.name}'s testimonial down`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronDown size={12} aria-hidden="true" /></button>
                          </div>
                          {t.photo && <img src={t.photo} alt={t.name} className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />}
                          <span className="truncate max-w-[140px]">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-dark-muted hidden md:table-cell">{t.destination}</td>
                      <td className="px-4 py-4 text-dark-muted hidden md:table-cell">
                        <div className="flex items-center gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                          {Array.from({ length: t.rating }).map((_, i) => <Star key={i} size={12} className="fill-secondary text-secondary" aria-hidden="true" />)}
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
                          <button onClick={() => togglePublish(t)} aria-label={t.is_published ? `Unpublish ${t.name}'s testimonial` : `Publish ${t.name}'s testimonial`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                            {t.is_published ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                          </button>
                          <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}'s testimonial`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} aria-hidden="true" /></button>
                          <button onClick={() => handleDelete(t)} aria-label={`Delete ${t.name}'s testimonial`} className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors"><Trash2 size={16} aria-hidden="true" /></button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingId ? 'Edit Testimonial' : 'Add Testimonial'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="test-name" className="block text-sm font-medium text-dark mb-1">Name *</label>
            <input id="test-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label htmlFor="test-destination" className="block text-sm font-medium text-dark mb-1">Destination</label>
            <input id="test-destination" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} placeholder="e.g. Spiti Valley" />
          </div>
          <div>
            <label htmlFor="test-rating" className="block text-sm font-medium text-dark mb-1">Rating</label>
            <Select
              inputId="test-rating"
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
              bucket={STORAGE_BUCKET}
              pathPrefix="testimonial-photos"
              fileNamePrefix={slugify(form.name) || undefined}
              hint="Square, at least 200×200px, with the face centered — shown as a small circular avatar."
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="test-review" className="block text-sm font-medium text-dark mb-1">Review *</label>
            <textarea id="test-review" value={form.review} onChange={e => setForm(f => ({ ...f, review: e.target.value }))} rows={4} className={`${inputClass} resize-none`} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input type="checkbox" id="tpub" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <label htmlFor="tpub" className="text-sm font-medium text-dark">Publish immediately</label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={handleFormSave}>
            {editingId ? 'Save Changes' : 'Add Testimonial'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
