import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  Trash as Trash2,
  Star,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import { uploadImage, deleteImageByUrl } from '../../services/api';
import { useConfirm } from '../../components/ui/useConfirm';
import { makeTempId } from '../useAdminHomePage';
import type { GalleryImage } from '../../types/types-index';

const STORAGE_BUCKET = 'ulaa';

export default function InstagramMomentsSection({
  images,
  setImages,
  sectionRef,
}: {
  images: GalleryImage[];
  setImages: React.Dispatch<React.SetStateAction<GalleryImage[]>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const confirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      setUploading(true);
      const newImages: GalleryImage[] = [];
      for (const file of files) {
        const path = `gallery/${Date.now()}-${file.name}`;
        const url = await uploadImage(STORAGE_BUCKET, file, path);
        newImages.push({
          id: makeTempId(),
          image_url: url,
          sort_order: images.length + newImages.length,
          is_featured: false,
          created_at: new Date().toISOString(),
        });
      }
      setImages(prev => [...prev, ...newImages]);
    } catch {
      alert('Failed to upload. Make sure the Supabase storage bucket "ulaa" exists and is public.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Existing (already-saved) images are only removed from the working list
  // here — the actual DB row + storage file are cleaned up when the page's
  // Save button is clicked (see useAdminHomePage.handleSave). A brand new,
  // not-yet-saved image can be cleaned up from storage immediately, since
  // nothing else could possibly reference it yet.
  const handleDelete = async (img: GalleryImage) => {
    if (!(await confirm({ message: 'Delete this image?', confirmLabel: 'Delete' }))) return;
    if (img.id.startsWith('new-')) {
      deleteImageByUrl(STORAGE_BUCKET, img.image_url).catch(() => {});
    }
    setImages(prev => prev.filter(i => i.id !== img.id));
  };

  const toggleFeatured = (img: GalleryImage) => {
    setImages(prev => prev.map(i => (i.id === img.id ? { ...i, is_featured: !i.is_featured } : i)));
  };

  const move = (index: number, dir: -1 | 1) => {
    setImages(prev => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const arr = [...prev];
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  return (
    <div ref={sectionRef} data-section={4} className="scroll-mt-4 space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Instagram Moments</h2>
        <p className="text-xs text-dark-muted mt-2">Photos shown in the "Instagram Moments" section on the homepage.</p>
      </div>

      <div className="bg-white rounded-lg shadow-card p-6 border-2 border-dashed border-background-warm hover:border-primary transition-colors">
        <div className="text-center">
          <Upload size={32} className="mx-auto text-primary mb-3" aria-hidden="true" />
          <p className="font-display text-lg font-bold text-dark mb-1">Upload Images</p>
          <p className="text-dark-muted text-sm mb-4">PNG, JPG, WEBP up to 10MB each. Select multiple files at once. Square photos work best (e.g. 800×800px) — shown in a cropped grid.</p>
          <input ref={fileRef} type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" id="gallery-upload" />
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={uploading}
            className="cursor-pointer max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} aria-hidden="true" />
            {uploading ? 'Uploading...' : 'Choose Files'}
          </Button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-card">
          <p className="font-display text-xl text-dark-muted">No images yet. Upload your first!</p>
        </div>
      ) : (
        <>
          <p className="text-dark-muted text-sm">{images.length} images</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((img, index) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative group rounded-lg overflow-hidden aspect-square"
              >
                <img src={img.image_url} alt={`Gallery photo ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-dark/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move photo ${index + 1} earlier`}
                    className="p-2 rounded bg-white/20 text-white hover:bg-white/40 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    title="Move earlier"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => toggleFeatured(img)}
                    aria-pressed={img.is_featured}
                    aria-label={img.is_featured ? `Unfeature photo ${index + 1}` : `Feature photo ${index + 1}`}
                    className={`p-2 rounded transition-colors ${img.is_featured ? 'bg-secondary text-white' : 'bg-white/20 text-white hover:bg-secondary'}`}
                    title="Toggle featured"
                  >
                    <Star size={16} className={img.is_featured ? 'fill-white' : ''} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleDelete(img)}
                    aria-label={`Delete photo ${index + 1}`}
                    className="p-2 rounded bg-primary text-white hover:bg-primary-dark transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === images.length - 1}
                    aria-label={`Move photo ${index + 1} later`}
                    className="p-2 rounded bg-white/20 text-white hover:bg-white/40 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    title="Move later"
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
                {img.is_featured && (
                  <div className="absolute top-2 left-2 bg-secondary text-white text-xs px-2 py-0.5 rounded-md font-button font-semibold">
                    Featured
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
