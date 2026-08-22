import { supabase } from '../supabase';

// =============================================
// Image compression (client-side, before upload)
// =============================================
// Every uploaded image is downscaled (if needed) and re-encoded to WebP,
// so a phone photo that starts at 4-8MB lands close to TARGET_SIZE_BYTES
// before it ever reaches Supabase storage. This matters a lot on the free
// tier's storage quota, and it also makes the public site load noticeably
// faster.
//
// Strategy for hitting the target WITHOUT trashing quality: resizing buys
// back far more bytes-per-unit-of-visible-quality than cranking quality
// down at full resolution does. So instead of "drop quality to the floor,
// then shrink", we alternate — search for the best quality at the current
// size (fine 0.05 steps, never below MIN_QUALITY), and if that's still
// over target, shrink the canvas a bit and re-run the quality search at
// the new, smaller size (which affords a *higher* quality per pass than
// the previous size did). This repeats until we're at/under target or we
// hit MIN_RESIZE_ATTEMPTS, so a busy/detailed photo ends up smaller but
// crisp rather than full-size and blocky. Animated GIFs and files already
// under the target are left untouched (nothing to gain, and canvas
// re-encoding would kill the animation).
const TARGET_SIZE_BYTES = 100 * 1024; // 100KB — default target for most uploads
// Trip cover images are the large hero photo on the trip detail page, so they're
// allowed to stay much bigger (up to 2MB) than the default target — that's the
// difference between "compressed until it's visibly soft" and "still crisp at
// full width". See COVER_IMAGE_TARGET_SIZE_BYTES usage on the Cover Image field
// in Admin → Upcoming Trips → Media.
export const COVER_IMAGE_TARGET_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_DIMENSION = 1920; // px, longest side — plenty for any use in this app
const MIN_QUALITY = 0.5; // quality floor for any single pass; resize instead of going lower
const QUALITY_STEP = 0.05; // fine-grained steps so we don't overshoot past a good size/quality tradeoff
const MAX_RESIZE_ATTEMPTS = 8; // each pass shrinks by 10%, so 8 passes ≈ 43% of original linear size at most
const RESIZE_FACTOR = 0.9;

async function compressImage(file: File, targetSizeBytes: number = TARGET_SIZE_BYTES): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size <= targetSizeBytes) return file;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: 'from-image' bakes in EXIF rotation (e.g. iPhone
    // photos) so the compressed output isn't sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // couldn't decode — upload the original rather than fail the whole action
  }

  let width = bitmap.width;
  let height = bitmap.height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }

  const draw = (w: number, h: number) => {
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(bitmap, 0, 0, w, h);
  };

  const toBlob = (quality: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));

  // Search quality (in fine steps, down to MIN_QUALITY) at whatever the
  // current canvas size is. Returns the best (smallest-over-target-or-best-
  // available) blob for that size.
  const searchQuality = async (): Promise<Blob | null> => {
    let quality = 0.85;
    let best = await toBlob(quality);
    while (best && best.size > targetSizeBytes && quality > MIN_QUALITY) {
      quality = Math.max(quality - QUALITY_STEP, MIN_QUALITY);
      best = await toBlob(quality);
      if (quality === MIN_QUALITY) break;
    }
    return best;
  };

  draw(width, height);
  let blob = await searchQuality();

  let attempts = 0;
  while (blob && blob.size > targetSizeBytes && attempts < MAX_RESIZE_ATTEMPTS) {
    width = Math.round(width * RESIZE_FACTOR);
    height = Math.round(height * RESIZE_FACTOR);
    draw(width, height);
    blob = await searchQuality();
    attempts++;
  }

  bitmap.close();

  if (!blob) return file; // encoding failed for some reason — fall back to the original

  const newName = file.name.replace(/\.[^./]+$/, '') + '.webp';
  return new File([blob], newName, { type: 'image/webp' });
}

export async function uploadImage(bucket: string, file: File, path: string, targetSizeBytes?: number): Promise<string> {
  const compressed = await compressImage(file, targetSizeBytes);
  // If the file got re-encoded to webp, the storage path's extension needs
  // to match, or the browser will guess the wrong content-type on download.
  const finalPath = compressed !== file
    ? path.replace(/\.[^./]+$/, '') + '.webp'
    : path;
  // cacheControl is in seconds; 31536000 = 1 year. Safe to cache this long
  // because every call site generates a fresh, timestamp-prefixed path per
  // upload (see AdminGallery.tsx / ImageUploadField.tsx / MultiImageUploadField.tsx),
  // so a given URL's bytes are immutable — an edit produces a *new* path/URL
  // rather than overwriting this one. Without this, Supabase's default of
  // 3600s meant browsers and the CDN re-fetched every image from origin
  // (counted as Cached Egress) at least once an hour, on every repeat view.
  const { error } = await supabase.storage.from(bucket).upload(finalPath, compressed, { upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(finalPath);
  return data.publicUrl;
}

// Fetches a pasted image URL client-side and re-hosts it in our own storage
// (compressed the same as a regular file upload), so pages load from our
// storage/CDN instead of hotlinking a third-party origin at full, uncompressed
// size on every visit.
//
// Caveat: this relies on the browser's fetch() being able to read the
// response body, which requires the source site to allow cross-origin reads
// (CORS). Plenty of sites don't set that header, so this will fail for some
// pasted URLs — callers should catch and fall back to using the URL as-is
// rather than blocking the admin from saving.
export async function uploadImageFromUrl(bucket: string, sourceUrl: string, path: string, targetSizeBytes?: number): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('URL did not return an image');
  const fileName = sourceUrl.split('/').pop()?.split('?')[0].split('#')[0] || 'image';
  const file = new File([blob], fileName, { type: blob.type });
  return uploadImage(bucket, file, path, targetSizeBytes);
}

export async function deleteImage(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

// Pulls the bucket-relative storage path out of a Supabase public URL, e.g.
// ".../storage/v1/object/public/ulaa/albums/abc123/1699999-photo.webp"
// -> "albums/abc123/1699999-photo.webp"
// Using this (instead of naively grabbing the last N segments of the URL)
// matters for nested paths — a flat "gallery/file.webp" is 2 segments, but
// an album photo like "albums/{id}/file.webp" is 3, so slicing a fixed
// number of segments silently drops the folder for anything nested.
export function getStoragePathFromUrl(bucket: string, url: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

export async function deleteImageByUrl(bucket: string, url: string): Promise<void> {
  const path = getStoragePathFromUrl(bucket, url);
  if (!path) return; // not a recognizable storage URL — nothing we can safely delete
  await deleteImage(bucket, path);
}
