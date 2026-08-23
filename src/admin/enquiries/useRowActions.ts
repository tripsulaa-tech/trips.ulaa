import {
  Pencil, Eye, FileText, ShareNetwork as Share2, UserCheck, UserMinus as UserX,
  SignIn as LogIn, X, ArrowsClockwise as RefreshCw, UserMinus, XCircle, Trash as Trash2,
} from '@phosphor-icons/react';
import type { ActionMenuItem } from '../../components/ui/ActionsMenu';
import type { Enquiry } from '../../types/types-index';
import { isNotInterested, canSetFollowUp, canSetBookingFollowUp, canCancelBooking } from './AdminEnquiryCommon';

/** Consolidates every per-row action that used to be a separate icon button
 *  (or, for Cancel/Delete, still is on narrower layouts) into one kebab
 *  menu — Edit Details, Mark/Undo No Show, invoice download/share, View
 *  Details, Delete. (WhatsApp/Call stay out — they're already one tap away
 *  via the round quick-link icons on the row itself, so listing them again
 *  here would just be the same actions twice. "Open Full CRM Page" and
 *  setting/editing a follow-up date also stay out — the card already has a
 *  dedicated "View Full CRM" button and a "Set Follow-up" chip that do
 *  exactly that; only Clear Follow-up stays here since there's no other way
 *  to reach it.)
 *
 *  Every handler this menu calls is owned by another hook (useEditEnquiry,
 *  useEnquiryDetailsModal, useEnquiryLifecycle, useEnquiryStatusActions) —
 *  this hook only wires them together into the row's action list, the same
 *  way handleAdvance in useEnquiryStatusActions dispatches to handlers it
 *  doesn't own either.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useRowActions(params: {
  openEdit: (enquiry: Enquiry) => void;
  setDetailsTarget: (enquiry: Enquiry) => void;
  invoiceBusyId: string | null;
  handleDownloadInvoice: (enquiry: Enquiry) => void;
  handleShareInvoice: (enquiry: Enquiry) => void;
  handleToggleNoShow: (enquiry: Enquiry, isNoShow: boolean) => void;
  handleUndoCheckIn: (enquiry: Enquiry) => void;
  handleClearFollowUp: (enquiry: Enquiry) => void;
  handleClearBookingFollowUp: (enquiry: Enquiry) => void;
  handleReopenEnquiry: (enquiry: Enquiry) => void;
  handleMarkNotInterested: (enquiry: Enquiry) => void;
  handleCancelToggle: (enquiry: Enquiry) => void;
  handleDelete: (enquiry: Enquiry) => void;
}) {
  const {
    openEdit, setDetailsTarget, invoiceBusyId, handleDownloadInvoice, handleShareInvoice,
    handleToggleNoShow, handleUndoCheckIn, handleClearFollowUp, handleClearBookingFollowUp,
    handleReopenEnquiry, handleMarkNotInterested, handleCancelToggle, handleDelete,
  } = params;

  const buildRowActions = (e: Enquiry): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      { label: 'Edit Details', icon: Pencil, onClick: () => openEdit(e) },
      { label: 'View Details', icon: Eye, onClick: () => setDetailsTarget(e) },
    ];
    if (e.booking_id) {
      items.push(
        { label: 'Download Invoice', icon: FileText, onClick: () => handleDownloadInvoice(e), disabled: invoiceBusyId === e.id },
        { label: 'Share Invoice', icon: Share2, onClick: () => handleShareInvoice(e), disabled: invoiceBusyId === e.id },
      );
    }
    // WhatsApp/Call are deliberately NOT in this menu — they're already
    // one tap away via the round quick-link icons on the row itself, so
    // listing them again here would just be the same actions twice.
    // Mark/Undo No Show — gated the same way setEnquiryNoShow() is
    // server-side (spec section 18's No Show Rules): only offered on an
    // active, Fully Paid booking whose Attendance hasn't started yet (not
    // checked in), and only once the trip date has actually arrived. Undo
    // No Show has no such gate — it's a correction path.
    if (e.is_no_show) {
      items.push({ label: 'Undo No Show', icon: UserCheck, onClick: () => handleToggleNoShow(e, false) });
    } else if (
      !e.cancelled_at && e.journey_stage === 'fully_paid' && !e.checked_in_at
      && (!e.departure_date || new Date(e.departure_date) <= new Date())
    ) {
      items.push({ label: 'Mark No Show', icon: UserX, onClick: () => handleToggleNoShow(e, true) });
    }
    if (e.journey_stage === 'checked_in') {
      items.push({ label: 'Undo Check In', icon: LogIn, onClick: () => handleUndoCheckIn(e) });
    }
    // Setting/editing the follow-up date is handled by the "Set Follow-up"
    // chip on the card itself — only Clear stays here, since that's not
    // reachable any other way.
    if (canSetFollowUp(e) && e.follow_up_at) {
      items.push({ label: 'Clear Follow-up', icon: X, onClick: () => handleClearFollowUp(e) });
    }
    // Same reasoning for the booking follow-up — the chip covers set/edit.
    if (canSetBookingFollowUp(e) && e.booking_follow_up_at) {
      items.push({ label: 'Clear Booking Follow-up', icon: X, onClick: () => handleClearBookingFollowUp(e) });
    }
    // "Not Interested" / "Reopen" only make sense before any money's
    // changed hands — once there's a booking_id or a payment on record,
    // closing the lead out is a Cancel Booking decision instead (different
    // consequences: refunds, seat release, etc).
    if (!e.cancelled_at && !e.booking_id && (e.amount_paid || 0) <= 0) {
      items.push(
        isNotInterested(e)
          ? { label: 'Reopen Enquiry', icon: RefreshCw, onClick: () => handleReopenEnquiry(e) }
          // Also available as a one-click inline button next to "Mark
          // Contacted" in the Update column (desktop table + mobile card)
          // — kept here too so it's still reachable from the kebab for
          // admins already in the habit of using it, or on rows where the
          // inline button doesn't fit.
          : { label: 'Not Interested (Close Query)', icon: UserMinus, onClick: () => handleMarkNotInterested(e) }
      );
    }
    // A Completed booking can't be cancelled, and neither can one that's
    // already checked in (spec section 18: "Checked In ... Not Allowed:
    // Cancel Booking" — undo the check-in first) — see cancelEnquiry's
    // guards in services/api.ts. Omit the action entirely rather than
    // showing it disabled or letting the click round-trip into an error
    // alert.
    if (e.cancelled_at || canCancelBooking(e)) {
      items.push(
        e.cancelled_at
          ? { label: 'Reactivate Booking', icon: RefreshCw, onClick: () => handleCancelToggle(e) }
          : { label: 'Cancel Booking', icon: XCircle, danger: true, onClick: () => handleCancelToggle(e) }
      );
    }
    items.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => handleDelete(e) });
    return items;
  };

  return { buildRowActions };
}
