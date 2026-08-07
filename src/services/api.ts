import { supabase } from './supabase';
import type { UpcomingTrip, CompletedTrip, Enquiry, GalleryImage, Testimonial, BookingFormData, AdminNotification, WaitlistEntry, WaitlistFormData, Payment, JourneyStage } from '../types/types-index';

// =============================================
// Trip lifecycle
// =============================================
// Finds upcoming trips whose start_date has passed, creates a draft album
// for each in completed_trips (same id, so linked enquiries stay linked),
// and unpublishes them from Upcoming. Safe to call repeatedly — it only
// acts on trips that need it. Called once from AdminDashboard on load.
export async function syncStartedTripAlbums(): Promise<void> {
  const { error } = await supabase.rpc('sync_started_trip_albums');
  if (error) throw error;
  await relocateStartedTripImages();
}

// The DB-side copy above carries the cover/gallery URLs over as-is, so a
// freshly-created album still points at the old trip-covers/ and
// trips/{tripId}/ folders it had as an upcoming trip. This moves those
// files into album-covers/ and albums/{slug}/ (matching where images land
// when uploaded directly to an album) and updates the row to point at the
// new URLs. Uses storage .move() (rename-in-place) rather than
// download+reupload+delete, and only touches rows that still have
// old-style paths, so it's safe to call on every sync — already-migrated
// albums are skipped.
async function relocateStartedTripImages(): Promise<void> {
  const { data: rows, error } = await supabase
    .from('completed_trips')
    .select('id, slug, cover_image, gallery_images');
  if (error || !rows) return;

  for (const row of rows) {
    const needsCoverMove = !!row.cover_image?.includes('/trip-covers/');
    const needsGalleryMove = (row.gallery_images || []).some((u: string) => u.includes('/trips/'));
    if (!needsCoverMove && !needsGalleryMove) continue;

    const newCover = needsCoverMove
      ? (await moveImage(row.cover_image, 'album-covers', row.slug)) ?? row.cover_image
      : row.cover_image;

    const newGallery: string[] = [];
    for (const url of row.gallery_images || []) {
      if (url.includes('/trips/')) {
        newGallery.push((await moveImage(url, `albums/${row.slug}`)) ?? url);
      } else {
        newGallery.push(url);
      }
    }

    await supabase
      .from('completed_trips')
      .update({ cover_image: newCover, gallery_images: newGallery })
      .eq('id', row.id);
  }
}

// Moves a single storage object into destFolder, keeping its filename
// (optionally prefixed with an identifying name, e.g. an album slug, for
// flat destination folders like album-covers), and returns the new public
// URL — or null if the URL couldn't be parsed or the move failed (caller
// falls back to leaving the original URL as-is).
async function moveImage(url: string, destFolder: string, fileNamePrefix?: string): Promise<string | null> {
  const path = getStoragePathFromUrl('ulaa', url);
  if (!path) return null;
  const originalFilename = path.split('/').pop();
  if (!originalFilename) return null;
  const filename = fileNamePrefix ? `${fileNamePrefix}-${originalFilename}` : originalFilename;
  const newPath = `${destFolder}/${filename}`;
  const { error } = await supabase.storage.from('ulaa').move(path, newPath);
  if (error) return null;
  const { data } = supabase.storage.from('ulaa').getPublicUrl(newPath);
  return data.publicUrl;
}

// =============================================
// Upcoming Trips
// =============================================
// PII-free RPC — returns { trip_id, reserved_count } for trips that have
// people still active on the waitlist (waiting/notified). Used to keep the
// public "seats left" number from showing a seat that's next in line for
// someone who's already waiting. Never throws: if it fails for any reason
// we just show real seat counts (fail open to "no reservation buffer").
// Exported so AdminWaitlist can factor in reserved counts when computing
// how many seats are truly available for conversion.
export async function getWaitlistReservedCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_waitlist_reserved_counts');
  if (error || !data) return {};
  const map: Record<string, number> = {};
  for (const row of data as { trip_id: string; reserved_count: number }[]) {
    map[row.trip_id] = row.reserved_count;
  }
  return map;
}

export async function getUpcomingTrips(): Promise<UpcomingTrip[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data, error }, reservedCounts] = await Promise.all([
    supabase
      .from('upcoming_trips')
      .select('*')
      .in('status', ['coming_soon', 'published'])
      .gte('start_date', today)
      .order('start_date', { ascending: true }),
    getWaitlistReservedCounts(),
  ]);
  if (error) throw error;
  return (data || []).map(trip => ({ ...trip, waitlist_reserved: reservedCounts[trip.id] || 0 }));
}

export async function getUpcomingTripBySlug(slug: string): Promise<UpcomingTrip | null> {
  const [{ data, error }, reservedCounts] = await Promise.all([
    supabase
      .from('upcoming_trips')
      .select('*')
      .eq('slug', slug)
      .in('status', ['coming_soon', 'published'])
      .single(),
    getWaitlistReservedCounts(),
  ]);
  if (error) return null;
  return { ...data, waitlist_reserved: reservedCounts[data.id] || 0 };
}

