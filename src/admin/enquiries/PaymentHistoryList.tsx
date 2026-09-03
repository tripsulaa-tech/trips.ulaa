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
//
// `discountAmount`/`discountReason` are optional and, when present and
// > 0, render as an extra non-monetary row above the ledger. A discount
// never inserts a row into the `payments` table (nothing moves), so it
// would otherwise never appear in this list even though it directly
// affects the total the payments below are being collected against —
// see recordPayment in services/api/enquiries/payments.ts, which logs it
// to activity_log instead. Callers pass the enquiry's current
// discount_amount/discount_reason directly, so this always reflects
// what's on record right now.
export default function PaymentHistoryList({
  payments,
  loading,
  labelId,
  showUtrNumber = true,
  discountAmount,
  discountReason,
}: {
  payments: Payment[];
  loading: boolean;
  labelId?: string;
  showUtrNumber?: boolean;
  discountAmount?: number | null;
  discountReason?: string | null;
}) {
  const hasDiscount = !!discountAmount && discountAmount > 0;
  return (
    <div>
      <label id={labelId} className="block text-sm font-medium text-dark mb-1">Payment History</label>
      {loading ? (
        <p className="text-xs text-dark-muted">Loading…</p>
      ) : payments.length === 0 && !hasDiscount ? (
        <p className="text-sm text-dark-muted bg-background-warm border-2 border-background-warm rounded-md px-3 py-2">No payments recorded yet.</p>
      ) : (
        <div className="border border-background-warm rounded-md divide-y divide-background-warm max-h-40 overflow-y-auto">
          {hasDiscount && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-amber-50/60">
              <div className="min-w-0">
                <p className="text-dark font-medium truncate">Discount Applied</p>
                <p className="text-dark-muted truncate">{discountReason || 'No reason given'}</p>
              </div>
              <p className="shrink-0 font-semibold text-amber-700">−{formatPrice(discountAmount!)}</p>
            </div>
          )}
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
