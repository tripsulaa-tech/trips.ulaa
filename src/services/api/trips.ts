import { supabase } from '../supabase';
import type { UpcomingTrip, CompletedTrip, TripFinanceSnapshot } from '../../types/types-index';
import { getStoragePathFromUrl, deleteImageByUrl } from './shared';

import { STORAGE_BUCKET } from '../../constants/storage';

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
  const path = getStoragePathFromUrl(STORAGE_BUCKET, url);
  if (!path) return null;
  const originalFilename = path.split('/').pop();
  if (!originalFilename) return null;
  const filename = fileNamePrefix ? `${fileNamePrefix}-${originalFilename}` : originalFilename;
  const newPath = `${destFolder}/${filename}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).move(path, newPath);
  if (error) return null;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(newPath);
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

// =============================================
// PII-free RPC — { trip_id, taken_count } for trips with a seat-limited early
// bird (upcoming_trips.early_bird_seats): how many early-bird seats are
// already PAID for. Cancelled/refunded seats still count. Never throws: on
// failure we report nothing taken (the DB still enforces the real limit when
// the advance is recorded).
// =============================================
async function getEarlyBirdSeatsTaken(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_early_bird_seats_taken');
  if (error || !data) return {};
  const map: Record<string, number> = {};
  for (const row of data as { trip_id: string; taken_count: number }[]) {
    map[row.trip_id] = row.taken_count;
  }
  return map;
}

// Every upcoming_trips read embeds its linked trip_leaders row (aliased to
// `trip_leader`, singular, matching the UpcomingTrip.trip_leader field) via
// the trip_leader_id FK — see add_trip_leader_id_to_trips.sql. This is how
// the public page/PDF and Admin views all read a trip's leader live from
// the directory instead of a per-trip copy: trip_leader_id is the only
// thing stored on the trip row itself.
const UPCOMING_TRIP_SELECT = '*, trip_leader:trip_leaders(*)';

export async function getUpcomingTrips(): Promise<UpcomingTrip[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data, error }, reservedCounts, earlyTaken] = await Promise.all([
    supabase
      .from('upcoming_trips')
      .select(UPCOMING_TRIP_SELECT)
      .in('status', ['coming_soon', 'published'])
      .gte('start_date', today)
      // Manual admin-controlled order (see add_trip_sort_order.sql and the
      // ↑/↓ controls in AdminTripsTable.tsx) drives card position on the
      // homepage preview and the full /trips listing; start_date is only a
      // tiebreaker for trips that somehow share a sort_order.
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('start_date', { ascending: true }),
    getWaitlistReservedCounts(),
    getEarlyBirdSeatsTaken(),
  ]);
  if (error) throw error;
  return (data || []).map(trip => ({ ...trip, waitlist_reserved: reservedCounts[trip.id] || 0, early_bird_seats_taken: earlyTaken[trip.id] || 0 })) as UpcomingTrip[];
}

export async function getUpcomingTripBySlug(slug: string): Promise<UpcomingTrip | null> {
  const [{ data, error }, reservedCounts, earlyTaken] = await Promise.all([
    supabase
      .from('upcoming_trips')
      .select(UPCOMING_TRIP_SELECT)
      .eq('slug', slug)
      .in('status', ['coming_soon', 'published'])
      .single(),
    getWaitlistReservedCounts(),
    getEarlyBirdSeatsTaken(),
  ]);
  if (error) return null;
  return { ...data, waitlist_reserved: reservedCounts[data.id] || 0, early_bird_seats_taken: earlyTaken[data.id] || 0 } as UpcomingTrip;
}

/** If a trip's link was changed (see add_trip_slug_rename.sql), returns the
 *  trip's current slug for an old one, so the public page can redirect.
 *  Null when there's no redirect (or the migration hasn't been run yet). */
export async function getUpcomingTripRedirectSlug(oldSlug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('trip_slug_redirects')
    .select('upcoming_trips(slug)')
    .eq('old_slug', oldSlug)
    .maybeSingle();
  if (error || !data) return null;
  const trip = (data as { upcoming_trips: { slug: string } | { slug: string }[] | null }).upcoming_trips;
  const row = Array.isArray(trip) ? trip[0] : trip;
  return row?.slug ?? null;
}

/** Admin-only: changes a trip's public link. The old link keeps working as a
 *  redirect. Throws if the new slug is taken or the rename function is missing. */
export async function renameUpcomingTripSlug(id: string, newSlug: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_rename_upcoming_trip_slug', {
    p_trip_id: id,
    p_new_slug: newSlug,
  });
  if (error) throw error;
  return data as string;
}

/** Admin-only: one trip by id regardless of status (draft included), for the
 *  admin "Preview page" view. The public getUpcomingTripBySlug hides drafts. */
export async function getUpcomingTripByIdAdmin(id: string): Promise<UpcomingTrip | null> {
  const [{ data, error }, reservedCounts, earlyTaken] = await Promise.all([
    supabase
      .from('upcoming_trips')
      .select(UPCOMING_TRIP_SELECT)
      .eq('id', id)
      .single(),
    getWaitlistReservedCounts(),
    getEarlyBirdSeatsTaken(),
  ]);
  if (error || !data) return null;
  return { ...data, waitlist_reserved: reservedCounts[data.id] || 0, early_bird_seats_taken: earlyTaken[data.id] || 0 } as UpcomingTrip;
}

export async function getAllUpcomingTripsAdmin(): Promise<UpcomingTrip[]> {
  const { data, error } = await supabase
    .from('upcoming_trips')
    .select(UPCOMING_TRIP_SELECT)
    // Matches the public ordering (see getUpcomingTrips above) so the
    // admin table's row order is what the ↑/↓ reorder controls are acting
    // on — moving a trip up here is what moves its card earlier on the
    // homepage/listing.
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const earlyTaken = await getEarlyBirdSeatsTaken();
  return (data || []).map(trip => ({ ...trip, early_bird_seats_taken: earlyTaken[trip.id] || 0 })) as UpcomingTrip[];
}

export async function createUpcomingTrip(trip: Partial<UpcomingTrip>): Promise<UpcomingTrip> {
  // New trips are appended to the end of the manual display order rather
  // than defaulting to null/first, so adding a trip never silently jumps
  // it ahead of an already-arranged homepage lineup. See
  // add_trip_sort_order.sql.
  let sort_order = trip.sort_order;
  if (sort_order == null) {
    const { data: lastRow } = await supabase
      .from('upcoming_trips')
      .select('sort_order')
      .order('sort_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    sort_order = (lastRow?.sort_order ?? -1) + 1;
  }
  const { data, error } = await supabase
    .from('upcoming_trips')
    .insert({ ...trip, sort_order })
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

async function deleteUpcomingTrip(id: string): Promise<void> {
  const { error } = await supabase.from('upcoming_trips').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
// Trip deletion — cascade cleanup
// =============================================
// Bucket every trip-attached image lives in — see the bucket={STORAGE_BUCKET} props
// throughout AdminTrips.tsx's upload fields.
const TRIP_IMAGE_BUCKET = STORAGE_BUCKET;

// Pulls every image URL referenced anywhere on an upcoming trip (cover,
// mobile hero, gallery, accommodation/fashion photo galleries, "Places
// You'll Post" items, itinerary day photos, end banner) so
// deleteUpcomingTripCascade can clean them out of storage instead of
// leaving orphaned files behind, and getTripDeletionImpact can show an
// accurate photo count in the pre-delete warning. Deliberately excludes the
// linked trip leader's photo (trip.trip_leader) — that photo lives on the
// shared trip_leaders directory entry, not this trip, and other trips may
// still reference the same leader.
function collectTripImageUrls(trip: UpcomingTrip): string[] {
  const urls: string[] = [];
  if (trip.cover_image) urls.push(trip.cover_image);
  if (trip.hero_mobile_image) urls.push(trip.hero_mobile_image);
  urls.push(...(trip.gallery_images || []));
  urls.push(...(trip.accommodation_photos || []));
  urls.push(...(trip.fashion_photos || []));
  (trip.gallery_items || []).forEach(item => { if (item.photo) urls.push(item.photo); });
  (trip.itinerary || []).forEach(day => urls.push(...(day.images || [])));
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
  // Keep the trip's Finances & Profit, Pricing, availability and final revenue
  // in the admin-only snapshot table before the trip row (and its enquiries,
  // which revenue is derived from) go away. The DB decides what is worth
  // keeping (started, or has finance / paid bookings — see
  // freeze_trip_finance). For a trip that has started a failure here BLOCKS
  // the delete, so a finished trip's money data can never be lost silently.
  // A trigger on upcoming_trips saves it again at the moment of deletion.
  const started = !!trip.start_date && trip.start_date <= new Date().toLocaleDateString('en-CA');
  try {
    await freezeTripFinance(trip.id);
  } catch (err) {
    if (started) throw new Error("Couldn't save this trip's finance record, so it was not deleted. Try again.", { cause: err });
    console.error(err);
  }

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
// Trip Finance snapshots (admin-only)
// =============================================
// Copies an upcoming trip's Finances & Profit, Pricing and current revenue
// into trip_finance_snapshots (DB function freeze_trip_finance). No-op when
// the upcoming_trips row no longer exists, so an existing snapshot is never
// overwritten with nothing.
export async function freezeTripFinance(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('freeze_trip_finance', { p_trip_id: tripId });
  if (error) throw error;
}

export async function getTripFinanceSnapshots(): Promise<TripFinanceSnapshot[]> {
  const { data, error } = await supabase.from('trip_finance_snapshots').select('*');
  if (error) throw error;
  return data || [];
}

// Saves the edited Finances & Profit of a trip whose upcoming_trips row no
// longer exists (a finished trip), straight into its snapshot row. Creates the
// row when there isn't one yet (a trip from before snapshots existed). Only the
// columns passed are written, so pricing/revenue already saved are untouched.
export async function saveTripFinanceSnapshot(
  snapshot: Pick<TripFinanceSnapshot, 'trip_id' | 'title'> & Partial<TripFinanceSnapshot>,
): Promise<void> {
  const { error } = await supabase
    .from('trip_finance_snapshots')
    .upsert(snapshot, { onConflict: 'trip_id' });
  if (error) throw error;
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

async function deleteCompletedTrip(id: string): Promise<void> {
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
