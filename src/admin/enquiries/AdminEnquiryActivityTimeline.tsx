// Activity Timeline card (CRM spec section 14) — split out of
// AdminEnquiryDetail.tsx. Every meaningful action taken on this enquiry,
// chronological, oldest first, nothing editable or removable (see
// activity_log's RLS: no UPDATE/DELETE policy exists at all).
import { ClockCounterClockwise as History } from '@phosphor-icons/react';
import type { ActivityLogEntry } from '../../types/types-index';
import { formatDate, formatTime } from '../../utils/utils-index';

interface AdminEnquiryActivityTimelineProps {
  activityLog: ActivityLogEntry[];
  loading: boolean;
}

// Picks a dot color for a timeline entry based on what kind of event it is —
// there's no structured "type" column on activity_log (see ActivityLogEntry),
// just the already-formatted `action`/`details` strings logActivity's
// call sites pass in, so this reads the same substrings a human would:
// "· pending" in details, "paid"/"removed"/"cancel" in the action, etc.
// Falls back to the neutral primary dot for everything else (logged,
// checked in, details updated, ...).
function timelineDotClass(entry: ActivityLogEntry): string {
  const action = entry.action.toLowerCase();
  const details = (entry.details || '').toLowerCase();
  if (action.includes('cancel') || action.includes('no show') || action.includes('removed')) return 'bg-red-500';
  if (details.includes('pending')) return 'bg-amber-500';
  if (action.includes('paid') || details.includes('collected')) return 'bg-green-600';
  return 'bg-primary';
}

export default function AdminEnquiryActivityTimeline({ activityLog, loading }: AdminEnquiryActivityTimelineProps) {
  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
      <p className="text-dark text-sm font-button font-semibold mb-3 flex items-center gap-1.5">
        <History size={14} className="shrink-0" aria-hidden="true" /> Activity Timeline
      </p>
      {loading ? (
        <p className="text-dark-muted text-xs">Loading…</p>
      ) : activityLog.length === 0 ? (
        <p className="text-dark-muted text-sm bg-background-warm border-2 border-background-warm rounded-md px-3 py-2">No activity logged yet.</p>
      ) : (
        <ol className="relative border-l-2 border-[#D9C7AC] pl-4 space-y-4 max-h-[600px] overflow-y-auto">
          {activityLog.map(entry => (
            <li key={entry.id} className="relative">
              <span className={`absolute -left-[21px] top-1 z-10 w-3 h-3 rounded-full border-2 border-white shadow-sm ${timelineDotClass(entry)}`} />
              <p className="text-dark text-sm font-medium">{entry.action}</p>
              {entry.details && <p className="text-dark-muted text-xs mt-0.5">{entry.details}</p>}
              <p className="text-dark-muted text-[11px] mt-0.5">
                {formatDate(entry.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(entry.created_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
