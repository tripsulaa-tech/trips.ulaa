// The actual Track Payment field set — split out of AdminEnquiryPaymentModal
// so the exact same fields/validation/behaviour can be rendered two ways:
// inside a Modal (once a booking already exists and the admin is adding a
// further payment) or directly inline on the page (the "No Payment Yet"
// state on AdminEnquiryDetail, before any booking exists — no popup needed
// for the very first payment). Neither caller owns any of this state; it's
// all still lifted to AdminEnquiryDetail, same as before the split.
import Select from '../../components/ui/Select';
import type { Enquiry, Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import MethodReferenceFields from './MethodReferenceFields';
import {
  parseNonNegative, PACKAGE_OPTIONS, GENERATE_INVOICE_STATUS_OPTIONS,
  availablePaymentTypeOptions, clearsBalance, computeDiscountedTotal,
  REFUND_METHOD_OPTIONS, PAYMENT_METHOD_OPTIONS,
} from './AdminEnquiryCommon';
import type { PaymentForm } from './AdminEnquiryCommon';
import PaymentHistoryList from './PaymentHistoryList';

export type PaymentErrors = Partial<Record<
  'amount_paid' | 'payment_method' | 'payment_utr' | 'refund_amount' | 'refund_method' | 'refund_utr',
  string
>>;

interface PaymentFormFieldsProps {
  enquiry: Enquiry;
  paymentForm: PaymentForm;
  setPaymentForm: React.Dispatch<React.SetStateAction<PaymentForm>>;
  paymentErrors: PaymentErrors;
  payments: Payment[];
  paymentsLoading: boolean;
  togglingNoShow: boolean;
  onToggleNoShow: (isNoShow: boolean) => void;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
  idPrefix?: string;
  // Pairs up fields that are otherwise single, full-width rows (Food
  // Preference/Package, Amount Being Paid Now/Payment Type) into a 2-col
  // grid on sm+ screens. Off by default so the narrow payment Modal keeps
  // its single-column layout; the wide inline "No Payment Yet" card on
  // AdminEnquiryJourneyCard turns it on since it has the room to spare.
  compact?: boolean;
}

export default function PaymentFormFields({
  enquiry, paymentForm, setPaymentForm, paymentErrors, payments, paymentsLoading,
  togglingNoShow, onToggleNoShow, getTripPrice, idPrefix = 'ed-pay', compact = false,
}: PaymentFormFieldsProps) {
  const paymentErrorClass = 'text-red-500 text-xs mt-1';
  const fieldClass = 'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none';
  // Only meaningful when a trip is linked — no-trip (general) enquiries
  // have no list price, so they keep the old free-typed Total Amount field.
  const listPrice = enquiry.trip_id ? getTripPrice(enquiry.trip_id, paymentForm.package_type) : undefined;
  // space-y-4 in non-compact mode reproduces the original stacked spacing
  // for these two fields; grid+gap-4 in compact mode sits them side by side.
  const pairClass = compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-4';

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <label htmlFor={`${idPrefix}-package`} className="block text-sm font-medium text-dark mb-1">Package</label>
          <Select
            inputId={`${idPrefix}-package`}
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
      )}
      {enquiry.trip_id ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">List Price (₹)</label>
            <div className={`${fieldClass} bg-background-warm text-dark-muted`}>
              {listPrice != null ? formatPrice(listPrice) : 'Not set'}
            </div>
            <p className="text-[11px] text-dark-muted mt-1">Trip's price for this package, before discount</p>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-discount`} className="block text-sm font-medium text-dark mb-1">Discount (₹)</label>
            <input
              id={`${idPrefix}-discount`}
              type="number"
              min={0}
              value={paymentForm.payment_type === 'addon' ? '' : paymentForm.discount_amount}
              disabled={paymentForm.payment_type === 'addon'}
              onChange={e => {
                const discount = parseNonNegative(e.target.value);
                setPaymentForm(f => ({ ...f, discount_amount: discount, total_amount: computeDiscountedTotal(listPrice, discount) ?? f.total_amount }));
              }}
              className={`${fieldClass} ${paymentForm.payment_type === 'addon' ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder={paymentForm.payment_type === 'addon' ? 'Updates automatically' : 'e.g. 1000'}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor={`${idPrefix}-discount-reason`} className="block text-sm font-medium text-dark mb-1">Discount Reason (optional)</label>
            <input
              id={`${idPrefix}-discount-reason`}
              type="text"
              value={paymentForm.discount_reason}
              disabled={paymentForm.payment_type === 'addon'}
              onChange={e => setPaymentForm(f => ({ ...f, discount_reason: e.target.value }))}
              className={`${fieldClass} ${paymentForm.payment_type === 'addon' ? 'opacity-60 cursor-not-allowed' : ''}`}
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
          <label htmlFor={`${idPrefix}-total`} className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
          <input
            id={`${idPrefix}-total`}
            type="number"
            min={0}
            value={paymentForm.payment_type === 'addon' ? '' : paymentForm.total_amount}
            disabled={paymentForm.payment_type === 'addon'}
            onChange={e => setPaymentForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
            className={`${fieldClass} ${paymentForm.payment_type === 'addon' ? 'opacity-60 cursor-not-allowed' : ''}`}
            placeholder={paymentForm.payment_type === 'addon' ? 'Updates automatically' : 'e.g. 15000'}
          />
        </div>
      )}

      <div className={pairClass}>
        <div>
          <label htmlFor={`${idPrefix}-amount-paid`} className="block text-sm font-medium text-dark mb-1">
            {paymentForm.payment_type === 'addon' ? 'Add-on Amount (₹)' : 'Amount Being Paid Now (₹)'}
          </label>
          <input
            id={`${idPrefix}-amount-paid`}
            type="number"
            min={0}
            value={paymentForm.amount_paid}
            onChange={e => setPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
            aria-invalid={!!paymentErrors.amount_paid}
            aria-describedby={paymentErrors.amount_paid ? `${idPrefix}-amount-paid-error` : undefined}
            className={fieldClass}
            placeholder="e.g. 5000"
          />
          {paymentErrors.amount_paid && <p id={`${idPrefix}-amount-paid-error`} role="alert" className={paymentErrorClass}>{paymentErrors.amount_paid}</p>}
        </div>

        {/* This transaction's own amount + a manually-picked type — same
            shape as Generate Invoice, rather than a running total the
            label gets inferred from. */}
        <div>
          <label htmlFor={`${idPrefix}-type`} className="block text-sm font-medium text-dark mb-1">Payment Type</label>
          <Select
            inputId={`${idPrefix}-type`}
            value={paymentForm.payment_type}
            onChange={val => setPaymentForm(f => ({ ...f, payment_type: val as PaymentForm['payment_type'] }))}
            options={availablePaymentTypeOptions(paymentForm, enquiry.amount_paid || 0)}
          />
          {paymentForm.payment_type === 'addon' && (
            <p className="text-[11px] text-dark-muted mt-1">
              Adds this amount on top of the booking's total amount right away — e.g. a hotel upgrade — whether or not it's collected now.
            </p>
          )}
          {paymentForm.payment_type !== 'addon' && !clearsBalance(paymentForm, enquiry.amount_paid || 0) && (
            <p className="text-[11px] text-dark-muted mt-1">
              'Balance' will appear here once the amount above clears what's still owed.
            </p>
          )}
        </div>
      </div>

      <div className={compact ? 'sm:max-w-[calc(50%-0.5rem)]' : ''}>
        <label htmlFor={`${idPrefix}-status`} className="block text-sm font-medium text-dark mb-1">Status</label>
        <Select
          inputId={`${idPrefix}-status`}
          value={paymentForm.status}
          onChange={val => setPaymentForm(f => ({ ...f, status: val as PaymentForm['status'] }))}
          options={GENERATE_INVOICE_STATUS_OPTIONS}
        />
      </div>

      {paymentForm.status === 'paid' && (
        <div className="grid grid-cols-2 gap-3">
          <MethodReferenceFields
            idPrefix={idPrefix}
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
        const isExtraCharge = paymentForm.payment_type === 'addon';
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
              <label htmlFor={`${idPrefix}-refund-amount`} className="block text-sm font-medium text-dark mb-1">Refund Amount (₹)</label>
              <input
                id={`${idPrefix}-refund-amount`}
                type="number"
                min={0}
                value={paymentForm.refund_amount}
                onChange={e => setPaymentForm(f => ({ ...f, refund_amount: parseNonNegative(e.target.value) }))}
                aria-describedby={paymentErrors.refund_amount ? `${idPrefix}-refund-amount-error` : undefined}
                className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
                placeholder="How much has been refunded so far"
              />
              {paymentErrors.refund_amount && <p id={`${idPrefix}-refund-amount-error`} role="alert" className={paymentErrorClass}>{paymentErrors.refund_amount}</p>}
            </div>
          )}
          {!enquiry.is_no_show && (
            <div className="grid grid-cols-2 gap-3">
              <MethodReferenceFields
                idPrefix={`${idPrefix}-refund`}
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
                <label htmlFor={`${idPrefix}-refund-date`} className="block text-sm font-medium text-dark mb-1">Refund Date</label>
                <input
                  id={`${idPrefix}-refund-date`}
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
              <label htmlFor={`${idPrefix}-refund-notes`} className="block text-sm font-medium text-dark mb-1">Refund Notes (optional)</label>
              <textarea
                id={`${idPrefix}-refund-notes`}
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
    </div>
  );
}
