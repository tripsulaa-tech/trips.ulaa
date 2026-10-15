import type { SyntheticEvent } from 'react';
import { STORAGE_BUCKET } from '../constants/storage';
import siteImageManifest from '../generated/siteImageManifest.json';

// Thumbnail URLs
// --------------
// Grids, filmstrips and cards show photos at a few hundred pixels, but the
// stored originals are 0.3-2 MB. Convention (no database change needed):
//   <bucket>/albums/x/123-photo.jpg  ->  <bucket>/thumbs/albums/x/123-photo.webp
// Thumbnails are created on upload (uploadImage in services/api/shared.ts) and,
// for existing photos, by scripts/make-thumbs.mjs. If a thumbnail is missing the
// <img> falls back to the original, so a page never breaks - it just costs the
// old bandwidth.

const THUMB_FOLDER = 'thumbs';
const PUBLIC_MARKER = '/storage/v1/object/public/';

/** Bucket-relative thumbnail path, e.g. albums/x/1-a.jpg -> thumbs/albums/x/1-a.webp */
export function thumbPath(path: string): string {
  return `${THUMB_FOLDER}/${path.replace(/\.[A-Za-z0-9]+$/, '')}.webp`;
}

/** Thumbnail URL for one of our Supabase storage URLs; any other URL is returned unchanged. */
export function thumbUrl(src: string): string {
  const idx = src.indexOf(PUBLIC_MARKER);
  if (idx === -1) return src;
  const prefix = src.slice(0, idx + PUBLIC_MARKER.length);
  const rest = src.slice(idx + PUBLIC_MARKER.length); // "<bucket>/<path>[?query]"
  const cut = rest.search(/[?#]/);
  const clean = cut === -1 ? rest : rest.slice(0, cut);
  const slash = clean.indexOf('/');
  if (slash === -1) return src;
  const bucket = clean.slice(0, slash);
  const path = clean.slice(slash + 1);
  if (!path || path.startsWith(`${THUMB_FOLDER}/`)) return src;
  if (/\.(gif|svg)$/i.test(path)) return src; // animated / vector: no thumbnail
  return `${prefix}${bucket}/${thumbPath(path)}`;
}

/**
 * Spread onto an <img> / <motion.img> instead of passing src:
 *   <img {...thumbImgProps(url)} alt="" />
 * Loads the thumbnail and, if it is missing, switches once to the original.
 */
export function thumbImgProps(src: string): {
  src: string;
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
} {
  const thumb = thumbUrl(src);
  if (thumb === src) return { src };
  return {
    src: thumb,
    onError: (e) => {
      const img = e.currentTarget;
      if (img.dataset.thumbFallback === '1') return;
      img.dataset.thumbFallback = '1';
      img.src = src;
    },
  };
}

// Site images served from the website itself
// ------------------------------------------
// Logos, hero banners, the founder photo and About-page photos are the same for
// every visitor, so they are mirrored into public/site-images/ (see
// scripts/mirror-site-images.mjs) and served by the website's own host instead of
// Supabase Storage. That keeps them out of Supabase's cached-egress quota, and
// means a traffic spike on these images can never take login and data down.
//
// The database keeps the original Supabase URLs (admin editing is unchanged);
// only the <img> src is swapped at render time, and only for files listed in the
// manifest. A photo the admin uploads later is not in the manifest yet, so it
// simply keeps loading from Supabase until the mirror script is run again.

const LOCAL_SITE_IMAGES = new Set<string>(siteImageManifest as string[]);

/** Local /site-images/... URL for a mirrored Supabase image; any other URL is returned unchanged. */
export function localSiteImage(src: string | undefined | null): string {
  if (!src) return src ?? '';
  if (LOCAL_SITE_IMAGES.size === 0) return src;
  const idx = src.indexOf(PUBLIC_MARKER);
  if (idx === -1) return src;
  const rest = src.slice(idx + PUBLIC_MARKER.length); // "<bucket>/<path>[?query]"
  const cut = rest.search(/[?#]/);
  const clean = cut === -1 ? rest : rest.slice(0, cut);
  const slash = clean.indexOf('/');
  if (slash === -1 || clean.slice(0, slash) !== STORAGE_BUCKET) return src;
  let path = clean.slice(slash + 1);
  try {
    path = decodeURIComponent(path);
  } catch {
    return src;
  }
  if (!LOCAL_SITE_IMAGES.has(path)) return src;
  return `/site-images/${path.split('/').map(encodeURIComponent).join('/')}`;
}
