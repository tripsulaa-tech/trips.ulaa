// One kid's own Payment modal — deliberately a smaller sibling of
// AdminPaymentModal/AdminEnquiryPaymentModal: Total (read-only, sourced
// from the trip's own child_price), Amount Paid Now, Payment Type/Status,
// Method/UTR, Food Preference, and this kid's own ledger — with none of
// the package/discount/refund/extra-charge machinery those carry, since a
// kid doesn't get its own seat, package, or cancellation flow (v1 — see
// useKidPayment.ts). State/save logic live in useKidPayment, shared
// by both the Enquiries list table and the enquiry detail page's Kids
// card, so this component is purely presentational, same pattern as
// AdminEnquiryPaymentModal relative to useEnquiryPayment.
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import { useConfirm } from '../../components/ui/useConfirm';
import MethodReferenceFields from './MethodReferenceFields';
import PaymentHistoryList from './PaymentHistoryList';
import { PAYMENT_METHOD_OPTIONS, FOOD_PREFERENCE_OPTIONS, GENERATE_INVOICE_STATUS_OPTIONS, parseNonNegative } from './AdminEnquiryCommon';
import { inputClass } from './AdminEnquiriesShared';
import type { Kid, Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { validateKidPaymentForm, availableKidPaymentTypeOptions } from './useKidPayment';
import type { KidPaymentForm } from './useKidPayment';

export default function AdminKidPaymentModal({
  kidPaymentTarget,
  fallbackLabel,
  onClose,
  kidPaymentForm,
  setKidPaymentForm,
  kidPaymentChildPrice,
  kidPaymentHistory,
  kidPaymentHistoryLoading,
  savingKidPayment,
  onSave,
}: {
  kidPaymentTarget: Kid | null;
  /** "Kid N" (or the kid's own name) — same fallback the Kids card/list rows use, so the modal title always matches what the admin just clicked. */
  fallbackLabel: string;
  onClose: () => void;
  kidPaymentForm: KidPaymentForm;
  setKidPaymentForm: Dispatch<SetStateAction<KidPaymentForm>>;
  /** The trip's live per-kid fee (upcoming_trips.child_price) — undefined when no trip's linked or the trip hasn't set one, in which case Total falls back to displaying whatever this kid's own record already holds. */
  kidPaymentChildPrice: number | undefined;
  kidPaymentHistory: Payment[];
  kidPaymentHistoryLoading: boolean;
  savingKidPayment: boolean;
  onSave: () => void;
}) {
  const confirm = useConfirm();
  const errorClass = 'text-red-500 text-xs mt-1';

  const kidErrors = kidPaymentTarget
    ? validateKidPaymentForm(kidPaymentForm, kidPaymentTarget.amount_paid || 0)
    : {};
  const hasKidErrors = Object.keys(kidErrors).length > 0;
  const isDirty =
    kidPaymentForm.amount_paid !== '' ||
    kidPaymentForm.payment_method !== '' ||
    kidPaymentForm.payment_utr !== '' ||
    kidPaymentForm.payment_type !== 'advance' ||
    kidPaymentForm.status !== 'paid' ||
    (kidPaymentForm.food_preference || null) !== (kidPaymentTarget?.food_preference ?? null);

  // Displayed Total — the trip's live fee wins; falls back to whatever
  // this kid's own record already has (e.g. no trip linked, or the trip
  // never set a Kids Fee) so an existing kid doesn't suddenly show
  // "Not set". Never admin-typed — see useKidPayment's openKidPayment.
  const displayTotal = kidPaymentChildPrice ?? (kidPaymentTarget?.amount || undefined);

  // Same steer-away-from-'Balance' idea as AdminPaymentModal's own effect —
  // if the admin picked 'Balance' and then the numbers change so it no
  // longer clears what's owed, drop back to 'Installment' rather than
  // leaving 'Balance' selected but no longer true.
  useEffect(() => {
    if (!kidPaymentTarget) return;
    const stillClears = availableKidPaymentTypeOptions(kidPaymentForm, kidPaymentTarget.amount_paid || 0).some(o => o.value === 'balance');
    if (kidPaymentForm.payment_type === 'balance' && !stillClears) {
      setKidPaymentForm(f => ({ ...f, payment_type: 'installment' }));
    }
  }, [kidPaymentTarget, kidPaymentForm, setKidPaymentForm]);

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: "You've entered payment details that haven't been saved yet.",
        confirmLabel: 'Discard',
        cancelLabel: 'Continue Editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal isOpen={!!kidPaymentTarget} onClose={requestClose} title={`${fallbackLabel} — Payment`} size="sm">
      {kidPaymentTarget && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3">
            <p className="font-medium text-dark truncate">{fallbackLabel}</p>
            <p className="text-dark-muted text-xs truncate">Own payment record — independent of the rest of this booking.</p>
          </div>

          <div>
            <label htmlFor="kid-pay-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              inputId="kid-pay-food"
              value={kidPaymentForm.food_preference}
              onChange={val => setKidPaymentForm(f => ({ ...f, food_preference: val as KidPaymentForm['food_preference'] }))}
              options={FOOD_PREFERENCE_OPTIONS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Total (₹)</label>
            <div className={`${inputClass} bg-background-warm text-dark-muted`}>
              {displayTotal != null ? formatPrice(displayTotal) : 'Not set'}
            </div>
            <p className="text-[11px] text-dark-muted mt-1">
              {displayTotal != null
                ? "Set by this trip's Kids Fee — not editable here."
                : (
                  <>
                    This trip has no Kids Fee set. Add it under{' '}
                    <Link to="/admin/trips" className="underline font-medium" onClick={onClose}>
                      Upcoming Trips → edit this trip → Kids Fee
                    </Link>.
                  </>
                )}
            </p>
          </div>

          <div>
            <label htmlFor="kid-pay-amount-paid" className="block text-sm font-medium text-dark mb-1">
              {kidPaymentForm.status === 'pending' ? 'Invoice Amount (₹)' : 'Amount Being Paid Now (₹)'}
            </label>
            <input
              id="kid-pay-amount-paid"
              type="number"
              min={0}
              value={kidPaymentForm.amount_paid}
              onChange={e => setKidPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
              aria-invalid={!!kidErrors.amount_paid}
              aria-describedby={kidErrors.amount_paid ? 'kid-pay-amount-paid-error' : undefined}
              className={inputClass}
              placeholder="e.g. 1000"
            />
            {kidErrors.amount_paid && <p id="kid-pay-amount-paid-error" role="alert" className={errorClass}>{kidErrors.amount_paid}</p>}
          </div>

          <div>
            <label htmlFor="kid-pay-type" className="block text-sm font-medium text-dark mb-1">Payment Type</label>
            <Select
              inputId="kid-pay-type"
              value={kidPaymentForm.payment_type}
              onChange={val => setKidPaymentForm(f => ({ ...f, payment_type: val as KidPaymentForm['payment_type'] }))}
              options={availableKidPaymentTypeOptions(kidPaymentForm, kidPaymentTarget.amount_paid || 0)}
            />
            {!availableKidPaymentTypeOptions(kidPaymentForm, kidPaymentTarget.amount_paid || 0).some(o => o.value === 'balance') && (
              <p className="text-[11px] text-dark-muted mt-1">
                'Balance' will appear here once the amount above clears what's still owed.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="kid-pay-status" className="block text-sm font-medium text-dark mb-1">Status</label>
            <Select
              inputId="kid-pay-status"
              value={kidPaymentForm.status}
              onChange={val => setKidPaymentForm(f => ({ ...f, status: val as KidPaymentForm['status'] }))}
              options={GENERATE_INVOICE_STATUS_OPTIONS}
            />
          </div>

          {(() => {
            const alreadyPaid = kidPaymentTarget.amount_paid || 0;
            const thisPayment = kidPaymentForm.amount_paid === '' ? 0 : Number(kidPaymentForm.amount_paid);
            const isPending = kidPaymentForm.status === 'pending';
            const projectedTotal = isPending ? alreadyPaid : alreadyPaid + thisPayment;
            const total = kidPaymentForm.amount === '' ? null : Number(kidPaymentForm.amount);
            return (
              <p className="text-sm text-dark-muted">
                Already paid <span className="font-medium text-dark">{formatPrice(alreadyPaid)}</span>
                {thisPayment > 0 && !isPending && <> · after this payment: <span className="font-semibold text-dark">{formatPrice(projectedTotal)}</span></>}
                {thisPayment > 0 && isPending && <> · <span className="font-semibold text-amber-700">{formatPrice(thisPayment)} raised as pending</span>, not yet counted as paid</>}
                {total != null && (
                  <> · Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, total - projectedTotal))}</span></>
                )}
              </p>
            );
          })()}

          {kidPaymentForm.status === 'paid' && (
            <div className="grid grid-cols-2 gap-3">
              <MethodReferenceFields
                idPrefix="kid-pay"
                methodLabel="Payment Method"
                value={kidPaymentForm.payment_method}
                onChange={val => setKidPaymentForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
                utrValue={kidPaymentForm.payment_utr}
                onUtrChange={val => setKidPaymentForm(f => ({ ...f, payment_utr: val }))}
                options={PAYMENT_METHOD_OPTIONS}
                utrPlaceholderExample="e.g. 426817XXXXXX"
                inputClassName={inputClass}
                selectSize="sm"
                methodError={kidErrors.payment_method}
                utrError={kidErrors.payment_utr}
                errorClassName={errorClass}
              />
            </div>
          )}

          <PaymentHistoryList
            payments={kidPaymentHistory}
            loading={kidPaymentHistoryLoading}
            labelId="kid-pay-history-label"
          />

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
              onClick={onSave}
              loading={savingKidPayment}
              disabled={hasKidErrors}
              title={hasKidErrors ? 'Fix the highlighted fields before saving' : undefined}
            >
              Save Payment
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
