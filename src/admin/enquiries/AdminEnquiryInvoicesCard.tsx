// Invoices & Payments ledger card — split out of AdminEnquiryDetail.tsx.
// Only rendered once a booking exists (enquiry.booking_id).
//
// Two layouts share the same data: a proper table (Invoice No / Description
// / Date / Amount / Status / Action) from the sm breakpoint up, and a
// stacked card-per-invoice list below it. A 6-column table just doesn't fit
// a phone width — it either truncates unreadably or forces a horizontal
// scroll the person has to discover, so mobile gets its own layout instead
// of the table squeezed down.
//
// Download/Share Invoice are NOT repeated here — they only ever act on the
// whole booking's invoice PDF (there's no per-line-item PDF to download),
// so they live once as icon buttons in AdminEnquiryHeaderCard next to Set
// Follow-up, instead of being duplicated on every row of this ledger.
import {
  FileText, Plus, SealCheck as BadgeCheck,
} from '@phosphor-icons/react';
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

// Small badge — identical markup used in both the table and the mobile
// cards, so status pills can't visually drift between the two layouts.
function StatusPill({ isPending }: { isPending: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
      isPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
    }`}>
      <BadgeCheck size={10} aria-hidden="true" /> {isPending ? 'Pending' : 'Paid'}
    </span>
  );
}

export default function AdminEnquiryInvoicesCard({
  enquiry, payments, paymentsLoading, showAllInvoices, setShowAllInvoices, onAddInvoice, onMarkPaid, markPaidBusyId,
}: AdminEnquiryInvoicesCardProps) {
  if (!enquiry.booking_id) return null;

  const visiblePayments = showAllInvoices ? payments : payments.slice(0, 3);

  return (
    <div className="bg-white rounded-lg shadow-card">
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-background-warm">
        <div>
          <p className="text-dark text-sm font-button font-semibold flex items-center gap-1.5">
            <FileText size={14} className="shrink-0 text-primary" aria-hidden="true" /> Invoices &amp; Payments
          </p>
          <p className="text-dark-muted text-xs mt-1">Every invoice raised and payment recorded on this booking.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onAddInvoice}>
          <Plus size={13} aria-hidden="true" /> Add
        </Button>
      </div>
      {paymentsLoading ? (
        <p className="text-dark-muted text-xs px-4 sm:px-5 py-4">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="text-dark-muted text-xs px-4 sm:px-5 py-4">No invoices generated yet.</p>
      ) : (
        <>
          {/* Desktop / tablet: full table, one column per field. */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background-warm/60 text-dark-muted">
                <tr>
                  <th className="px-5 py-2.5 text-left font-button font-semibold text-xs whitespace-nowrap">Invoice No</th>
                  <th className="px-4 py-2.5 text-left font-button font-semibold text-xs whitespace-nowrap">Description</th>
                  <th className="px-4 py-2.5 text-left font-button font-semibold text-xs whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 text-left font-button font-semibold text-xs whitespace-nowrap">Amount</th>
                  <th className="px-4 py-2.5 text-left font-button font-semibold text-xs whitespace-nowrap">Status</th>
                  <th className="px-5 py-2.5 text-right font-button font-semibold text-xs whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-warm">
                {visiblePayments.map(inv => {
                  const isRefund = inv.payment_type === 'refund';
                  const isPending = inv.status === 'pending';
                  return (
                    <tr key={inv.id} className="hover:bg-background/40 transition-colors">
                      <td className="px-5 py-3 text-dark text-xs font-mono whitespace-nowrap">{inv.invoice_number || '—'}</td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <p className="text-dark text-sm">{INVOICE_TYPE_LABEL[inv.payment_type] ?? inv.payment_type}</p>
                        {(inv.payment_method || inv.utr_number) && (
                          <p className="text-dark-muted text-[11px]">
                            {inv.payment_method || ''}{inv.payment_method && inv.utr_number ? ' · ' : ''}{inv.utr_number ? `UTR ${inv.utr_number}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-dark-muted text-xs whitespace-nowrap">
                        {formatDate(inv.paid_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-sm font-semibold ${isRefund ? 'text-red-600' : 'text-dark'}`}>
                          {isRefund ? '− ' : ''}{formatPrice(Math.abs(inv.amount))}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusPill isPending={isPending} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isPending && (
                          // Deliberately not the shared <Button> here — its
                          // smallest size is still a 44px-min-height touch
                          // target, which reads too big sitting inline in a
                          // table row. A plain compact button matches the
                          // "small pill" Mark Paid seen in the ledger mock.
                          <button
                            type="button"
                            onClick={() => onMarkPaid(inv)}
                            disabled={markPaidBusyId === inv.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-primary text-primary text-xs font-button font-semibold hover:bg-primary hover:text-white active:bg-primary active:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                          >
                            {markPaidBusyId === inv.id ? 'Marking…' : 'Mark Paid'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per invoice — same fields as the table, just
              stacked (Invoice No + Status on top, "Description · Date" on
              one line, then Mark Paid on pending invoices). */}
          <div className="sm:hidden divide-y divide-background-warm">
            {visiblePayments.map(inv => {
              const isRefund = inv.payment_type === 'refund';
              const isPending = inv.status === 'pending';
              return (
                <div key={inv.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-dark-muted text-[11px] font-mono truncate">{inv.invoice_number || '—'}</p>
                    <StatusPill isPending={isPending} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-dark text-sm font-semibold truncate">
                      {INVOICE_TYPE_LABEL[inv.payment_type] ?? inv.payment_type}
                      <span className="text-dark-muted font-normal">
                        {' · '}{formatDate(inv.paid_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </p>
                    <span className={`text-sm font-semibold shrink-0 ${isRefund ? 'text-red-600' : 'text-dark'}`}>
                      {isRefund ? '− ' : ''}{formatPrice(Math.abs(inv.amount))}
                    </span>
                  </div>
                  {(inv.payment_method || inv.utr_number) && (
                    <p className="text-dark-muted text-[11px]">
                      {inv.payment_method || ''}{inv.payment_method && inv.utr_number ? ' · ' : ''}{inv.utr_number ? `UTR ${inv.utr_number}` : ''}
                    </p>
                  )}
                  {isPending && (
                    <div className="flex items-center justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => onMarkPaid(inv)}
                        disabled={markPaidBusyId === inv.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-primary text-primary text-xs font-button font-semibold hover:bg-primary hover:text-white active:bg-primary active:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      >
                        {markPaidBusyId === inv.id ? 'Marking…' : 'Mark Paid'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
