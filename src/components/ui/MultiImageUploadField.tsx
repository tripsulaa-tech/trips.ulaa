import { useRef, useState } from 'react';
import { Upload, X, ImagePlus, Loader2 } from 'lucide-react';
import { uploadImage } from '../../services/api';

interface MultiImageUploadFieldProps {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  bucket: string;
  pathPrefix: string;
}

export default function MultiImageUploadField({ label, value, onChange, bucket, pathPrefix }: MultiImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      setUploading(true);
      const uploaded: string[] = [];
      for (const file of files) {
        const path = `${pathPrefix}/${Date.now()}-${file.name}`;
        const url = await uploadImage(bucket, file, path);
        uploaded.push(url);
      }
      onChange([...value, ...uploaded]);
    } catch {
      alert(`Failed to upload. Make sure the Supabase storage bucket "${bucket}" exists and is public.`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-dark mb-1">{label}</label>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {value.map((url, index) => (
          <div key={`${url}-${index}`} className="relative aspect-square rounded-xl overflow-hidden border-2 border-background-warm group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-dark/70 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
              title="Remove image"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center gap-1 aspect-square rounded-xl border-2 border-dashed border-background-warm bg-background hover:border-primary cursor-pointer transition-colors text-dark-muted disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 size={20} className="text-primary animate-spin" />
              <span className="text-xs font-medium">Uploading...</span>
            </>
          ) : (
            <>
              <ImagePlus size={20} className="text-primary" />
              <span className="text-xs font-medium text-dark text-center px-1">Add Photos</span>
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-dark-muted mt-2 flex items-center gap-1">
        <Upload size={12} />
        {value.length} photo{value.length === 1 ? '' : 's'} · select multiple files at once
      </p>
    </div>
  );
}
