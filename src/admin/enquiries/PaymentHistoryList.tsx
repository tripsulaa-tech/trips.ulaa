import { INVOICE_TYPE_LABEL } from './AdminEnquiryCommon';
import type { Payment } from '../../types/types-index';
import { formatDate, formatPrice } from '../../utils/utils-index';

// Read-only payment ledger, shown inside the Payment / Generate Invoice
// modals and on the enquiry detail page so an admin can see exactly what's
// already been recorded before changing the running total above it.
// Extracted from three near-identical copies (AdminPaymentModal,
// AdminGenerateInvoiceModal, AdminEnquiryDetail) — see those callers for
// where each is used.
//
// `labelId` and `showUtrNumber` exist only to preserve two small
// differences that existed between the original copies: AdminPaymentModal's
// label carried an (unreferenced) id, and AdminEnquiryDetail's copy didn't
// show the UTR number line. Both default to the more common behavior seen
// in two of the three original copies.
export default function PaymentHistoryList({
  payments,
  loading,
  labelId,
  showUtrNumber = true,
}: {
  payments: Payment[];
  loading: boolean;
  labelId?: string;
  showUtrNumber?: boolean;
}) {
  return (
    <div>
      <label id={labelId} className="block text-sm font-medium text-dark mb-1">Payment History</label>
      {loading ? (
        <p className="text-xs text-dark-muted">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="text-xs text-dark-muted bg-background-warm rounded-md px-3 py-2">No payments recorded yet.</p>
      ) : (
        <div className="border border-background-warm rounded-md divide-y divide-background-warm max-h-40 overflow-y-auto">
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="text-dark font-medium truncate">
                  {INVOICE_TYPE_LABEL[p.payment_type] || p.payment_type}
                  {p.status === 'pending' && <span className="text-amber-600 font-normal"> · pending</span>}
                </p>
                <p className="text-dark-muted">
                  {p.paid_at ? formatDate(p.paid_at, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not yet paid'}
                  {p.payment_method ? ` · ${p.payment_method}` : ''}
                  {showUtrNumber && p.utr_number ? ` · UTR ${p.utr_number}` : ''}
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
  );
}
