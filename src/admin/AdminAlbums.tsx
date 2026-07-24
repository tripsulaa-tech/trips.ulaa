import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ImageUploadField from '../components/ui/ImageUploadField';
import MultiImageUploadField from '../components/ui/MultiImageUploadField';
import DatePicker from '../components/ui/DatePicker';
import { getAllCompletedTripsAdmin, createCompletedTrip, updateCompletedTrip, deleteCompletedTrip } from '../services/api';

import { useConfirm } from '../components/ui/ConfirmDialog';
import type { CompletedTrip } from '../types';
import { formatDate, slugify, formatBatchLabel, formatBatchShortLabel } from '../utils';

interface AlbumForm {
  title: string;
  destination: string;
  map_url: string;
  trip_date: string;
  description: string;
  batch: string;
  participants: number;
  cover_image: string;
  gallery_images: string[];
  is_published: boolean;
}

export default function AdminAlbums() {
  const confirm = useConfirm();
  const [albums, setAlbums] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompletedTrip | null>(null);
  const [viewing, setViewing] = useState<CompletedTrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AlbumForm>({
    title: '', destination: '', map_url: '', trip_date: '', description: '', batch: '', participants: 10, cover_image: '', gallery_images: [], is_published: false,
  });

  const load = () => {
    getAllCompletedTripsAdmin().then(setAlbums).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', destination: '', map_url: '', trip_date: '', description: '', batch: '', participants: 10, cover_image: '', gallery_images: [], is_published: false });
    setModalOpen(true);
  };

  const openEdit = (album: CompletedTrip) => {
    setEditing(album);
    setForm({ title: album.title, destination: album.destination, map_url: album.map_url || '', trip_date: album.trip_date, description: album.description, batch: album.batch || '', participants: album.participants, cover_image: album.cover_image || '', gallery_images: album.gallery_images || [], is_published: album.is_published });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const batch = form.batch.trim() || undefined;
    const titleNorm = form.title.trim().toLowerCase();
    const batchNorm = (batch || '').trim().toLowerCase();
    const duplicate = albums.some(a =>
      a.id !== editing?.id &&
      a.title.trim().toLowerCase() === titleNorm &&
      (a.batch || '').trim().toLowerCase() === batchNorm
    );
    if (duplicate) {
      alert('An album with this title already exists' + (batch ? ' for this batch' : '') + '. Use a different batch, or change the title.');
      return;
    }

    try {
      setSaving(true);
      const slugSource = batch ? `${form.title} ${batch}` : form.title;
      const data = { ...form, batch, slug: slugify(slugSource) };
      if (editing) await updateCompletedTrip(editing.id, data);
      else await createCompletedTrip(data);
      setModalOpen(false);
      load();
    } catch { alert('Failed to save.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Delete this album?', confirmLabel: 'Delete' }))) return;
    await deleteCompletedTrip(id);
    load();
  };

  const togglePublish = async (album: CompletedTrip) => {
    await updateCompletedTrip(album.id, { is_published: !album.is_published });
    load();
  };

  const inputClass = `w-full px-3 py-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors`;

  return (
    <AdminLayout title="Completed Trips">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-dark-muted">{albums.length} albums</p>
          <Button variant="primary" size="sm" onClick={openCreate}><Plus size={16} /> Add Album</Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Album</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Destination</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Date</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Participants</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Photos</th>
                    <th className="px-2 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-warm">
                  {albums.map(album => (
                    <motion.tr key={album.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                      <td className="px-4 py-3 font-medium text-dark max-w-[150px] sm:max-w-none">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            onClick={() => setViewing(album)}
                            className="truncate text-left hover:text-primary hover:underline underline-offset-2"
                            title="View details"
                          >
                            {album.title}
                          </button>
                          {album.batch && (
                            <span className="shrink-0 text-xs font-button font-medium text-primary bg-background-warm px-2 py-0.5 rounded-full whitespace-nowrap">
                              <span className="sm:hidden">{formatBatchShortLabel(album.batch)}</span>
                              <span className="hidden sm:inline">{formatBatchLabel(album.batch)}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell truncate">{album.destination}</td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell whitespace-nowrap">{formatDate(album.trip_date, { month: 'long', year: 'numeric' })}</td>
                      <td className="px-4 py-3 text-dark-muted hidden lg:table-cell">{album.participants}</td>
                      <td className="px-4 py-3 text-dark-muted hidden lg:table-cell">{album.gallery_images?.length || 0}</td>
                      <td className="px-2 py-3 text-center">
                        <span className={`text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${album.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                          {album.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="pl-4 pr-3 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => togglePublish(album)} className="p-1.5 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors">
                            {album.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button onClick={() => openEdit(album)} className="p-1.5 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={15} /></button>
                          <button onClick={() => handleDelete(album.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors"><Trash2 size={15} /></button>
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Album' : 'Add Album'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Album Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="e.g. Magical Meghalaya" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Destination *</label>
            <div className="flex gap-2">
              <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.destination)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { if (!form.destination.trim()) e.preventDefault(); }}
                className="shrink-0 flex items-center gap-1.5 px-3 rounded-xl border-2 border-background-warm bg-background text-dark text-sm font-medium hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
                title="Opens Google Maps in a new tab, already searching for this"
              >
                Find on Maps ↗
              </a>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Destination — Google Maps Link</label>
            <input
              value={form.map_url}
              onChange={e => setForm(f => ({ ...f, map_url: e.target.value }))}
              className={inputClass}
              placeholder="Paste the link here"
            />
            <p className="text-xs text-dark-muted mt-1.5">
              Optional. In the Maps tab: confirm the pin is right → <span className="font-medium text-dark">Share</span> → <span className="font-medium text-dark">Copy link</span> → paste here. Without this, the album page falls back to a text search for the destination.
              {form.map_url.trim() && (
                <>
                  {' '}
                  <a href={form.map_url} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
                    Open this link ↗
                  </a>
                </>
              )}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Batch (optional)</label>
            <input value={form.batch} onChange={e => setForm(f => ({ ...f, batch: e.target.value }))} className={inputClass} placeholder="e.g. 1 (shows as 'Batch 1')" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Trip Date *</label>
            <DatePicker value={form.trip_date} onChange={trip_date => setForm(f => ({ ...f, trip_date }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Participants</label>
            <input type="number" value={form.participants} onChange={e => setForm(f => ({ ...f, participants: +e.target.value }))} className={inputClass} />
          </div>
          <div>
            <ImageUploadField
              label="Cover Image"
              value={form.cover_image}
              onChange={url => setForm(f => ({ ...f, cover_image: url }))}
              bucket="ulaa"
              pathPrefix="album-covers"
            />
          </div>
          <div className="md:col-span-2">
            <MultiImageUploadField
              label="Album Photos"
              value={form.gallery_images}
              onChange={urls => setForm(f => ({ ...f, gallery_images: urls }))}
              bucket="ulaa"
              pathPrefix={`albums/${editing ? editing.id : 'new'}`}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${inputClass} resize-none`} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input type="checkbox" id="pub" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
            <label htmlFor="pub" className="text-sm font-medium text-dark">Publish immediately</label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" size="md" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleSave} loading={saving}>
            {editing ? 'Save Changes' : 'Create Album'}
          </Button>
        </div>
      </Modal>

      {/* View-only details popup — no editable fields, just a clean read-out */}
      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.title || 'Album Details'} size="lg">
        {viewing && (
          <div className="space-y-5">
            {viewing.cover_image && (
              <img src={viewing.cover_image} alt={viewing.title} className="w-full h-48 object-cover rounded-xl" />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap ${viewing.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                {viewing.is_published ? 'Published' : 'Draft'}
              </span>
              {viewing.batch && (
                <span className="text-xs font-button font-semibold px-2 py-1 rounded-full whitespace-nowrap bg-background-warm text-dark-muted">
                  {formatBatchLabel(viewing.batch)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Destination</p>
                <p className="text-dark">{viewing.destination}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Trip Date</p>
                <p className="text-dark">{formatDate(viewing.trip_date, { month: 'long', year: 'numeric' })}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Participants</p>
                <p className="text-dark">{viewing.participants}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Photos</p>
                <p className="text-dark">{viewing.gallery_images?.length || 0}</p>
              </div>
            </div>

            {viewing.description && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Description</p>
                <p className="text-sm text-dark whitespace-pre-line">{viewing.description}</p>
              </div>
            )}

            {viewing.gallery_images?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Gallery ({viewing.gallery_images.length})</p>
                <div className="grid grid-cols-4 gap-2">
                  {viewing.gallery_images.slice(0, 8).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded-lg" />
                  ))}
                </div>
              </div>
            )}

            {(viewing.original_itinerary?.length || viewing.original_highlights?.length
              || viewing.original_included?.length || viewing.original_not_included?.length) ? (
              <details className="group">
                <summary className="text-xs font-medium text-dark-muted mb-1 cursor-pointer select-none list-none flex items-center gap-1">
                  <span className="transition-transform group-open:rotate-90">▶</span> Original Trip Plan
                  <span className="text-dark-muted/70 font-normal">(from Upcoming Trips — admin reference only, not shown publicly)</span>
                </summary>
                <div className="mt-2 bg-background rounded-xl p-3 max-h-80 overflow-y-auto app-scroll space-y-4">
                  {viewing.original_highlights?.length ? (
                    <div>
                      <p className="text-xs font-medium text-dark-muted mb-1">Highlights</p>
                      <div className="flex flex-wrap gap-1.5">
                        {viewing.original_highlights.map((h, i) => (
                          <span key={i} className="text-xs bg-white text-dark px-2 py-1 rounded-full">{h}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {viewing.original_itinerary?.length ? (
                    <div>
                      <p className="text-xs font-medium text-dark-muted mb-1">Itinerary</p>
                      <div className="space-y-2">
                        {viewing.original_itinerary.map((d, i) => (
                          <div key={i} className="text-sm">
                            <p className="font-medium text-dark">Day {d.day || i + 1}: {d.title}</p>
                            {d.description && <p className="text-dark-muted text-xs mt-0.5">{d.description}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {(viewing.original_included?.length || viewing.original_not_included?.length) ? (
                    <div className="grid grid-cols-2 gap-4">
                      {viewing.original_included?.length ? (
                        <div>
                          <p className="text-xs font-medium text-dark-muted mb-1">What's Included</p>
                          <ul className="text-sm text-dark list-disc list-inside space-y-0.5">
                            {viewing.original_included.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {viewing.original_not_included?.length ? (
                        <div>
                          <p className="text-xs font-medium text-dark-muted mb-1">Not Included</p>
                          <ul className="text-sm text-dark list-disc list-inside space-y-0.5">
                            {viewing.original_not_included.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}

            <div className="flex gap-3 pt-2 border-t border-background-warm">
              <Button
                variant="primary"
                size="md"
                onClick={() => { const a = viewing; setViewing(null); openEdit(a); }}
              >
                Edit Album
              </Button>
              <Button variant="outline" size="md" onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
