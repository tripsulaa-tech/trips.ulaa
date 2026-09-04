// Booking Journey card — split out of AdminEnquiryDetail.tsx. Shows the
// lifecycle stepper + ledger once a booking exists, or — before any
// booking exists — the Track Payment fields themselves, filled in right
// here on the page rather than behind a popup, since recording the first
// payment is the very next thing an admin does with a brand-new enquiry.
import { CheckCircle as CheckCircle2, Clock, CurrencyInr as IndianRupee, FileText, Path, Wallet, Tag, Suitcase, PlusCircle, Percent } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import type { Enquiry, Payment } from '../../types/types-index';
import { formatPrice } from '../../utils/utils-index';
import { BookingLifecycleStepper } from './AdminEnquiryLifecycle';
import PaymentFormFields from './PaymentFormFields';
import type { PaymentErrors } from './PaymentFormFields';
import type { PaymentForm } from './AdminEnquiryCommon';

interface AdminEnquiryJourneyCardProps {
  enquiry: Enquiry;
  busyAction: boolean;
  onOpenPayment: () => void;
  onMarkCompleted: () => void;
  // Only needed for the pre-booking "No Payment Yet" state below, where
  // the Track Payment fields are inline rather than behind onOpenPayment's
  // modal — same form state/save path AdminEnquiryPaymentModal uses.
  paymentForm: PaymentForm;
  setPaymentForm: React.Dispatch<React.SetStateAction<PaymentForm>>;
  paymentErrors: PaymentErrors;
  hasPaymentErrors: boolean;
  savingPayment: boolean;
  onSavePayment: () => void;
  payments: Payment[];
  paymentsLoading: boolean;
  togglingNoShow: boolean;
  onToggleNoShow: (isNoShow: boolean) => void;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
}

