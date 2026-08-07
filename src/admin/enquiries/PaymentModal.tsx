import type { Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Select from '../../../components/ui/Select';
import FoodMark from '../../../components/ui/FoodMark';
import { parseNonNegative, PACKAGE_OPTIONS, FOOD_PREFERENCE_OPTIONS, INVOICE_TYPE_LABEL, foodBadge, foodPreferenceKey } from '../../enquiryShared';
import type { PaymentForm } from '../../enquiryShared';
import type { Enquiry, Payment } from '../../../types/types-index';
import { formatDate, formatPrice } from '../../../utils/utils-index';
import { inputClass } from '../adminEnquiriesShared';

export default function PaymentModal({
  paymentTarget,
  onClose,
  paymentForm,
  setPaymentForm,
  getTripPrice,
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
  paymentHistory: Payment[];
  paymentHistoryLoading: boolean;
  togglingNoShow: boolean;
  onToggleNoShow: (e: Enquiry, isNoShow: boolean) => void;
  onSave: () => void;
  savingPayment: boolean;
}) {
  return (
    <Modal isOpen={!!paymentTarget} onClose={onClose} title="Track Payment" size="sm">
      {paymentTarget && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-dark truncate">{paymentTarget.full_name}</p>
              <p className="text-dark-muted text-xs truncate">{paymentTarget.trip_title || 'No trip linked'}</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-[10px] font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap shrink-0 ${foodBadge(paymentTarget).color}`}>
              <FoodMark type={foodPreferenceKey(paymentTarget)} size={11} /> {foodBadge(paymentTarget).label}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              value={paymentForm.food_preference}
              onChange={val => setPaymentForm(f => ({ ...f, food_preference: val as PaymentForm['food_preference'] }))}
              options={FOOD_PREFERENCE_OPTIONS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Package</label>
            <Select
              value={paymentForm.package_type}
              onChange={val => {
                const packageType = val as Enquiry['package_type'];
                const suggested = getTripPrice(paymentTarget.trip_id, packageType);
                setPaymentForm(f => ({ ...f, package_type: packageType, total_amount: suggested ?? f.total_amount }));
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
              <input
                type="number"
                min={0}
                value={paymentForm.total_amount}
                onChange={e => setPaymentForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                className={inputClass}
                placeholder="e.g. 15000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
              <input
                type="number"
                min={0}
                value={paymentForm.amount_paid}
                onChange={e => setPaymentForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
                className={inputClass}
                placeholder="e.g. 5000 (advance)"
              />
            </div>
          </div>

          {paymentForm.total_amount !== '' && paymentForm.amount_paid !== '' && (
            <p className="text-sm text-dark-muted">
              Balance due: <span className="font-semibold text-dark">{formatPrice(Math.max(0, Number(paymentForm.total_amount) - Number(paymentForm.amount_paid)))}</span>
            </p>
          )}

          {/* Inline payment history (Phase F) — read-only ledger so an
              admin can see exactly what's already been recorded before
              changing the running total above. */}
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Payment History</label>
            {paymentHistoryLoading ? (
              <p className="text-xs text-dark-muted">Loading…</p>
            ) : paymentHistory.length === 0 ? (
              <p className="text-xs text-dark-muted bg-background-warm rounded-md px-3 py-2">No payments recorded yet.</p>
            ) : (
              <div className="border border-background-warm rounded-md divide-y divide-background-warm max-h-40 overflow-y-auto">
                {paymentHistory.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                    <div className="min-w-0">
                      <p className="text-dark font-medium truncate">
                        {INVOICE_TYPE_LABEL[p.payment_type] || p.payment_type}
                        {p.status === 'pending' && <span className="text-amber-600 font-normal"> · pending</span>}
                      </p>
                      <p className="text-dark-muted">
                        {p.paid_at ? formatDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not yet paid'}
                        {p.payment_method ? ` · ${p.payment_method}` : ''}
                      </p>
                    </div>
                    <p className={`shrink-0 font-semibold ${p.payment_type === 'refund' ? 'text-red-600' : 'text-green-700'}`}>
                      {p.payment_type === 'refund' ? '−' : ''}{formatPrice(p.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                <label className="block text-sm font-medium text-dark mb-1">Refund Amount (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={paymentForm.refund_amount}
                  disabled={paymentTarget.is_no_show}
                  onChange={e => setPaymentForm(f => ({ ...f, refund_amount: parseNonNegative(e.target.value) }))}
                  className={`${inputClass} ${paymentTarget.is_no_show ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder="How much has been refunded so far"
                />
                <p className="text-[11px] text-dark-muted mt-1">
                  {paymentTarget.is_no_show
                    ? 'Locked at ₹0 for no-shows. Uncheck "no-show" above to enter a refund.'
                    : `They paid ${formatPrice(paymentTarget.amount_paid || 0)} in total.`}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onSave} loading={savingPayment}>Save Payment</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
