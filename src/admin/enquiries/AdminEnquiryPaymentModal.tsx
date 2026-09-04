// Track Payment modal — split out of AdminEnquiryDetail.tsx (that file was
// pushing 1750 lines). Pure presentational + form-state props, no data
// fetching of its own; the parent still owns paymentForm/paymentOpen state
// and handleSavePayment's save logic since those are shared with the rest
// of the page (e.g. openPayment() pre-filling from trip pricing).
//
// Used once a booking already exists, to record a further payment — the
// very first payment (before any booking exists) is now filled in directly
// on the page instead, via the same PaymentFormFields this wraps. See
// AdminEnquiryJourneyCard's "No Payment Yet" branch.
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import type { Enquiry, Payment } from '../../types/types-index';
import PaymentFormFields from './PaymentFormFields';
import type { PaymentErrors } from './PaymentFormFields';
import type { PaymentForm } from './AdminEnquiryCommon';

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
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Payment" size="sm">
      <div className="space-y-4">
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
          idPrefix="ed-pay"
        />

        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            variant="primary"
            size="md"
            onClick={onSave}
            loading={savingPayment}
            disabled={hasPaymentErrors}
            title={hasPaymentErrors ? 'Fix the highlighted fields before saving' : undefined}
            className="flex-1"
          >
            Save Payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
