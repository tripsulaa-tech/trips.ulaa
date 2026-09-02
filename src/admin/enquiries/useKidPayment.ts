import { useState, useEffect } from 'react';
import { recordKidPayment, generateKidPendingInvoice, addExtraChargeForKid, getPaymentsForKid } from '../../services/api';
import type { Kid, Payment } from '../../types/types-index';
import { useAlert } from '../../components/ui/useAlert';

/** One kid's own Payment modal — its own Total/Paid, own ledger, own
 *  method/UTR, own Payment Type/Status — genuinely independent of every
 *  other kid on the same booking and of the adult booking's Track Payment
 *  modal (which no longer carries a combined Kids Fee section; see
 *  AdminEnquiryPaymentModal/AdminPaymentModal). Deliberately simpler than
 *  useEnquiryPayment: no package/discount (kids don't have a package), no
 *  refund flow — a kid doesn't get its own seat or cancellation. Extra
 *  Charge is supported (see addExtraChargeForKid), same as the adult
 *  modal's own Extra Charge type. Total is never admin-typed here — it's always the trip's
 *  own child_price (see getTripChildPrice below and AdminKidPaymentModal),
 *  same "list price, not free-typed" idea as the adult modal's own List
 *  Price field.
 *
 *  Shared by both the Enquiries list table (one kid row per real kid,
 *  bulk-loaded — see AdminEnquiries.tsx's kidsByEnquiry) and the enquiry
 *  detail page's Kids card / kid detail modal, so the two screens can
 *  never drift on what counts as a valid kid payment. */
export type KidPaymentForm = {
  // This kid's own total — sourced live from the trip's child_price
  // whenever the modal opens (see openKidPayment), not admin-typed. Kept
  // as a number so the balance-due preview below and recordKidPayment's
  // own total-correction can still use it.
  amount: number | '';
  // This transaction's own amount, not a running total — same convention
  // as PaymentForm.amount_paid. recordKidPayment does the delta/running-
  // total math internally.
  amount_paid: number | '';
  payment_method: string;
  payment_utr: string;
  // Full Payment / Advance / Balance / Installment / Extra Charge — same
  // options and meaning as the adult Track Payment modal's Payment Type
  // dropdown. See KID_PAYMENT_TYPE_OPTIONS below.
  payment_type: 'full_payment' | 'advance' | 'balance' | 'installment' | 'extra_charge';
  // Paid now vs pending — same meaning as the adult modal's Status
  // dropdown. 'pending' raises an invoice (generateKidPendingInvoice)
  // without touching this kid's amount_paid; it still carries the parent
  // enquiry_id, so it already shows up (and is settleable) in that
  // enquiry's own Invoices & Payments card — see generateKidPendingInvoice.
  status: 'paid' | 'pending';
  food_preference: 'veg' | 'non_veg' | '';
};

export const emptyKidPaymentForm: KidPaymentForm = {
  amount: '', amount_paid: '', payment_method: '', payment_utr: '', payment_type: 'advance', status: 'paid', food_preference: '',
};

// Same five types the adult modal offers — see KidPaymentForm.payment_type
// above.
export const KID_PAYMENT_TYPE_OPTIONS: { value: KidPaymentForm['payment_type']; label: string }[] = [
  { value: 'full_payment', label: 'Full Payment' },
  { value: 'advance', label: 'Advance' },
  { value: 'balance', label: 'Balance' },
  { value: 'installment', label: 'Installment' },
  { value: 'extra_charge', label: 'Extra Charge' },
];

// 'Balance' is meant for the payment that clears whatever's left owing on
// this kid's own total — same reasoning/gating as the adult modal's
// clearsBalance (AdminEnquiryCommon.ts), just re-derived here rather than
// widened to accept this narrower KidPaymentForm shape. Extra Charge never
// clears a balance — it raises the total instead — same as the adult
// modal's own clearsBalance short-circuit.
function kidAmountClearsBalance(form: KidPaymentForm, alreadyPaid: number): boolean {
  if (form.payment_type === 'extra_charge') return false;
  const { amount: totalAmount, amount_paid: thisAmount } = form;
  if (totalAmount === '') return false;
  const amt = thisAmount === '' ? 0 : Number(thisAmount);
  if (amt <= 0) return false;
  return Number(totalAmount) - alreadyPaid - amt <= 0;
}

