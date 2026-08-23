import { useState } from 'react';
import { updateEnquiryStatus, setEnquiryFollowUp, setBookingFollowUp, recordContactOutcome } from '../../services/api';
import type { ClosedReason, Enquiry } from '../../types/types-index';
import type { ContactOutcomeResult } from './AdminContactOutcomeModal';
import type { BookingFollowUpResult } from './AdminBookingFollowUpModal';
import { useAlert } from '../../components/ui/useAlert';

/** Owns every small "row status transition" handler that isn't big enough
 *  to warrant its own hook: recording a contact outcome (New/Contacted ->
 *  Contacted/Closed), the single-button "Advance" dispatcher, Not
 *  Interested + Reopen, the lead follow-up reminder, and the post-booking
 *  follow-up reminder.
 *
 *  `openPayment`, `handleCheckIn`, and `handleMarkCompleted` are passed in
 *  rather than owned here because handleAdvance's job is purely to
 *  dispatch to whichever one of those (from useEnquiryPayment /
 *  useEnquiryLifecycle) applies for the row's current journey_stage — same
 *  cross-hook wiring pattern already used for setDetailsTarget/
 *  setPaymentTarget elsewhere.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEnquiryStatusActions(params: {
  load: () => void;
  setUpdating: (id: string | null) => void;
  openPayment: (enquiry: Enquiry) => void;
  handleCheckIn: (enquiry: Enquiry) => void;
  handleMarkCompleted: (enquiry: Enquiry) => void;
}) {
  const { load, setUpdating, openPayment, handleCheckIn, handleMarkCompleted } = params;
  const alert = useAlert();

  // ---- Record Contact Outcome (New -> Contacted, and re-logging the next
  // call while still Contacted) --------------------------------------------
  // Replaces the old direct "Mark Contacted" status flip: status only ever
  // becomes 'contacted' (or 'closed', for Not Interested/Wrong Number)
  // once this popup is saved — see ContactOutcomeModal.tsx and
  // recordContactOutcome() in services/api.ts.
  const [contactOutcomeTarget, setContactOutcomeTarget] = useState<Enquiry | null>(null);
  const [savingContactOutcome, setSavingContactOutcome] = useState(false);
  const handleSaveContactOutcome = async (result: ContactOutcomeResult) => {
    if (!contactOutcomeTarget) return;
    setSavingContactOutcome(true);
    try {
      await recordContactOutcome(contactOutcomeTarget.id, {
        outcome: result.outcome,
        notes: result.notes,
        followUpAt: result.followUpAt || null,
        followUpTime: result.followUpTime || null,
        closedReason: result.closedReason,
      });
      const target = contactOutcomeTarget;
      setContactOutcomeTarget(null);
      load();
      // Interested is the one outcome that moves towards a booking — open
      // Track Payment right away, same as the old auto-open-on-Contacted
      // behaviour, so the admin can record the advance in one flow.
      if (result.outcome === 'interested') {
        openPayment({ ...target, status: 'contacted' });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to record contact outcome.');
    } finally {
      setSavingContactOutcome(false);
    }
  };

  // Single entry point for the table's "Advance" button — dispatches to
  // whichever manual action nextManualAction() says is next for this row.
  const handleAdvance = (enquiry: Enquiry) => {
    switch (enquiry.journey_stage) {
      case 'new_enquiry':
      case 'contacted':
        return setContactOutcomeTarget(enquiry);
      case 'fully_paid':
        return handleCheckIn(enquiry);
      case 'checked_in':
        return handleMarkCompleted(enquiry);
      default:
        return undefined;
    }
  };

  // ---- Not Interested / Reopen (this is just a query, not a booking) ----
  // Mirrors AdminEnquiryDetail.tsx's handling exactly — this only applies
  // before anything's been paid, i.e. closing out a lead that went nowhere
  // after being contacted, as opposed to Cancel Booking (money already on
  // it). See isNotInterested()'s comment in AdminEnquiryCommon.tsx for why
  // 'closed' status alone is ambiguous without this. Added here (not just
  // on the CRM detail page) so the admin doesn't have to open a row just
  // to drop a lead that said no.
  // Opens the reason-picker modal below instead of closing immediately —
  // capturing *why* a lead didn't convert (see CLOSED_REASON_OPTIONS) is
  // what makes the "35 closed before booking" number in reporting
  // actionable instead of a dead end. Mirrors AdminEnquiryDetail.tsx.
  const [notInterestedTarget, setNotInterestedTarget] = useState<Enquiry | null>(null);
  const [closedReason, setClosedReason] = useState<ClosedReason>('no_response');
  const handleMarkNotInterested = (enquiry: Enquiry) => {
    setClosedReason('no_response');
    setNotInterestedTarget(enquiry);
  };
  const handleConfirmNotInterested = async () => {
    if (!notInterestedTarget) return;
    setUpdating(notInterestedTarget.id);
    try {
      await updateEnquiryStatus(notInterestedTarget.id, 'closed', closedReason);
      setNotInterestedTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
    } finally {
      setUpdating(null);
    }
  };

  // ---- Follow-up reminder (still warm, not ready to close either way) ----
  // Mirrors the Not Interested modal's shape (target + form state, confirm
  // handler) but writes just follow_up_at via setEnquiryFollowUp — this
  // never touches status/journey_stage itself. See canSetFollowUp/
  // followUpStatus in AdminEnquiryCommon.tsx and add_enquiry_follow_up.sql.
  const [followUpTarget, setFollowUpTarget] = useState<Enquiry | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const openFollowUpModal = (enquiry: Enquiry) => {
    setFollowUpDate(enquiry.follow_up_at || '');
    setFollowUpTarget(enquiry);
  };
  const handleSaveFollowUp = async () => {
    if (!followUpTarget || !followUpDate) return;
    setUpdating(followUpTarget.id);
    try {
      await setEnquiryFollowUp(followUpTarget.id, followUpDate);
      setFollowUpTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to set follow-up date.');
    } finally {
      setUpdating(null);
    }
  };
  const handleClearFollowUp = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await setEnquiryFollowUp(enquiry.id, null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to clear follow-up date.');
    } finally {
      setUpdating(null);
    }
  };

  // ---- Booking Follow-up (CRM spec section 8B) — post-booking reminder ----
  // Mirrors the Lead Follow-up block above, but for balance-payment/
  // document/passport-type reminders that only make sense once a booking
  // has actually started. See canSetBookingFollowUp/bookingFollowUpStatus
  // in AdminEnquiryCommon.tsx and add_booking_follow_up.sql.
  const [bookingFollowUpTarget, setBookingFollowUpTarget] = useState<Enquiry | null>(null);
  const handleSaveBookingFollowUp = async (result: BookingFollowUpResult) => {
    if (!bookingFollowUpTarget) return;
    setUpdating(bookingFollowUpTarget.id);
    try {
      await setBookingFollowUp(bookingFollowUpTarget.id, result.at, { time: result.time, type: result.type, notes: result.notes });
      setBookingFollowUpTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to set booking follow-up.');
    } finally {
      setUpdating(null);
    }
  };
  const handleClearBookingFollowUp = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await setBookingFollowUp(enquiry.id, null);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to clear booking follow-up.');
    } finally {
      setUpdating(null);
    }
  };

  const handleReopenEnquiry = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await updateEnquiryStatus(enquiry.id, 'contacted');
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to reopen enquiry.');
    } finally {
      setUpdating(null);
    }
  };

  return {
    contactOutcomeTarget, setContactOutcomeTarget,
    savingContactOutcome,
    handleSaveContactOutcome,
    handleAdvance,
    notInterestedTarget, setNotInterestedTarget,
    closedReason, setClosedReason,
    handleMarkNotInterested,
    handleConfirmNotInterested,
    followUpTarget, setFollowUpTarget,
    followUpDate, setFollowUpDate,
    openFollowUpModal,
    handleSaveFollowUp,
    handleClearFollowUp,
    bookingFollowUpTarget, setBookingFollowUpTarget,
    handleSaveBookingFollowUp,
    handleClearBookingFollowUp,
    handleReopenEnquiry,
  };
}
