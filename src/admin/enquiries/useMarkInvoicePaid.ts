import { useState } from 'react';
import { markInvoicePaid } from '../../services/api';
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
