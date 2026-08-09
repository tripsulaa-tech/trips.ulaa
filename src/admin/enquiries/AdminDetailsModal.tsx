import { CheckCircle2, FileText, Share2, Receipt, BadgeCheck, Plus, Users, User } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FoodMark from '../../components/ui/FoodMark';
import { ContactQuickLinks } from '../../components/ui/DataTableChrome';
import {
  PACKAGE_CONFIG, INVOICE_TYPE_LABEL, SOURCE_CONFIG, foodBadge, foodPreferenceKey,
  BookingLifecycleStepper,
} from './AdminEnquiryCommon';
import type { Enquiry, Payment } from '../../types/types-index';
import { formatDate, formatPrice, formatTime } from '../../utils/utils-index';

export default function DetailsModal({
  detailsTarget,
  onClose,
  groupLabel,
  isGeneralContactMessage,
  invoiceBusyId,
  onDownloadInvoice,
  onShareInvoice,
  completingId,
  onMarkCompleted,
  detailsInvoices,
  detailsInvoicesLoading,
  onOpenGenerateInvoice,
  invoiceRowBusyId,
  onMarkInvoicePaid,
}: {
  detailsTarget: Enquiry | null;
  onClose: () => void;
  groupLabel: (e: Enquiry) => string;
  isGeneralContactMessage: (e: Enquiry) => boolean;
  invoiceBusyId: string | null;
  onDownloadInvoice: (e: Enquiry) => void;
  onShareInvoice: (e: Enquiry) => void;
  completingId: string | null;
  onMarkCompleted: (e: Enquiry) => void;
  detailsInvoices: Payment[];
  detailsInvoicesLoading: boolean;
  onOpenGenerateInvoice: (e: Enquiry) => void;
  invoiceRowBusyId: string | null;
  onMarkInvoicePaid: (payment: Payment) => void;
}) {
  return (
    <Modal isOpen={!!detailsTarget} onClose={onClose} title={detailsTarget?.full_name || 'Enquiry Details'} size="md">
      {detailsTarget && (() => {
        const srcCfg = SOURCE_CONFIG[detailsTarget.source] || SOURCE_CONFIG.other;
        const food = foodBadge(detailsTarget);
        return (
          <div className="space-y-4">
            <div className="flex items-center flex-wrap gap-1.5">
              {detailsTarget.group_size && detailsTarget.group_size > 1 ? (
                <span
                  title={`${groupLabel(detailsTarget)} — part of a group booking of ${detailsTarget.group_size}`}
                  className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted"
                >
                  <Users size={10} /> {groupLabel(detailsTarget)} · {detailsTarget.group_seq}/{detailsTarget.group_size}
                </span>
              ) : (
                <span
                  title="Booked individually, not part of a group"
                  className="inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted"
                >
                  <User size={10} /> Solo
                </span>
              )}
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${food.color}`}>
                <FoodMark type={foodPreferenceKey(detailsTarget)} size={10} /> {food.label}
              </span>
            </div>
            {detailsTarget.booking_id && (
              <div className="flex items-center justify-between bg-background-warm rounded-md px-3 py-2">
                <div className="min-w-0">
                  <p className="text-dark-muted text-xs">Booking ID</p>
                  <p className="text-dark text-sm font-mono truncate">{detailsTarget.booking_id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => onDownloadInvoice(detailsTarget)} disabled={invoiceBusyId === detailsTarget.id}>
                    <FileText size={14} /> Invoice
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onShareInvoice(detailsTarget)} disabled={invoiceBusyId === detailsTarget.id}>
                    <Share2 size={14} /> Share
                  </Button>
                </div>
              </div>
            )}
            {detailsTarget.booking_id && (
              <div className="space-y-2.5">
                {/* Booking lifecycle — Confirmed → Fully Paid → Completed,
                    with Cancelled as a terminal off-ramp. */}
                <BookingLifecycleStepper enquiry={detailsTarget} />

                {/* Booking Summary — Total / Paid / Pending, mirrors the
                    price-summary strip on the PDF invoice itself. Pending
                    here is simply what's left of the total, which stays
                    correct whether it came from a not-yet-collected
                    installment/balance invoice or from money nobody's
                    raised an invoice for yet. */}
                <div className="grid grid-cols-3 gap-2 bg-background-warm rounded-md px-3 py-2.5">
                  <div>
                    <p className="text-dark-muted text-[11px]">Total</p>
                    <p className="text-dark text-sm font-semibold">{formatPrice(detailsTarget.total_amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-dark-muted text-[11px]">Paid</p>
                    <p className="text-green-700 text-sm font-semibold">{formatPrice(detailsTarget.amount_paid || 0)}</p>
                  </div>
                  <div>
                    <p className="text-dark-muted text-[11px]">Pending</p>
                    <p className="text-amber-600 text-sm font-semibold">
                      {formatPrice(Math.max(0, (detailsTarget.total_amount || 0) - (detailsTarget.amount_paid || 0)))}
                    </p>
                  </div>
                </div>

                {detailsTarget.booking_status && detailsTarget.booking_status !== 'cancelled' && detailsTarget.booking_status !== 'completed' && (
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onMarkCompleted(detailsTarget)}
                      disabled={completingId === detailsTarget.id}
                    >
                      <CheckCircle2 size={13} /> Mark Trip Completed
                    </Button>
                  </div>
                )}

                {/* Invoices — every payments row for this booking, each
                    with its own invoice number/type/status. */}
                <div className="bg-white border border-background-warm rounded-md">
                  <div className="flex flex-col gap-2 px-3 py-2 border-b border-background-warm">
                    <p className="text-dark text-xs font-button font-semibold flex items-center gap-1.5">
                      <Receipt size={13} className="shrink-0" /> Invoices
                    </p>
                    <Button variant="secondary" size="sm" className="self-start" onClick={() => onOpenGenerateInvoice(detailsTarget)}>
                      <Plus size={13} /> Generate Invoice
                    </Button>
                  </div>
                  {detailsInvoicesLoading ? (
                    <p className="text-dark-muted text-xs px-3 py-3">Loading invoices…</p>
                  ) : detailsInvoices.length === 0 ? (
                    <p className="text-dark-muted text-xs px-3 py-3">No invoices generated yet.</p>
                  ) : (
                    <ul className="divide-y divide-background-warm">
                      {detailsInvoices.map(inv => {
                        const isRefund = inv.payment_type === 'refund';
                        const isPending = inv.status === 'pending';
                        return (
                          <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
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
                                {isRefund ? '\u2212 ' : ''}{formatPrice(Math.abs(inv.amount))}
                              </span>
                              <span
                                className={`inline-flex items-center gap-0.5 text-[10px] font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                  isPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                }`}
                              >
                                <BadgeCheck size={10} /> {isPending ? 'Pending' : 'Paid'}
                              </span>
                              {isPending && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onMarkInvoicePaid(inv)}
                                  disabled={invoiceRowBusyId === inv.id}
                                >
                                  Mark Paid
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <div>
                <p className="text-dark-muted text-xs">Email</p>
                <p className="text-dark truncate">{detailsTarget.email}</p>
              </div>
              <div>
                <p className="text-dark-muted text-xs">Phone</p>
                <p className="text-dark truncate">{detailsTarget.phone}</p>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <ContactQuickLinks phone={detailsTarget.phone} email={detailsTarget.email} name={detailsTarget.full_name} tripTitle={detailsTarget.trip_title} size="md" />
              </div>
              {/* Trip (3.8) — spelled out explicitly, including the
                  no-trip case, instead of only being inferable from
                  which Trip filter group the admin happens to be
                  scoped to. */}
              <div className="col-span-2 sm:col-span-3">
                <p className="text-dark-muted text-xs">Trip</p>
                <p className="text-dark truncate">
                  {detailsTarget.trip_id ? detailsTarget.trip_title : (
                    <span className="text-dark-muted italic">
                      {isGeneralContactMessage(detailsTarget) ? 'None — Contact Us message' : 'None — logged without a trip'}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-dark-muted text-xs">City</p>
                <p className="text-dark truncate">{detailsTarget.city || '—'}</p>
              </div>
              <div>
                <p className="text-dark-muted text-xs">Age</p>
                <p className="text-dark truncate">{detailsTarget.age ?? '—'}</p>
              </div>
              <div>
                <p className="text-dark-muted text-xs">Source</p>
                <p className="text-dark truncate inline-flex items-center gap-1">
                  <srcCfg.icon size={12} className="shrink-0" /> {srcCfg.label}
                </p>
              </div>
              <div>
                <p className="text-dark-muted text-xs">Package</p>
                <p className="text-dark truncate">{PACKAGE_CONFIG[detailsTarget.package_type || 'normal'].label}</p>
              </div>
              <div>
                <p className="text-dark-muted text-xs">Date &amp; Time</p>
                <p className="text-dark truncate">
                  {formatDate(detailsTarget.created_at, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(detailsTarget.created_at)}
                </p>
              </div>
            </div>
            {detailsTarget.message && (
              <div>
                <p className="text-dark-muted text-xs mb-1">Notes</p>
                <p className="text-dark text-sm bg-background-warm rounded-md px-3 py-2.5">{detailsTarget.message}</p>
              </div>
            )}
          </div>
        );
      })()}
    </Modal>
  );
}