export function availableKidPaymentTypeOptions(form: KidPaymentForm, alreadyPaid: number): { value: KidPaymentForm['payment_type']; label: string }[] {
  return kidAmountClearsBalance(form, alreadyPaid)
    ? KID_PAYMENT_TYPE_OPTIONS
    : KID_PAYMENT_TYPE_OPTIONS.filter(o => o.value !== 'balance');
}

type KidPaymentFormErrors = Partial<Record<'amount_paid' | 'payment_method' | 'payment_utr', string>>;

export function validateKidPaymentForm(form: KidPaymentForm, alreadyPaid: number): KidPaymentFormErrors {
  const errors: KidPaymentFormErrors = {};
  const totalAmount = form.amount === '' ? null : Number(form.amount);
  const thisPayment = form.amount_paid === '' ? 0 : Number(form.amount_paid);
  const isExtraCharge = form.payment_type === 'extra_charge';
  const isPending = form.status === 'pending';

  if (!isExtraCharge && !isPending && totalAmount != null && totalAmount > 0 && thisPayment > 0 && alreadyPaid + thisPayment > totalAmount) {
    errors.amount_paid = "This would take the amount paid past this kid's total.";
  } else if ((isExtraCharge || isPending) && thisPayment <= 0) {
    errors.amount_paid = isExtraCharge
      ? 'Enter an extra charge amount greater than zero.'
      : 'Enter an amount greater than zero for the pending invoice.';
  }

  if (!isPending && thisPayment > 0 && !form.payment_method) {
    errors.payment_method = 'Select a payment method.';
  }
  if (!isPending && thisPayment > 0 && form.payment_method && form.payment_method !== 'Cash' && !form.payment_utr.trim()) {
    errors.payment_utr = 'Enter a UTR / reference number.';
  }

  return errors;
}

