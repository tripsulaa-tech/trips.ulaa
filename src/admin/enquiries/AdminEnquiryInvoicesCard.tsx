// Invoices & Payments ledger card — split out of AdminEnquiryDetail.tsx.
// Only rendered once a booking exists (enquiry.booking_id).
import { FileText, Plus, SealCheck as BadgeCheck } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import type { Enquiry, Payment } from '../../types/types-index';
import { formatDate, formatPrice } from '../../utils/utils-index';
import { INVOICE_TYPE_LABEL } from './AdminEnquiryCommon';

interface AdminEnquiryInvoicesCardProps {
  enquiry: Enquiry;
  payments: Payment[];
  paymentsLoading: boolean;
  showAllInvoices: boolean;
  setShowAllInvoices: (val: boolean) => void;
  // Opens the single, consolidated Payment modal (Track Payment + what used
  // to be the separate "Add Invoice" flow — see AdminEnquiryPaymentModal /
  // PaymentFormFields, which already cover everything a standalone
  // Generate Invoice modal did). Kept the onAddInvoice prop name to avoid
  // a churny rename across callers; only the button label and the action
  // it triggers changed.
  onAddInvoice: () => void;
  onMarkPaid: (invoice: Payment) => void;
  markPaidBusyId: string | null;
}

export default function AdminEnquiryInvoicesCard({
  enquiry, payments, paymentsLoading, showAllInvoices, setShowAllInvoices, onAddInvoice, onMarkPaid, markPaidBusyId,
}: AdminEnquiryInvoicesCardProps) {
  if (!enquiry.booking_id) return null;

  return (
    <div className="bg-white rounded-lg shadow-card">
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-background-warm">
        <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
          <FileText size={14} className="shrink-0" aria-hidden="true" /> Invoices &amp; Payments
        </p>
        <Button variant="primary" size="sm" onClick={onAddInvoice}>
          <Plus size={13} aria-hidden="true" /> Payment
        </Button>
      </div>
      {paymentsLoading ? (
        <p className="text-dark-muted text-xs px-4 sm:px-5 py-4">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="text-dark-muted text-xs px-4 sm:px-5 py-4">No invoices generated yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-background-warm">
            {(showAllInvoices ? payments : payments.slice(0, 3)).map(inv => {
              const isRefund = inv.payment_type === 'refund';
              const isPending = inv.status === 'pending';
              return (
                <li key={inv.id} className="flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-dark text-xs font-mono truncate">{inv.invoice_number || '—'}</p>
                    <p className="text-dark-muted text-[11px]">
                      {INVOICE_TYPE_LABEL[inv.payment_type] ?? inv.payment_type} · {formatDate(inv.paid_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {inv.payment_method ? ` · ${inv.payment_method}` : ''}
                      {inv.utr_number ? ` · UTR ${inv.utr_number}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-semibold ${isRefund ? 'text-red-600' : 'text-dark'}`}>
                      {isRefund ? '− ' : ''}{formatPrice(Math.abs(inv.amount))}
                    </span>
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      isPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>
                      <BadgeCheck size={10} aria-hidden="true" /> {isPending ? 'Pending' : 'Paid'}
                    </span>
                    {isPending && (
                      <Button variant="primary" size="sm" onClick={() => onMarkPaid(inv)} disabled={markPaidBusyId === inv.id}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {/* Only show 3 invoices by default; "View All Invoices" expands
              the rest in place, like a read-more. */}
          {!showAllInvoices && payments.length > 3 && (
            <button
              onClick={() => setShowAllInvoices(true)}
              className="w-full text-center text-primary text-xs font-button font-semibold px-4 sm:px-5 py-2.5 border-t border-background-warm hover:bg-background-warm transition-colors"
            >
              View All Invoices ({payments.length}) &gt;
            </button>
          )}
        </>
      )}
    </div>
  );
}
