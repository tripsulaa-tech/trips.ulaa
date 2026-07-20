import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ImageUploadField from '../components/ui/ImageUploadField';
import MultiImageUploadField from '../components/ui/MultiImageUploadField';
import { getAllCompletedTripsAdmin, createCompletedTrip, updateCompletedTrip, deleteCompletedTrip } from '../services/api';

import type { CompletedTrip } from '../types';
import { formatDate, slugify } from '../utils';

interface AlbumForm {
  title: string;
  destination: string;
  trip_date: string;
  description: string;
  participants: number;
  cover_image: string;
  gallery_images: string[];
  is_published: boolean;
}

export default function AdminAlbums() {
  const [albums, setAlbums] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompletedTrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AlbumForm>({
    title: '', destination: '', trip_date: '', description: '', participants: 10, cover_image: '', gallery_images: [], is_published: false,
  });

  const load = () => {
    getAllCompletedTripsAdmin().then(setAlbums).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', destination: '', trip_date: '', description: '', participants: 10, cover_image: '', gallery_images: [], is_published: false });
    setModalOpen(true);
  };

  const openEdit = (album: CompletedTrip) => {
    setEditing(album);
    setForm({ title: album.title, destination: album.destination, trip_date: album.trip_date, description: album.description, participants: album.participants, cover_image: album.cover_image || '', gallery_images: album.gallery_images || [], is_published: album.is_published });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = { ...form, slug: slugify(form.title) };
      if (editing) await updateCompletedTrip(editing.id, data);
      else await createCompletedTrip(data);
      setModalOpen(false);
      load();
    } catch { alert('Failed to save.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this album?')) return;
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Album</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Destination</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Date</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Participants</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Photos</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-warm">
                  {albums.map(album => (
                    <motion.tr key={album.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                      <td className="px-4 py-3 font-medium text-dark max-w-[200px] truncate">{album.title}</td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell">{album.destination}</td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell">{formatDate(album.trip_date, { month: 'long', year: 'numeric' })}</td>
                      <td className="px-4 py-3 text-dark-muted hidden lg:table-cell">{album.participants}</td>
                      <td className="px-4 py-3 text-dark-muted hidden lg:table-cell">{album.gallery_images?.length || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-button font-semibold px-3 py-1 rounded-full ${album.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                          {album.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => togglePublish(album)} className="p-2 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors">
                            {album.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          <button onClick={() => openEdit(album)} className="p-2 rounded-lg hover:bg-background text-dark-muted hover:text-primary transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(album.id)} className="p-2 rounded-lg hover:bg-red-50 text-dark-muted hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
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
            <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Trip Date *</label>
            <input type="date" value={form.trip_date} onChange={e => setForm(f => ({ ...f, trip_date: e.target.value }))} className={inputClass} />
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
    </AdminLayout>
  );
}
