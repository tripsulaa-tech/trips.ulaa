import { supabase } from '../../supabase';
import type { Kid, KidStatus } from '../../../types/types-index';
import { logActivity } from './activity';

// =============================================
// Kids — independently-trackable per-kid records
// =============================================
// Each kid on a booking gets its own row here (name, status, follow-up),
// layered on top of the parent enquiry's kids_count/kids_amount headcount
// (which stays the source of truth for pricing — see
// add_trip_kids_option.sql). See add_kids_table.sql for the full schema
// rationale.

// All kid rows for one enquiry, oldest first — matches the order they'd
// have been added in (either typed into the booking form or added by an
// admin), so "Kid 1"/"Kid 2" fallback labels stay stable across reloads.
export async function getKidsForEnquiry(enquiryId: string): Promise<Kid[]> {
  const { data, error } = await supabase
    .from('kids')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Seeds one row per kid on a fresh booking — called right after the
// enquiry insert succeeds (submitEnquiry/submitGroupEnquiry/
// createManualEnquiry), never directly by a form. `count` is the
// authoritative number (kids_count on the enquiry); `names` is whatever
// the form collected alongside it, index-aligned and optionally shorter
// than count — any kid past the end of `names` (or with a blank name)
// just starts out nameless, same as a pre-this-table backfilled row.
export async function createKidsForEnquiry(enquiryId: string, count: number, names: string[] = []): Promise<void> {
  if (count <= 0) return;
  const rows = Array.from({ length: count }, (_, i) => ({
    enquiry_id: enquiryId,
    name: names[i]?.trim() || null,
    status: 'pending' as KidStatus,
  }));
  const { error } = await supabase.from('kids').insert(rows);
  if (error) {
    // Best-effort, same reasoning as logActivity: the enquiry itself is
    // already committed by the time this runs, and losing the per-kid
    // detail rows (this booking falls back to looking like a pre-this-
    // table one, still fully bookable) is a far smaller problem than
    // failing an otherwise-successful booking submission over it.
    console.error('createKidsForEnquiry failed:', error.message);
  }
}

// General-purpose edit for one kid's own record — name/age correction,
// notes, etc. Status and follow-up have their own dedicated helpers below
// since they carry extra bookkeeping (the pending-only follow-up rule,
// activity logging).
export async function updateKid(id: string, patch: Partial<Pick<Kid, 'name' | 'age'>>): Promise<void> {
  const { error } = await supabase.from('kids').update(patch).eq('id', id);
  if (error) throw error;
}

// Moves one kid's own status forward/back — independent of the parent
// enquiry's status. Clears this kid's follow-up the moment it leaves
// 'pending' (mirrors refreshJourneyStage's handling of
// enquiries.follow_up_at — see add_enquiry_follow_up.sql's check
// constraint, which kids_follow_up_requires_pending_status mirrors), so a
// reminder never lingers on a kid that's since moved on.
export async function updateKidStatus(id: string, status: KidStatus): Promise<void> {
  const { error } = await supabase
    .from('kids')
    .update({ status, ...(status !== 'pending' ? { follow_up_at: null, follow_up_notes: null } : {}) })
    .eq('id', id);
  if (error) throw error;
}

// Same idea as bulk-editing enquiries (AdminBulkEditModal) — apply one
// status to every selected kid in a single round trip.
export async function bulkUpdateKidsStatus(ids: string[], status: KidStatus): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('kids')
    .update({ status, ...(status !== 'pending' ? { follow_up_at: null, follow_up_notes: null } : {}) })
    .in('id', ids);
  if (error) throw error;
}

// Sets/clears this kid's own follow-up reminder — same shape as
// setEnquiryFollowUp in status.ts, just scoped to a kid row instead of the
// enquiry. Only meaningful while the kid is still 'pending' (enforced by
// kids_follow_up_requires_pending_status), so this is only ever called
// from UI that already keeps that rule.
export async function setKidFollowUp(id: string, followUpAt: string | null, notes?: string | null): Promise<void> {
  const { error } = await supabase
    .from('kids')
    .update({ follow_up_at: followUpAt, follow_up_notes: followUpAt ? (notes ?? null) : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteKid(id: string): Promise<void> {
  const { error } = await supabase.from('kids').delete().eq('id', id);
  if (error) throw error;
}

// Logs a kid-scoped action onto the parent enquiry's Activity Timeline, so
// "Kid Aarav marked Checked In" shows up in the same place every other
// admin action on this booking does, instead of being invisible outside
// the Kids card. Best-effort, same as logActivity itself.
export async function logKidActivity(enquiryId: string, action: string, details?: string | null): Promise<void> {
  await logActivity(enquiryId, action, details);
}
