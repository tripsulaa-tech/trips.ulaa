import { useState } from 'react';
import { addExtraCharge, generatePendingInvoice, recordTypedPayment } from '../../services/api';
import type { Enquiry } from '../../types/types-index';
import { emptyGenerateInvoiceForm, validateGenerateInvoiceForm, type GenerateInvoiceForm } from './AdminEnquiryCommon';
import { useAlert } from '../../components/ui/useAlert';

// Single source of truth for "Generate Invoice": owns the target/form/saving
// state and the actual save routing (extra_charge -> addExtraCharge,
// pending -> generatePendingInvoice, paid -> recordTypedPayment).
//
// AdminEnquiries.tsx (list view) and AdminEnquiryDetail.tsx (detail page)
// both need this exact flow but differ only in what should happen to their
// own local state once the save succeeds (refresh a table row vs. refresh a
// single enquiry) — so that part is left to the caller via onSuccess,
// instead of duplicating the whole handler in both files.
export function useGenerateInvoice(onSuccess: (updatedEnquiry: Enquiry, target: Enquiry) => void | Promise<void>) {
  const alert = useAlert();
  const [target, setTarget] = useState<Enquiry | null>(null);
  const [form, setForm] = useState<GenerateInvoiceForm>(emptyGenerateInvoiceForm);
  const [saving, setSaving] = useState(false);

  const open = (e: Enquiry) => {
    setForm(emptyGenerateInvoiceForm);
    setTarget(e);
  };

  const close = () => setTarget(null);

  const save = async () => {
    if (!target) return;
    const amount = form.amount === '' ? 0 : Number(form.amount);
    // The modal already shows every one of these live, field-by-field, and
    // disables Save while any are present — this is just the defense-in-
    // depth gate in case Save is reached some other way. Same shared
    // validator as AdminGenerateInvoiceModal.tsx (amountTouched forced true
    // here, since actually clicking Save is itself an attempt), so the
    // rules can't drift between "what the admin sees live" and "what
    // actually blocks the save".
    const formErrors = validateGenerateInvoiceForm(form, true);
    const firstError = Object.values(formErrors)[0];
    if (firstError) {
      alert(firstError);
      return;
    }
    try {
      setSaving(true);
      const notes = form.notes.trim() || undefined;
      const payment_method = form.status === 'paid' ? (form.payment_method || undefined) : undefined;
      const utr_number = form.status === 'paid' ? (form.utr_number || undefined) : undefined;
      let updatedEnquiry: Enquiry = target;

      if (form.type === 'extra_charge') {
        updatedEnquiry = await addExtraCharge(target, amount, {
          collectedNow: form.status === 'paid',
          payment_method,
          utr_number,
          notes,
        });
      } else if (form.status === 'pending') {
        await generatePendingInvoice(target.id, form.type, amount, notes);
      } else {
        updatedEnquiry = await recordTypedPayment(target, {
          type: form.type,
          amount,
          payment_method,
          utr_number,
          notes,
        });
      }

      setTarget(null);
      await onSuccess(updatedEnquiry, target);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to generate invoice.');
    } finally {
      setSaving(false);
    }
  };

  return { target, form, setForm, saving, open, close, save };
}
