import { supabase } from '../supabase';
import type { WaitlistEntry, WaitlistFormData } from '../../types/types-index';
import { isAgeNotEligibleError, logActivity } from './enquiries';

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

// How long a "Seat Offered" holds before it's considered overdue (CRM spec
// section 9's "Offer Expiry"). Purely advisory — see offer_expiry's doc
// comment in types-index.ts — this just picks the window; nothing enforces
// it automatically. 48h is a reasonable default for a travel booking
// decision; if that ever needs to vary per trip/admin, this is the one
// place to make it configurable instead of a magic number.
const WAITLIST_OFFER_WINDOW_HOURS = 48;

// For the manual status dropdown only — waiting / notified / declined.
// 'converted' is never set through here; see markWaitlistConverted below.
// The DB trigger (enforce_waitlist_conversion) rejects a bare 'converted'
// passed to this function anyway, but the UI no longer offers it as an
// option in the first place.
export async function updateWaitlistStatus(id: string, status: WaitlistEntry['status']): Promise<void> {
  const updates: Partial<WaitlistEntry> = { status };
  if (status === 'notified') {
    // Offering a seat starts both the clock (notified_at = "Offer Sent
    // At") and the deadline (offer_expiry) in the same update, so the two
    // can never drift apart.
    const now = new Date();
    updates.notified_at = now.toISOString();
    updates.offer_expiry = new Date(now.getTime() + WAITLIST_OFFER_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  } else {
    // Any other status (waiting/declined/expired) means there's no active
    // offer outstanding — clear the deadline so a stale offer_expiry never
    // lingers on a row that isn't actually "Seat Offered" anymore.
    updates.offer_expiry = null;
  }
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
    .update({
      status: newStatus,
      converted_enquiry_ids: updatedIds,
      // Converting closes out the offer — clear the deadline the same way
      // updateWaitlistStatus does for declined/expired, so a fully
      // converted row never shows a stale "Offer expires in..." badge.
      ...(newStatus === 'converted' ? { offer_expiry: null } : {}),
    })
    .eq('id', waitlistId);
  if (error) throw error;
  await logActivity(enquiryId, 'Waitlist converted', entry.group_size && entry.group_size > 1 ? `Seat ${updatedIds.length} of ${needed}` : null);
}

export async function deleteWaitlistEntry(id: string): Promise<void> {
  const { error } = await supabase.from('waitlist').delete().eq('id', id);
  if (error) throw error;
}
