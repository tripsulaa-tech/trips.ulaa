// The actual kid Payment field set — split out of AdminKidPaymentModal so
// the exact same fields/validation/behaviour can be rendered two ways:
// inside a Modal (the Kids card / Enquiries list / standalone Kids list,
// where a kid is one of several rows and a popup keeps the surrounding
// list uncluttered) or directly inline on the page (AdminKidDetail — a
// page about exactly one kid, where the popup added a click for no real
// benefit; see AdminEnquiryDetail's own PaymentFormFields split for the
// adult-side precedent this mirrors). Neither caller owns any of this
// state; it's all still lifted from useKidPayment, same as before the
// split.
import { Link } from 'react-router-dom';
import Select from '../../components/ui/Select';
import MethodReferenceFields from './MethodReferenceFields';
import PaymentHistoryList from './PaymentHistoryList';
import { PAYMENT_METHOD_OPTIONS, GENERATE_INVOICE_STATUS_OPTIONS, parseNonNegative } from './AdminEnquiryCommon';
import { inputClass } from './AdminEnquiriesShared';
import type { Kid, Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { availableKidPaymentTypeOptions } from './useKidPayment';
import type { KidPaymentForm, KidPaymentFormErrors } from './useKidPayment';

interface KidPaymentFormFieldsProps {
  kid: Kid;
  kidPaymentForm: KidPaymentForm;
  setKidPaymentForm: React.Dispatch<React.SetStateAction<KidPaymentForm>>;
  /** Computed by the caller via validateKidPaymentForm — same "caller validates, this component only displays" split as the adult side's PaymentFormFields/paymentErrors. */
  kidErrors: KidPaymentFormErrors;
  /** The trip's live per-kid fee (upcoming_trips.child_price) — undefined when no trip's linked or the trip hasn't set one, in which case Total falls back to displaying whatever this kid's own record already holds. */
  kidPaymentChildPrice: number | undefined;
  kidPaymentHistory: Payment[];
  kidPaymentHistoryLoading: boolean;
  idPrefix?: string;
  /** Only meaningful inside the Modal, which needs a way back to Upcoming Trips → edit trip that also closes itself first. Omitted on the inline page — there's no popup to close. */
  onNavigateAway?: () => void;
}

export default function KidPaymentFormFields({
  kid, kidPaymentForm, setKidPaymentForm, kidErrors, kidPaymentChildPrice,
  kidPaymentHistory, kidPaymentHistoryLoading, idPrefix = 'kid-pay', onNavigateAway,
}: KidPaymentFormFieldsProps) {
  const errorClass = 'text-red-500 text-xs mt-1';

  // Displayed Total — the trip's live fee wins; falls back to whatever
  // this kid's own record already has (e.g. no trip linked, or the trip
  // never set a Kids Fee) so an existing kid doesn't suddenly show
  // "Not set". Never admin-typed — see useKidPayment's openKidPayment.
  const displayTotal = kidPaymentChildPrice ?? (kid.amount || undefined);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Total (₹)</label>
          <div className={`${inputClass} bg-background-warm text-dark-muted`}>
            {displayTotal != null ? formatPrice(displayTotal) : 'Not set'}
          </div>
          <p className="text-[11px] text-dark-muted mt-1">
            {kidPaymentForm.payment_type === 'extra_charge'
              ? 'Updates automatically once the extra charge below is saved.'
              : displayTotal != null
              ? "Set by this trip's Kids Fee — not editable here."
              : (
                <>
                  This trip has no Kids Fee set. Add it under{' '}
                  <Link to="/admin/trips" className="underline font-medium" onClick={onNavigateAway}>
                    Upcoming Trips → edit this trip → Kids Fee
                  </Link>.
                </>
              )}
          </p>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-amount-paid`} className="block text-sm font-medium text-dark mb-1">
            {kidPaymentForm.payment_type === 'extra_charge'
              ? 'Extra Charge Amount (₹)'
              : kidPaymentForm.status === 'pending' ? 'Invoice Amount (₹)' : 'Amount Being Paid Now (₹)'}
          </label>
          <input
            id={`${idPrefix}-amount-paid`}
            type="number"
            min={0}
            value={kidPaymentForm.amount_paid}
            onChange={e => setKidPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
            aria-invalid={!!kidErrors.amount_paid}
            aria-describedby={kidErrors.amount_paid ? `${idPrefix}-amount-paid-error` : undefined}
            className={inputClass}
            placeholder="e.g. 1000"
          />
          {kidErrors.amount_paid && <p id={`${idPrefix}-amount-paid-error`} role="alert" className={errorClass}>{kidErrors.amount_paid}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-type`} className="block text-sm font-medium text-dark mb-1">Payment Type</label>
          <Select
            inputId={`${idPrefix}-type`}
            value={kidPaymentForm.payment_type}
            onChange={val => setKidPaymentForm(f => ({ ...f, payment_type: val as KidPaymentForm['payment_type'] }))}
            options={availableKidPaymentTypeOptions(kidPaymentForm, kid.amount_paid || 0)}
          />
          {kidPaymentForm.payment_type === 'extra_charge' && (
            <p className="text-[11px] text-dark-muted mt-1">
              Adds this amount on top of this kid's total right away — e.g. a costume rental — whether or not it's collected now.
            </p>
          )}
          {kidPaymentForm.payment_type !== 'extra_charge' && !availableKidPaymentTypeOptions(kidPaymentForm, kid.amount_paid || 0).some(o => o.value === 'balance') && (
            <p className="text-[11px] text-dark-muted mt-1">
              'Balance' will appear here once the amount above clears what's still owed.
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${idPrefix}-status`} className="block text-sm font-medium text-dark mb-1">Status</label>
          <Select
            inputId={`${idPrefix}-status`}
            value={kidPaymentForm.status}
            onChange={val => setKidPaymentForm(f => ({ ...f, status: val as KidPaymentForm['status'] }))}
            options={GENERATE_INVOICE_STATUS_OPTIONS}
          />
        </div>
      </div>

      {(() => {
        const alreadyPaid = kid.amount_paid || 0;
        const thisPayment = kidPaymentForm.amount_paid === '' ? 0 : Number(kidPaymentForm.amount_paid);
        const isExtraCharge = kidPaymentForm.payment_type === 'extra_charge';
        const isPending = kidPaymentForm.status === 'pending';
        // Extra Charge (collected now) and a normal paid-now payment
        // both land in amount_paid right away; a Pending invoice —
        // extra charge or otherwise — doesn't touch it until it's
        // later marked paid, same as the adult modal's own preview.
        const projectedTotal = isPending ? alreadyPaid : alreadyPaid + thisPayment;
        const total = kidPaymentForm.amount === '' ? null : Number(kidPaymentForm.amount);
        const projectedKidTotal = isExtraCharge && total != null ? total + thisPayment : total;
        return (
          <p className="text-sm text-dark-muted">
            Already paid <span className="font-medium text-dark">{formatPrice(alreadyPaid)}</span>
            {thisPayment > 0 && !isPending && <> · after this payment: <span className="font-semibold text-dark">{formatPrice(projectedTotal)}</span></>}
            {thisPayment > 0 && isPending && <> · <span className="font-semibold text-amber-700">{formatPrice(thisPayment)} raised as pending</span>, not yet counted as paid</>}
            {isExtraCharge && thisPayment > 0 && <> · this kid's total will rise by <span className="font-semibold text-dark">{formatPrice(thisPayment)}</span></>}
            {projectedKidTotal != null && (
              <> · Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, projectedKidTotal - projectedTotal))}</span></>
            )}
          </p>
        );
      })()}

      {kidPaymentForm.status === 'paid' && (
        <div className="grid grid-cols-2 gap-3">
          <MethodReferenceFields
            idPrefix={idPrefix}
            methodLabel="Payment Method"
            value={kidPaymentForm.payment_method}
            onChange={val => setKidPaymentForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
            utrValue={kidPaymentForm.payment_utr}
            onUtrChange={val => setKidPaymentForm(f => ({ ...f, payment_utr: val }))}
            options={PAYMENT_METHOD_OPTIONS}
            utrPlaceholderExample="e.g. 426817XXXXXX"
            inputClassName={inputClass}
            methodError={kidErrors.payment_method}
            utrError={kidErrors.payment_utr}
            errorClassName={errorClass}
          />
        </div>
      )}

      <PaymentHistoryList
        payments={kidPaymentHistory}
        loading={kidPaymentHistoryLoading}
        labelId={`${idPrefix}-history-label`}
      />
    </div>
  );
}
