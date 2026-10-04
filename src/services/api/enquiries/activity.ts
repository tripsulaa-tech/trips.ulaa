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

// =============================================
// Booking-email tracking
// =============================================
// Booking confirmation emails go out only when an admin sends one (see
// sendBookingEmail in utils/bookingEmail.ts). Each successful send writes one
// activity_log row with this action and the recipient address as details, so
// "was it sent, how many times, and when last" is just a count over those
// rows, with no extra table or column. The rows are immutable, so the history
// can't be edited after the fact. "Sent" means the email provider accepted
// it, not that it was delivered or opened.
export const BOOKING_EMAIL_ACTION = 'Booking email sent';

export interface BookingEmailStat {
  count: number;
  lastSentAt: string;
}

/** Same count/last-sent figures from an activity log that's already loaded
 *  (the enquiry detail page), or null when nothing has been sent. */
export function bookingEmailStatFromLog(rows: ActivityLogEntry[]): BookingEmailStat | null {
  const sent = rows.filter(r => r.action === BOOKING_EMAIL_ACTION);
  if (sent.length === 0) return null;
  const lastSentAt = sent.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), sent[0].created_at);
  return { count: sent.length, lastSentAt };
}

/** Email-sent stats for many enquiries at once, keyed by enquiry id. An
 *  enquiry that was never emailed is simply absent from the result. */
export async function getBookingEmailStats(enquiryIds: string[]): Promise<Record<string, BookingEmailStat>> {
  const stats: Record<string, BookingEmailStat> = {};
  const CHUNK = 100; // keeps the request URL a sane length
  for (let i = 0; i < enquiryIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('activity_log')
      .select('enquiry_id, created_at')
      .eq('action', BOOKING_EMAIL_ACTION)
      .in('enquiry_id', enquiryIds.slice(i, i + CHUNK));
    if (error) throw error;
    for (const row of data || []) {
      const existing = stats[row.enquiry_id];
      stats[row.enquiry_id] = existing
        ? { count: existing.count + 1, lastSentAt: row.created_at > existing.lastSentAt ? row.created_at : existing.lastSentAt }
        : { count: 1, lastSentAt: row.created_at };
    }
  }
  return stats;
}