export default function AdminEnquiryJourneyCard({
  enquiry, busyAction, onOpenPayment, onMarkCompleted,
  paymentForm, setPaymentForm, paymentErrors, hasPaymentErrors, savingPayment, onSavePayment,
  payments, paymentsLoading, togglingNoShow, onToggleNoShow, getTripPrice,
}: AdminEnquiryJourneyCardProps) {
  if (enquiry.booking_id) {
    const totalAmount = enquiry.total_amount || 0;
    const paidAmount = enquiry.amount_paid || 0;
    const pendingAmount = Math.max(0, totalAmount - paidAmount);
    const paidPercent = totalAmount > 0 ? Math.round(Math.min(1, paidAmount / totalAmount) * 100) : 0;
    // Discount is already netted into total_amount, and — per this actual
    // booking's numbers (₹47,999 total = ₹39,999 trip + ₹8,000 add-on,
    // still pending) — so is the add-on cost, whether or not it's been
    // collected yet. So back out "Trip Amount" (the base package price
    // alone) by removing add-ons and adding the discount back, rather
    // than re-deriving list price from the trip/package config (which
    // would need per-traveller multiplication that can't be verified from
    // here). Add-ons themselves aren't their own line item on the enquiry
    // — they only exist as payment_type: 'addon' rows in the ledger — and
    // the tile shows the full add-on cost regardless of paid/pending
    // status, same as Total Amount does, so a pending add-on doesn't just
    // disappear from the summary.
    const discountAmount = enquiry.discount_amount || 0;
    const addonsAmount = payments.reduce((sum, p) => sum + (p.payment_type === 'addon' ? p.amount : 0), 0);
    const tripAmount = Math.max(0, totalAmount - addonsAmount + discountAmount);
    // Complete Trip only earns primary/solid emphasis once the balance
    // is actually clear — otherwise it's visually competing with (and
    // outranking) Add Payment for an enquiry that isn't done being paid
    // for yet. Demoted to outline, same weight as Add Payment, until
    // pendingAmount clears; onMarkCompleted (see
    // AdminEnquiryDetail/useEnquiryLifecycle) separately confirms with the
    // admin before completing while a balance remains.
    return (
      <>
        {/* Booking Journey — kept as its own card (just the lifecycle
            stepper) rather than folded into Payment Overview below, since
            "what stage is this booking at" and "how much money has moved"
            are two different questions an admin scans for separately. */}
        <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
          <div>
            <p className="text-dark text-base font-display font-bold flex items-center gap-2">
              <Path size={18} className="shrink-0 text-primary" aria-hidden="true" /> Booking Journey
            </p>
            <p className="text-dark-muted text-xs mt-1">Track this booking's stage, payments, and balance.</p>
          </div>
          <BookingLifecycleStepper enquiry={enquiry} />
        </div>

        <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-dark text-base font-display font-bold flex items-center gap-2">
                <IndianRupee size={18} className="shrink-0 text-primary" aria-hidden="true" /> Payment Overview
              </p>
              <p className="text-dark-muted text-xs mt-1">Total amount, payments received and balance details.</p>
            </div>
            <div className="min-w-[140px] flex-1 sm:flex-none sm:w-44">
              <p className="text-right text-sm font-button font-bold text-dark mb-1.5">
                {paidPercent}% <span className="text-primary">Paid</span>
              </p>
              <div className="h-2 rounded-full bg-dark/10 overflow-hidden">
                <div className="h-full rounded-full bg-green-500 transition-[width] duration-500" style={{ width: `${paidPercent}%` }} />
              </div>
            </div>
          </div>

          {(discountAmount > 0 || addonsAmount > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {discountAmount > 0 && enquiry.discount_reason && (
                <span className="inline-flex items-center gap-1 text-[11px] font-button font-semibold text-green-700 bg-green-50 rounded-full px-2.5 py-1">
                  <Tag size={11} aria-hidden="true" /> {enquiry.discount_reason}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="flex items-center gap-2.5 bg-background-warm/60 border border-background-warm rounded-lg px-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
                <Suitcase size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-dark-muted text-[11px]">Trip Amount</p>
                <p className="text-dark text-sm font-bold">{formatPrice(tripAmount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 bg-background-warm/60 border border-background-warm rounded-lg px-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-sky-100 text-sky-600 inline-flex items-center justify-center shrink-0">
                <PlusCircle size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-dark-muted text-[11px]">Addons</p>
                <p className="text-sky-600 text-sm font-bold">{addonsAmount > 0 ? formatPrice(addonsAmount) : '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 bg-background-warm/60 border border-background-warm rounded-lg px-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-rose-100 text-rose-600 inline-flex items-center justify-center shrink-0">
                <Percent size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-dark-muted text-[11px]">Discount</p>
                <p className="text-rose-600 text-sm font-bold">{discountAmount > 0 ? `- ${formatPrice(discountAmount)}` : '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 bg-background-warm/60 border border-background-warm rounded-lg px-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0">
                <FileText size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-dark-muted text-[11px]">Total Amount</p>
                <p className="text-dark text-sm font-bold">{formatPrice(totalAmount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 bg-background-warm/60 border border-background-warm rounded-lg px-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-green-100 text-green-600 inline-flex items-center justify-center shrink-0">
                <CheckCircle2 size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-dark-muted text-[11px]">Paid Amount</p>
                <p className="text-green-700 text-sm font-bold">{formatPrice(paidAmount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 bg-background-warm/60 border border-background-warm rounded-lg px-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 inline-flex items-center justify-center shrink-0">
                <Clock size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-dark-muted text-[11px]">Balance</p>
                <p className="text-amber-600 text-sm font-bold">{formatPrice(pendingAmount)}</p>
              </div>
            </div>
          </div>

          <div className={`grid gap-2 ${enquiry.booking_status && enquiry.booking_status !== 'cancelled' && enquiry.booking_status !== 'completed' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Button
              variant={pendingAmount > 0 ? 'primary' : 'outline'}
              size="sm"
              fullWidth
              onClick={onOpenPayment}
            >
              <IndianRupee size={13} aria-hidden="true" /> Add Payment
            </Button>
            {enquiry.booking_status && enquiry.booking_status !== 'cancelled' && enquiry.booking_status !== 'completed' && (
              <Button
                variant={pendingAmount > 0 ? 'outline' : 'primary'}
                size="sm"
                fullWidth
                onClick={onMarkCompleted}
                disabled={busyAction}
                title={pendingAmount > 0 ? `${formatPrice(pendingAmount)} still pending on this booking` : undefined}
              >
                <CheckCircle2 size={13} aria-hidden="true" /> Complete Trip
              </Button>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-4">
      <div>
        <p className="text-dark text-base font-display font-bold flex items-center gap-2">
          <Wallet size={18} className="shrink-0 text-primary" aria-hidden="true" /> No Payment Yet
        </p>
        <p className="text-dark-muted text-xs mt-1">No booking exists on this enquiry yet — fill this in to track the first payment.</p>
      </div>

      <PaymentFormFields
        enquiry={enquiry}
        paymentForm={paymentForm}
        setPaymentForm={setPaymentForm}
        paymentErrors={paymentErrors}
        payments={payments}
        paymentsLoading={paymentsLoading}
        togglingNoShow={togglingNoShow}
        onToggleNoShow={onToggleNoShow}
        getTripPrice={getTripPrice}
        idPrefix="jc-pay"
        compact
      />

      <Button
        variant="primary"
        size="sm"
        onClick={onSavePayment}
        loading={savingPayment}
        disabled={hasPaymentErrors}
        title={hasPaymentErrors ? 'Fix the highlighted fields before saving' : undefined}
        className="w-full sm:w-auto"
      >
        <IndianRupee size={13} aria-hidden="true" /> Track Payment
      </Button>
    </div>
  );
}
