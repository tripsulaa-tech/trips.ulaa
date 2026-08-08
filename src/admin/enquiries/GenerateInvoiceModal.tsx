import type { Dispatch, SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
<<<<<<< HEAD
import { parseNonNegative, GENERATE_INVOICE_TYPE_OPTIONS, GENERATE_INVOICE_STATUS_OPTIONS } from '../enquiryShared';
=======
import { useConfirm } from '../../components/ui/useConfirm';
import { parseNonNegative, GENERATE_INVOICE_TYPE_OPTIONS, GENERATE_INVOICE_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS } from '../enquiryShared';
>>>>>>> a5195ca (Implement CRM spec sections 1-80 with full spec compliance)
import type { GenerateInvoiceForm } from '../enquiryShared';
import type { Enquiry } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { inputClass } from './adminEnquiriesShared';

// Raises one invoice line (Full Payment / Advance / Balance / Installment /
// Extra Charge) against whichever booking it was opened from. "Paid now"
// records real money via recordTypedPayment/addExtraCharge; "Pending"
// raises the invoice without touching amount_paid, via
// generatePendingInvoice, for later settlement with the Mark Paid button
// in the Invoices list.
export default function GenerateInvoiceModal({
  generateInvoiceTarget,
  onClose,
  generateInvoiceForm,
  setGenerateInvoiceForm,
  onSave,
  savingInvoice,
}: {
  generateInvoiceTarget: Enquiry | null;
  onClose: () => void;
  generateInvoiceForm: GenerateInvoiceForm;
  setGenerateInvoiceForm: Dispatch<SetStateAction<GenerateInvoiceForm>>;
  onSave: () => void;
  savingInvoice: boolean;
}) {
<<<<<<< HEAD
  return (
    <Modal isOpen={!!generateInvoiceTarget} onClose={onClose} title="Generate Invoice" size="sm">
=======
  const confirm = useConfirm();
  const isDirty =
    generateInvoiceForm.amount !== '' ||
    generateInvoiceForm.notes !== '' ||
    generateInvoiceForm.payment_method !== '' ||
    generateInvoiceForm.utr_number !== '';

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: "You've entered invoice details that haven't been saved yet.",
        confirmLabel: 'Discard',
        cancelLabel: 'Continue Editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal isOpen={!!generateInvoiceTarget} onClose={requestClose} title="Generate Invoice" size="sm">
>>>>>>> a5195ca (Implement CRM spec sections 1-80 with full spec compliance)
      {generateInvoiceTarget && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3">
            <p className="font-medium text-dark">{generateInvoiceTarget.full_name}</p>
            <p className="text-dark-muted text-xs">{generateInvoiceTarget.trip_title || 'No trip linked'}</p>
            <p className="text-dark-muted text-xs mt-1">
              Total {formatPrice(generateInvoiceTarget.total_amount || 0)} · Paid {formatPrice(generateInvoiceTarget.amount_paid || 0)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Type</label>
            <Select
              value={generateInvoiceForm.type}
              onChange={val => setGenerateInvoiceForm(f => ({ ...f, type: val }))}
              options={GENERATE_INVOICE_TYPE_OPTIONS}
            />
            {generateInvoiceForm.type === 'extra_charge' && (
              <p className="text-[11px] text-dark-muted mt-1">
                Adds this amount on top of the booking's total amount right away — e.g. a hotel upgrade — whether or not it's collected now.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Amount (₹)</label>
            <input
              type="number"
              min={0}
              value={generateInvoiceForm.amount}
              onChange={ev => setGenerateInvoiceForm(f => ({ ...f, amount: parseNonNegative(ev.target.value) }))}
              className={inputClass}
              placeholder="Amount for this invoice"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Status</label>
            <Select
              value={generateInvoiceForm.status}
              onChange={val => setGenerateInvoiceForm(f => ({ ...f, status: val }))}
              options={GENERATE_INVOICE_STATUS_OPTIONS}
            />
          </div>

<<<<<<< HEAD
=======
          {generateInvoiceForm.status === 'paid' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Payment Method</label>
                <Select
                  value={generateInvoiceForm.payment_method}
                  onChange={val => setGenerateInvoiceForm(f => ({ ...f, payment_method: val, utr_number: val === 'Cash' ? '' : f.utr_number }))}
                  options={PAYMENT_METHOD_OPTIONS}
                  placeholder="Select method"
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">UTR / Reference</label>
                <input
                  type="text"
                  value={generateInvoiceForm.utr_number}
                  disabled={generateInvoiceForm.payment_method === 'Cash'}
                  onChange={ev => setGenerateInvoiceForm(f => ({ ...f, utr_number: ev.target.value }))}
                  className={`${inputClass} ${generateInvoiceForm.payment_method === 'Cash' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder={generateInvoiceForm.payment_method === 'Cash' ? 'N/A for cash' : 'e.g. 426817XXXXXX'}
                />
              </div>
            </div>
          )}

>>>>>>> a5195ca (Implement CRM spec sections 1-80 with full spec compliance)
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Notes (optional)</label>
            <input
              type="text"
              value={generateInvoiceForm.notes}
              onChange={ev => setGenerateInvoiceForm(f => ({ ...f, notes: ev.target.value }))}
              className={inputClass}
<<<<<<< HEAD
              placeholder="e.g. Paid via UPI, hotel category upgrade, etc."
=======
              placeholder="Any additional context for this invoice"
>>>>>>> a5195ca (Implement CRM spec sections 1-80 with full spec compliance)
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onSave} loading={savingInvoice}>
              Generate Invoice
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