export function useKidPayment(params: {
  onSaved: (kid: Kid) => void;
  // Looks up the trip's flat per-kid fee (upcoming_trips.child_price) —
  // same function AdminEnquiries.tsx/AdminEnquiryDetail.tsx already build
  // for the adult modal's Kids Fee section, passed through unchanged so
  // Total here is always sourced from the one place trips actually price
  // kids, never free-typed by the admin.
  getTripChildPrice: (tripId: string | undefined) => number | undefined;
}) {
  const { onSaved, getTripChildPrice } = params;
  const alert = useAlert();

  const [kidPaymentTarget, setKidPaymentTarget] = useState<Kid | null>(null);
  // Which trip this kid's own booking is on — needed only to look up the
  // live child_price above; not part of KidPaymentForm since it's never
  // itself edited.
  const [kidPaymentTripId, setKidPaymentTripId] = useState<string | undefined>(undefined);
  const [kidPaymentForm, setKidPaymentForm] = useState<KidPaymentForm>(emptyKidPaymentForm);
  const [savingKidPayment, setSavingKidPayment] = useState(false);
  const [kidPaymentHistory, setKidPaymentHistory] = useState<Payment[]>([]);
  const [kidPaymentHistoryLoading, setKidPaymentHistoryLoading] = useState(false);

  // Same lazy on-demand fetch pattern as useEnquiryPayment's inline ledger,
  // just keyed to kidPaymentTarget instead of paymentTarget.
  useEffect(() => {
    if (!kidPaymentTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale payment history immediately on modal close, ahead of the async fetch below
      setKidPaymentHistory([]);
      return;
    }
    let cancelled = false;
    setKidPaymentHistoryLoading(true);
    getPaymentsForKid(kidPaymentTarget.id)
      .then(rows => { if (!cancelled) setKidPaymentHistory(rows); })
      .catch(err => console.error(err))
      .finally(() => { if (!cancelled) setKidPaymentHistoryLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only kidPaymentTarget.id is read
  }, [kidPaymentTarget?.id]);

  // Recomputed every render straight from the live `trips` list (via the
  // caller's getTripChildPrice), rather than cached in state, so it never
  // goes stale if the trip's price is edited while this modal is open.
  const kidPaymentChildPrice = getTripChildPrice(kidPaymentTripId);

  const openKidPayment = (kid: Kid, tripId: string | undefined) => {
    setKidPaymentTarget(kid);
    setKidPaymentTripId(tripId);
    const suggestedTotal = getTripChildPrice(tripId);
    setKidPaymentForm({
      // Trip's live fee wins; falls back to whatever this kid's own
      // `amount` already holds (e.g. the trip's fee isn't set, or the
      // trip's since been removed from Upcoming Trips) so an existing
      // record doesn't suddenly show as "Not set".
      amount: suggestedTotal ?? (kid.amount || ''),
      amount_paid: '',
      payment_method: '',
      payment_utr: '',
      payment_type: 'advance',
      status: 'paid',
      food_preference: kid.food_preference === 'veg' || kid.food_preference === 'non_veg' ? kid.food_preference : '',
    });
  };

  const handleSaveKidPayment = async () => {
    if (!kidPaymentTarget) return;
    const thisPayment = kidPaymentForm.amount_paid === '' ? 0 : Number(kidPaymentForm.amount_paid);
    const newAmount = kidPaymentForm.amount === '' ? null : Number(kidPaymentForm.amount);
    const foodPreference = kidPaymentForm.food_preference || null;
    const isExtraCharge = kidPaymentForm.payment_type === 'extra_charge';
    const isPending = kidPaymentForm.status === 'pending';
    const formErrors = validateKidPaymentForm(kidPaymentForm, kidPaymentTarget.amount_paid || 0);
    const firstError = Object.values(formErrors)[0];
    if (firstError) {
      alert(firstError);
      return;
    }
    try {
      setSavingKidPayment(true);
      let updated: Kid;
      if (isExtraCharge) {
        // Same routing as useEnquiryPayment's own extra_charge branch —
        // this kid's Total is disabled in the UI for this type, so there's
        // nothing to reconcile beyond the food-preference edit (folded
        // into recordKidPayment's own no-op-on-the-ledger call), then
        // addExtraChargeForKid bumps this kid's own total by thisPayment.
        updated = await recordKidPayment(kidPaymentTarget, {
          amount_paid: kidPaymentTarget.amount_paid || 0,
          food_preference: foodPreference,
        });
        updated = await addExtraChargeForKid(updated, thisPayment, {
          collectedNow: !isPending,
          payment_method: kidPaymentForm.payment_method || undefined,
          utr_number: kidPaymentForm.payment_utr || undefined,
        });
      } else if (isPending) {
        // Not extra_charge in this branch (handled above), so this is
        // always one of the four types generateKidPendingInvoice accepts.
        updated = await generateKidPendingInvoice(
          kidPaymentTarget,
          kidPaymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment',
          thisPayment,
          { newTotal: newAmount, food_preference: foodPreference }
        );
      } else {
        updated = await recordKidPayment(kidPaymentTarget, {
          amount_paid: (kidPaymentTarget.amount_paid || 0) + thisPayment,
          amount: newAmount,
          payment_method: kidPaymentForm.payment_method || undefined,
          utr_number: kidPaymentForm.payment_utr || undefined,
          // Not extra_charge in this branch (handled above), so this is
          // always one of the four types recordKidPayment's override accepts.
          payment_type: thisPayment > 0 ? (kidPaymentForm.payment_type as 'full_payment' | 'advance' | 'balance' | 'installment') : undefined,
          food_preference: foodPreference,
        });
      }
      setKidPaymentTarget(null);
      onSaved(updated);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save this kid's payment details.");
    } finally {
      setSavingKidPayment(false);
    }
  };

  return {
    kidPaymentTarget, setKidPaymentTarget,
    kidPaymentForm, setKidPaymentForm,
    kidPaymentChildPrice,
    savingKidPayment,
    kidPaymentHistory, kidPaymentHistoryLoading,
    openKidPayment,
    handleSaveKidPayment,
  };
}
