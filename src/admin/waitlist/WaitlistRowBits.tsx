import {
  CheckCircle as CheckCircle2,
  XCircle,
  Confetti as PartyPopper,
  Clock,
  Baby,
} from '@phosphor-icons/react';
import Select from '../../components/ui/Select';
import type { WaitlistEntry } from '../../types/types-index';
import {
  EDITABLE_STATUS_OPTIONS, offerExpiryLabel,
  seatsNeeded, convertedIds, convertedCount, seatsRemaining, hasSeatOpen, canConvert,
} from './waitlistShared';

// Small presentational pieces of a waitlist row that were byte-for-byte
// (or near enough) identical between AdminWaitlistDesktopTable and
// AdminWaitlistMobileCards. Pulled out here so both layouts share one
// copy of the markup instead of two hand-kept-in-sync ones. Nothing here
// holds state — everything needed is passed in explicitly.

/** "#2 of 5 waiting" queue-position pill, shown next to a name when this
 *  trip has more than one convertible entry waiting. */
export function QueueRankBadge({ entry, queueRank }: {
  entry: WaitlistEntry;
  queueRank: Map<string, { rank: number; total: number }>;
}) {
  const rank = queueRank.get(entry.id);
  if (!canConvert(entry) || (rank?.total ?? 0) <= 1) return null;
  return (
    <span
      title={rank!.rank === 1
        ? `First in line for this trip — ${rank!.total} waiting in total`
        : `#${rank!.rank} of ${rank!.total} waiting for this trip — ${rank!.rank - 1} waited longer`}
      className={`inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
        rank!.rank === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      #{rank!.rank} of {rank!.total} waiting
    </span>
  );
}

/** "N kid(s)" pill — purely informational (the waitlist holds no pricing
 *  data at all), shown wherever the Group/Solo badge is shown. */
export function KidsBadge({ entry, size = 12, className = '' }: { entry: WaitlistEntry; size?: number; className?: string }) {
  if (!entry.kids_count) return null;
  return (
    <span
      title={`${entry.kids_count} kid${entry.kids_count > 1 ? 's' : ''} coming along — no seat needed`}
      className={`inline-flex items-center gap-1 font-button font-semibold whitespace-nowrap bg-amber-50 text-amber-700 ${className}`}
    >
      <Baby size={size} className="shrink-0" aria-hidden="true" /> {entry.kids_count} {entry.kids_count > 1 ? 'Kids' : 'Kid'}
    </span>
  );
}

/** "2/3 converted" pill for a group entry that's partially converted but
 *  not yet marked 'converted' overall. */
export function ConvertedProgressBadge({ entry }: { entry: WaitlistEntry }) {
  if (entry.status === 'converted' || convertedCount(entry) === 0) return null;
  return (
    <span
      title={`${convertedCount(entry)} of ${seatsNeeded(entry)} in this group converted so far — ${seatsRemaining(entry)} left to go`}
      className="inline-flex items-center gap-1 text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 whitespace-nowrap"
    >
      <CheckCircle2 size={9} aria-hidden="true" /> {convertedCount(entry)}/{seatsNeeded(entry)} converted
    </span>
  );
}

/** The "N seat(s) open" (green, ready to convert) / "N/M seats open"
 *  (amber, partially open for a group) pair shown for a waiting entry. */
export function SeatAvailabilityBadges({ entry, seatsAvailable }: {
  entry: WaitlistEntry;
  seatsAvailable: Record<string, number>;
}) {
  if (hasSeatOpen(entry, seatsAvailable)) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-md bg-green-100 text-green-700 whitespace-nowrap">
        <PartyPopper size={10} className="shrink-0" aria-hidden="true" />
        {seatsAvailable[entry.trip_id]} seat{seatsAvailable[entry.trip_id] === 1 ? '' : 's'} open
      </span>
    );
  }
  if (entry.status === 'waiting' && seatsRemaining(entry) > 1 && (seatsAvailable[entry.trip_id] ?? 0) > 0) {
    return (
      <span
        title={`Needs ${seatsRemaining(entry)} more seats free together — only ${seatsAvailable[entry.trip_id]} open so far`}
        className="mt-1 inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 whitespace-nowrap"
      >
        {seatsAvailable[entry.trip_id]}/{seatsRemaining(entry)} seats open
      </span>
    );
  }
  return null;
}

/** The green "Converted" pill plus, if applicable, the red "booking
 *  cancelled" pill next to it. Doesn't include the view-booking links —
 *  those come from ConvertedBookingLinks below, since the two layouts
 *  wrap them in different flex containers. */
export function ConvertedStatusBadges({ entry, cancelledEnquiryIds }: {
  entry: WaitlistEntry;
  cancelledEnquiryIds: Set<string>;
}) {
  const ids = convertedIds(entry);
  const cancelledCount = ids.filter(id => cancelledEnquiryIds.has(id)).length;
  return (
    <>
      <span className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-md bg-green-100 text-green-700 whitespace-nowrap">
        <CheckCircle2 size={12} className="shrink-0" aria-hidden="true" />
        Converted{convertedCount(entry) > 1 ? ` (${convertedCount(entry)}/${convertedCount(entry)})` : ''}
      </span>
      {cancelledCount > 0 && (
        <span
          title="At least one of this group's bookings was cancelled after converting — that seat is free again."
          className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2.5 py-1 rounded-md bg-red-100 text-red-700 whitespace-nowrap"
        >
          <XCircle size={12} className="shrink-0" aria-hidden="true" />
          {ids.length > 1 ? `${cancelledCount}/${ids.length} cancelled` : 'Booking cancelled'}
        </span>
      )}
    </>
  );
}

/** "View booking" / "View booking N" links for each enquiry this entry
 *  converted into. Rendered as a fragment so callers can pick their own
 *  wrapping flex container (the desktop table stacks these; mobile wraps
 *  them inline). */
export function ConvertedBookingLinks({ entry, onNavigate }: {
  entry: WaitlistEntry;
  onNavigate: (enquiryId: string) => void;
}) {
  const ids = convertedIds(entry);
  return (
    <>
      {ids.map((id, i) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          className="text-xs font-button font-semibold text-primary underline underline-offset-2 whitespace-nowrap"
        >
          View booking{ids.length > 1 ? ` ${i + 1}` : ''}
        </button>
      ))}
    </>
  );
}

/** The editable status <Select> plus its "offer expires in Xh" pill —
 *  identical between desktop and mobile apart from the id (mobile needs
 *  its own to avoid colliding with the desktop table's, since both can be
 *  in the DOM at different breakpoints) and one extra alignment class on
 *  mobile's expiry pill. */
export function WaitlistStatusControl({ entry, idPrefix, updating, onStatusChange, expiryBadgeClassName = '' }: {
  entry: WaitlistEntry;
  idPrefix: string;
  updating: string | null;
  onStatusChange: (id: string, status: WaitlistEntry['status']) => void;
  expiryBadgeClassName?: string;
}) {
  const expiry = entry.status === 'notified' ? offerExpiryLabel(entry.offer_expiry) : null;
  return (
    <>
      <label htmlFor={`${idPrefix}${entry.id}`} className="sr-only">Status for {entry.full_name}</label>
      <Select
        inputId={`${idPrefix}${entry.id}`}
        value={entry.status}
        disabled={updating === entry.id}
        onChange={val => onStatusChange(entry.id, val as WaitlistEntry['status'])}
        options={EDITABLE_STATUS_OPTIONS}
        size="sm"
      />
      {expiry && (
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${expiryBadgeClassName} ${
            expiry.overdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          <Clock size={9} className="shrink-0" aria-hidden="true" /> {expiry.text}
        </span>
      )}
    </>
  );
}
