// Activity Timeline card (CRM spec section 14) — split out of
// AdminEnquiryDetail.tsx. Every meaningful action taken on this enquiry,
// chronological, oldest first, nothing editable or removable (see
// activity_log's RLS: no UPDATE/DELETE policy exists at all).
import type { ReactNode } from 'react';
import {
  ClockCounterClockwise as History, XCircle, Clock,
  Globe, Phone, Camera, MapPin, Percent, CurrencyInr as IndianRupee,
} from '@phosphor-icons/react';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import type { ActivityLogEntry } from '../../types/types-index';
import { formatDate, formatTime } from '../../utils/utils-index';

interface AdminEnquiryActivityTimelineProps {
  activityLog: ActivityLogEntry[];
  loading: boolean;
}

// Phosphor doesn't ship a real WhatsApp glyph (ChatCircle/ChatsCircle are
// generic speech-bubble icons, not the recognizable WhatsApp mark) — same
// path already used for the actual WhatsApp button in
// DataTableChrome's ContactQuickLinks, reused here so "Enquiry logged
// (whatsapp)" shows the same mark people already recognize from that button.
function whatsappGlyph(size: number): ReactNode {
  return (
    <WhatsAppIcon size={size} aria-hidden="true" />
  );
}

// Wraps a Phosphor icon component into the same (size) => ReactNode shape
// as whatsappGlyph above, so timelineMeta can freely mix real Phosphor
// icons and the hand-drawn WhatsApp mark behind one common interface.
// Filled weight reads best for the status glyphs (check/clock/history/x)
// at this size, but the same fill weight makes Globe/Phone/Camera/MapPin
// render as a muddy blob — those source icons use the plain (regular)
// weight instead, matching how Globe already renders for Source elsewhere
// on this page (Traveller & Trip's Source field).
function phosphorGlyph(Icon: typeof History) {
  return (size: number) => <Icon size={size} weight="fill" aria-hidden="true" />;
}
function phosphorGlyphRegular(Icon: typeof Globe) {
  return (size: number) => <Icon size={size} aria-hidden="true" />;
}

// Source keyword -> icon renderer, same mapping as AdminEnquiryCommon's
// SOURCE_CONFIG (kept separate to avoid pulling in that whole config just
// for its icons) — used below so "Enquiry logged (whatsapp)" etc. shows
// the actual channel it came in on instead of a generic clock.
const LOG_SOURCE_ICONS: [needle: string, render: (size: number) => ReactNode][] = [
  ['whatsapp', whatsappGlyph],
  ['phone', phosphorGlyphRegular(Phone)],
  ['instagram', phosphorGlyphRegular(Camera)],
  ['walk-in', phosphorGlyphRegular(MapPin)],
  ['walk_in', phosphorGlyphRegular(MapPin)],
  ['website', phosphorGlyphRegular(Globe)],
];

// Picks an icon renderer + color for a timeline entry's node based on what
// kind of event it is — there's no structured "type" column on
// activity_log (see ActivityLogEntry), just the already-formatted
// `action`/`details` strings logActivity's call sites pass in, so this
// reads the same substrings a human would: "· pending" in details,
// "paid"/"removed"/"cancel" in the action, etc. Falls back to the neutral
// primary node for everything else (checked in, details updated, ...).
function timelineMeta(entry: ActivityLogEntry): { render: (size: number) => ReactNode; classes: string } {
  const action = entry.action.toLowerCase();
  const details = (entry.details || '').toLowerCase();
  // Checked ahead of the generic cancel/removed and paid/received branches
  // below — "Discount applied"/"Discount removed" would otherwise match
  // those and show a plain check/X instead of something that actually
  // reads as "discount" at a glance. Keeps the same green/red semantic
  // (applied vs. removed) those branches already used, just with the
  // more specific icon.
  if (action.includes('discount')) {
    // Outline weight here (not phosphorGlyph's filled weight) to match the
    // Percent glyph already used in Payment Overview's Discount tile.
    return action.includes('removed')
      ? { render: phosphorGlyphRegular(Percent), classes: 'bg-red-50 text-red-600' }
      : { render: phosphorGlyphRegular(Percent), classes: 'bg-green-50 text-green-600' };
  }
  if (action.includes('cancel') || action.includes('no show') || action.includes('removed')) {
    return { render: phosphorGlyph(XCircle), classes: 'bg-red-50 text-red-600' };
  }
  if (details.includes('pending')) {
    return { render: phosphorGlyph(Clock), classes: 'bg-amber-50 text-amber-600' };
  }
  if (action.includes('paid') || action.includes('received') || details.includes('collected')) {
    return { render: phosphorGlyph(IndianRupee), classes: 'bg-green-50 text-green-600' };
  }
  // "Enquiry logged (whatsapp)" / "(phone)" / "(website)" etc. (admin-portal
  // entries) and the DB trigger's special-cased "Website enquiry submitted"
  // (see log_enquiry_created_activity() in add_activity_log.sql) — show the
  // channel it actually came in on, matching the icon already used for
  // this same source elsewhere (Traveller & Trip's Source field).
  if (action.includes('logged') || action.includes('submitted')) {
    const match = LOG_SOURCE_ICONS.find(([needle]) => action.includes(needle));
    if (match) return { render: match[1], classes: 'bg-primary/10 text-primary' };
  }
  return { render: phosphorGlyph(History), classes: 'bg-primary/10 text-primary' };
}

export default function AdminEnquiryActivityTimeline({ activityLog, loading }: AdminEnquiryActivityTimelineProps) {
  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
      <div className="mb-3">
        <p className="text-dark text-base font-display font-bold flex items-center gap-2">
          <History size={18} className="shrink-0 text-primary" aria-hidden="true" /> Activity Timeline
        </p>
        <p className="text-dark-muted text-xs mt-1">A complete, timestamped record of everything that's happened on this enquiry.</p>
      </div>
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
                    {meta.render(15)}
                  </span>
                  {!isLast && <span className="w-0.5 flex-1 min-h-[1.75rem] my-0.5 rounded-full bg-gradient-to-b from-[#D9C7AC] to-[#D9C7AC]/40" aria-hidden="true" />}
                </div>
                <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <p className="text-dark text-sm font-medium pt-1">{entry.action}</p>
                  {entry.details && <p className="text-dark-muted text-xs mt-0.5">{entry.details}</p>}
                  <p className="text-dark-muted text-2xs mt-0.5">
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
