import { useState, useEffect } from 'react';
import {
  recordPayment, recordKidsPayment, recordRefund, getAllUpcomingTripsAdmin,
  getPaymentsForEnquiry, generatePendingInvoice, addExtraCharge,
} from '../../services/api';
import type { Enquiry, UpcomingTrip, Payment } from '../../types/types-index';
import { validatePaymentForm } from './AdminEnquiryCommon';
import type { PaymentForm } from './AdminEnquiryCommon';
import { useAlert } from '../../components/ui/useAlert';

/** Owns the Track Payment modal — its target/form state, the inline payment-
 *  history ledger (lazy-loaded on demand, same pattern as the Details
 *  modal's invoice list), opening the modal with a suggested amount
 *  prefilled from the trip's price, and saving (which branches across
 *  extra-charge / pending / normal-collected payments, plus a refund leg
 *  when the target is cancelled).
 *
 *  `setPaymentTarget`/`setPaymentForm` are returned directly (not just via
 *  handlers) because useEnquiryLifecycle's handleToggleNoShow also needs to
 *  update this modal's target/form when toggling no-show status from
 *  elsewhere in the table — same cross-hook wiring pattern already used for
 *  setDetailsTarget.
 *
 *  `getTripPrice` stays owned by AdminEnquiries.tsx and is passed in, since
 *  useAddEnquiry also depends on it — keeping it there avoids either hook
 *  importing the other just for a pure `trips`-lookup function.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEnquiryPayment(params: {
  setTrips: (trips: UpcomingTrip[]) => void;
  load: () => void;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
}) {
  const { setTrips, load, getTripPrice } = params;
  const alert = useAlert();

  const [paymentTarget, setPaymentTarget] = useState<Enquiry | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ package_type: 'normal', total_amount: '', discount_amount: '', discount_reason: '', amount_paid: '', payment_type: 'advance', status: 'paid', payment_method: '', payment_utr: '', refund_amount: '', refund_method: '', refund_utr: '', refund_date: '', refund_notes: '', food_preference: '', kids_amount_paid: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  // Read-only ledger shown inline in the Track Payment modal (Phase F) —
  // same on-demand fetch pattern as detailsInvoices in AdminEnquiries.tsx,
  // just keyed to paymentTarget instead of detailsTarget.
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);

  // Same lazy-load pattern as the Details modal's invoice list, for the
  // Track Payment modal's inline history.
  useEffect(() => {
    if (!paymentTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale payment history immediately on modal close, ahead of the async fetch below
      setPaymentHistory([]);
      return;
    }
    let cancelled = false;
    setPaymentHistoryLoading(true);
    getPaymentsForEnquiry(paymentTarget.id)
      .then(rows => { if (!cancelled) setPaymentHistory(rows); })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setPaymentHistoryLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only paymentTarget.id is read; re-fetching on every paymentTarget reference change would refetch unnecessarily
  }, [paymentTarget?.id]);

  const openPayment = (enquiry: Enquiry) => {
    setPaymentTarget(enquiry);
    const packageType = enquiry.package_type || 'normal';
    // If no amount has been recorded yet, pull the trip's price for whichever
    // package this booking is under so the admin isn't starting from blank.
    const suggested = enquiry.total_amount ?? getTripPrice(enquiry.trip_id, packageType);
    setPaymentForm({
      package_type: packageType,
      total_amount: suggested ?? '',
      discount_amount: enquiry.discount_amount || '',
      discount_reason: enquiry.discount_reason || '',
      // Blank, not enquiry.amount_paid — this field is now "amount for this
      // payment," matching Generate Invoice, not a running total to edit
      // down to. Package/total/food-preference edits below can still be
      // saved with amount_paid left blank; that's a no-op on the ledger.
      amount_paid: '',
      payment_type: 'advance',
      status: 'paid',
      payment_method: '',
      payment_utr: '',
      // No-shows forfeit the full amount paid, no exceptions — refund
      // amount is locked at 0 rather than showing whatever was last on record.
      refund_amount: enquiry.is_no_show ? 0 : enquiry.refund_amount ?? 0,
      refund_method: '',
      refund_utr: '',
      refund_date: '',
      refund_notes: '',
      food_preference: enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : '',
      // Same "this transaction's own amount" convention as amount_paid
      // above, not enquiry.kids_amount_paid — see PaymentForm.
      kids_amount_paid: '',
    });
  };

  // Saves whatever's in the Track Payment modal. Branches on payment_type:
  // extra_charge bumps total_amount via addExtraCharge instead of
  // reconciling it directly; pending logs the intent (and, if an amount was
  // entered, a pending invoice) without moving money yet; everything else
  // is a normal collected payment. A cancelled target also gets its refund
  // leg recorded in the same save — total/package/food edits sitting in the
  // same form still need saving, so those always go through a recordPayment
  // call first (a no-op on the ledger when the payment itself is routed
  // elsewhere).
  const handleSavePayment = async () => {
    if (!paymentTarget) return;
    const totalAmount = paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
    // amount_paid is this transaction's own amount now (Generate Invoice's
    // semantics), so the running total recordPayment actually needs is the
    // existing amount_paid plus whatever's being entered here.
    const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
    const isExtraCharge = paymentForm.payment_type === 'extra_charge';
    const isPending = paymentForm.status === 'pending';
    const newRunningTotal = (paymentTarget.amount_paid || 0) + thisPayment;
    const refundAmount = paymentForm.refund_amount === '' ? 0 : Number(paymentForm.refund_amount);
    const discountAmount = paymentForm.discount_amount === '' ? 0 : Number(paymentForm.discount_amount);
    // The modal already shows every one of these live, field-by-field, and
    // disables Save while any are present — this is just the defense-in-
    // depth gate in case Save is reached some other way. Same shared
    // validator, so the rules can't drift between "what the admin sees
    // live" and "what actually blocks the save".
    const formErrors = validatePaymentForm(paymentForm, paymentTarget.amount_paid || 0, paymentTarget.kids_count > 0
      ? { total: paymentTarget.kids_amount || 0, alreadyPaid: paymentTarget.kids_amount_paid || 0 }
      : undefined);
    const firstError = Object.values(formErrors)[0];
    if (firstError) {
      alert(firstError);
      return;
    }
    try {
      setSavingPayment(true);
      let updated: Enquiry = paymentTarget;

      if (isExtraCharge) {
        // Total Amount is disabled in the UI for this type — addExtraCharge
        // bumps it by thisPayment itself, so there's nothing to reconcile.
        updated = await recordPayment(paymentTarget, {
          amount_paid: paymentTarget.amount_paid || 0,
          package_type: paymentForm.package_type,
          discount_amount: discountAmount,
          discount_reason: paymentForm.discount_reason || null,
          food_preference: paymentForm.food_preference || null,
        });
        updated = await addExtraCharge(updated, thisPayment, {
          collectedNow: !isPending,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
        });
      } else if (isPending) {
        updated = await recordPayment(paymentTarget, {
          amount_paid: paymentTarget.amount_paid || 0,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          discount_amount: discountAmount,
          discount_reason: paymentForm.discount_reason || null,
          food_preference: paymentForm.food_preference || null,
        });
        if (thisPayment > 0) {
          // Not extra_charge in this branch (handled above), so this is
          // always one of the four types generatePendingInvoice accepts.
          await generatePendingInvoice(paymentTarget.id, paymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment', thisPayment);
        }
      } else {
        updated = await recordPayment(paymentTarget, {
          amount_paid: newRunningTotal,
          total_amount: totalAmount,
          package_type: paymentForm.package_type,
          discount_amount: discountAmount,
          discount_reason: paymentForm.discount_reason || null,
          food_preference: paymentForm.food_preference || null,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
          // Only meaningful when money is actually moving — recordPayment's
          // delta !== 0 guard already no-ops the ledger insert otherwise, so
          // there's no case where an unused type value could mislabel a
          // profile-only edit (total/package/food with no payment amount).
          // Not extra_charge in this branch (handled above), so this is
          // always one of the four types recordPayment's override accepts.
          type: thisPayment > 0 ? (paymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment') : undefined,
        });
      }

      if (paymentTarget.cancelled_at) {
        await recordRefund(updated, refundAmount, {
          payment_method: paymentForm.refund_method || undefined,
          utr_number: paymentForm.refund_utr || undefined,
          notes: paymentForm.refund_notes || undefined,
          paid_at: paymentForm.refund_date || undefined,
        });
      }

      // Kids fee — independent Total/Paid/Pending, tracked alongside
      // whichever branch above handled the adult payment. Same "amount for
      // this transaction" entry as amount_paid; a no-op when left blank.
      const thisKidsPayment = paymentForm.kids_amount_paid === '' ? 0 : Number(paymentForm.kids_amount_paid);
      if (thisKidsPayment > 0) {
        updated = await recordKidsPayment(updated, {
          kids_amount_paid: (updated.kids_amount_paid || 0) + thisKidsPayment,
          payment_method: paymentForm.payment_method || undefined,
          utr_number: paymentForm.payment_utr || undefined,
        });
      }

      setPaymentTarget(null);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save payment details.');
    } finally {
      setSavingPayment(false);
    }
  };

  return {
    paymentTarget, setPaymentTarget,
    paymentForm, setPaymentForm,
    savingPayment,
    paymentHistory, paymentHistoryLoading,
    openPayment,
    handleSavePayment,
  };
}
