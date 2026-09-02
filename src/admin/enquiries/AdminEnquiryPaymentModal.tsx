// Track Payment modal — split out of AdminEnquiryDetail.tsx (that file was
// pushing 1750 lines). Pure presentational + form-state props, no data
// fetching of its own; the parent still owns paymentForm/paymentOpen state
// and handleSavePayment's save logic since those are shared with the rest
// of the page (e.g. openPayment() pre-filling from trip pricing).
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import type { Enquiry, Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import MethodReferenceFields from './MethodReferenceFields';
import {
  parseNonNegative, PACKAGE_OPTIONS, GENERATE_INVOICE_STATUS_OPTIONS,
  availablePaymentTypeOptions, clearsBalance, computeDiscountedTotal, FOOD_PREFERENCE_OPTIONS,
  REFUND_METHOD_OPTIONS, PAYMENT_METHOD_OPTIONS,
} from './AdminEnquiryCommon';
import type { PaymentForm } from './AdminEnquiryCommon';
import PaymentHistoryList from './PaymentHistoryList';

type PaymentErrors = Partial<Record<
  'amount_paid' | 'payment_method' | 'payment_utr' | 'refund_amount' | 'refund_method' | 'refund_utr' | 'kids_amount_paid',
  string
>>;

interface AdminEnquiryPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry;
  paymentForm: PaymentForm;
  setPaymentForm: React.Dispatch<React.SetStateAction<PaymentForm>>;
  paymentErrors: PaymentErrors;
  hasPaymentErrors: boolean;
  savingPayment: boolean;
  onSave: () => void;
  payments: Payment[];
  paymentsLoading: boolean;
  togglingNoShow: boolean;
  onToggleNoShow: (isNoShow: boolean) => void;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
}

