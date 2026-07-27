import { supabase } from './supabase';
import type { UpcomingTrip, CompletedTrip, Enquiry, GalleryImage, Testimonial, BookingFormData, AdminNotification, Payment, WaitlistEntry, WaitlistFormData } from '../types/types-index';

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
async function getWaitlistReservedCounts(): Promise<Record<string, number>> {
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
      .eq('is_published', true)
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
      .eq('is_published', true)
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
const TARGET_SIZE_BYTES = 100 * 1024; // 100KB
const MAX_DIMENSION = 1920; // px, longest side — plenty for any use in this app
const MIN_QUALITY = 0.5; // quality floor for any single pass; resize instead of going lower
const QUALITY_STEP = 0.05; // fine-grained steps so we don't overshoot past a good size/quality tradeoff
const MAX_RESIZE_ATTEMPTS = 8; // each pass shrinks by 10%, so 8 passes ≈ 43% of original linear size at most
const RESIZE_FACTOR = 0.9;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size <= TARGET_SIZE_BYTES) return file;

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
    while (best && best.size > TARGET_SIZE_BYTES && quality > MIN_QUALITY) {
      quality = Math.max(quality - QUALITY_STEP, MIN_QUALITY);
      best = await toBlob(quality);
      if (quality === MIN_QUALITY) break;
    }
    return best;
  };

  draw(width, height);
  let blob = await searchQuality();

  let attempts = 0;
  while (blob && blob.size > TARGET_SIZE_BYTES && attempts < MAX_RESIZE_ATTEMPTS) {
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

export async function uploadImage(bucket: string, file: File, path: string): Promise<string> {
  const compressed = await compressImage(file);
  // If the file got re-encoded to webp, the storage path's extension needs
  // to match, or the browser will guess the wrong content-type on download.
  const finalPath = compressed !== file
    ? path.replace(/\.[^./]+$/, '') + '.webp'
    : path;
  const { error } = await supabase.storage.from(bucket).upload(finalPath, compressed, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(finalPath);
  return data.publicUrl;
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

// The (trip_id, name, phone, email) unique constraint (active enquiries
// only — cancelled ones are excluded) means an exact literal re-submission
// throws a Postgres 23505. Surfaced as a distinct error so the UI can show
// "you've already enquired" instead of a generic failure. Deliberately
// keyed on all three fields together (not email/phone alone) so a family
// booking several seats through one shared contact still works fine.
export async function submitEnquiry(enquiry: BookingFormData): Promise<void> {
  const { error } = await supabase.from('enquiries').insert(enquiry);
  if (error) {
    if (error.code === '23505') {
      throw new Error('DUPLICATE_ENQUIRY');
    }
    if (isAgeNotEligibleError(error)) {
      throw new Error('AGE_NOT_ELIGIBLE');
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
    throw error;
  }
}

export async function getEnquiries(): Promise<Enquiry[]> {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateEnquiryStatus(id: string, status: Enquiry['status']): Promise<void> {
  const { error } = await supabase.from('enquiries').update({ status }).eq('id', id);
  if (error) throw error;
}

// Manual enquiry entry — for walk-ins, phone calls, WhatsApp messages, etc.
// that never came through the website's booking form. If an amount is paid
// up front, this books a seat, logs it to the payments ledger, and sets
// status/booking_status/is_paid the same way recordPayment does above.
export async function createManualEnquiry(enquiry: Partial<Enquiry>): Promise<Enquiry> {
  const amountPaid = enquiry.amount_paid || 0;
  const totalAmount = enquiry.total_amount ?? null;
  const isPaidFull = !!totalAmount && amountPaid >= totalAmount;
  const status = computeAutoStatus(amountPaid, totalAmount, enquiry.status || 'new');
  const bookingStatus = computeBookingStatus(
    amountPaid,
    totalAmount,
    enquiry.booking_amount || 0,
    enquiry.balance_due_date,
    undefined
  );

  // Don't insert amount_paid directly if we're about to log it to the
  // ledger — let the trigger set it, so the two never drift apart.
  const rest = { ...enquiry };
  delete rest.amount_paid;
  const { data, error } = await supabase
    .from('enquiries')
    .insert({ ...rest, amount_paid: 0, is_paid: isPaidFull, status, booking_status: bookingStatus })
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
      payment_type: 'booking_amount',
      notes: 'Initial payment recorded at enquiry creation',
    });
    if (paymentError) {
      // The enquiry row above was already committed — it's a separate
      // insert, not one transaction with this payment. If logging the
      // payment fails (most commonly: the trip filled up in between and
      // the enforce_trip_capacity DB trigger rejected it), don't leave
      // that bare, unpaid enquiry behind as an orphan that then shows up
      // in the list on its own. Delete it and surface the real error.
      await supabase.from('enquiries').delete().eq('id', data.id);
      throw paymentError;
    }
    // Re-fetch: inserting the payment above cascades, via DB triggers, into
    // both enquiries.amount_paid and the trip's seats_booked count being
    // recomputed from real data — no manual seat adjustment needed here.
    const { data: refreshed, error: refetchError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('id', data.id)
      .single();
    if (refetchError) throw refetchError;
    return refreshed;
  }

  return data;
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
  const { data: entry, error: fetchError } = await supabase
    .from('waitlist')
    .select('status, group_size, converted_enquiry_ids')
    .eq('id', waitlistId)
    .single();
  if (fetchError) throw fetchError;

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

// Fetches the payment history for one enquiry (booking amount, balance,
// installments, refunds) — this is the source of truth; enquiries.amount_paid
// and refund_amount are just a cached rollup kept in sync via DB trigger.
export async function getPayments(enquiryId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('paid_at', { ascending: true });
  if (error) throw error;
  return data || [];
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
  const delta = payment.amount_paid - (current.amount_paid || 0);

  if (delta !== 0) {
    const isFirstPayment = (current.amount_paid || 0) <= 0;
    const { error: paymentError } = await supabase.from('payments').insert({
      enquiry_id: current.id,
      amount: delta,
      payment_type: isFirstPayment ? 'booking_amount' : 'installment',
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

  const { data, error } = await supabase
    .from('enquiries')
    .update({
      total_amount: newTotal,
      package_type: payment.package_type ?? current.package_type,
      food_preference: payment.food_preference !== undefined ? payment.food_preference : current.food_preference,
      is_paid: isPaidFull,
      status,
      booking_status: bookingStatus,
    })
    .eq('id', current.id)
    .select()
    .single();
  if (error) throw error;
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
// data) so the suggestion accounts for them.
//
// The trip's seats_booked count frees up on its own: the
// on_enquiries_seat_sync DB trigger recomputes it from real enquiries data
// right after this update commits, so no manual adjustment is made here.
export async function cancelEnquiry(enquiry: Enquiry, thirdPartyCharges?: number): Promise<Enquiry> {
  if (thirdPartyCharges !== undefined) {
    const { error: chargesError } = await supabase
      .from('enquiries')
      .update({ third_party_charges: thirdPartyCharges })
      .eq('id', enquiry.id);
    if (chargesError) throw chargesError;
  }

  const { data, error } = await supabase
    .from('enquiries')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', enquiry.id)
    .select()
    .single();
  if (error) throw error;

  return data;
}

// Permanently deletes an enquiry. Associated payment rows cascade-delete
// via the DB's "on delete cascade" FK, so nothing orphaned is left behind.
// If the enquiry still held a seat, the trip's seats_booked count is freed
// automatically by the on_enquiries_seat_sync DB trigger once the delete
// commits — no manual adjustment needed here.
export async function deleteEnquiry(enquiry: Enquiry): Promise<void> {
  const { error } = await supabase.from('enquiries').delete().eq('id', enquiry.id);
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

  const { data, error } = await supabase
    .from('enquiries')
    .update({ cancelled_at: null, booking_status: bookingStatus, suggested_refund_amount: null })
    .eq('id', enquiry.id)
    .select()
    .single();
  if (error) throw error;

  return data;
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
