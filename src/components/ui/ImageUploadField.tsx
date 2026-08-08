import { useRef, useState } from 'react';
import { Upload, X, ImagePlus, Link2 } from 'lucide-react';
import { uploadImage, uploadImageFromUrl, deleteImageByUrl } from '../../services/api';

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
  // Overrides the default ~100KB compression target (see compressImage in
  // services/api.ts) for fields where quality matters more than shaving
  // storage — e.g. the trip cover image, which passes
  // COVER_IMAGE_TARGET_SIZE_BYTES (2MB) so it stays crisp at full width.
  maxSizeBytes?: number;
  // Short recommended-size/aspect note shown under the label (e.g. "Square,
  // at least 800×800px") so admins know what to upload before they pick a
  // file, instead of finding out it looks cropped/blurry after saving.
  hint?: string;
  // CSS aspect-ratio (e.g. "4/3") for the preview box, so what the admin
  // sees while framing the shot matches the actual crop shown on the live
  // site. Omit to keep the default fixed h-32 strip (used where the field
  // isn't shown in a fixed-ratio tile elsewhere on the site).
  aspectRatio?: string;
  // When true, also offers a "paste an image URL" option alongside the file
  // upload dropzone. On submit, the pasted URL is fetched and re-hosted in
  // our own storage (compressed like a regular upload) so the saved trip
  // loads from our storage/CDN instead of hotlinking the source site. If the
  // source site's CORS policy blocks that fetch, it falls back to storing
  // the URL as-is (<img src={url}>) so the admin isn't blocked from saving.
  // Off by default so existing upload-only fields are unaffected.
  allowUrl?: boolean;
}

export default function ImageUploadField({ label, value, onChange, bucket, pathPrefix, required, fileNamePrefix, maxSizeBytes, hint, aspectRatio, allowUrl }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
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
      const url = await uploadImage(bucket, file, path, maxSizeBytes);
      onChange(url);
      // Replacing an existing image — clean up the file it's replacing so
      // it doesn't sit around as an orphan in storage. Skipped for pasted
      // URLs, which were never uploaded to our bucket in the first place.
      if (previousUrl && previousUrl.includes(`/${bucket}/`)) await deleteImageByUrl(bucket, previousUrl).catch(() => {});
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
    if (previousUrl && previousUrl.includes(`/${bucket}/`)) await deleteImageByUrl(bucket, previousUrl).catch(() => {});
  };

  const applyUrl = async () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    const previousUrl = value;
    setUrlDraft('');
    setShowUrlInput(false);
    try {
      setUploading(true);
      const namePart = fileNamePrefix ? `${fileNamePrefix}-url-image` : 'url-image';
      const path = `${pathPrefix}/${Date.now()}-${namePart}`;
      const hostedUrl = await uploadImageFromUrl(bucket, trimmed, path, maxSizeBytes);
      onChange(hostedUrl);
      if (previousUrl && previousUrl.includes(`/${bucket}/`)) await deleteImageByUrl(bucket, previousUrl).catch(() => {});
    } catch {
      // Most often the source site's CORS policy blocked us from reading the
      // image bytes — fall back to using the URL as-is so the admin can
      // still save, just without the storage/perf benefit.
      onChange(trimmed);
      alert("Couldn't save that image to our own storage automatically (the source site may not allow it), so it's linked directly instead — it may load slower for visitors.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-dark mb-1">
          {label}{required && ' *'}
        </label>
      )}
      {hint && <p className="text-[11px] text-dark-muted leading-snug mb-1.5">{hint}</p>}

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
        <div
          className={`relative w-full rounded-lg overflow-hidden border-2 border-background-warm group ${aspectRatio ? '' : 'h-32'}`}
          style={aspectRatio ? { aspectRatio } : undefined}
        >
          <img src={value} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-dark/0 group-hover:bg-dark/40 transition-colors" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 p-1.5 rounded-md bg-dark/70 text-white hover:bg-red-600 transition-colors"
            title="Remove image"
          >
            <X size={14} />
          </button>
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
            {allowUrl && (
              <button
                type="button"
                onClick={() => setShowUrlInput(s => !s)}
                className="px-2.5 py-1.5 rounded-md bg-white/95 text-dark text-xs font-medium cursor-pointer hover:bg-white transition-colors flex items-center gap-1"
                title="Replace with an image URL"
              >
                <Link2 size={12} />
                URL
              </button>
            )}
            <label
              htmlFor={inputId}
              onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}
              className="px-2.5 py-1.5 rounded-md bg-white/95 text-dark text-xs font-medium cursor-pointer hover:bg-white transition-colors flex items-center gap-1"
            >
              <Upload size={12} />
              {uploading ? 'Uploading...' : 'Replace'}
            </label>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}
          className={`flex flex-col items-center justify-center gap-1.5 w-full rounded-lg border-2 border-dashed border-background-warm bg-background hover:border-primary cursor-pointer transition-colors text-dark-muted ${aspectRatio ? '' : 'h-32'}`}
          style={aspectRatio ? { aspectRatio } : undefined}
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

      {allowUrl && (
        <div className="mt-2">
          {showUrlInput || !value ? (
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-muted" />
                <input
                  type="text"
                  value={urlDraft}
                  onChange={e => setUrlDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } }}
                  placeholder="Or paste an image URL…"
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
                {uploading ? 'Saving...' : 'Use URL'}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => { setShowUrlInput(false); setUrlDraft(''); }}
                  className="px-2 py-1.5 rounded-md text-dark-muted text-xs hover:bg-background-warm transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
