import type { Dispatch, SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import { PAYMENT_METHOD_OPTIONS } from '../enquiryShared';
import type { Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { inputClass } from './AdminEnquiriesShared';

export type MarkPaidForm = { payment_method: string; utr_number: string };
export const emptyMarkPaidForm: MarkPaidForm = { payment_method: '', utr_number: '' };

// Settling a pending invoice (Mark Paid) is a real money-collection event
// just like recording a payment — CRM spec §6/9/46-48 expects payment
// method + UTR/transaction reference captured for it too, not just at
// initial-payment time. This small confirmation modal is what the
// "Mark Paid" buttons open instead of firing the API call directly.
export default function MarkPaidModal({
  target,
  onClose,
  form,
  setForm,
  onConfirm,
  saving,
}: {
  target: Payment | null;
  onClose: () => void;
  form: MarkPaidForm;
  setForm: Dispatch<SetStateAction<MarkPaidForm>>;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <Modal isOpen={!!target} onClose={onClose} title="Mark Invoice as Paid" size="sm">
      {target && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3">
            <p className="font-medium text-dark">{target.invoice_number || target.payment_type}</p>
            <p className="text-dark-muted text-xs mt-1">Amount {formatPrice(target.amount)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Payment Method</label>
              <Select
                value={form.payment_method}
                onChange={val => setForm(f => ({ ...f, payment_method: val, utr_number: val === 'Cash' ? '' : f.utr_number }))}
                options={PAYMENT_METHOD_OPTIONS}
                placeholder="Select method"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">UTR / Reference</label>
              <input
                type="text"
                value={form.utr_number}
                disabled={form.payment_method === 'Cash'}
                onChange={e => setForm(f => ({ ...f, utr_number: e.target.value }))}
                className={`${inputClass} ${form.payment_method === 'Cash' ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder={form.payment_method === 'Cash' ? 'N/A for cash' : 'e.g. 426817XXXXXX'}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" onClick={onConfirm} loading={saving}>Mark Paid</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
