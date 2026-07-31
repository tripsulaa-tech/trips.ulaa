import { useRef, useState } from 'react';
import { Upload, X, ImagePlus, Loader2 } from 'lucide-react';
import { uploadImage, deleteImageByUrl } from '../../services/api';

interface MultiImageUploadFieldProps {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  bucket: string;
  pathPrefix: string;
  // Short recommended-size/aspect note shown under the label, same purpose
  // as ImageUploadField's hint.
  hint?: string;
}

export default function MultiImageUploadField({ label, value, onChange, bucket, pathPrefix, hint }: MultiImageUploadFieldProps) {
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

  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  const removeAt = async (index: number) => {
    const url = value[index];
    // Drop it from the form state immediately so the UI feels responsive...
    onChange(value.filter((_, i) => i !== index));
    // ...then clean up the actual file in storage. If this fails, the file
    // becomes an orphan in the bucket (harmless but wastes quota) — we
    // don't re-add it to the form on failure since the user already asked
    // for it gone from the album.
    try {
      setRemovingUrl(url);
      await deleteImageByUrl(bucket, url);
    } catch {
      // best-effort — surfaced nowhere on purpose, matches existing delete UX elsewhere
    } finally {
      setRemovingUrl(null);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-dark mb-1">{label}</label>
      {hint && <p className="text-[11px] text-dark-muted leading-snug mb-1.5">{hint}</p>}

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
          <div key={`${url}-${index}`} className="relative aspect-square rounded-lg overflow-hidden border-2 border-background-warm group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(index)}
              disabled={removingUrl === url}
              className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-dark/70 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-100 disabled:cursor-wait"
              title="Remove image"
            >
              {removingUrl === url ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center gap-1 aspect-square rounded-lg border-2 border-dashed border-background-warm bg-background hover:border-primary cursor-pointer transition-colors text-dark-muted disabled:opacity-60"
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
