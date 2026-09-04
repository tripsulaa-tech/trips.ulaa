// Header card (name, badges, Booking ID, top-level quick actions) — split
// out of AdminEnquiryDetail.tsx. Recomputes its own badges from `enquiry`
// via the shared pure helpers rather than taking them as props, so the
// parent doesn't have to thread jb/food/etc. through.
import {
  Users, User, CalendarDot as CalendarClock, XCircle, UserMinus, SignIn as LogIn, Copy, Check, Baby,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import ActionsMenu from '../../components/ui/ActionsMenu';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import FoodMark from '../../components/ui/FoodMark';
import type { Enquiry } from '../../types/types-index';
import {
  foodBadge, foodPreferenceKey, journeyBadge, nextManualAction, isNotInterested,
  canMarkNotInterested, closedReasonLabel, canSetFollowUp, followUpStatus,
} from './AdminEnquiryCommon';
import { isCancelled, bookingStateBadge, attendanceBadge } from './AdminEnquiriesShared';

interface AdminEnquiryHeaderCardProps {
  enquiry: Enquiry;
  busyAction: boolean;
  busyStatus: boolean;
  busyFollowUp: boolean;
  bookingIdCopied: boolean;
  onCopyBookingId: () => void;
  onAdvance: () => void;
  onMarkNotInterested: () => void;
  onOpenFollowUp: () => void;
  rowActions: ActionMenuItem[];
}

export default function AdminEnquiryHeaderCard({
  enquiry, busyAction, busyStatus, busyFollowUp, bookingIdCopied, onCopyBookingId,
  onAdvance, onMarkNotInterested, onOpenFollowUp, rowActions,
}: AdminEnquiryHeaderCardProps) {
  const jb = journeyBadge(enquiry);
  const nma = nextManualAction(enquiry);
  const food = foodBadge(enquiry);

  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-dark truncate">{enquiry.full_name}</h2>
          <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
            <span title={`Booking Journey: ${jb.label}`} className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${jb.color}`}>
              <jb.icon size={12} className="shrink-0" aria-hidden="true" /> {jb.label}
            </span>
            {/* Booking State — independent of Booking Journey above, per
                CRM spec section 3. Only shown once there's an actual
                booking (cancelling a bare lead is "Not Interested", not
                this), and only called out when Cancelled — "Active" is
                the unremarkable default and would just add noise next to
                a Journey badge that already implies it. */}
            {isCancelled(enquiry) && (
              <span title="Booking State" className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${bookingStateBadge(enquiry).color}`}>
                <XCircle size={12} className="shrink-0" aria-hidden="true" /> {bookingStateBadge(enquiry).label}
              </span>
            )}
            {/* Attendance — independent of Journey/State, per CRM spec
                section 4. Only shown once it's meaningful (checked in or
                a recorded no-show); "Not Started" beforehand is implied
                by the Journey badge not yet reaching Checked In. */}
            {(enquiry.checked_in_at || enquiry.is_no_show) && (
              <span title="Attendance" className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${attendanceBadge(enquiry).color}`}>
                <LogIn size={12} className="shrink-0" aria-hidden="true" /> {attendanceBadge(enquiry).label}
              </span>
            )}
            {isNotInterested(enquiry) && (
              <span title={closedReasonLabel(enquiry) ? `Closed — ${closedReasonLabel(enquiry)}` : 'Closed — this was just a query, no booking followed'} className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-red-50 text-red-600">
                <UserMinus size={12} className="shrink-0" aria-hidden="true" /> Not Interested{closedReasonLabel(enquiry) ? ` — ${closedReasonLabel(enquiry)}` : ''}
              </span>
            )}
            {/* Set once an Add-on with the "Child fare" preset has
                been added (see AdminGenerateInvoiceModal's Child Fare
                chip) — see enquiry.has_child_addon's doc comment. Purely
                informational; check the Invoices card below for the
                actual charge. */}
            {enquiry.has_child_addon && (
              <span title="A Child Fare add-on has been added to this booking — see Invoices below" className="inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-amber-50 text-amber-700">
                <Baby size={12} className="shrink-0" aria-hidden="true" /> Bringing a Child
              </span>
            )}
            {followUpStatus(enquiry) && (
              <button
                onClick={onOpenFollowUp}
                disabled={busyFollowUp}
                title="Click to change the follow-up date"
                className={`inline-flex items-center gap-1 text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap hover:opacity-80 transition-opacity disabled:opacity-50 ${followUpStatus(enquiry)!.color}`}
              >
                <CalendarClock size={12} className="shrink-0" aria-hidden="true" /> {followUpStatus(enquiry)!.label}
              </button>
            )}
            {enquiry.group_size && enquiry.group_size > 1 ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted">
                <Users size={10} aria-hidden="true" /> Group of {enquiry.group_size} · seat {enquiry.group_seq}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted">
                <User size={10} aria-hidden="true" /> Solo
              </span>
            )}
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${food.color}`}>
              <FoodMark type={foodPreferenceKey(enquiry)} size={10} /> {food.label}
            </span>
          </div>
        </div>
        <div className="flex flex-nowrap items-center justify-end gap-1.5 min-w-0 w-full sm:w-auto">
          {nma && (
            <Button variant="primary" size="sm" onClick={onAdvance} disabled={busyAction} className="!px-3 !gap-1.5 text-xs whitespace-nowrap flex-1 sm:flex-none">
              <nma.icon size={14} aria-hidden="true" /> {nma.label}
            </Button>
          )}
          {canMarkNotInterested(enquiry) && (
            <Button variant="outline" size="sm" onClick={onMarkNotInterested} disabled={busyAction || busyStatus} className="!px-3 !gap-1.5 text-xs whitespace-nowrap flex-1 sm:flex-none">
              <UserMinus size={14} aria-hidden="true" /> Not Interested
            </Button>
          )}
          {/* When there's no booking yet, Follow-up + the 3-dot menu stay
              here at the top of the header. Once a booking exists, they
              move down next to the Booking ID row directly below the
              header instead. */}
          {!enquiry.booking_id && (
            <>
              {canSetFollowUp(enquiry) && !followUpStatus(enquiry) && (
                <Button variant="outline" size="sm" onClick={onOpenFollowUp} disabled={busyAction || busyFollowUp} className="!px-3 !gap-1.5 text-xs whitespace-nowrap">
                  <CalendarClock size={14} aria-hidden="true" /> Set Follow-up
                </Button>
              )}
              <ActionsMenu items={rowActions} disabled={busyAction || busyStatus} />
            </>
          )}
        </div>
      </div>

      {/* Booking ID, moved up here (right below the name/badges row),
          with Follow-up + the 3-dot actions menu alongside it — used to
          live inside the Booking Journey card below, but that pushed it
          too far from the header for how often it's referenced. */}
      {enquiry.booking_id && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-background-warm">
          <div className="min-w-0">
            <p className="text-dark-muted text-xs">Booking ID</p>
            <div className="flex items-center gap-1.5">
              <p className="text-dark text-sm font-mono truncate">{enquiry.booking_id}</p>
              <button
                type="button"
                onClick={onCopyBookingId}
                aria-label="Copy Booking ID"
                title="Copy Booking ID"
                className="shrink-0 p-1 rounded text-dark-muted hover:text-primary hover:bg-background-warm transition-colors"
              >
                {bookingIdCopied ? <Check size={13} className="text-green-600" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
            {canSetFollowUp(enquiry) && !followUpStatus(enquiry) && (
              <Button variant="outline" size="sm" onClick={onOpenFollowUp} disabled={busyAction || busyFollowUp} className="!px-3 !gap-1.5 text-xs whitespace-nowrap">
                <CalendarClock size={14} aria-hidden="true" /> Set Follow-up
              </Button>
            )}
            <ActionsMenu items={rowActions} disabled={busyAction || busyStatus} />
          </div>
        </div>
      )}
    </div>
  );
}
