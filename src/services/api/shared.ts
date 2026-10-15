import { supabase } from '../supabase';
import { thumbPath } from '../../utils/imageUrls';

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
// crisp rather than full-size and blocky. Files already under the target are
// ALSO converted to WebP, but the WebP is kept only if it is at least 20%
// smaller than the original (otherwise the original is uploaded untouched).
// Animated GIFs, SVGs and files that are already WebP are never re-encoded.
// 500KB ceiling for EVERY admin image upload (trip covers, gallery, album photos,
// home sections, etc.). It is a ceiling, not a fixed output size: a photo that is
// already <= 500KB is only converted to WebP when that makes it clearly smaller,
// and a bigger one is only squeezed as far as needed to land under 500KB. A 1920px WebP at quality
// ~0.75-0.85 is visually indistinguishable from the original for photos, and it
// keeps Supabase cached egress (5GB/month on the free plan) under control.
// Call sites that pass their own limit (e.g. logos) keep it.
const TARGET_SIZE_BYTES = 500 * 1024; // 500KB — default target for all uploads
// Kept as a named export because the Cover Image fields already import it; it now
// simply equals the global default.
export const COVER_IMAGE_TARGET_SIZE_BYTES = TARGET_SIZE_BYTES;
const MAX_DIMENSION = 1920; // px, longest side — plenty for any use in this app
const MIN_QUALITY = 0.5; // quality floor for any single pass; resize instead of going lower
const QUALITY_STEP = 0.05; // fine-grained steps so we don't overshoot past a good size/quality tradeoff
const MAX_RESIZE_ATTEMPTS = 8; // each pass shrinks by 10%, so 8 passes ≈ 43% of original linear size at most
const RESIZE_FACTOR = 0.9;
const SMALL_FILE_QUALITY = 0.92; // starting quality for files already under the size limit
const SMALL_FILE_MAX_RATIO = 0.8; // convert a small file only if the WebP is >=20% smaller

async function compressImage(file: File, targetSizeBytes: number = TARGET_SIZE_BYTES): Promise<File> {
  // Never touch non-images, animated GIFs or SVGs (vector: canvas would rasterise them).
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  const isSmall = file.size <= targetSizeBytes;
  // A WebP that is already within the limit gains nothing from another lossy pass.
  if (isSmall && file.type === 'image/webp') return file;

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
    // Files already under the limit get a higher starting quality: we are only
    // converting format, not trying to hit a size, so keep them as crisp as possible.
    let quality = isSmall ? SMALL_FILE_QUALITY : 0.85;
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

  // Already within the size limit: only swap in the WebP when it is clearly
  // smaller. Otherwise keep the original bytes (no pointless quality loss).
  if (isSmall && blob.size > file.size * SMALL_FILE_MAX_RATIO) return file;

  const newName = file.name.replace(/\.[^./]+$/, '') + '.webp';
  return new File([blob], newName, { type: 'image/webp' });
}

// Small copy used by grids, filmstrips and cards (see utils/imageUrls.ts).
// 720px-wide WebP is roughly 30-60KB versus 0.3-2MB for the original.
const THUMB_WIDTH = 720;
const THUMB_QUALITY = 0.72;

async function makeThumbnail(source: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', THUMB_QUALITY));
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

  // Best-effort small copy for grids/cards. A failure here must never fail the
  // upload: pages fall back to the original if no thumbnail exists.
  try {
    const isRaster = compressed.type.startsWith('image/') && compressed.type !== 'image/gif' && compressed.type !== 'image/svg+xml';
    if (isRaster) {
      const thumb = await makeThumbnail(compressed);
      if (thumb) {
        // Never store a thumbnail bigger than the original: for already-small
        // photos, reuse the original bytes at the thumbnail path.
        const useOriginal = thumb.size >= compressed.size;
        await supabase.storage.from(bucket).upload(thumbPath(finalPath), useOriginal ? compressed : thumb, {
          upsert: true,
          cacheControl: '31536000',
          contentType: useOriginal ? compressed.type : 'image/webp',
        });
      }
    }
  } catch (err) {
    console.warn('Thumbnail upload skipped:', err);
  }

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
  // Also remove the small copy (if any) so thumbnails don't pile up as orphans.
  const paths = path.startsWith('thumbs/') ? [path] : [path, thumbPath(path)];
  const { error } = await supabase.storage.from(bucket).remove(paths);
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
