import { useRef, useState } from 'react';
import {
  Upload,
  X,
  ImageSquare as ImagePlus,
  CircleNotch as Loader2,
  LinkSimple as Link2,
  CaretLeft,
  CaretRight,
  DotsSixVertical,
} from '@phosphor-icons/react';
import { uploadImage, uploadImageFromUrl, deleteImageByUrl } from '../../services/api';
import { useToast } from './useToast';

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
  // upload tile. On submit, the pasted URL is fetched and re-hosted in our
  // own storage (compressed like a regular upload) so the saved page loads
  // from our storage/CDN instead of hotlinking the source site. If the
  // source site's CORS policy blocks that fetch, it falls back to storing
  // the URL as-is (<img src={url}>) so the admin isn't blocked from adding
  // it. Off by default so existing upload-only fields are unaffected.
  allowUrl?: boolean;
}

export default function MultiImageUploadField({ label, value, onChange, bucket, pathPrefix, hint, children, allowUrl }: MultiImageUploadFieldProps) {
  const toast = useToast();
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
      toast.error(`Failed to upload. Make sure the Supabase storage bucket "${bucket}" exists and is public.`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  // ---- Reordering ---------------------------------------------------------
  // The saved order IS the array order, so whatever order the admin leaves
  // the photos in here is the order visitors see them everywhere this field
  // is used (itinerary days, gallery, accommodation, fashion, albums...).
  // Desktop: drag a tile onto another. Touch screens (no HTML5 drag): the
  // left/right arrows on each tile.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const moveImage = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= value.length || to >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

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

  const applyUrl = async () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    setUrlDraft('');
    setShowUrlInput(false);
    try {
      setUploading(true);
      const path = `${pathPrefix}/${Date.now()}-url-image`;
      const hostedUrl = await uploadImageFromUrl(bucket, trimmed, path);
      onChange([...value, hostedUrl]);
    } catch {
      // Most often the source site's CORS policy blocked us from reading the
      // image bytes — fall back to using the URL as-is so the admin can
      // still add it, just without the storage/perf benefit.
      onChange([...value, trimmed]);
      toast.error("Couldn't save that image to our own storage automatically (the source site may not allow it), so it's linked directly instead — it may load slower for visitors.");
    } finally {
      setUploading(false);
    }
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
            {uploading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={13} aria-hidden="true" />}
            {uploading ? 'Uploading...' : 'Add Photos'}
          </button>
          {allowUrl && (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
            >
              <Link2 size={13} aria-hidden="true" /> Add by URL
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-2xs text-dark-muted leading-snug mb-1.5">{hint}</p>}
      {children && <div className="mb-3">{children}</div>}

      {allowUrl && showUrlInput && (
        <div className="flex items-center gap-1.5 mb-3">
          <div className="relative flex-1">
            <label htmlFor={`${pathPrefix}-url-input`} className="sr-only">{label ? `${label} URL` : 'Image URL'}</label>
            <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-muted" aria-hidden="true" />
            <input
              id={`${pathPrefix}-url-input`}
              type="text"
              autoFocus
              value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } }}
              placeholder="Paste an image URL…"
              disabled={uploading}
              className="w-full pl-7 pr-2 py-1.5 text-xs border-2 border-background-warm rounded-md bg-background focus:border-primary outline-none transition-colors disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={applyUrl}
            disabled={!urlDraft.trim() || uploading}
            className="px-2.5 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? 'Saving...' : 'Add'}
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
            <div
              key={`${url}-${index}`}
              draggable={value.length > 1}
              onDragStart={e => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={e => {
                if (dragIndex === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overIndex !== index) setOverIndex(index);
              }}
              onDrop={e => {
                e.preventDefault();
                if (dragIndex !== null) moveImage(dragIndex, index);
                endDrag();
              }}
              onDragEnd={endDrag}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 group transition-all ${
                value.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
              } ${dragIndex === index ? 'opacity-40 border-primary' : overIndex === index && dragIndex !== null ? 'border-primary ring-2 ring-primary/40 scale-[1.03]' : 'border-background-warm'}`}
            >
              <img src={url} alt="" draggable={false} className="w-full h-full object-cover" />

              {/* Position badge — 1 is the first photo visitors see */}
              <span className="absolute top-1.5 left-1.5 min-w-[22px] h-[22px] px-1 rounded-md bg-dark/70 text-white text-xs font-semibold flex items-center justify-center pointer-events-none">
                {index + 1}
              </span>

              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={removingUrl === url}
                className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-dark/70 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100 disabled:cursor-wait"
                title="Remove image"
                aria-label={`Remove ${label ? `${label} ` : ''}photo ${index + 1}`}
              >
                {removingUrl === url ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
              </button>

              {value.length > 1 && (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1.5 bg-gradient-to-t from-dark/70 to-transparent max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => moveImage(index, index - 1)}
                    disabled={index === 0}
                    className="p-1 rounded-md bg-dark/70 text-white hover:bg-primary transition-colors disabled:opacity-30 disabled:hover:bg-dark/70 disabled:cursor-not-allowed"
                    title="Move earlier"
                    aria-label={`Move photo ${index + 1} earlier`}
                  >
                    <CaretLeft size={14} aria-hidden="true" />
                  </button>
                  <DotsSixVertical size={16} className="text-white/90 hidden sm:block pointer-events-none" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => moveImage(index, index + 1)}
                    disabled={index === value.length - 1}
                    className="p-1 rounded-md bg-dark/70 text-white hover:bg-primary transition-colors disabled:opacity-30 disabled:hover:bg-dark/70 disabled:cursor-not-allowed"
                    title="Move later"
                    aria-label={`Move photo ${index + 1} later`}
                  >
                    <CaretRight size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-dark-muted mt-2 flex items-center gap-1">
        <Upload size={12} aria-hidden="true" />
        {value.length} photo{value.length === 1 ? '' : 's'} · select multiple files at once
        {value.length > 1 && ' · drag to reorder (or use the arrows)'}
      </p>
    </div>
  );
}
