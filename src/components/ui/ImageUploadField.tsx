import { useRef, useState } from 'react';
import { Upload, X, ImagePlus } from 'lucide-react';
import { uploadImage, deleteImageByUrl } from '../../services/api';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  bucket: string;
  pathPrefix: string;
  required?: boolean;
  // Optional identifying name baked into the filename (e.g. an album's
  // slug). Useful when pathPrefix is a flat, shared folder — like
  // "album-covers", where every album's cover ends up in the same folder —
  // so the filename alone tells you "1784...-attapadi-IMG_8255.webp"
  // belongs to Attapadi, instead of being an anonymous timestamp+filename.
  fileNamePrefix?: string;
}

export default function ImageUploadField({ label, value, onChange, bucket, pathPrefix, required, fileNamePrefix }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = `upload-${pathPrefix}-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previousUrl = value;
    try {
      setUploading(true);
      const namePart = fileNamePrefix ? `${fileNamePrefix}-${file.name}` : file.name;
      const path = `${pathPrefix}/${Date.now()}-${namePart}`;
      const url = await uploadImage(bucket, file, path);
      onChange(url);
      // Replacing an existing image — clean up the file it's replacing so
      // it doesn't sit around as an orphan in storage.
      if (previousUrl) await deleteImageByUrl(bucket, previousUrl).catch(() => {});
    } catch {
      alert(`Failed to upload. Make sure the Supabase storage bucket "${bucket}" exists and is public.`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    const previousUrl = value;
    onChange('');
    if (previousUrl) await deleteImageByUrl(bucket, previousUrl).catch(() => {});
  };

  return (
    <div>
      <label className="block text-sm font-medium text-dark mb-1">
        {label}{required && ' *'}
      </label>

      {/* Native file picker: opens gallery/camera on mobile, file browser on desktop */}
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />

      {value ? (
        <div className="relative w-full h-32 rounded-xl overflow-hidden border-2 border-background-warm group">
          <img src={value} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/40 transition-colors" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-dark/70 text-white hover:bg-red-600 transition-colors"
            title="Remove image"
          >
            <X size={14} />
          </button>
          <label
            htmlFor={inputId}
            onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}
            className="absolute bottom-2 right-2 px-2.5 py-1.5 rounded-lg bg-white/95 text-dark text-xs font-medium cursor-pointer hover:bg-white transition-colors flex items-center gap-1"
          >
            <Upload size={12} />
            {uploading ? 'Uploading...' : 'Replace'}
          </label>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}
          className="flex flex-col items-center justify-center gap-1.5 w-full h-32 rounded-xl border-2 border-dashed border-background-warm bg-background hover:border-primary cursor-pointer transition-colors text-dark-muted"
        >
          {uploading ? (
            <span className="text-sm font-medium">Uploading...</span>
          ) : (
            <>
              <ImagePlus size={22} className="text-primary" />
              <span className="text-sm font-medium text-dark">Tap to upload a photo</span>
              <span className="text-xs">From your gallery, camera, or files</span>
            </>
          )}
        </label>
      )}
    </div>
  );
}
