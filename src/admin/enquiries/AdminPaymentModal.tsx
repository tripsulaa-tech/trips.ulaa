import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import FoodMark from '../../components/ui/FoodMark';
import { useConfirm } from '../../components/ui/useConfirm';
import MethodReferenceFields from './MethodReferenceFields';
import { parseNonNegative, PACKAGE_OPTIONS, FOOD_PREFERENCE_OPTIONS, PAYMENT_METHOD_OPTIONS, REFUND_METHOD_OPTIONS, availablePaymentTypeOptions, clearsBalance, computeDiscountedTotal, validatePaymentForm, GENERATE_INVOICE_STATUS_OPTIONS, foodBadge, foodPreferenceKey } from './AdminEnquiryCommon';
import type { PaymentForm } from './AdminEnquiryCommon';
import type { Enquiry, Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { inputClass } from './AdminEnquiriesShared';
import PaymentHistoryList from './PaymentHistoryList';

export default function PaymentModal({
  paymentTarget,
  onClose,
  paymentForm,
  setPaymentForm,
  getTripPrice,
  getTripChildPrice,
  paymentHistory,
  paymentHistoryLoading,
  togglingNoShow,
  onToggleNoShow,
  onSave,
  savingPayment,
}: {
  paymentTarget: Enquiry | null;
  onClose: () => void;
  paymentForm: PaymentForm;
  setPaymentForm: Dispatch<SetStateAction<PaymentForm>>;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
  getTripChildPrice: (tripId: string | undefined) => number | undefined;
  paymentHistory: Payment[];
  paymentHistoryLoading: boolean;
  togglingNoShow: boolean;
  onToggleNoShow: (e: Enquiry, isNoShow: boolean) => void;
  onSave: () => void;
  savingPayment: boolean;
}) {
  const confirm = useConfirm();
  const errorClass = 'text-red-500 text-xs mt-1';
  // Live, field-level errors — recomputed on every render so a bad amount,
  // a missing payment method, etc. show up the moment the admin enters or
  // selects it, instead of only surfacing behind an alert() after Save.
  const paymentErrors = paymentTarget
    ? validatePaymentForm(paymentForm, paymentTarget.amount_paid || 0, paymentTarget.kids_count > 0
      ? { total: paymentForm.kids_amount === '' ? 0 : Number(paymentForm.kids_amount), alreadyPaid: paymentTarget.kids_amount_paid || 0 }
      : undefined)
    : {};
  // Only meaningful when a trip is linked — that's the list price a
  // discount comes off of. No-trip (general) enquiries have no list price,
  // so they keep the old free-typed Total Amount field further down.
  const listPrice = paymentTarget?.trip_id ? getTripPrice(paymentTarget.trip_id, paymentForm.package_type) : undefined;
  // Same idea, for the trip's flat per-kid price — see the Kids Fee
  // section further down.
  const kidsListPrice = paymentTarget?.trip_id ? getTripChildPrice(paymentTarget.trip_id) : undefined;
  const hasPaymentErrors = Object.keys(paymentErrors).length > 0;
  const isDirty =
    paymentForm.total_amount !== '' ||
    paymentForm.amount_paid !== '' ||
    paymentForm.payment_method !== '' ||
    paymentForm.payment_utr !== '' ||
    paymentForm.refund_amount !== '' ||
    paymentForm.refund_method !== '' ||
    paymentForm.refund_utr !== '' ||
    paymentForm.refund_notes !== '';

  // 'Balance' is only meant for the payment that actually zeroes out the
  // amount due — if the admin picked it and then edits the amount (or
  // total) so it no longer does, drop back to 'Installment' rather than
  // leaving 'Balance' selected but no longer true. See clearsBalance in
  // AdminEnquiryCommon.
  useEffect(() => {
    if (!paymentTarget) return;
    if (paymentForm.payment_type === 'balance' && !clearsBalance(paymentForm, paymentTarget.amount_paid || 0)) {
      setPaymentForm(f => ({ ...f, payment_type: 'installment' }));
    }
  }, [paymentTarget, paymentForm, setPaymentForm]);

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
    <Modal isOpen={!!paymentTarget} onClose={requestClose} title="Payment" size="sm">
      {paymentTarget && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-dark truncate">{paymentTarget.full_name}</p>
              <p className="text-dark-muted text-xs truncate">{paymentTarget.trip_title || 'No trip linked'}</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap shrink-0 ${foodBadge(paymentTarget).color}`}>
              <FoodMark type={foodPreferenceKey(paymentTarget)} size={11} aria-hidden="true" /> {foodBadge(paymentTarget).label}
            </span>
          </div>

          <div>
            <label htmlFor="pay-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              inputId="pay-food"
              value={paymentForm.food_preference}
              onChange={val => setPaymentForm(f => ({ ...f, food_preference: val as PaymentForm['food_preference'] }))}
              options={FOOD_PREFERENCE_OPTIONS}
            />
          </div>

          <div>
            <label htmlFor="pay-package" className="block text-sm font-medium text-dark mb-1">Package</label>
            <Select
              inputId="pay-package"
              value={paymentForm.package_type}
              onChange={val => {
                const packageType = val as Enquiry['package_type'];
                const suggested = getTripPrice(paymentTarget.trip_id, packageType);
                setPaymentForm(f => ({
                  ...f,
                  package_type: packageType,
                  total_amount: paymentTarget.trip_id
                    ? (computeDiscountedTotal(suggested, f.discount_amount) ?? f.total_amount)
                    : (suggested ?? f.total_amount),
                }));
              }}
              options={PACKAGE_OPTIONS}
            />
            {paymentTarget.trip_id && (
              <div className="text-xs mt-1">
                {(() => {
                  const normal = getTripPrice(paymentTarget.trip_id, 'normal');
                  const earlyBird = getTripPrice(paymentTarget.trip_id, 'early_bird');
                  const parts = [];
                  if (normal != null) parts.push(`Normal ${formatPrice(normal)}`);
                  if (earlyBird != null) parts.push(`Early Bird ${formatPrice(earlyBird)}`);
                  const missingOne = normal == null || earlyBird == null;
                  const missingField = normal == null && earlyBird == null
                    ? 'Regular Price per person and Early-Bird Price per person'
                    : normal == null
                      ? 'Regular Price per person'
                      : 'Early-Bird Price per person';

                  return (
                    <>
                      {parts.length > 0 && (
                        <p className="text-dark-muted">Trip price — {parts.join(' · ')}</p>
                      )}
                      {missingOne && (
                        <p className="text-amber-600 mt-0.5">
                          {parts.length === 0
                            ? "This trip has no price set, so we can't suggest an amount. "
                            : `This trip's ${missingField} isn't set yet. `}
                          Add it under{' '}
                          <Link to="/admin/trips" className="underline font-medium" onClick={onClose}>
                            Upcoming Trips → edit this trip → {missingField}
                          </Link>.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {paymentTarget.trip_id ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">List Price (₹)</label>
                <div className={`${inputClass} bg-background-warm text-dark-muted`}>
                  {listPrice != null ? formatPrice(listPrice) : 'Not set'}
                </div>
              </div>
              <div>
                <label htmlFor="pay-discount-amount" className="block text-sm font-medium text-dark mb-1">Discount (₹)</label>
                <input
                  id="pay-discount-amount"
                  type="number"
                  min={0}
                  value={paymentForm.payment_type === 'extra_charge' ? '' : paymentForm.discount_amount}
                  disabled={paymentForm.payment_type === 'extra_charge'}
                  onChange={e => {
                    const discount = parseNonNegative(e.target.value);
                    setPaymentForm(f => ({ ...f, discount_amount: discount, total_amount: computeDiscountedTotal(listPrice, discount) ?? f.total_amount }));
                  }}
                  className={`${inputClass} ${paymentForm.payment_type === 'extra_charge' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder={paymentForm.payment_type === 'extra_charge' ? 'Updates automatically' : 'e.g. 1000'}
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="pay-discount-reason" className="block text-sm font-medium text-dark mb-1">Discount Reason (optional)</label>
                <input
                  id="pay-discount-reason"
                  type="text"
                  value={paymentForm.discount_reason}
                  disabled={paymentForm.payment_type === 'extra_charge'}
                  onChange={e => setPaymentForm(f => ({ ...f, discount_reason: e.target.value }))}
                  className={`${inputClass} ${paymentForm.payment_type === 'extra_charge' ? 'opacity-60 cursor-not-allowed' : ''}`}
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
              <label htmlFor="pay-total-amount" className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
              <input
                id="pay-total-amount"
                type="number"
                min={0}
                value={paymentForm.payment_type === 'extra_charge' ? '' : paymentForm.total_amount}
                disabled={paymentForm.payment_type === 'extra_charge'}
                onChange={e => setPaymentForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                className={`${inputClass} ${paymentForm.payment_type === 'extra_charge' ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder={paymentForm.payment_type === 'extra_charge' ? 'Updates automatically' : 'e.g. 15000'}
              />
            </div>
          )}

          <div>
            <label htmlFor="pay-amount-paid" className="block text-sm font-medium text-dark mb-1">
              {paymentForm.payment_type === 'extra_charge' ? 'Extra Charge Amount (₹)' : 'Amount Being Paid Now (₹)'}
            </label>
            <input
              id="pay-amount-paid"
              type="number"
              min={0}
              value={paymentForm.amount_paid}
              onChange={e => setPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
              aria-invalid={!!paymentErrors.amount_paid}
              aria-describedby={paymentErrors.amount_paid ? 'pay-amount-paid-error' : undefined}
              className={inputClass}
              placeholder="e.g. 5000"
            />
            {paymentErrors.amount_paid && <p id="pay-amount-paid-error" role="alert" className={errorClass}>{paymentErrors.amount_paid}</p>}
          </div>

          {/* This transaction's own amount + a manually-picked type — same
              shape as Generate Invoice, rather than asking for a new
              running total and inferring the label from it. */}
          <div>
            <label htmlFor="pay-type" className="block text-sm font-medium text-dark mb-1">Payment Type</label>
            <Select
              inputId="pay-type"
              value={paymentForm.payment_type}
              onChange={val => setPaymentForm(f => ({ ...f, payment_type: val as PaymentForm['payment_type'] }))}
              options={availablePaymentTypeOptions(paymentForm, paymentTarget.amount_paid || 0)}
            />
            {paymentForm.payment_type === 'extra_charge' && (
              <p className="text-[11px] text-dark-muted mt-1">
                Adds this amount on top of the booking's total amount right away — e.g. a hotel upgrade — whether or not it's collected now.
              </p>
            )}
            {paymentForm.payment_type !== 'extra_charge' && !clearsBalance(paymentForm, paymentTarget.amount_paid || 0) && (
              <p className="text-[11px] text-dark-muted mt-1">
                'Balance' will appear here once the amount above clears what's still owed.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="pay-status" className="block text-sm font-medium text-dark mb-1">Status</label>
            <Select
              inputId="pay-status"
              value={paymentForm.status}
              onChange={val => setPaymentForm(f => ({ ...f, status: val as PaymentForm['status'] }))}
              options={GENERATE_INVOICE_STATUS_OPTIONS}
            />
          </div>

          {(() => {
            const alreadyPaid = paymentTarget.amount_paid || 0;
            const thisPayment = paymentForm.amount_paid === '' ? 0 : Number(paymentForm.amount_paid);
            const isExtraCharge = paymentForm.payment_type === 'extra_charge';
            const isPending = paymentForm.status === 'pending';
            // Extra Charge (collected now) and a normal paid-now payment both
            // land in amount_paid right away; a Pending invoice — extra
            // charge or otherwise — doesn't touch it until it's later marked
            // paid, so the preview shouldn't claim it does.
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

          {paymentForm.status === 'paid' && (
            <div className="grid grid-cols-2 gap-3">
              <MethodReferenceFields
                idPrefix="pay"
                methodLabel="Payment Method"
                value={paymentForm.payment_method}
                onChange={val => setPaymentForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
                utrValue={paymentForm.payment_utr}
                onUtrChange={val => setPaymentForm(f => ({ ...f, payment_utr: val }))}
                options={PAYMENT_METHOD_OPTIONS}
                utrPlaceholderExample="e.g. 426817XXXXXX"
                inputClassName={inputClass}
                selectSize="sm"
                methodError={paymentErrors.payment_method}
                utrError={paymentErrors.payment_utr}
                errorClassName={errorClass}
              />
            </div>
          )}

          {paymentTarget.kids_count > 0 && (
            <div className="bg-amber-50/60 rounded-md p-3 space-y-3">
              <p className="text-xs font-medium text-amber-800">
                Kids Fee — tracked independently of the adult booking above ({paymentTarget.kids_count} kid{paymentTarget.kids_count > 1 ? 's' : ''})
              </p>
              {kidsListPrice != null && (
                <p className="text-xs text-dark-muted">
                  Trip's per-kid price — <span className="font-medium text-dark">{formatPrice(kidsListPrice)}</span> × {paymentTarget.kids_count} = <span className="font-medium text-dark">{formatPrice(kidsListPrice * paymentTarget.kids_count)}</span>
                </p>
              )}
              <div>
                <label htmlFor="pay-kids-total" className="block text-sm font-medium text-dark mb-1">Kids Fee Total (₹)</label>
                <input
                  id="pay-kids-total"
                  type="number"
                  min={0}
                  value={paymentForm.kids_amount}
                  onChange={e => setPaymentForm(f => ({ ...f, kids_amount: parseNonNegative(e.target.value) }))}
                  className={inputClass}
                  placeholder={kidsListPrice != null ? `e.g. ${kidsListPrice * paymentTarget.kids_count}` : 'e.g. 6000'}
                />
                <p className="text-[11px] text-dark-muted mt-1">
                  Prefilled from the trip's per-kid price above — override if it needs correcting for this booking.
                </p>
              </div>
              <p className="text-sm text-dark-muted">
                Kids total <span className="font-medium text-dark">{formatPrice(paymentForm.kids_amount === '' ? 0 : Number(paymentForm.kids_amount))}</span>
                {' · '}already paid <span className="font-medium text-dark">{formatPrice(paymentTarget.kids_amount_paid || 0)}</span>
                {' · '}pending <span className="font-medium text-dark">{formatPrice(Math.max(0, (paymentForm.kids_amount === '' ? 0 : Number(paymentForm.kids_amount)) - (paymentTarget.kids_amount_paid || 0)))}</span>
              </p>
              <div>
                <label htmlFor="pay-kids-amount" className="block text-sm font-medium text-dark mb-1">Kids Amount Being Paid Now (₹)</label>
                <input
                  id="pay-kids-amount"
                  type="number"
                  min={0}
                  value={paymentForm.kids_amount_paid}
                  onChange={e => setPaymentForm(f => ({ ...f, kids_amount_paid: parseNonNegative(e.target.value) }))}
                  aria-invalid={!!paymentErrors.kids_amount_paid}
                  aria-describedby={paymentErrors.kids_amount_paid ? 'pay-kids-amount-error' : undefined}
                  className={inputClass}
                  placeholder="e.g. 2000"
                />
                {paymentErrors.kids_amount_paid && <p id="pay-kids-amount-error" role="alert" className={errorClass}>{paymentErrors.kids_amount_paid}</p>}
                <p className="text-[11px] text-dark-muted mt-1">Uses the same payment method/UTR entered above for this transaction.</p>
              </div>
            </div>
          )}

          {/* Inline payment history (Phase F) — read-only ledger so an
              admin can see exactly what's already been recorded before
              changing the running total above. */}
          <PaymentHistoryList
            payments={paymentHistory}
            loading={paymentHistoryLoading}
            labelId="pay-history-label"
            discountAmount={paymentTarget.discount_amount}
            discountReason={paymentTarget.discount_reason}
          />

          {paymentTarget.cancelled_at && (
            <div className="bg-red-50 rounded-md p-3 space-y-2">
              <p className="text-red-700 text-xs font-medium">This booking is cancelled. Track any refund here as you process it.</p>
              <label className="flex items-start gap-2 text-xs text-dark cursor-pointer bg-white/60 rounded px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={paymentTarget.is_no_show}
                  disabled={togglingNoShow}
                  onChange={ev => onToggleNoShow(paymentTarget, ev.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Mark as <span className="font-medium">no-show</span>
                  <span className="block text-[11px] text-dark-muted">No refund is given for no-shows, per policy — this locks the refund amount to ₹0. Unchecking unlocks it and recalculates the suggestion from the cancellation window.</span>
                </span>
              </label>
              {paymentTarget.is_no_show ? (
                <p className="text-xs text-dark-muted bg-white/60 rounded px-2 py-1.5">
                  No refund — no-shows forfeit the full amount paid, per policy.
                </p>
              ) : paymentTarget.suggested_refund_amount != null && (
                <p className="text-xs text-dark-muted bg-white/60 rounded px-2 py-1.5">
                  Suggested refund (estimate — not binding, confirm before use): <span className="font-semibold text-dark">{formatPrice(paymentTarget.suggested_refund_amount)}</span>
                  {paymentTarget.third_party_charges ? ` — after ${formatPrice(paymentTarget.third_party_charges)} in third-party charges` : ''}
                </p>
              )}
              <div>
                <label htmlFor="pay-refund-amount" className="block text-sm font-medium text-dark mb-1">Refund Amount (₹)</label>
                <input
                  id="pay-refund-amount"
                  type="number"
                  min={0}
                  value={paymentForm.refund_amount}
                  disabled={paymentTarget.is_no_show}
                  onChange={e => setPaymentForm(f => ({ ...f, refund_amount: parseNonNegative(e.target.value) }))}
                  aria-describedby="pay-refund-amount-hint"
                  className={`${inputClass} ${paymentTarget.is_no_show ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder="How much has been refunded so far"
                />
                <p id="pay-refund-amount-hint" className="text-[11px] text-dark-muted mt-1">
                  {paymentTarget.is_no_show
                    ? 'Locked at ₹0 for no-shows. Uncheck "no-show" above to enter a refund.'
                    : `They paid ${formatPrice(paymentTarget.amount_paid || 0)} in total.`}
                </p>
                {paymentErrors.refund_amount && <p role="alert" className={errorClass}>{paymentErrors.refund_amount}</p>}
              </div>

              {!paymentTarget.is_no_show && (
                <div className="grid grid-cols-2 gap-3">
                  <MethodReferenceFields
                    idPrefix="pay-refund"
                    methodLabel="Refund Method"
                    value={paymentForm.refund_method}
                    onChange={val => setPaymentForm(f => ({ ...f, refund_method: val, refund_utr: val === 'Cash' ? '' : f.refund_utr }))}
                    utrValue={paymentForm.refund_utr}
                    onUtrChange={val => setPaymentForm(f => ({ ...f, refund_utr: val }))}
                    options={REFUND_METHOD_OPTIONS}
                    utrLabel="Refund UTR / Reference"
                    utrPlaceholderExample="e.g. 987654XXXX"
                    inputClassName={inputClass}
                    selectSize="sm"
                    methodError={paymentErrors.refund_method}
                    utrError={paymentErrors.refund_utr}
                    errorClassName={errorClass}
                  />
                  <div className="col-span-2">
                    <label htmlFor="pay-refund-date" className="block text-sm font-medium text-dark mb-1">Refund Date</label>
                    <input
                      id="pay-refund-date"
                      type="date"
                      value={paymentForm.refund_date}
                      onChange={e => setPaymentForm(f => ({ ...f, refund_date: e.target.value }))}
                      className={`${inputClass} text-sm`}
                    />
                  </div>
                </div>
              )}

              {!paymentTarget.is_no_show && (
                <div>
                  <label htmlFor="pay-refund-notes" className="block text-sm font-medium text-dark mb-1">Refund Notes (optional)</label>
                  <textarea
                    id="pay-refund-notes"
                    value={paymentForm.refund_notes}
                    onChange={e => setPaymentForm(f => ({ ...f, refund_notes: e.target.value }))}
                    rows={2}
                    className={`${inputClass} resize-none`}
                    placeholder="e.g. partial refund after cancellation charges"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
              onClick={onSave}
              loading={savingPayment}
              disabled={hasPaymentErrors}
              title={hasPaymentErrors ? 'Fix the highlighted fields before saving' : undefined}
            >
              Save Payment
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