export default function AdminEnquiryPaymentModal({
  isOpen, onClose, enquiry, paymentForm, setPaymentForm, paymentErrors, hasPaymentErrors,
  savingPayment, onSave, payments, paymentsLoading, togglingNoShow, onToggleNoShow, getTripPrice,
}: AdminEnquiryPaymentModalProps) {
  const paymentErrorClass = 'text-red-500 text-xs mt-1';
  const fieldClass = 'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none';
  // Only meaningful when a trip is linked — no-trip (general) enquiries
  // have no list price, so they keep the old free-typed Total Amount field.
  const listPrice = enquiry.trip_id ? getTripPrice(enquiry.trip_id, paymentForm.package_type) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Payment" size="sm">
      <div className="space-y-4">
        <div>
          <label htmlFor="ed-pay-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
          <Select
            inputId="ed-pay-food"
            value={paymentForm.food_preference}
            onChange={val => setPaymentForm(f => ({ ...f, food_preference: val as PaymentForm['food_preference'] }))}
            options={FOOD_PREFERENCE_OPTIONS}
          />
        </div>
        <div>
          <label htmlFor="ed-pay-package" className="block text-sm font-medium text-dark mb-1">Package</label>
          <Select
            inputId="ed-pay-package"
            value={paymentForm.package_type}
            onChange={val => {
              const packageType = val as Enquiry['package_type'];
              const suggested = getTripPrice(enquiry.trip_id, packageType);
              setPaymentForm(f => ({
                ...f,
                package_type: packageType,
                total_amount: enquiry.trip_id
                  ? (computeDiscountedTotal(suggested, f.discount_amount) ?? f.total_amount)
                  : (suggested ?? f.total_amount),
              }));
            }}
            options={PACKAGE_OPTIONS}
          />
        </div>
        {enquiry.trip_id ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">List Price (₹)</label>
              <div className={`${fieldClass} bg-background-warm text-dark-muted`}>
                {listPrice != null ? formatPrice(listPrice) : 'Not set'}
              </div>
            </div>
            <div>
              <label htmlFor="ed-pay-discount" className="block text-sm font-medium text-dark mb-1">Discount (₹)</label>
              <input
                id="ed-pay-discount"
                type="number"
                min={0}
                value={paymentForm.payment_type === 'extra_charge' ? '' : paymentForm.discount_amount}
                disabled={paymentForm.payment_type === 'extra_charge'}
                onChange={e => {
                  const discount = parseNonNegative(e.target.value);
                  setPaymentForm(f => ({ ...f, discount_amount: discount, total_amount: computeDiscountedTotal(listPrice, discount) ?? f.total_amount }));
                }}
                className={`${fieldClass} ${paymentForm.payment_type === 'extra_charge' ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder={paymentForm.payment_type === 'extra_charge' ? 'Updates automatically' : 'e.g. 1000'}
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="ed-pay-discount-reason" className="block text-sm font-medium text-dark mb-1">Discount Reason (optional)</label>
              <input
                id="ed-pay-discount-reason"
                type="text"
                value={paymentForm.discount_reason}
                disabled={paymentForm.payment_type === 'extra_charge'}
                onChange={e => setPaymentForm(f => ({ ...f, discount_reason: e.target.value }))}
                className={`${fieldClass} ${paymentForm.payment_type === 'extra_charge' ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder="e.g. repeat customer, referral"
              />
            </div>
            <div className="col-span-2">
              <p className="text-sm text-dark-muted">
                Total Amount: <span className="font-semibold text-dark">{paymentForm.total_amount === '' ? 'Not set' : formatPrice(Number(paymentForm.total_amount))}</span>
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="ed-pay-total" className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
            <input
              id="ed-pay-total"
              type="number"
              min={0}
              value={paymentForm.payment_type === 'extra_charge' ? '' : paymentForm.total_amount}
              disabled={paymentForm.payment_type === 'extra_charge'}
              onChange={e => setPaymentForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
              className={`${fieldClass} ${paymentForm.payment_type === 'extra_charge' ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder={paymentForm.payment_type === 'extra_charge' ? 'Updates automatically' : 'e.g. 15000'}
            />
          </div>
        )}

        <div>
          <label htmlFor="ed-pay-amount-paid" className="block text-sm font-medium text-dark mb-1">
            {paymentForm.payment_type === 'extra_charge' ? 'Extra Charge Amount (₹)' : 'Amount Being Paid Now (₹)'}
          </label>
          <input
            id="ed-pay-amount-paid"
            type="number"
            min={0}
            value={paymentForm.amount_paid}
            onChange={e => setPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
            aria-invalid={!!paymentErrors.amount_paid}
            aria-describedby={paymentErrors.amount_paid ? 'ed-pay-amount-paid-error' : undefined}
            className={fieldClass}
            placeholder="e.g. 5000"
          />
          {paymentErrors.amount_paid && <p id="ed-pay-amount-paid-error" role="alert" className={paymentErrorClass}>{paymentErrors.amount_paid}</p>}
        </div>

        {/* This transaction's own amount + a manually-picked type — same
            shape as Generate Invoice, rather than a running total the
            label gets inferred from. */}
        <div>
          <label htmlFor="ed-pay-type" className="block text-sm font-medium text-dark mb-1">Payment Type</label>
          <Select
            inputId="ed-pay-type"
            value={paymentForm.payment_type}
            onChange={val => setPaymentForm(f => ({ ...f, payment_type: val as PaymentForm['payment_type'] }))}
            options={availablePaymentTypeOptions(paymentForm, enquiry.amount_paid || 0)}
          />
          {paymentForm.payment_type === 'extra_charge' && (
            <p className="text-[11px] text-dark-muted mt-1">
              Adds this amount on top of the booking's total amount right away — e.g. a hotel upgrade — whether or not it's collected now.
            </p>
          )}
          {paymentForm.payment_type !== 'extra_charge' && !clearsBalance(paymentForm, enquiry.amount_paid || 0) && (
            <p className="text-[11px] text-dark-muted mt-1">
              'Balance' will appear here once the amount above clears what's still owed.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ed-pay-status" className="block text-sm font-medium text-dark mb-1">Status</label>
          <Select
            inputId="ed-pay-status"
            value={paymentForm.status}
            onChange={val => setPaymentForm(f => ({ ...f, status: val as PaymentForm['status'] }))}
            options={GENERATE_INVOICE_STATUS_OPTIONS}
          />
        </div>

        {paymentForm.status === 'paid' && (
          <div className="grid grid-cols-2 gap-3">
            <MethodReferenceFields
              idPrefix="ed-pay"
              methodLabel="Payment Method"
              value={paymentForm.payment_method}
              onChange={val => setPaymentForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
              utrValue={paymentForm.payment_utr}
              onUtrChange={val => setPaymentForm(f => ({ ...f, payment_utr: val }))}
              options={PAYMENT_METHOD_OPTIONS}
              utrPlaceholderExample="e.g. 426817XXXXXX"
              inputClassName="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              methodError={paymentErrors.payment_method}
              utrError={paymentErrors.payment_utr}
              errorClassName={paymentErrorClass}
            />
          </div>
        )}

        {(() => {
          const alreadyPaid = enquiry.amount_paid || 0;
          const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
          const isExtraCharge = paymentForm.payment_type === 'extra_charge';
          const isPending = paymentForm.status === 'pending';
          const projectedTotal = isPending ? alreadyPaid : alreadyPaid + thisPayment;
          const projectedBookingTotal = isExtraCharge && paymentForm.total_amount !== ''
            ? Number(paymentForm.total_amount) + thisPayment
            : paymentForm.total_amount === '' ? null : Number(paymentForm.total_amount);
          return (
            <p className="text-sm text-dark-muted">
              Already paid <span className="font-medium text-dark">{formatPrice(alreadyPaid)}</span>
              {thisPayment > 0 && !isPending && <> · after this payment: <span className="font-semibold text-dark">{formatPrice(projectedTotal)}</span></>}
              {thisPayment > 0 && isPending && <> · <span className="font-semibold text-amber-700">{formatPrice(thisPayment)} raised as pending</span>, not yet counted as paid</>}
              {isExtraCharge && thisPayment > 0 && <> · booking total will rise by <span className="font-semibold text-dark">{formatPrice(thisPayment)}</span></>}
              {projectedBookingTotal != null && (
                <> · Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, projectedBookingTotal - projectedTotal))}</span></>
              )}
            </p>
          );
        })()}

        <PaymentHistoryList
          payments={payments}
          loading={paymentsLoading}
          showUtrNumber={false}
          discountAmount={enquiry.discount_amount}
          discountReason={enquiry.discount_reason}
        />

        {enquiry.cancelled_at && (
          <div className="bg-red-50 rounded-md p-3 space-y-2">
            <p className="text-red-700 text-xs font-medium">This booking is cancelled. Track any refund here as you process it.</p>
            <label className="flex items-start gap-2 text-xs text-dark cursor-pointer bg-white/60 rounded px-2 py-1.5">
              <input
                type="checkbox"
                checked={enquiry.is_no_show}
                disabled={togglingNoShow}
                onChange={ev => onToggleNoShow(ev.target.checked)}
                className="mt-0.5"
              />
              <span>
                Mark as <span className="font-medium">no-show</span>
                <span className="block text-[11px] text-dark-muted">No refund is given for no-shows, per policy — this locks the refund amount to ₹0.</span>
              </span>
            </label>
            {!enquiry.is_no_show && (
              <div>
                <label htmlFor="ed-refund-amount" className="block text-sm font-medium text-dark mb-1">Refund Amount (₹)</label>
                <input
                  id="ed-refund-amount"
                  type="number"
                  min={0}
                  value={paymentForm.refund_amount}
                  onChange={e => setPaymentForm(f => ({ ...f, refund_amount: parseNonNegative(e.target.value) }))}
                  aria-describedby={paymentErrors.refund_amount ? 'ed-refund-amount-error' : undefined}
                  className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                  placeholder="How much has been refunded so far"
                />
                {paymentErrors.refund_amount && <p id="ed-refund-amount-error" role="alert" className={paymentErrorClass}>{paymentErrors.refund_amount}</p>}
              </div>
            )}
            {!enquiry.is_no_show && (
              <div className="grid grid-cols-2 gap-3">
                <MethodReferenceFields
                  idPrefix="ed-refund"
                  methodLabel="Refund Method"
                  value={paymentForm.refund_method}
                  onChange={val => setPaymentForm(f => ({ ...f, refund_method: val, refund_utr: val === 'Cash' ? '' : f.refund_utr }))}
                  utrValue={paymentForm.refund_utr}
                  onUtrChange={val => setPaymentForm(f => ({ ...f, refund_utr: val }))}
                  options={REFUND_METHOD_OPTIONS}
                  utrLabel="Refund UTR / Reference"
                  utrPlaceholderExample="e.g. 987654XXXX"
                  inputClassName="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                  selectSize="sm"
                  methodError={paymentErrors.refund_method}
                  utrError={paymentErrors.refund_utr}
                  errorClassName={paymentErrorClass}
                />
                <div className="col-span-2">
                  <label htmlFor="ed-refund-date" className="block text-sm font-medium text-dark mb-1">Refund Date</label>
                  <input
                    id="ed-refund-date"
                    type="date"
                    value={paymentForm.refund_date}
                    onChange={e => setPaymentForm(f => ({ ...f, refund_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                  />
                </div>
              </div>
            )}
            {!enquiry.is_no_show && (
              <div>
                <label htmlFor="ed-refund-notes" className="block text-sm font-medium text-dark mb-1">Refund Notes (optional)</label>
                <textarea
                  id="ed-refund-notes"
                  value={paymentForm.refund_notes}
                  onChange={e => setPaymentForm(f => ({ ...f, refund_notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none resize-none"
                  placeholder="e.g. partial refund after cancellation charges"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            onClick={onSave}
            loading={savingPayment}
            disabled={hasPaymentErrors}
            title={hasPaymentErrors ? 'Fix the highlighted fields before saving' : undefined}
          >
            Save Payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
