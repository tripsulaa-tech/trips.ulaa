// Booking Journey card — split out of AdminEnquiryDetail.tsx. Shows the
// lifecycle stepper + ledger once a booking exists, or — before any
// booking exists — the Track Payment fields themselves, filled in right
// here on the page rather than behind a popup, since recording the first
// payment is the very next thing an admin does with a brand-new enquiry.
import { CheckCircle as CheckCircle2, CurrencyInr as IndianRupee, Wallet } from '@phosphor-icons/react';
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
    return (
      <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-3">
        <p className="text-dark text-sm font-button font-semibold">Booking Journey</p>
        <BookingLifecycleStepper enquiry={enquiry} />
        <div className="grid grid-cols-3 gap-2 bg-background-warm rounded-md px-3 py-2.5">
          <div>
            <p className="text-dark-muted text-[11px]">Total</p>
            <p className="text-dark text-sm font-semibold">{formatPrice(enquiry.total_amount || 0)}</p>
          </div>
          <div>
            <p className="text-dark-muted text-[11px]">Paid</p>
            <p className="text-green-700 text-sm font-semibold">{formatPrice(enquiry.amount_paid || 0)}</p>
          </div>
          <div>
            <p className="text-dark-muted text-[11px]">Pending</p>
            <p className="text-amber-600 text-sm font-semibold">
              {formatPrice(Math.max(0, (enquiry.total_amount || 0) - (enquiry.amount_paid || 0)))}
            </p>
          </div>
        </div>

        <div className={`grid gap-2 ${enquiry.booking_status && enquiry.booking_status !== 'cancelled' && enquiry.booking_status !== 'completed' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Button variant="outline" size="sm" fullWidth onClick={onOpenPayment}>
            <IndianRupee size={13} aria-hidden="true" /> Payment
          </Button>
          {enquiry.booking_status && enquiry.booking_status !== 'cancelled' && enquiry.booking_status !== 'completed' && (
            <Button variant="primary" size="sm" fullWidth onClick={onMarkCompleted} disabled={busyAction}>
              <CheckCircle2 size={13} aria-hidden="true" /> Complete Trip
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
          <Wallet size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-dark text-sm font-semibold">No Payment Yet</p>
          <p className="text-dark-muted text-xs mt-0.5">No booking exists on this enquiry yet — fill this in to track the first payment.</p>
        </div>
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
