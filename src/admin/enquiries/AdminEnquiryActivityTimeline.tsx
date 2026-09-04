// Activity Timeline card (CRM spec section 14) — split out of
// AdminEnquiryDetail.tsx. Every meaningful action taken on this enquiry,
// chronological, oldest first, nothing editable or removable (see
// activity_log's RLS: no UPDATE/DELETE policy exists at all).
import {
  ClockCounterClockwise as History, CheckCircle, XCircle, Clock,
  Globe, ChatCircle as MessageCircle, Phone, Camera, MapPin,
} from '@phosphor-icons/react';
import type { ActivityLogEntry } from '../../types/types-index';
import { formatDate, formatTime } from '../../utils/utils-index';

interface AdminEnquiryActivityTimelineProps {
  activityLog: ActivityLogEntry[];
  loading: boolean;
}

// Source keyword -> icon, same mapping as AdminEnquiryCommon's
// SOURCE_CONFIG (kept separate to avoid pulling in that whole config just
// for its icons) — used below so "Enquiry logged (whatsapp)" etc. shows
// the actual channel it came in on instead of a generic clock.
const LOG_SOURCE_ICONS: [needle: string, icon: typeof History][] = [
  ['whatsapp', MessageCircle],
  ['phone', Phone],
  ['instagram', Camera],
  ['walk-in', MapPin],
  ['walk_in', MapPin],
  ['website', Globe],
];

// Picks an icon + color for a timeline entry's node based on what kind of
// event it is — there's no structured "type" column on activity_log (see
// ActivityLogEntry), just the already-formatted `action`/`details` strings
// logActivity's call sites pass in, so this reads the same substrings a
// human would: "· pending" in details, "paid"/"removed"/"cancel" in the
// action, etc. Falls back to the neutral primary node for everything else
// (checked in, details updated, ...).
function timelineMeta(entry: ActivityLogEntry): { icon: typeof History; classes: string } {
  const action = entry.action.toLowerCase();
  const details = (entry.details || '').toLowerCase();
  if (action.includes('cancel') || action.includes('no show') || action.includes('removed')) {
    return { icon: XCircle, classes: 'bg-red-50 text-red-600' };
  }
  if (details.includes('pending')) {
    return { icon: Clock, classes: 'bg-amber-50 text-amber-600' };
  }
  if (action.includes('paid') || details.includes('collected') || action.includes('discount applied')) {
    return { icon: CheckCircle, classes: 'bg-green-50 text-green-600' };
  }
  // "Enquiry logged (whatsapp)" / "(phone)" / "(website)" etc. — show the
  // channel it actually came in on, matching the icon already used for
  // this same source elsewhere (Traveller & Trip's Source field).
  if (action.includes('logged')) {
    const match = LOG_SOURCE_ICONS.find(([needle]) => action.includes(needle));
    if (match) return { icon: match[1], classes: 'bg-primary/10 text-primary' };
  }
  return { icon: History, classes: 'bg-primary/10 text-primary' };
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
        <ol className="max-h-[600px] overflow-y-auto">
          {activityLog.map((entry, idx) => {
            const meta = timelineMeta(entry);
            const isLast = idx === activityLog.length - 1;
            return (
              <li key={entry.id} className="flex gap-3">
                {/* Node + connector column — the connector is its own
                    flex-1 segment inside each row (instead of one long
                    absolutely-positioned line behind every dot), so it
                    runs cleanly between this node and the next one and
                    never overlaps or gets clipped by node/content height. */}
                <div className="flex flex-col items-center shrink-0">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ring-4 ring-white shadow-sm ${meta.classes}`}>
                    <meta.icon size={15} weight="fill" aria-hidden="true" />
                  </span>
                  {!isLast && <span className="w-0.5 flex-1 min-h-[1.75rem] my-0.5 rounded-full bg-gradient-to-b from-[#D9C7AC] to-[#D9C7AC]/40" aria-hidden="true" />}
                </div>
                <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <p className="text-dark text-sm font-medium pt-1">{entry.action}</p>
                  {entry.details && <p className="text-dark-muted text-xs mt-0.5">{entry.details}</p>}
                  <p className="text-dark-muted text-[11px] mt-0.5">
                    {formatDate(entry.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(entry.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
