import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Trash2, Star } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import { getGalleryImages, uploadImage, deleteImage } from '../services/api';
import { supabase } from '../services/supabase';
import type { GalleryImage } from '../types';

export default function AdminGallery() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    getGalleryImages().then(setImages).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      setUploading(true);
      for (const file of files) {
        const path = `gallery/${Date.now()}-${file.name}`;
        const url = await uploadImage('ulaa', file, path);
        await supabase.from('gallery').insert({ image_url: url, sort_order: 0 });
      }
      load();
    } catch (err) {
      alert('Failed to upload. Make sure the Supabase storage bucket "ulaa" exists and is public.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (img: GalleryImage) => {
    if (!confirm('Delete this image?')) return;
    const path = img.image_url.split('/').slice(-2).join('/');
    await deleteImage('ulaa', path).catch(() => {});
    await supabase.from('gallery').delete().eq('id', img.id);
    load();
  };

  const toggleFeatured = async (img: GalleryImage) => {
    await supabase.from('gallery').update({ is_featured: !img.is_featured }).eq('id', img.id);
    load();
  };

  return (
    <AdminLayout title="Gallery">
      <div className="space-y-6">
        {/* Upload */}
        <div className="bg-white rounded-2xl shadow-card p-6 border-2 border-dashed border-background-warm hover:border-primary transition-colors">
          <div className="text-center">
            <Upload size={32} className="mx-auto text-primary mb-3" />
            <p className="font-display text-lg font-bold text-dark mb-1">Upload Images</p>
            <p className="text-dark-muted text-sm mb-4">PNG, JPG, WEBP up to 10MB each. Select multiple files at once.</p>
            <input ref={fileRef} type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" id="gallery-upload" />
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={uploading}
              className="cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Choose Files'}
            </Button>
          </div>
        </div>

        {/* Images Grid */}
        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading gallery...</div>
        ) : images.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-card">
            <p className="font-display text-xl text-dark-muted">No images yet. Upload your first!</p>
          </div>
        ) : (
          <>
            <p className="text-dark-muted text-sm">{images.length} images</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {images.map(img => (
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative group rounded-2xl overflow-hidden aspect-square"
                >
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-dark/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => toggleFeatured(img)}
                      className={`p-2 rounded-lg transition-colors ${img.is_featured ? 'bg-secondary text-white' : 'bg-white/20 text-white hover:bg-secondary'}`}
                      title="Toggle featured"
                    >
                      <Star size={16} className={img.is_featured ? 'fill-white' : ''} />
                    </button>
                    <button
                      onClick={() => handleDelete(img)}
                      className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {img.is_featured && (
                    <div className="absolute top-2 left-2 bg-secondary text-white text-xs px-2 py-0.5 rounded-full font-button font-semibold">
                      Featured
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
