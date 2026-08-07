import type { Dispatch, SetStateAction } from 'react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Select from '../../../components/ui/Select';
import { parseNonNegative, GENERATE_INVOICE_TYPE_OPTIONS, GENERATE_INVOICE_STATUS_OPTIONS } from '../../enquiryShared';
import type { GenerateInvoiceForm } from '../../enquiryShared';
import type { Enquiry } from '../../../types/types-index';
import { formatPrice } from '../../../utils/utils-index';
import { inputClass } from '../adminEnquiriesShared';

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
  return (
    <Modal isOpen={!!generateInvoiceTarget} onClose={onClose} title="Generate Invoice" size="sm">
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

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Notes (optional)</label>
            <input
              type="text"
              value={generateInvoiceForm.notes}
              onChange={ev => setGenerateInvoiceForm(f => ({ ...f, notes: ev.target.value }))}
              className={inputClass}
              placeholder="e.g. Paid via UPI, hotel category upgrade, etc."
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
