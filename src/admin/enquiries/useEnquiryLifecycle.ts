import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  cancelEnquiry, uncancelEnquiry, deleteEnquiry, setEnquiryNoShow,
  markEnquiryCompleted, checkInEnquiry, undoCheckInEnquiry, getAllUpcomingTripsAdmin,
} from '../../services/api';
import type { CancellationReason, Enquiry, UpcomingTrip } from '../../types/types-index';
import type { PaymentForm } from './AdminEnquiryCommon';
import { useAlert } from '../../components/ui/useAlert';
import { useConfirm } from '../../components/ui/useConfirm';

/** Owns the booking-lifecycle actions a row's kebab menu / action buttons
 *  trigger — cancel (with its confirmation-modal target/form state),
 *  reactivate, permanent delete, toggling is_no_show, marking a trip
 *  completed, and check-in/undo-check-in — plus the completingId busy
 *  indicator scoped to the "mark completed" action specifically.
 *
 *  `updating` (the generic per-row busy indicator several other, not-yet-
 *  extracted handlers also share — follow-ups, not-interested, etc.) stays
 *  owned by AdminEnquiries.tsx and is passed in as `setUpdating`, since
 *  narrowing it to just this hook would mean every JSX `disabled={updating
 *  === e.id}` check would need to OR together a flag per domain hook
 *  instead of reading one shared value.
 *
 *  A couple of these actions have side effects on state this hook doesn't
 *  own — toggling no-show refreshes the Track Payment modal's target/form,
 *  and marking completed refreshes the Details modal's target — so those
 *  are threaded through as setter params rather than duplicated here.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEnquiryLifecycle(params: {
  load: () => void;
  setTrips: (trips: UpcomingTrip[]) => void;
  setUpdating: Dispatch<SetStateAction<string | null>>;
  setPaymentTarget: Dispatch<SetStateAction<Enquiry | null>>;
  setPaymentForm: Dispatch<SetStateAction<PaymentForm>>;
  setDetailsTarget: Dispatch<SetStateAction<Enquiry | null>>;
}) {
  const { load, setTrips, setUpdating, setPaymentTarget, setPaymentForm, setDetailsTarget } = params;
  const alert = useAlert();
  const confirm = useConfirm();

  const [cancelTarget, setCancelTarget] = useState<Enquiry | null>(null);
  const [cancelCharges, setCancelCharges] = useState<number | ''>('');
  const [cancelIsNoShow, setCancelIsNoShow] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancellationReason | ''>('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [togglingNoShow, setTogglingNoShow] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Reactivates a previously cancelled enquiry. Re-books the seat if
  // something had been paid, and resets booking_status via uncancelEnquiry.
  const handleReactivate = async (e: Enquiry) => {
    setUpdating(e.id);
    try {
      await uncancelEnquiry(e);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to reactivate booking.');
    } finally {
      setUpdating(null);
    }
  };

  // Cancel/reactivate entry point for the row-level button. Reactivating
  // happens immediately; cancelling opens a modal first so third-party
  // charges (airline/hotel penalties) can be recorded up front — cancelEnquiry
  // uses them to compute suggested_refund_amount.
  const handleCancelToggle = (e: Enquiry) => {
    if (e.cancelled_at) {
      handleReactivate(e);
    } else {
      setCancelTarget(e);
      setCancelCharges('');
      setCancelIsNoShow(false);
      setCancelReason('');
      setCancelNotes('');
    }
  };

  // Cancels an enquiry. Frees the trip seat immediately but never touches
  // amount_paid — that stays as the record of what was actually collected,
  // separate from whatever gets refunded. isNoShow forces the suggested
  // refund to 0 server-side (see cancelEnquiry).
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const charges = cancelCharges === '' ? undefined : Number(cancelCharges);
      await cancelEnquiry(cancelTarget, charges, cancelIsNoShow, cancelReason || undefined, cancelNotes);
      setCancelTarget(null);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to cancel booking.');
    } finally {
      setCancelling(false);
    }
  };

  // Toggles is_no_show independent of cancellation — e.g. an admin
  // realizing after the trip departed that a still-"confirmed" booking was
  // actually a no-show. The DB trigger recomputes suggested_refund_amount
  // in response, so refresh paymentTarget from the returned row.
  const handleToggleNoShow = async (e: Enquiry, isNoShow: boolean) => {
    setTogglingNoShow(true);
    try {
      const updated = await setEnquiryNoShow(e, isNoShow);
      setPaymentTarget(updated);
      // No refund for no-shows — clear whatever was in the field so it
      // can't be saved through by accident.
      if (isNoShow) {
        setPaymentForm(f => ({ ...f, refund_amount: 0 }));
      }
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to update no-show status.');
    } finally {
      setTogglingNoShow(false);
    }
  };

  // Permanently removes an enquiry. If it currently holds a seat, that seat
  // is released first (handled inside deleteEnquiry) so trip counts stay
  // accurate.
  const handleDelete = async (e: Enquiry) => {
    const ok = await confirm({
      title: 'Delete this enquiry?',
      message: 'This permanently removes the enquiry and its payment history. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setUpdating(e.id);
    try {
      await deleteEnquiry(e);
      if (e.trip_id) {
        const freshTrips = await getAllUpcomingTripsAdmin();
        setTrips(freshTrips);
      }
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to delete enquiry.');
    } finally {
      setUpdating(null);
    }
  };

  // Marks the trip as done — the one transition in booking_status's
  // lifecycle that a payment event can never infer on its own (see
  // markEnquiryCompleted's comment in services/api.ts).
  const handleMarkCompleted = async (enquiry: Enquiry) => {
    try {
      setCompletingId(enquiry.id);
      const updated = await markEnquiryCompleted(enquiry.id);
      setDetailsTarget(updated);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to mark booking as completed.');
    } finally {
      setCompletingId(null);
    }
  };

  // Stamps/clears checked_in_at — the one journey stage with no
  // payment/status signal to derive it from.
  const handleCheckIn = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await checkInEnquiry(enquiry);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to check in.');
    } finally {
      setUpdating(null);
    }
  };

  const handleUndoCheckIn = async (enquiry: Enquiry) => {
    setUpdating(enquiry.id);
    try {
      await undoCheckInEnquiry(enquiry.id);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to undo check-in.');
    } finally {
      setUpdating(null);
    }
  };

  return {
    cancelTarget, setCancelTarget,
    cancelCharges, setCancelCharges,
    cancelIsNoShow, setCancelIsNoShow,
    cancelReason, setCancelReason,
    cancelNotes, setCancelNotes,
    togglingNoShow, cancelling, completingId,
    handleReactivate, handleCancelToggle, handleConfirmCancel,
    handleToggleNoShow, handleDelete, handleMarkCompleted,
    handleCheckIn, handleUndoCheckIn,
  };
}
