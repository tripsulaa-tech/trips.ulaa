import { supabase } from '../../supabase';
import type { ActivityLogEntry } from '../../../types/types-index';

// =============================================
// Activity Timeline (CRM spec section 14)
// =============================================
// One append-only insert per meaningful admin action — "Website enquiry
// submitted" is logged separately, straight from the DB (see
// log_enquiry_created_activity() / on_enquiry_created_log_activity in
// add_activity_log.sql), since it has to fire from both the authenticated
// admin portal (createManualEnquiry) and the anonymous public form
// (submitEnquiry/submitGroupEnquiry) — this helper only covers the
// admin-portal side.
//
// Deliberately best-effort: a logging failure is caught and console.error'd
// rather than thrown, so a transient activity_log insert problem can never
// block the real action (recording a payment, checking someone in, ...) it
// was describing. The trade-off is an occasional gap in the timeline rather
// than a blocked booking — the right side to fail open on.
export async function logActivity(enquiryId: string, action: string, details?: string | null): Promise<void> {
  const { error } = await supabase
    .from('activity_log')
    .insert({ enquiry_id: enquiryId, action, details: details || null });
  if (error) console.error('logActivity failed:', action, error);
}

// Full, chronological (oldest first) activity timeline for one enquiry —
// powers the read-only "Activity Timeline" section on AdminEnquiryDetail.
// Nothing in this table is ever updated or deleted (enforced by RLS: no
// UPDATE/DELETE policy exists on activity_log at all), so what this
// returns is always the complete, honest history.
export async function getActivityLog(enquiryId: string): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
