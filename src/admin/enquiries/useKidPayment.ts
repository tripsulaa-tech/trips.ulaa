import { useState, useEffect } from 'react';
import { recordKidPayment, getPaymentsForKid } from '../../services/api';
import type { Kid, Payment } from '../../types/types-index';
import { useAlert } from '../../components/ui/useAlert';

/** One kid's own Payment modal — its own Total/Paid, own ledger, own
 *  method/UTR — genuinely independent of every other kid on the same
 *  booking and of the adult booking's Track Payment modal (which no
 *  longer carries a combined Kids Fee section; see
 *  AdminEnquiryPaymentModal/AdminPaymentModal). Deliberately simpler than
 *  useEnquiryPayment: no package/discount (kids don't have a package), no
 *  refund/extra-charge/pending-invoice branching in v1 — a kid doesn't get
 *  its own seat or invoice-type menu, just Total/Paid/Pending, same
 *  scope recordKidsPayment (the older combined version) originally
 *  shipped with.
 *
 *  Shared by both the Enquiries list table (one kid row per real kid,
 *  bulk-loaded — see AdminEnquiries.tsx's kidsByEnquiry) and the enquiry
 *  detail page's Kids card / kid detail modal, so the two screens can
 *  never drift on what counts as a valid kid payment. */
export type KidPaymentForm = {
  // This kid's own total — same "list price, admin-adjustable" idea as
  // PaymentForm.total_amount, just scoped to one kid.
  amount: number | '';
  // This transaction's own amount, not a running total — same convention
  // as PaymentForm.amount_paid. recordKidPayment does the delta/running-
  // total math internally.
  amount_paid: number | '';
  payment_method: string;
  payment_utr: string;
};

export const emptyKidPaymentForm: KidPaymentForm = {
  amount: '', amount_paid: '', payment_method: '', payment_utr: '',
};

type KidPaymentFormErrors = Partial<Record<'amount_paid' | 'payment_method' | 'payment_utr', string>>;

export function validateKidPaymentForm(form: KidPaymentForm, alreadyPaid: number): KidPaymentFormErrors {
  const errors: KidPaymentFormErrors = {};
  const totalAmount = form.amount === '' ? null : Number(form.amount);
  const thisPayment = form.amount_paid === '' ? 0 : Number(form.amount_paid);

  if (thisPayment > 0 && totalAmount != null && totalAmount > 0 && alreadyPaid + thisPayment > totalAmount) {
    errors.amount_paid = "This would take the amount paid past this kid's total.";
  }
  if (thisPayment > 0 && !form.payment_method) {
    errors.payment_method = 'Select a payment method.';
  }
  if (thisPayment > 0 && form.payment_method && form.payment_method !== 'Cash' && !form.payment_utr.trim()) {
    errors.payment_utr = 'Enter a UTR / reference number.';
  }

  return errors;
}

export function useKidPayment(params: { onSaved: (kid: Kid) => void }) {
  const { onSaved } = params;
  const alert = useAlert();

  const [kidPaymentTarget, setKidPaymentTarget] = useState<Kid | null>(null);
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

  const openKidPayment = (kid: Kid) => {
    setKidPaymentTarget(kid);
    setKidPaymentForm({
      amount: kid.amount || '',
      amount_paid: '',
      payment_method: '',
      payment_utr: '',
    });
  };

  const handleSaveKidPayment = async () => {
    if (!kidPaymentTarget) return;
    const thisPayment = kidPaymentForm.amount_paid === '' ? 0 : Number(kidPaymentForm.amount_paid);
    const newAmount = kidPaymentForm.amount === '' ? null : Number(kidPaymentForm.amount);
    const formErrors = validateKidPaymentForm(kidPaymentForm, kidPaymentTarget.amount_paid || 0);
    const firstError = Object.values(formErrors)[0];
    if (firstError) {
      alert(firstError);
      return;
    }
    try {
      setSavingKidPayment(true);
      const updated = await recordKidPayment(kidPaymentTarget, {
        amount_paid: (kidPaymentTarget.amount_paid || 0) + thisPayment,
        amount: newAmount,
        payment_method: kidPaymentForm.payment_method || undefined,
        utr_number: kidPaymentForm.payment_utr || undefined,
      });
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
    savingKidPayment,
    kidPaymentHistory, kidPaymentHistoryLoading,
    openKidPayment,
    handleSaveKidPayment,
  };
}
