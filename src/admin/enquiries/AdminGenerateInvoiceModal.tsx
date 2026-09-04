import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Baby } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import { useConfirm } from '../../components/ui/useConfirm';
import { parseNonNegative, availableInvoiceTypeOptions, clearsBalanceForInvoice, validateGenerateInvoiceForm, GENERATE_INVOICE_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS, refPlaceholder } from './AdminEnquiryCommon';
import type { GenerateInvoiceForm } from './AdminEnquiryCommon';
import type { Enquiry, Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { inputClass } from './AdminEnquiriesShared';
import PaymentHistoryList from './PaymentHistoryList';

// Raises one invoice line (Full Payment / Advance / Balance / Installment /
// Add-on) against whichever booking it was opened from. "Paid now"
// records real money via recordTypedPayment/addAddonCharge; "Pending"
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
  paymentHistory,
  paymentHistoryLoading,
}: {
  generateInvoiceTarget: Enquiry | null;
  onClose: () => void;
  generateInvoiceForm: GenerateInvoiceForm;
  setGenerateInvoiceForm: Dispatch<SetStateAction<GenerateInvoiceForm>>;
  onSave: () => void;
  savingInvoice: boolean;
  paymentHistory: Payment[];
  paymentHistoryLoading: boolean;
}) {
  const confirm = useConfirm();
  const errorClass = 'text-red-500 text-xs mt-1';
  // Whether the Amount field has been blurred yet — the "amount required"
  // error would otherwise fire the instant the modal opens (amount starts
  // at ''), before the admin has looked at the field. Resets whenever a
  // new target is opened.
  const [amountTouched, setAmountTouched] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting local "touched" tracking to match a newly-opened target, not syncing an external system
    setAmountTouched(false);
  }, [generateInvoiceTarget?.id]);

  // Live, field-level errors — recomputed on every render so a missing
  // amount, payment method, etc. show up as the admin fills the form,
  // instead of only surfacing behind an alert() after Save. Gated on
  // amountTouched so the "amount required" error (and everything that
  // depends on a real amount) doesn't flash the moment the modal opens,
  // before the admin has looked at the field — same reasoning as Track
  // Payment's touch-gating, just needed here since amount is required
  // rather than merely bounded.
  const invoiceErrors = generateInvoiceTarget ? validateGenerateInvoiceForm(generateInvoiceForm, amountTouched) : {};
  const hasInvoiceErrors = Object.keys(invoiceErrors).length > 0;

  // 'Balance' is only meant for the invoice that actually zeroes out the
  // amount due — if the admin picked it and then edits the amount so it
  // no longer does, drop back to 'Installment' rather than leaving
  // 'Balance' selected but no longer true. See clearsBalanceForInvoice in
  // AdminEnquiryCommon.
  useEffect(() => {
    if (!generateInvoiceTarget) return;
    if (generateInvoiceForm.type === 'balance' && !clearsBalanceForInvoice(generateInvoiceForm, generateInvoiceTarget.total_amount || 0, generateInvoiceTarget.amount_paid || 0)) {
      setGenerateInvoiceForm(f => ({ ...f, type: 'installment' }));
    }
  }, [generateInvoiceTarget, generateInvoiceForm, setGenerateInvoiceForm]);

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
    <Modal isOpen={!!generateInvoiceTarget} onClose={requestClose} title="Add Invoice" size="sm">
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
            <label htmlFor="gi-type" className="block text-sm font-medium text-dark mb-1">Type</label>
            <Select
              inputId="gi-type"
              value={generateInvoiceForm.type}
              onChange={val => setGenerateInvoiceForm(f => ({ ...f, type: val }))}
              options={availableInvoiceTypeOptions(generateInvoiceForm, generateInvoiceTarget.total_amount || 0, generateInvoiceTarget.amount_paid || 0)}
            />
            {generateInvoiceForm.type === 'addon' && (
              <>
                <p className="text-[11px] text-dark-muted mt-1">
                  Adds this amount on top of the booking's total amount right away — e.g. a hotel upgrade — whether or not it's collected now.
                </p>
                {/* Quick preset for the common case: this traveller wants to
                    bring a child along. ULAA trips aren't built around kids
                    (no separate child pricing/seat type), so this is just a
                    one-off add-on against an existing enquiry rather than a
                    field on the public booking form — same Add-on
                    mechanism as any other add-on, with the note pre-filled.
                    Toggles the note text; the amount is still entered below,
                    since it varies per trip. */}
                <button
                  type="button"
                  onClick={() => setGenerateInvoiceForm(f => ({ ...f, notes: f.notes === 'Child fare' ? '' : 'Child fare' }))}
                  aria-pressed={generateInvoiceForm.notes === 'Child fare'}
                  className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-colors ${
                    generateInvoiceForm.notes === 'Child fare'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-background-warm text-dark-muted hover:border-primary/40'
                  }`}
                >
                  <Baby size={13} aria-hidden="true" /> Child Fare
                </button>
              </>
            )}
            {generateInvoiceForm.type !== 'addon' && !clearsBalanceForInvoice(generateInvoiceForm, generateInvoiceTarget.total_amount || 0, generateInvoiceTarget.amount_paid || 0) && (
              <p className="text-[11px] text-dark-muted mt-1">
                'Balance' will appear here once the amount below clears what's still owed.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="gi-amount" className="block text-sm font-medium text-dark mb-1">Amount (₹)</label>
            <input
              id="gi-amount"
              type="number"
              min={0}
              value={generateInvoiceForm.amount}
              onChange={ev => setGenerateInvoiceForm(f => ({ ...f, amount: parseNonNegative(ev.target.value) }))}
              onBlur={() => setAmountTouched(true)}
              aria-invalid={!!invoiceErrors.amount}
              aria-describedby={invoiceErrors.amount ? 'gi-amount-error' : undefined}
              className={inputClass}
              placeholder="Amount for this invoice"
            />
            {invoiceErrors.amount && <p id="gi-amount-error" role="alert" className={errorClass}>{invoiceErrors.amount}</p>}
          </div>

          <div>
            <label htmlFor="gi-status" className="block text-sm font-medium text-dark mb-1">Status</label>
            <Select
              inputId="gi-status"
              value={generateInvoiceForm.status}
              onChange={val => setGenerateInvoiceForm(f => ({ ...f, status: val }))}
              options={GENERATE_INVOICE_STATUS_OPTIONS}
            />
          </div>

          {(() => {
            const alreadyPaid = generateInvoiceTarget.amount_paid || 0;
            const thisAmount = generateInvoiceForm.amount === '' ? 0 : Number(generateInvoiceForm.amount);
            const isExtraCharge = generateInvoiceForm.type === 'addon';
            const isPending = generateInvoiceForm.status === 'pending';
            // Add-on (collected now) and a normal paid-now invoice both
            // land in amount_paid right away; a Pending invoice — extra
            // charge or otherwise — doesn't touch it until it's later marked
            // paid, so the preview shouldn't claim it does.
            const projectedTotal = isPending ? alreadyPaid : alreadyPaid + thisAmount;
            const projectedBookingTotal = isExtraCharge
              ? (generateInvoiceTarget.total_amount || 0) + thisAmount
              : (generateInvoiceTarget.total_amount || 0);
            return (
              <p className="text-sm text-dark-muted">
                Already paid <span className="font-medium text-dark">{formatPrice(alreadyPaid)}</span>
                {thisAmount > 0 && !isPending && <> · after this payment: <span className="font-semibold text-dark">{formatPrice(projectedTotal)}</span></>}
                {thisAmount > 0 && isPending && <> · <span className="font-semibold text-amber-700">{formatPrice(thisAmount)} raised as pending</span>, not yet counted as paid</>}
                {isExtraCharge && thisAmount > 0 && <> · booking total will rise by <span className="font-semibold text-dark">{formatPrice(thisAmount)}</span></>}
                {' '}· Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, projectedBookingTotal - projectedTotal))}</span>
              </p>
            );
          })()}

          {generateInvoiceForm.status === 'paid' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="gi-payment-method" className="block text-sm font-medium text-dark mb-1">Payment Method</label>
                <Select
                  inputId="gi-payment-method"
                  value={generateInvoiceForm.payment_method}
                  onChange={val => setGenerateInvoiceForm(f => ({ ...f, payment_method: val, utr_number: val === 'Cash' ? '' : f.utr_number }))}
                  options={PAYMENT_METHOD_OPTIONS}
                  placeholder="Select method"
                  size="sm"
                />
                {invoiceErrors.payment_method && <p role="alert" className={errorClass}>{invoiceErrors.payment_method}</p>}
              </div>
              <div>
                <label htmlFor="gi-utr" className="block text-sm font-medium text-dark mb-1">UTR / Reference</label>
                <input
                  id="gi-utr"
                  type="text"
                  value={generateInvoiceForm.utr_number}
                  disabled={generateInvoiceForm.payment_method === 'Cash'}
                  onChange={ev => setGenerateInvoiceForm(f => ({ ...f, utr_number: ev.target.value }))}
                  className={`${inputClass} ${generateInvoiceForm.payment_method === 'Cash' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder={refPlaceholder(generateInvoiceForm.payment_method, 'e.g. 426817XXXXXX')}
                />
                {invoiceErrors.utr_number && <p role="alert" className={errorClass}>{invoiceErrors.utr_number}</p>}
              </div>
            </div>
          )}

          <PaymentHistoryList
            payments={paymentHistory}
            loading={paymentHistoryLoading}
            discountAmount={generateInvoiceTarget?.discount_amount}
            discountReason={generateInvoiceTarget?.discount_reason}
          />

          <div>
            <label htmlFor="gi-notes" className="block text-sm font-medium text-dark mb-1">Notes (optional)</label>
            <input
              id="gi-notes"
              type="text"
              value={generateInvoiceForm.notes}
              onChange={ev => setGenerateInvoiceForm(f => ({ ...f, notes: ev.target.value }))}
              className={inputClass}
              placeholder="Any additional context for this invoice"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
              onClick={() => {
                setAmountTouched(true);
                onSave();
              }}
              loading={savingInvoice}
              disabled={hasInvoiceErrors}
              title={hasInvoiceErrors ? 'Fix the highlighted fields before saving' : undefined}
            >
              Add Invoice
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