export async function getAllUpcomingTripsAdmin(): Promise<UpcomingTrip[]> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createUpcomingTrip(trip: Partial<UpcomingTrip>): Promise<UpcomingTrip> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .insert(trip)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUpcomingTrip(id: string, trip: Partial<UpcomingTrip>): Promise<UpcomingTrip> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .update(trip)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUpcomingTrip(id: string): Promise<void> {
  const { error } = await supabase.from('upcoming_trips').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// Trip deletion — cascade cleanup
// =============================================
// Bucket every trip-attached image lives in — see the bucket="ulaa" props
// throughout AdminTrips.tsx's upload fields.
const TRIP_IMAGE_BUCKET = 'ulaa';

// Pulls every image URL referenced anywhere on an upcoming trip (cover,
// mobile hero, gallery, accommodation/fashion photo galleries, "Places
// You'll Post" items, itinerary day photos, founder photo, end banner) so
// deleteUpcomingTripCascade can clean them out of storage instead of
// leaving orphaned files behind, and getTripDeletionImpact can show an
// accurate photo count in the pre-delete warning.
function collectTripImageUrls(trip: UpcomingTrip): string[] {
  const urls: string[] = [];
  if (trip.cover_image) urls.push(trip.cover_image);
  if (trip.hero_mobile_image) urls.push(trip.hero_mobile_image);
  urls.push(...(trip.gallery_images || []));
  urls.push(...(trip.accommodation_photos || []));
  urls.push(...(trip.fashion_photos || []));
  (trip.gallery_items || []).forEach(item => { if (item.photo) urls.push(item.photo); });
  (trip.itinerary || []).forEach(day => urls.push(...(day.images || [])));
  if (trip.trip_founder?.photo) urls.push(trip.trip_founder.photo);
  if (trip.end_banner?.image) urls.push(trip.end_banner.image);
  return Array.from(new Set(urls));
}

// Counts of everything tied to a trip, for the delete-confirmation warning
// (AdminTrips.handleDelete) shown before the admin commits — an enquiry
// count isn't just a number, it's real people and money, so this is the
// last chance to back out with full information.
export async function getTripDeletionImpact(tripId: string): Promise<{ enquiries: number; waitlist: number; photos: number }> {
  const [{ count: enquiryCount, error: eErr }, { count: waitlistCount, error: wErr }, { data: trip, error: tErr }] = await Promise.all([
    supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('trip_id', tripId).is('deleted_at', null),
    supabase.from('waitlist').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    supabase.from('upcoming_trips').select('*').eq('id', tripId).single(),
  ]);
  if (eErr) throw eErr;
  if (wErr) throw wErr;
  if (tErr) throw tErr;
  return {
    enquiries: enquiryCount || 0,
    waitlist: waitlistCount || 0,
    photos: trip ? collectTripImageUrls(trip).length : 0,
  };
}

// Deletes a trip and everything attached to it:
//  - linked enquiries are SOFT-deleted (deleted_at stamped) — same
//    mechanism as a normal single-enquiry delete (deleteEnquiry above).
//    trip_id was deliberately left as a non-FK column (see schema.sql)
//    specifically so payment history survives a trip being deleted;
//    payments.enquiry_id cascade-deletes if an enquiry row itself is ever
//    hard-deleted, so a soft delete here is what keeps that ledger intact.
//    The enquiries still fully disappear from every admin view, which is
//    what "gone" looks like day-to-day — they're just recoverable at the
//    DB level rather than destroyed outright.
//  - linked waitlist entries are hard-deleted — no payment data to protect
//    there.
//  - every image the trip referenced is removed from storage, best-effort
//    (a single failed/missing file doesn't block the rest of the cascade).
//  - the trip row itself is deleted last, once everything above succeeds.
export async function deleteUpcomingTripCascade(trip: UpcomingTrip): Promise<void> {
  const [{ error: enquiryErr }, { error: waitlistErr }] = await Promise.all([
    supabase
      .from('enquiries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('trip_id', trip.id)
      .is('deleted_at', null),
    supabase.from('waitlist').delete().eq('trip_id', trip.id),
  ]);
  if (enquiryErr) throw enquiryErr;
  if (waitlistErr) throw waitlistErr;

  const imageUrls = collectTripImageUrls(trip);
  await Promise.all(
    imageUrls.map(url =>
      deleteImageByUrl(TRIP_IMAGE_BUCKET, url).catch(() => {
        // Best-effort: an already-missing or unrecognizable URL shouldn't
        // block the rest of the trip delete.
      })
    )
  );

  await deleteUpcomingTrip(trip.id);
}

// =============================================
// Completed Trips
// =============================================
export async function getCompletedTrips(): Promise<CompletedTrip[]> {
  const { data, error } = await supabase
    .from('completed_trips')
    .select('*')
    .eq('is_published', true)
    .order('trip_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getCompletedTripBySlug(slug: string): Promise<CompletedTrip | null> {
  const { data, error } = await supabase
    .from('completed_trips')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();
  if (error) return null;
  return data;
}

export async function getAllCompletedTripsAdmin(): Promise<CompletedTrip[]> {
  const { data, error } = await supabase
    .from('completed_trips')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Public Like button on the album page (AlbumPage.tsx). completed_trips
// otherwise only allows admin updates, so these go through
// SECURITY DEFINER RPCs (see add_completed_trip_likes_dedupe.sql) that
// insert/delete a row in completed_trip_likes keyed on (trip_id,
// visitor_id) — the DB's primary key is what actually stops a repeat like
// from the same visitor, not just the client remembering it already
// liked. visitorId comes from getVisitorId() in utils-index.ts. Each call
// returns the freshly-recomputed total so the UI shows the real count
// straight away instead of guessing at prev ± 1.
export async function likeCompletedTrip(tripId: string, visitorId: string): Promise<number> {
  const { data, error } = await supabase.rpc('like_completed_trip', { p_trip_id: tripId, p_visitor_id: visitorId });
  if (error) throw error;
  return data as number;
}

export async function unlikeCompletedTrip(tripId: string, visitorId: string): Promise<number> {
  const { data, error } = await supabase.rpc('unlike_completed_trip', { p_trip_id: tripId, p_visitor_id: visitorId });
  if (error) throw error;
  return data as number;
}

export async function createCompletedTrip(trip: Partial<CompletedTrip>): Promise<CompletedTrip> {
  const { data, error } = await supabase
    .from('completed_trips')
    .insert(trip)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompletedTrip(id: string, trip: Partial<CompletedTrip>): Promise<CompletedTrip> {
  const { data, error } = await supabase
    .from('completed_trips')
    .update(trip)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCompletedTrip(id: string): Promise<void> {
  const { error } = await supabase.from('completed_trips').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// Completed trip (album) deletion — cascade cleanup
// =============================================
// Same reasoning as the upcoming-trip cascade above: enquiries.trip_id and
// waitlist.trip_id are polymorphic across upcoming_trips/completed_trips
// (see schema.sql), and sync_started_trip_albums() carries a trip's id
// over unchanged when it becomes an album — so an album can still have
// live enquiries/waitlist rows pointed at it, exactly like an upcoming
// trip can. completed_trip_likes already cascade-deletes via its own FK
// (on delete cascade), so that needs no manual cleanup here.
function collectCompletedTripImageUrls(trip: CompletedTrip): string[] {
  const urls: string[] = [];
  if (trip.cover_image) urls.push(trip.cover_image);
  urls.push(...(trip.gallery_images || []));
  return Array.from(new Set(urls));
}

// Counts of everything tied to an album, for the delete-confirmation
// warning (AdminAlbums.handleDelete) shown before the admin commits.
export async function getCompletedTripDeletionImpact(tripId: string): Promise<{ enquiries: number; waitlist: number; photos: number }> {
  const [{ count: enquiryCount, error: eErr }, { count: waitlistCount, error: wErr }, { data: trip, error: tErr }] = await Promise.all([
    supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('trip_id', tripId).is('deleted_at', null),
    supabase.from('waitlist').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    supabase.from('completed_trips').select('*').eq('id', tripId).single(),
  ]);
  if (eErr) throw eErr;
  if (wErr) throw wErr;
  if (tErr) throw tErr;
  return {
    enquiries: enquiryCount || 0,
    waitlist: waitlistCount || 0,
    photos: trip ? collectCompletedTripImageUrls(trip).length : 0,
  };
}

// Deletes an album and everything attached to it — same soft-delete-
// enquiries / hard-delete-waitlist / best-effort-image-cleanup pattern as
// deleteUpcomingTripCascade, see the comment there for the full rationale.
export async function deleteCompletedTripCascade(trip: CompletedTrip): Promise<void> {
  const [{ error: enquiryErr }, { error: waitlistErr }] = await Promise.all([
    supabase
      .from('enquiries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('trip_id', trip.id)
      .is('deleted_at', null),
    supabase.from('waitlist').delete().eq('trip_id', trip.id),
  ]);
  if (enquiryErr) throw enquiryErr;
  if (waitlistErr) throw waitlistErr;

  const imageUrls = collectCompletedTripImageUrls(trip);
  await Promise.all(
    imageUrls.map(url =>
      deleteImageByUrl(TRIP_IMAGE_BUCKET, url).catch(() => {
        // Best-effort: an already-missing or unrecognizable URL shouldn't
        // block the rest of the album delete.
      })
    )
  );

  await deleteCompletedTrip(trip.id);
}

// =============================================
// Gallery
// =============================================
export async function getGalleryImages(): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from('gallery')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addGalleryImage(imageUrl: string, sortOrder = 0): Promise<GalleryImage> {
  const { data, error } = await supabase
    .from('gallery')
    .insert({ image_url: imageUrl, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const { error } = await supabase.from('gallery').delete().eq('id', id);
  if (error) throw error;
}

export async function updateGalleryFeatured(id: string, isFeatured: boolean): Promise<void> {
  const { error } = await supabase
    .from('gallery')
    .update({ is_featured: isFeatured })
    .eq('id', id);
  if (error) throw error;
}

export async function updateGalleryOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('gallery')
    .update({ sort_order: sortOrder })
    .eq('id', id);
  if (error) throw error;
}

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

// =============================================
// Enquiries
// =============================================
// True when a Postgres error is the enforce_trip_age_eligibility trigger's
// rejection (see add_trip_age_eligibility_enforcement.sql) rather than some
// other failure. That trigger raises a plain 'AGE_NOT_ELIGIBLE' marker
// message (default SQLSTATE — not a dedicated code like the 23505 unique
// violations below), so it's matched on message text instead of error.code.
function isAgeNotEligibleError(error: { message?: string }): boolean {
  return !!error.message?.includes('AGE_NOT_ELIGIBLE');
}

// The enforce_enquiry_capacity_or_waitlist() DB trigger (see
// add_enquiry_capacity_enforcement.sql) raises a plain 'SEATS_UNAVAILABLE'
// marker — not a dedicated SQLSTATE — when a plain enquiry insert (or a
// group's worth of them) would exceed the trip's real, live seat count.
// This is the hard backstop behind getTripSeatSnapshot()'s pre-submit
// re-check below: even if two people submit within the same instant, only
// as many as actually fit get through as real enquiries — the rest get
// this error and the caller routes them to the waitlist instead. Matched
// on message text, same pattern as isAgeNotEligibleError above.
function isSeatsUnavailableError(error: { message?: string }): boolean {
  return !!error.message?.includes('SEATS_UNAVAILABLE');
}

// The (trip_id, name, phone, email) unique constraint (active enquiries
// only — cancelled ones are excluded) means an exact literal re-submission
// throws a Postgres 23505. Surfaced as a distinct error so the UI can show
// "you've already enquired" instead of a generic failure. Deliberately
// keyed on all three fields together (not email/phone alone) so a family
// booking several seats through one shared contact still works fine.
export async function submitEnquiry(enquiry: BookingFormData): Promise<void> {
  const { error } = await supabase.from('enquiries').insert(enquiry);
  if (error) {
    // Log the raw Postgrest error so the real cause (bad column, NOT NULL
    // violation, check constraint, RLS, etc.) is visible in devtools instead
    // of only surfacing as a generic "Something went wrong" in the UI.
    console.error('submitEnquiry failed:', error.code, error.message, error.details, error.hint);
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    if (isSeatsUnavailableError(error)) {
      throw new Error('SEATS_UNAVAILABLE');
    }
    // error here is a PostgrestError, not a JS Error instance, so it's
    // wrapped so BookingForm's `err instanceof Error` checks don't silently
    // discard error.message on the way to its generic fallback copy.
    throw new Error(error.message || 'ENQUIRY_INSERT_FAILED');
  }
}

// General "Contact Us" message — not tied to a specific trip (trip_id left
// null), used by ContactPage.tsx. Kept separate from submitEnquiry/
// BookingFormData because a general enquiry doesn't have age/city/
// emergency_contact/food_preference/terms_accepted to collect. Still goes
// through the same enquiries table and the same error-marker conventions as
// every other insert path here, rather than the page hitting supabase
// directly — see enquiries_contact_message_active_unique in
// add_contact_message_dedupe.sql for why this can also throw
// DUPLICATE_ENQUIRY on an accidental double-submit.
export async function submitContactEnquiry(contact: {
  full_name: string;
  email: string;
  phone?: string;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from('enquiries').insert({
    full_name: contact.full_name.trim(),
    email: contact.email.trim(),
    // enquiries.phone is NOT NULL in the schema, so '' is the "not
    // provided" sentinel here (matches the rest of the app, which treats
    // an empty string the same as absent when building tel:/WhatsApp
    // links) — trimmed so accidental whitespace-only input doesn't count
    // as "provided" either.
    phone: contact.phone?.trim() || '',
    message: contact.message.trim(),
    trip_id: null,
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    throw error;
  }
}

// Group booking — the public form's "Group" option. Inserts one enquiry row
// per seat (groupSize of them), all carrying the same submitted
// name/phone/email/etc, so each seat still counts individually toward trip
// capacity and can have its own payment/status/cancellation tracked in
// Admin. Rows are tied together with a shared group_id and group_size, and
// group_seq (1..groupSize) is what lets otherwise-identical rows coexist
// under the duplicate-submission unique index — see
// add_group_bookings.sql.
// food_preference is the one exception to "same details on every row" —
// a group can be a mix of veg/non-veg, so it's collected per-seat on the
// form (see BookingForm's group food-preference stepper) and passed here
// as an array of length groupSize, one entry per seat.
export async function submitGroupEnquiry(enquiry: BookingFormData, groupSize: number, foodPreferences: ('veg' | 'non_veg')[]): Promise<void> {
  const groupId = crypto.randomUUID();
  const rows = Array.from({ length: groupSize }, (_, i) => ({
    ...enquiry,
    food_preference: foodPreferences[i],
    group_id: groupId,
    group_size: groupSize,
    group_seq: i + 1,
  }));
  const { error } = await supabase.from('enquiries').insert(rows);
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    if (isSeatsUnavailableError(error)) {
      throw new Error('SEATS_UNAVAILABLE');
    }
    throw error;
  }
}

// Live, uncached snapshot of one trip's seat numbers — queried right before
// a booking submission decides enquiry-vs-waitlist, instead of trusting
// whatever was true when the trip page first loaded. Mirrors the same
// total/booked/waitlist-reserved math getUpcomingTrips() and
// getUpcomingTripBySlug() use for the public "seats left" figure (see
// publicSeatsLeft() in utils/utils-index.ts), just re-fetched fresh at
// submit time. This closes most of the "two people submit against the same
// stale seats-left number" race; the SEATS_UNAVAILABLE DB trigger (see
// add_enquiry_capacity_enforcement.sql) is the hard backstop for whatever's
// left of that window. Returns null on any fetch failure so callers can
// fall back to their existing cached number rather than blocking submission.
export async function getTripSeatSnapshot(
  tripId: string
): Promise<{ totalSeats: number | null; seatsBooked: number; waitlistReserved: number } | null> {
  const [{ data, error }, reservedCounts] = await Promise.all([
    supabase.from('upcoming_trips').select('total_seats, seats_booked').eq('id', tripId).single(),
    getWaitlistReservedCounts(),
  ]);
  if (error || !data) return null;
  return {
    totalSeats: data.total_seats,
    seatsBooked: data.seats_booked,
    waitlistReserved: reservedCounts[tripId] || 0,
  };
}

export async function getEnquiries(): Promise<Enquiry[]> {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// closedReason is only ever written when status is 'closed'; every other
// status value (including reopening back to 'new') clears closed_reason
// back to null so it never lingers on a re-opened or since-progressed
// enquiry — see add_closed_reason.sql and enquiries_closed_reason_requires_closed_status.
export async function updateEnquiryStatus(
  id: string,
  status: Enquiry['status'],
  closedReason?: Enquiry['closed_reason']
): Promise<void> {
  const { error } = await supabase
    .from('enquiries')
    .update({ status, closed_reason: status === 'closed' ? (closedReason ?? null) : null })
    .eq('id', id);
  if (error) throw error;
  await refreshJourneyStage(id);
}

// Corrects who/what an enquiry is actually about — full name, contact
// details, and which trip it's linked to — for when an admin logged the
// right enquiry against the wrong person (typo'd name/phone/email, picked
// the wrong trip, etc). Deliberately separate from recordPayment/
// createManualEnquiry: this never touches money, status, or journey_stage,
// it only fixes the traveller-identity fields, so it can't accidentally
// re-trigger booking/payment side effects. trip_id is included since
// "wrong trip" is the same class of mistake as "wrong name" here; if it
// changes, any already-tracked total_amount/package_type is left as-is —
// re-open Track Payment afterwards if the new trip's price differs.
export async function updateEnquiryDetails(
  id: string,
  fields: {
    full_name?: string;
    email?: string;
    phone?: string;
    city?: string | null;
    age?: number | null;
    trip_id?: string | null;
    // trip_title is snapshotted on the row at submit time (see
    // AdminEnquiries.tsx), not looked up live from trip_id — so changing
    // trip_id here must also pass the new trip's title, or the row ends up
    // pointing at one trip while displaying another's name everywhere the
    // snapshot (not a join) is what's shown.
    trip_title?: string | null;
    source?: Enquiry['source'];
  }
): Promise<Enquiry> {
  const patch: Record<string, unknown> = {};
  if (fields.full_name !== undefined) {
    const trimmed = fields.full_name.trim();
    if (!trimmed) throw new Error('Name cannot be empty.');
    patch.full_name = trimmed;
  }
  if (fields.email !== undefined) patch.email = fields.email.trim();
  if (fields.phone !== undefined) {
    const trimmed = fields.phone.trim();
    if (!trimmed) throw new Error('Phone cannot be empty.');
    patch.phone = trimmed;
  }
  if (fields.city !== undefined) patch.city = fields.city || null;
  if (fields.age !== undefined) patch.age = fields.age;
  if (fields.trip_id !== undefined) patch.trip_id = fields.trip_id || null;
  if (fields.trip_title !== undefined) patch.trip_title = fields.trip_title || null;
  if (fields.source !== undefined) patch.source = fields.source;

  const { data, error } = await supabase
    .from('enquiries')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('updateEnquiryDetails failed:', error.code, error.message, error.details, error.hint);
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    throw new Error(error.message || 'Failed to update enquiry details.');
  }
  return data;
}

// Manual enquiry entry — for walk-ins, phone calls, WhatsApp messages, etc.
// that never came through the website's booking form. If an amount is paid
// up front, this books a seat, logs it to the payments ledger, and sets
// status/booking_status/is_paid the same way recordPayment does above.
export async function createManualEnquiry(enquiry: Partial<Enquiry>): Promise<Enquiry> {
  const amountPaid = enquiry.amount_paid || 0;
  const totalAmount = enquiry.total_amount ?? null;
  if (amountPaid < 0) {
    throw new Error('Amount paid cannot be negative.');
  }
  if (totalAmount != null && totalAmount > 0 && amountPaid > totalAmount) {
    throw new Error("Amount paid can't exceed the total amount.");
  }
  const isPaidFull = !!totalAmount && amountPaid >= totalAmount;
  const status = computeAutoStatus(amountPaid, totalAmount, enquiry.status || 'new');
  const bookingStatus = computeBookingStatus(
    amountPaid,
    totalAmount,
    enquiry.booking_amount || 0,
    enquiry.balance_due_date,
    undefined
  );
  // journey_stage computed as if amount_paid were already 0 (the ledger
  // insert below, if any, is refreshed via refreshJourneyStage afterwards).
  const journeyStage = computeJourneyStage({
    status,
    cancelled_at: null,
    amount_paid: 0,
    total_amount: totalAmount,
    booking_amount: enquiry.booking_amount || 0,
    balance_due_date: enquiry.balance_due_date,
    checked_in_at: null,
    booking_status: bookingStatus,
  });

  // Don't insert amount_paid directly if we're about to log it to the
  // ledger — let the trigger set it, so the two never drift apart.
  const rest = { ...enquiry };
  delete rest.amount_paid;
  const { data, error } = await supabase
    .from('enquiries')
    .insert({ ...rest, amount_paid: 0, is_paid: isPaidFull, status, booking_status: bookingStatus, journey_stage: journeyStage })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    throw error;
  }

  if (amountPaid > 0) {
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: data.id,
      amount: amountPaid,
      payment_type: isPaidFull ? 'full_payment' : 'advance',
      notes: 'Initial payment recorded at enquiry creation',
    });
    if (paymentError) {
      // The enquiry row above was already committed — it's a separate
      // insert, not one transaction with this payment. If logging the
      // payment fails (most commonly: the trip filled up in between and
      // the enforce_trip_capacity DB trigger rejected it), don't leave
      // that bare, unpaid enquiry behind as an orphan that then shows up
      // in the list on its own. Delete it and surface the real error.
      // Retry the cleanup once if the first attempt fails (e.g. transient
      // network hiccup) — an orphaned unpaid enquiry is worse than a
      // slightly longer error path.
      const cleanup = () => supabase.from('enquiries').delete().eq('id', data.id);
      const { error: deleteError } = await cleanup();
      if (deleteError) {
        console.error('Orphan cleanup failed, retrying:', deleteError);
        await cleanup();
      }
      throw paymentError;
    }
    // Re-fetch: inserting the payment above cascades, via DB triggers, into
    // both enquiries.amount_paid and the trip's seats_booked count being
    // recomputed from real data — no manual seat adjustment needed here.
    // Also brings journey_stage in line with the real amount_paid, which
    // may put it a stage further along than the pre-payment value computed
    // above (e.g. straight to 'confirmed'/'fully_paid').
    return refreshJourneyStage(data.id);
  }

  return data;
}

// Pure derivation of the single "Booking Journey" stage shown in the admin
// table, from the same underlying columns computeAutoStatus/
// computeBookingStatus already read — see add_booking_journey_stage.sql for
// the full rationale on why each branch is ordered the way it is.
// cancelled_at always wins; booking_status === 'completed' is next (both are
// admin-explicit, never something a payment alone can undo).
function computeJourneyStage(e: {
  status: Enquiry['status'];
  cancelled_at?: string | null;
  amount_paid: number;
  total_amount?: number | null;
  booking_amount: number;
  balance_due_date?: string | null;
  checked_in_at?: string | null;
  booking_status?: Enquiry['booking_status'];
}): JourneyStage {
  if (e.cancelled_at) return 'cancelled';
  if (e.booking_status === 'completed') return 'completed';
  if (e.checked_in_at) return 'checked_in';
  if (e.total_amount && e.total_amount > 0 && e.amount_paid >= e.total_amount) return 'fully_paid';
  if (
    e.amount_paid > 0 &&
    e.balance_due_date &&
    new Date(e.balance_due_date) < new Date() &&
    (!e.total_amount || e.amount_paid < e.total_amount)
  ) {
    return 'balance_pending';
  }
  if (e.booking_amount > 0 && e.amount_paid >= e.booking_amount) return 'confirmed';
  if (e.amount_paid > 0) return 'advance_paid';
  // A lead an admin closed out as "not interested" after contacting (or
  // without ever contacting) — no money ever landed on it, so it's not a
  // Cancelled booking, and status !== 'contacted' means it can't fall into
  // either of the two branches below either. Without this, a closed lead
  // silently fell all the way through to 'new_enquiry'. See
  // add_not_interested_journey_stage.sql / isNotInterested() in
  // enquiryShared.tsx for the full rationale.
  if (e.status === 'closed') return 'not_interested';
  if (e.status === 'contacted' && e.total_amount) return 'advance_pending';
  if (e.status === 'contacted') return 'contacted';
  return 'new_enquiry';
}

// Re-reads an enquiry's current columns and writes the journey_stage they
// derive to, if it's changed. Every mutating enquiry path below that can
// possibly move the journey forward (or back to 'cancelled') calls this
// once it's done, instead of trying to compute the new stage inline from
// values that might not reflect what a DB trigger just wrote.
async function refreshJourneyStage(enquiryId: string): Promise<Enquiry> {
  const { data: e, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', enquiryId)
    .single();
  if (error) throw error;

  const stage = computeJourneyStage(e);

  // follow_up_at (see add_enquiry_follow_up.sql) is only meaningful while
  // the lead is still a live, pre-booked conversation — the DB's own check
  // constraint enforces status === 'contacted', which covers 'contacted',
  // 'advance_pending', and 'advance_paid' (status only flips off
  // 'contacted' once amount_paid reaches total_amount — see
  // computeAutoStatus above). Kept in sync with canSetFollowUp() in
  // enquiryShared.tsx. Every mutating path that can move a lead past that
  // point (booking confirmed, fully paid, closed as Not Interested,
  // reopened, cancelled, etc.) already routes through here, so this is the
  // one place a stale reminder needs clearing rather than every call site
  // remembering to do it individually.
  const stillFollowable = stage === 'contacted' || stage === 'advance_pending' || stage === 'advance_paid';
  const clearFollowUp = !!e.follow_up_at && !stillFollowable;

  if (stage === e.journey_stage && !clearFollowUp) return e;

  const patch: Record<string, unknown> = {};
  if (stage !== e.journey_stage) patch.journey_stage = stage;
  if (clearFollowUp) patch.follow_up_at = null;

  const { data, error: updateError } = await supabase
    .from('enquiries')
    .update(patch)
    .eq('id', enquiryId)
    .select()
    .single();
  if (updateError) throw updateError;
  return data;
}

// Sets or clears the follow-up reminder date on a Contacted lead that's
// still warm but not ready to act on — "checking with family, call back
// Aug 15". Deliberately separate from updateEnquiryStatus: this never
// touches status/journey_stage itself, it's a reminder layered on top of
// wherever the lead already sits (see canSetFollowUp/followUpStatus in
// enquiryShared.tsx). The DB check constraint only allows a non-null value
// while status = 'contacted' — refreshJourneyStage() clears it back to
// null automatically once the lead moves on, so nothing else needs to.
export async function setEnquiryFollowUp(id: string, followUpAt: string | null): Promise<void> {
  const { error } = await supabase
    .from('enquiries')
    .update({ follow_up_at: followUpAt })
    .eq('id', id);
  if (error) throw error;
}

// Manually advances an enquiry to 'checked_in' — the one journey stage with
// no payment/status signal to derive it from. Only meaningful once the
// booking is fully paid (checking in someone who still owes money is a
// front-desk/ops decision, not blocked here, but the button that calls this
// only appears once journey_stage is already 'fully_paid').
export async function checkInEnquiry(enquiryId: string): Promise<Enquiry> {
  const { error } = await supabase
    .from('enquiries')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', enquiryId);
  if (error) throw error;
  return refreshJourneyStage(enquiryId);
}

// Undoes an accidental check-in.
export async function undoCheckInEnquiry(enquiryId: string): Promise<Enquiry> {
  const { error } = await supabase
    .from('enquiries')
    .update({ checked_in_at: null })
    .eq('id', enquiryId);
  if (error) throw error;
  return refreshJourneyStage(enquiryId);
}

// Any payment — full or partial — reserves a seat, since a deposit is a
// booking in practice. Status auto-advances: fully paid -> closed,
// partially paid -> contacted. Unpaid (0) never auto-downgrades status,
// so an admin's manual "closed"/"contacted" note isn't silently undone.
function computeAutoStatus(
  amountPaid: number,
  totalAmount: number | null | undefined,
  currentStatus: Enquiry['status']
): Enquiry['status'] {
  if (totalAmount && totalAmount > 0 && amountPaid >= totalAmount) return 'closed';
  if (amountPaid > 0) return 'contacted';
  return currentStatus;
}

// Booking/payment lifecycle — a separate dimension from the lead `status`
// above. Never downgrades away from 'cancelled' or 'completed' here; those
// are set explicitly (cancelled via the DB trigger on cancelEnquiry,
// completed manually by an admin after the trip wraps).
function computeBookingStatus(
  amountPaid: number,
  totalAmount: number | null | undefined,
  bookingAmount: number,
  balanceDueDate: string | null | undefined,
  current: Enquiry['booking_status']
): Enquiry['booking_status'] {
  if (current === 'cancelled' || current === 'completed') return current;
  if (amountPaid <= 0) return undefined;
  if (totalAmount && totalAmount > 0 && amountPaid >= totalAmount) return 'fully_paid';
  if (bookingAmount > 0 && amountPaid >= bookingAmount && balanceDueDate) {
    return new Date(balanceDueDate) < new Date() ? 'balance_pending' : 'booking_confirmed';
  }
  return 'booking_confirmed';
}

// NOTE: trips.seats_booked is no longer adjusted manually from here. The
// on_enquiries_seat_sync DB trigger recomputes it straight from real
// enquiries data (count of non-cancelled rows with amount_paid > 0) after
// every insert/update/delete on `enquiries` — including the amount_paid
// updates that cascade in from the `payments` table. Keeping a second,
// manual +/-1 adjustment here double-counted every change (e.g. a
// cancellation would free the seat via the trigger AND get decremented
// again by this function), which is what caused seat counts to drift.

// Manually marks a booking's trip as completed once it's wrapped up.
// booking_status only ever reaches 'completed' through this explicit call —
// computeBookingStatus() (used by every payment-driven update above) never
// advances to it on its own, since "the trip happened" isn't something a
// payment event can infer. Guards against completing a booking that was
// cancelled or one that was never actually booked (no payment recorded, so
// booking_status is still unset).
export async function markEnquiryCompleted(enquiryId: string): Promise<Enquiry> {
  const { data: current, error: fetchError } = await supabase
    .from('enquiries')
    .select('booking_status')
    .eq('id', enquiryId)
    .single();
  if (fetchError) throw fetchError;

  if (current.booking_status === 'cancelled') {
    throw new Error('This booking was cancelled and cannot be marked completed.');
  }
  if (!current.booking_status) {
    throw new Error('This enquiry has no booking on it yet (no payment recorded), so it cannot be marked completed.');
  }

  const { error } = await supabase
    .from('enquiries')
    .update({ booking_status: 'completed' })
    .eq('id', enquiryId);
  if (error) throw error;
  return refreshJourneyStage(enquiryId);
}

// =============================================
// Waitlist
// =============================================
// Public-facing: submits a waitlist signup for a sold-out trip. The
// (trip_id, email) unique constraint means a repeat submission from the
// same person throws a Postgres 23505 — surfaced to the caller as a
// distinct error so the UI can show "you're already on the list" instead
// of a generic failure.
export async function submitWaitlist(entry: WaitlistFormData): Promise<void> {
  const { error } = await supabase.from('waitlist').insert(entry);
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_WAITLIST_ENTRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
    }
    throw error;
  }
}

// Admin: all waitlist entries across every trip, newest first.
export async function getWaitlistEntries(): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from('waitlist')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// For the manual status dropdown only — waiting / notified / declined.
// 'converted' is never set through here; see markWaitlistConverted below.
// The DB trigger (enforce_waitlist_conversion) rejects a bare 'converted'
// passed to this function anyway, but the UI no longer offers it as an
// option in the first place.
export async function updateWaitlistStatus(id: string, status: WaitlistEntry['status']): Promise<void> {
  const updates: Partial<WaitlistEntry> = { status };
  if (status === 'notified') updates.notified_at = new Date().toISOString();
  const { error } = await supabase.from('waitlist').update(updates).eq('id', id);
  if (error) throw error;
}

// Links a newly-created enquiry to a waitlist entry as one of its
// conversions. Only call this once the enquiry actually has an advance
// payment on it — the DB trigger enforces that too, but this function
// doesn't re-check it itself so the caller (AdminEnquiries.handleSave)
// must gate on amountPaid > 0 before calling it.
//
// A solo entry (group_size null/1) converts and closes out in one call,
// same as before. A group entry (group_size > 1) only flips to 'converted'
// once every seat has been linked — converting person 1 of 3 leaves this
// row's status as whatever it already was ('waiting'/'notified') with
// converted_enquiry_ids holding 1 id, so the remaining 2 seats are still
// visible and actionable from the Waitlist page instead of the whole row
// silently closing out early.
export async function markWaitlistConverted(waitlistId: string, enquiryId: string): Promise<void> {
  // Fetch the waitlist entry and the linked enquiry in parallel so we can
  // verify they belong to the same trip before linking them — prevents an
  // admin accidentally (or programmatically) cross-linking entries across
  // different trips.
  const [{ data: entry, error: fetchError }, { data: enquiry, error: enquiryFetchError }] = await Promise.all([
    supabase
      .from('waitlist')
      .select('trip_id, status, group_size, converted_enquiry_ids')
      .eq('id', waitlistId)
      .single(),
    supabase
      .from('enquiries')
      .select('trip_id')
      .eq('id', enquiryId)
      .single(),
  ]);
  if (fetchError) throw fetchError;
  if (enquiryFetchError) throw enquiryFetchError;

  if (entry.trip_id !== enquiry.trip_id) {
    throw new Error('Waitlist entry and enquiry belong to different trips — cannot link them.');
  }

  const existingIds = entry.converted_enquiry_ids || [];
  const updatedIds = existingIds.includes(enquiryId) ? existingIds : [...existingIds, enquiryId];
  const needed = entry.group_size && entry.group_size > 1 ? entry.group_size : 1;
  const newStatus = updatedIds.length >= needed ? 'converted' : entry.status;

  const { error } = await supabase
    .from('waitlist')
    .update({ status: newStatus, converted_enquiry_ids: updatedIds })
    .eq('id', waitlistId);
  if (error) throw error;
}

export async function deleteWaitlistEntry(id: string): Promise<void> {
  const { error } = await supabase.from('waitlist').delete().eq('id', id);
  if (error) throw error;
}

// Records a new payment (delta from what's already been paid, not an
// absolute total) against an enquiry. Inserting into the payments ledger
// triggers a DB-side recalculation of enquiries.amount_paid — this function
// never writes amount_paid directly, to avoid it drifting from the ledger.
//
// `newAmountPaid` is the *running total* the admin enters in the UI (kept
// this way so the form still just shows one "amount paid so far" field);
// this function does the delta math and inserts one ledger row for the
// difference. Passing a newAmountPaid equal to current.amount_paid is a
// no-op (e.g. saving the form after only changing total_amount/package_type).
export async function recordPayment(
  current: Enquiry,
  payment: {
    amount_paid: number; // new running total, not a delta
    total_amount?: number | null;
    package_type?: Enquiry['package_type'];
    food_preference?: 'veg' | 'non_veg' | null;
    payment_method?: string;
    notes?: string;
  }
): Promise<Enquiry> {
  const newTotal = payment.total_amount !== undefined ? payment.total_amount : current.total_amount;

  // Server-side bound-checking: the UI validates this too, but recordPayment
  // is the one choke point every payment path (single edit, bulk edit,
  // manual-enquiry creation) eventually calls, so guard here regardless of
  // what a caller passes in. Without this, a typo'd amount_paid inserts a
  // ledger delta straight into `payments` — the DB's amount_paid <=
  // total_amount CHECK constraint only catches it once the sync trigger
  // tries to write the recomputed total back to `enquiries`, by which point
  // the bad ledger row already exists and the update just fails.
  if (payment.amount_paid < 0) {
    throw new Error('Amount paid cannot be negative.');
  }
  if (newTotal != null && newTotal > 0 && payment.amount_paid > newTotal) {
    throw new Error("Amount paid can't exceed the total amount.");
  }

  const delta = payment.amount_paid - (current.amount_paid || 0);

  if (delta !== 0) {
    const isFirstPayment = (current.amount_paid || 0) <= 0;
    const completesTotal = !!newTotal && newTotal > 0 && payment.amount_paid >= newTotal;
    // Labels this transaction the way the invoice list shows it: the first
    // money in is 'full_payment' if it settles the whole total in one go,
    // otherwise 'advance'; anything after that is 'balance' if it's the
    // payment that brings the booking to fully paid, otherwise 'installment'.
    const invoiceType = isFirstPayment
      ? (completesTotal ? 'full_payment' : 'advance')
      : (completesTotal ? 'balance' : 'installment');
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: invoiceType,
      payment_method: payment.payment_method,
      notes: payment.notes,
    });
    if (paymentError) throw paymentError;
  }

  // Re-read the trigger-updated amount_paid so is_paid/status/booking_status
  // are computed from the actual synced value, not assumed from the delta.
  const { data: refreshed, error: refreshError } = await supabase
    .from('enquiries')
    .select('amount_paid, balance_due_date, booking_amount, booking_status')
    .eq('id', current.id)
    .single();
  if (refreshError) throw refreshError;

  // Seat booking follows automatically: the payment insert above already
  // updated enquiries.amount_paid via a DB trigger, which in turn triggers
  // the trip's seats_booked to be recomputed from real data. No manual
  // adjustment needed here.
  const isPaidFull = !!newTotal && newTotal > 0 && refreshed.amount_paid >= newTotal;
  const status = computeAutoStatus(refreshed.amount_paid, newTotal, current.status);
  const bookingStatus = computeBookingStatus(
    refreshed.amount_paid,
    newTotal,
    refreshed.booking_amount,
    refreshed.balance_due_date,
    refreshed.booking_status
  );

  const { error } = await supabase
    .from('enquiries')
    .update({
      total_amount: newTotal,
      package_type: payment.package_type ?? current.package_type,
      food_preference: payment.food_preference !== undefined ? payment.food_preference : current.food_preference,
      is_paid: isPaidFull,
      status,
      booking_status: bookingStatus,
    })
    .eq('id', current.id);
  if (error) throw error;
  return refreshJourneyStage(current.id);
}

// Full payment ledger for one enquiry (booking_amount / installment /
// balance / refund rows), oldest first — the transaction history section
// of the invoice PDF, and also useful for any future "payment history"
// admin view. Distinct from enquiries.amount_paid/refund_amount, which are
// just the running totals this ledger is the source of truth for.
export async function getPaymentsForEnquiry(enquiryId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('paid_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Records one specific, admin-picked invoice type/amount as money already
// collected (status defaults to 'paid' via the DB column default) — unlike
// recordPayment, `amount` here is this transaction's own amount, not a new
// running total, so the admin doesn't have to do the addition themselves
// when generating e.g. an explicit "Advance" or "Balance" invoice from the
// Invoices list. Powers the "Generate Invoice" action for every type except
// extra_charge (see addExtraCharge) and refund (see recordRefund, which
// already has its own dedicated, cancellation-aware flow).
export async function recordTypedPayment(
  current: Enquiry,
  payment: {
    type: 'full_payment' | 'advance' | 'balance' | 'installment';
    amount: number;
    payment_method?: string;
    notes?: string;
  }
): Promise<Enquiry> {
  if (payment.amount <= 0) {
    throw new Error('Invoice amount must be greater than zero.');
  }
  const prospectiveTotal = (current.amount_paid || 0) + payment.amount;
  if (current.total_amount != null && current.total_amount > 0 && prospectiveTotal > current.total_amount) {
    throw new Error("This would take amount paid past the booking's total amount.");
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: current.id,
    amount: payment.amount,
    payment_type: payment.type,
    payment_method: payment.payment_method,
    notes: payment.notes,
  });
  if (paymentError) throw paymentError;

  // Re-read the trigger-updated amount_paid, same reasoning as recordPayment
  // above — never assume the new total, read back what the sync trigger
  // actually wrote.
  const { data: refreshed, error: refreshError } = await supabase
    .from('enquiries')
    .select('amount_paid, balance_due_date, booking_amount, booking_status, total_amount')
    .eq('id', current.id)
    .single();
  if (refreshError) throw refreshError;

  const isPaidFull = !!refreshed.total_amount && refreshed.total_amount > 0 && refreshed.amount_paid >= refreshed.total_amount;
  const status = computeAutoStatus(refreshed.amount_paid, refreshed.total_amount, current.status);
  const bookingStatus = computeBookingStatus(
    refreshed.amount_paid,
    refreshed.total_amount,
    refreshed.booking_amount,
    refreshed.balance_due_date,
    refreshed.booking_status
  );

  const { error } = await supabase
    .from('enquiries')
    .update({ is_paid: isPaidFull, status, booking_status: bookingStatus })
    .eq('id', current.id);
  if (error) throw error;
  return refreshJourneyStage(current.id);
}

// Raises an invoice for money that hasn't been collected yet — e.g. a
// Balance or Installment invoice generated ahead of the customer actually
// paying it (Scenario 2/3 in the invoicing flow). Inserted with
// status = 'pending', so sync_enquiry_amount_paid() leaves
// enquiries.amount_paid untouched until markInvoicePaid flips it later.
export async function generatePendingInvoice(
  enquiryId: string,
  type: 'full_payment' | 'advance' | 'balance' | 'installment',
  amount: number,
  notes?: string
): Promise<Payment> {
  if (amount <= 0) {
    throw new Error('Invoice amount must be greater than zero.');
  }
  const { data, error } = await supabase
    .from('payments')
    .insert({ enquiry_id: enquiryId, amount, payment_type: type, status: 'pending', notes })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Adds an extra charge to an existing booking (e.g. a hotel upgrade) — bumps
// enquiries.total_amount by the charge amount right away, since that's now
// part of what's owed whether or not it's been collected yet, and logs an
// 'extra_charge' invoice for it. Pass collectedNow: true if the customer
// paid on the spot; otherwise the invoice is raised as 'pending' and can be
// settled later via markInvoicePaid.
export async function addExtraCharge(
  current: Enquiry,
  amount: number,
  options?: { collectedNow?: boolean; payment_method?: string; notes?: string }
): Promise<Enquiry> {
  if (amount <= 0) {
    throw new Error('Extra charge amount must be greater than zero.');
  }
  const newTotal = (current.total_amount || 0) + amount;

  const { error: totalError } = await supabase
    .from('enquiries')
    .update({ total_amount: newTotal })
    .eq('id', current.id);
  if (totalError) throw totalError;

  const { error: paymentError } = await supabase.from('payments').insert({
    enquiry_id: current.id,
    amount,
    payment_type: 'extra_charge',
    status: options?.collectedNow ? 'paid' : 'pending',
    payment_method: options?.payment_method,
    notes: options?.notes,
  });
  if (paymentError) throw paymentError;

  const { data, error } = await supabase.from('enquiries').select('*').eq('id', current.id).single();
  if (error) throw error;
  return refreshJourneyStage(data.id);
}

// Settles a 'pending' invoice (a balance/installment invoice raised ahead of
// collection, or an extra charge not yet paid) once the money actually comes
// in. Flips status to 'paid' and stamps paid_at — the existing
// sync_amount_paid_on_payments_change trigger fires on this UPDATE the same
// way it does on insert, folding the amount into enquiries.amount_paid.
export async function markInvoicePaid(
  paymentId: string,
  options?: { payment_method?: string }
): Promise<Payment> {
  const { data, error } = await supabase
    .from('enquiries')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      ...(options?.payment_method ? { payment_method: options.payment_method } : {}),
    })
    .eq('id', paymentId)
    .select()
    .single();
  if (error) throw error;
  await refreshJourneyStage(data.enquiry_id);
  return data;
}

// Cancels an enquiry / booking. Frees the trip seat immediately if one was
// held (amount_paid > 0 and not already cancelled). amount_paid itself is
// untouched — that's the historical record of what they actually paid,
// separate from refund_amount which tracks what's been paid back.
//
// Setting cancelled_at fires a DB trigger that auto-computes
// suggested_refund_amount and sets booking_status to 'cancelled' — this is
// a SUGGESTION only, never authoritative; the admin still enters the real
// refund_amount via recordRefund. Pass thirdPartyCharges if known at
// cancellation time (airline/hotel penalties aren't derivable from stored
// data) so the suggestion accounts for them. Pass isNoShow if the admin is
// cancelling *because* the guest was a no-show — the DB trigger forces the
// suggested refund to 0 in that case, per the site's no-refund-for-no-shows
// policy, overriding the normal cancellation-window math.
//
// The trip's seats_booked count frees up on its own: the
// on_enquiries_seat_sync DB trigger recomputes it from real enquiries data
// right after this update commits, so no manual adjustment is made here.
export async function cancelEnquiry(enquiry: Enquiry, thirdPartyCharges?: number, isNoShow?: boolean): Promise<Enquiry> {
  if (thirdPartyCharges !== undefined) {
    const { error: chargesError } = await supabase
      .from('enquiries')
      .update({ third_party_charges: thirdPartyCharges })
      .eq('id', enquiry.id);
    if (chargesError) throw chargesError;
  }

  const { error } = await supabase
    .from('enquiries')
    .update({
      cancelled_at: new Date().toISOString(),
      ...(isNoShow !== undefined ? { is_no_show: isNoShow } : {}),
    })
    .eq('id', enquiry.id);
  if (error) throw error;

  return refreshJourneyStage(enquiry.id);
}

// Toggles is_no_show on its own, independent of cancellation — an admin may
// only realize/decide a booking was a no-show after the fact (e.g. once the
// trip has already departed), whether or not the booking was ever formally
// cancelled. The on_enquiry_cancelled DB trigger reacts to this update and
// recomputes suggested_refund_amount: forced to 0 while is_no_show is true,
// or back to the normal cancellation-window math when unmarked.
export async function setEnquiryNoShow(enquiry: Enquiry, isNoShow: boolean): Promise<Enquiry> {
  const { data, error } = await supabase
    .from('enquiries')
    .update({ is_no_show: isNoShow })
    .eq('id', enquiry.id)
    .select()
    .single();
  if (error) throw error;

  return data;
}

// Soft-deletes an enquiry by stamping deleted_at — the row is hidden from
// all normal queries but preserved in the DB for recovery. Payment history
// is kept intact (no cascade). If the enquiry held a seat, the
// on_enquiries_seat_sync trigger frees it automatically because the
// updated row no longer matches the "paid & not cancelled & not deleted"
// count condition.
export async function deleteEnquiry(enquiry: Enquiry): Promise<void> {
  const { error } = await supabase
    .from('enquiries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', enquiry.id);
  if (error) throw error;
}


// Re-books the seat if they'd already paid something, and resets
// booking_status back to whatever it would be given the current amount
// paid (rather than leaving it stuck on 'cancelled'). Re-booking a seat
// this way is still capacity-checked by the enforce_trip_capacity DB
// trigger, and seats_booked is recomputed by on_enquiries_seat_sync right
// after — no manual adjustment needed here.
export async function uncancelEnquiry(enquiry: Enquiry): Promise<Enquiry> {
  const bookingStatus = computeBookingStatus(
    enquiry.amount_paid,
    enquiry.total_amount,
    enquiry.booking_amount,
    enquiry.balance_due_date,
    undefined // force recompute rather than trusting the 'cancelled' value
  );

  const { error } = await supabase
    .from('enquiries')
    .update({ cancelled_at: null, booking_status: bookingStatus, suggested_refund_amount: null })
    .eq('id', enquiry.id);
  if (error) throw error;

  return refreshJourneyStage(enquiry.id);
}

// Logs how much has been refunded so far for a cancelled booking.
// `newRefundAmount` is the running total (matching recordPayment's pattern)
// — this inserts a ledger row for the delta rather than overwriting
// refund_amount directly, so refund_amount stays in sync via the same DB
// trigger that maintains amount_paid.
export async function recordRefund(
  current: Enquiry,
  newRefundAmount: number,
  options?: { payment_method?: string; notes?: string }
): Promise<Enquiry> {
  // Same reasoning as the guard at the top of recordPayment above — this is
  // the one choke point every refund path calls, so bound-check here even
  // though the UI already does too.
  if (newRefundAmount < 0) {
    throw new Error('Refund amount cannot be negative.');
  }
  if (newRefundAmount > (current.amount_paid || 0)) {
    throw new Error("Refund amount can't exceed what was actually paid.");
  }
  // No-shows forfeit the full amount paid, no exceptions — the UI already
  // locks this field to 0, but guard here too since this is the one choke
  // point every refund path calls.
  if (current.is_no_show && newRefundAmount > 0) {
    throw new Error('No refund is permitted for a no-show.');
  }

  const delta = newRefundAmount - (current.refund_amount || 0);
  if (delta !== 0) {
    const { error: refundError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: 'refund',
      payment_method: options?.payment_method,
      notes: options?.notes,
    });
    if (refundError) throw refundError;
  }

  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('id', current.id)
    .single();
  if (error) throw error;
  return data;
}

// =============================================
// Testimonials
// =============================================
export async function getTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAllTestimonialsAdmin(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTestimonial(testimonial: Partial<Testimonial>): Promise<Testimonial> {
  const { data, error } = await supabase
    .from('testimonials')
    .insert(testimonial)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTestimonial(id: string, testimonial: Partial<Testimonial>): Promise<Testimonial> {
  const { data, error } = await supabase
    .from('testimonials')
    .update(testimonial)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTestimonial(id: string): Promise<void> {
  const { error } = await supabase.from('testimonials').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// Site Content (editable copy for pages like About)
// =============================================
export async function getSiteContent<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('site_content')
    .select('content')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data.content as T;
}

export async function upsertSiteContent(key: string, content: unknown): Promise<void> {
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, content }, { onConflict: 'key' });
  if (error) throw error;
}

// =============================================
// Notifications
// =============================================
export async function getNotifications(limit = 20): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) throw error;
  return count || 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (error) throw error;
}
