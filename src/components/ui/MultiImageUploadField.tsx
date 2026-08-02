import { useRef, useState } from 'react';
import { Upload, X, ImagePlus, Loader2, Link2 } from 'lucide-react';
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
  // Optional extra content rendered after the label/hint and before the
  // upload grid — e.g. a section-description textarea that belongs
  // visually inside this field rather than as a separate block above it.
  children?: React.ReactNode;
  // When true, also offers a "paste an image URL" option next to the
  // upload tile. Pasted URLs are stored as-is and rendered directly
  // (<img src={url}>) — nothing is downloaded or re-hosted. Off by default
  // so existing upload-only fields are unaffected.
  allowUrl?: boolean;
}

export default function MultiImageUploadField({ label, value, onChange, bucket, pathPrefix, hint, children, allowUrl }: MultiImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
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
    // for it gone from the album. Skipped for pasted URLs, which were never
    // uploaded to our bucket in the first place.
    if (!url.includes(`/${bucket}/`)) return;
    try {
      setRemovingUrl(url);
      await deleteImageByUrl(bucket, url);
    } catch {
      // best-effort — surfaced nowhere on purpose, matches existing delete UX elsewhere
    } finally {
      setRemovingUrl(null);
    }
  };

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setUrlDraft('');
    setShowUrlInput(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <label className="block text-sm font-medium text-dark">{label}</label>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
            {uploading ? 'Uploading...' : 'Add Photos'}
          </button>
          {allowUrl && (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
            >
              <Link2 size={13} /> Add by URL
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-[11px] text-dark-muted leading-snug mb-1.5">{hint}</p>}
      {children && <div className="mb-3">{children}</div>}

      {allowUrl && showUrlInput && (
        <div className="flex items-center gap-1.5 mb-3">
          <div className="relative flex-1">
            <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-muted" />
            <input
              type="text"
              autoFocus
              value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } }}
              placeholder="Paste an image URL…"
              className="w-full pl-7 pr-2 py-1.5 text-xs border-2 border-background-warm rounded-md bg-background focus:border-primary outline-none transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={applyUrl}
            disabled={!urlDraft.trim()}
            className="px-2.5 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowUrlInput(false); setUrlDraft(''); }}
            className="px-2 py-1.5 rounded-md text-dark-muted text-xs hover:bg-background-warm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      {value.length > 0 && (
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
        </div>
      )}

      <p className="text-xs text-dark-muted mt-2 flex items-center gap-1">
        <Upload size={12} />
        {value.length} photo{value.length === 1 ? '' : 's'} · select multiple files at once
      </p>
    </div>
  );
}
