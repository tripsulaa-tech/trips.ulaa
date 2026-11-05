import { useState } from 'react';
import { markInvoicePaid, getUtrWarning } from '../../services/api';
import { useAlert } from '../../components/ui/useAlert';
import { useConfirm } from '../../components/ui/useConfirm';
import type { Payment } from '../../types/types-index';
import { emptyMarkPaidForm, type MarkPaidForm } from './AdminMarkPaidModal';

// Single source of truth for "Mark Invoice Paid": owns the target/form/
// saving state and the actual save call. AdminEnquiries.tsx (list view) and
// AdminEnquiryDetail.tsx (detail page) both need this exact flow but differ
// only in what should happen to their own local state once the save
// succeeds (refresh a table row's cached invoices/target vs. refresh a
// single enquiry's payments/enquiry state) — so that part is left to the
// caller via onSuccess, instead of duplicating the whole handler in both
// files. Mirrors useEnquiryPayment's cross-page-sharing pattern for the
// same reason.
export function useMarkInvoicePaid(onSuccess: (updatedPayment: Payment) => void | Promise<void>) {
  const alert = useAlert();
  const askConfirm = useConfirm();
  const [target, setTarget] = useState<Payment | null>(null);
  const [form, setForm] = useState<MarkPaidForm>(emptyMarkPaidForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (payment: Payment) => {
    setForm(emptyMarkPaidForm);
    setTarget(payment);
  };

  const close = () => setTarget(null);

  const confirm = async () => {
    if (!target) return;
    const payment = target;
    // A UTR already on a booking is only a warning (one person can pay for
    // several travellers): the admin decides whether to carry on.
    if (form.utr_number) {
      const utrWarning = await getUtrWarning(form.utr_number, { excludePaymentId: payment.id, currentEnquiryId: payment.enquiry_id });
      if (utrWarning && !(await askConfirm({ title: 'UTR already used', message: utrWarning, confirmLabel: 'Save anyway', variant: 'default' }))) return;
    }
    try {
      setSaving(true);
      setBusyId(payment.id);
      const updatedPayment = await markInvoicePaid(payment.id, {
        payment_method: form.payment_method || undefined,
        utr_number: form.utr_number || undefined,
      });
      setTarget(null);
      await onSuccess(updatedPayment);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to mark invoice as paid.');
    } finally {
      setBusyId(null);
      setSaving(false);
    }
  };

  return { target, form, setForm, busyId, saving, open, close, confirm };
}
