import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  PencilSimple as Edit2,
  Trash as Trash2,
  Eye,
  EyeSlash as EyeOff,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
} from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ImageUploadField from '../components/ui/ImageUploadField';
import {
  getAllTripLeadersAdmin, createTripLeader, updateTripLeader, deleteTripLeader, deleteImageByUrl,
} from '../services/api';
import { useConfirm } from '../components/ui/useConfirm';
import type { TripLeader, AboutFounderSocialLink } from '../types/types-index';
import { slugify } from '../utils/utils-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';

interface TripLeaderForm {
  name: string;
  photo: string;
  designation: string;
  description: string;
  social_links: AboutFounderSocialLink[];
  is_published: boolean;
}

const emptyForm: TripLeaderForm = {
  name: '', photo: '', designation: '', description: '', social_links: [], is_published: true,
};

export default function AdminTripLeaders() {
  const confirm = useConfirm();
  const [items, setItems] = useState<TripLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TripLeader | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripLeaderForm>(emptyForm);

  const load = () => {
    getAllTripLeadersAdmin().then(setItems).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

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

  const openEdit = (t: TripLeader) => {
    setEditing(t);
    setForm({
      name: t.name, photo: t.photo || '', designation: t.designation || '',
      description: t.description, social_links: t.social_links || [], is_published: t.is_published,
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
        await updateTripLeader(editing.id, form);
      } else {
        await createTripLeader({ ...form, sort_order: items.length });
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
    if (!(await confirm({ message: 'Delete this trip leader?', confirmLabel: 'Delete' }))) return;
    await deleteTripLeader(id);
    load();
  };

  const togglePublish = async (t: TripLeader) => {
    await updateTripLeader(t.id, { is_published: !t.is_published });
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    await Promise.all([
      updateTripLeader(a.id, { sort_order: b.sort_order }),
      updateTripLeader(b.id, { sort_order: a.sort_order }),
    ]);
    load();
  };

  const updateSocial = (i: number, field: keyof AboutFounderSocialLink, value: string) => {
    const links = form.social_links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l));
    setForm(f => ({ ...f, social_links: links }));
  };
  const addSocial = () =>
    setForm(f => ({ ...f, social_links: [...f.social_links, { platform: '', url: '' }] }));
  const removeSocial = (i: number) =>
    setForm(f => ({ ...f, social_links: f.social_links.filter((_, idx) => idx !== i) }));

  return (
    <AdminLayout title="Trip Leaders" subtitle="Manage the directory of trip leaders that can be assigned to individual trips.">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-dark-muted">{items.length} trip leaders</p>
          <Button variant="primary" size="sm" onClick={openCreate}><Plus size={16} aria-hidden="true" /> Add Trip Leader</Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-dark-muted bg-white rounded-lg shadow-card">No trip leaders yet.</div>
        ) : (
          <>
            {/* Mobile (below sm): a card per trip leader — the desktop
                table's hidden md/lg columns (designation, bio) meant a
                phone was left with only a cramped name/status/actions row,
                so this gives every field room to breathe instead. */}
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
                        {t.designation && (
                          <p className="text-xs text-dark-muted truncate">{t.designation}</p>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${t.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                      {t.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-sm text-dark-muted leading-relaxed line-clamp-3">{t.description}</p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-background-warm">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${t.name} up`}
                        className="p-2 rounded text-dark-muted hover:bg-background disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <ChevronUp size={15} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1}
                        aria-label={`Move ${t.name} down`}
                        className="p-2 rounded text-dark-muted hover:bg-background disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <ChevronDown size={15} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => togglePublish(t)} aria-label={t.is_published ? `Unpublish ${t.name}` : `Publish ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                        {t.is_published ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      </button>
                      <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} aria-hidden="true" /></button>
                      <button onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`} className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors"><Trash2 size={16} aria-hidden="true" /></button>
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
                      <th className="px-4 py-4 text-left">Trip Leader</th>
                      <th className="px-4 py-4 text-left hidden md:table-cell">Designation</th>
                      <th className="px-4 py-4 text-left hidden lg:table-cell">Bio</th>
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
                              <button onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${t.name} up`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronUp size={12} aria-hidden="true" /></button>
                              <button onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${t.name} down`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronDown size={12} aria-hidden="true" /></button>
                            </div>
                            {t.photo && <img src={t.photo} alt={t.name} className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />}
                            <span className="truncate max-w-[140px]">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-dark-muted hidden md:table-cell">{t.designation}</td>
                        <td className="px-4 py-4 text-dark-muted hidden lg:table-cell max-w-[280px] truncate">{t.description}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-xs font-button font-semibold px-3 py-1 rounded-md ${t.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                            {t.is_published ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => togglePublish(t)} aria-label={t.is_published ? `Unpublish ${t.name}` : `Publish ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                              {t.is_published ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                            </button>
                            <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`} className="p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} aria-hidden="true" /></button>
                            <button onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`} className="p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors"><Trash2 size={16} aria-hidden="true" /></button>
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
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Edit Trip Leader' : 'Add Trip Leader'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tl-name" className="block text-sm font-medium text-dark mb-1">Name *</label>
            <input id="tl-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label htmlFor="tl-designation" className="block text-sm font-medium text-dark mb-1">Designation</label>
            <input id="tl-designation" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} className={inputClass} placeholder="e.g. Lead Trip Captain" />
          </div>
          <div className="md:col-span-2">
            <ImageUploadField
              label="Photo"
              value={form.photo}
              onChange={url => setForm(f => ({ ...f, photo: url }))}
              bucket="ulaa"
              pathPrefix="trip-leader-photos"
              fileNamePrefix={slugify(form.name) || undefined}
              hint="Square, at least 600×600px, with the face centered."
              allowUrl
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="tl-description" className="block text-sm font-medium text-dark mb-1">About / Bio *</label>
            <textarea id="tl-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} className={`${inputClass} resize-none`} />
          </div>
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-dark mb-0">Social Links</label>
              <button
                type="button"
                onClick={addSocial}
                className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
              >
                <Plus size={13} aria-hidden="true" /> Add Link
              </button>
            </div>
            <p className="text-xs text-dark-muted -mt-1">
              Full URLs work best, but a bare username (e.g. "justjini_") also works for Instagram, LinkedIn, Facebook, X, YouTube, TikTok, and Pinterest. For WhatsApp, enter a phone number with country code (e.g. "919876543210"). For Mail/Gmail, enter the email address.
            </p>
            {form.social_links.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-36 flex-shrink-0">
                  <label htmlFor={`tl-social-platform-${i}`} className="sr-only">Social link {i + 1} platform</label>
                  <input
                    id={`tl-social-platform-${i}`}
                    value={link.platform}
                    onChange={e => updateSocial(i, 'platform', e.target.value)}
                    className={inputClass}
                    placeholder="Instagram"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label htmlFor={`tl-social-url-${i}`} className="sr-only">{link.platform || `Social link ${i + 1}`} URL or username</label>
                  <input
                    id={`tl-social-url-${i}`}
                    value={link.url}
                    onChange={e => updateSocial(i, 'url', e.target.value)}
                    className={inputClass}
                    placeholder="justjini_ or https://instagram.com/justjini_"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSocial(i)}
                  aria-label={`Remove ${link.platform || `social link ${i + 1}`}`}
                  className="p-1.5 rounded text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input type="checkbox" id="tlpub" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <label htmlFor="tlpub" className="text-sm font-medium text-dark">Publish immediately</label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={handleSave} loading={saving}>
            {editing ? 'Save Changes' : 'Add Trip Leader'}
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
