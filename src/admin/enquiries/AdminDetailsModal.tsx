import type { ReactNode } from 'react';
import {
  CheckCircle as CheckCircle2,
  FileText,
  ShareNetwork as Share2,
  EnvelopeSimple,
  Receipt,
  SealCheck as BadgeCheck,
  Plus,
  Users,
  User,
  Phone as PhoneIcon,
  Briefcase,
  Buildings as Building2,
  CalendarBlank as CalendarDays,
  Globe,
  Package,
  Bird,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FoodMark from '../../components/ui/FoodMark';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import {
  PACKAGE_CONFIG, INVOICE_TYPE_LABEL, SOURCE_CONFIG, foodBadge, foodPreferenceKey,
} from './AdminEnquiryCommon';
import { BookingLifecycleStepper } from './AdminEnquiryLifecycle';
import type { Enquiry, Payment } from '../../types/types-index';
import type { InvoiceAction } from './AdminEnquiryCommon';
import { formatDate, formatPrice, formatTime, getWhatsAppLink } from '../../utils/utils-index';
import { formatPhone } from '../../utils/formatPhone';
import { isPremiumPackage } from '../../utils/tripOptions';

// Same icon-chip + label/value look as the "Traveller & Trip" card on the
// full enquiry page (AdminEnquiryTravellerCard): a round tinted icon, a muted
// label, and a bold value. When `href` is given the icon itself is the
// tap-to-call / tap-to-email / WhatsApp link, as on that card.
const ICON_CHIP_CLASS = 'w-9 h-9 rounded-full bg-primary/10 text-primary inline-flex items-center justify-center shrink-0';
const ICON_LINK_CLASS = `${ICON_CHIP_CLASS} hover:bg-primary hover:text-white transition-colors`;

function InfoItem({ icon, label, href, linkTitle, external, children }: {
  icon: ReactNode;
  label: string;
  href?: string;
  linkTitle?: string;
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {href ? (
        <a
          href={href}
          title={linkTitle}
          aria-label={linkTitle}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className={ICON_LINK_CLASS}
        >
          {icon}
        </a>
      ) : (
        <span className={ICON_CHIP_CLASS}>{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-dark-muted text-xs">{label}</p>
        {children}
      </div>
    </div>
  );
}

export default function DetailsModal({
  detailsTarget,
  onClose,
  groupLabel,
  isGeneralContactMessage,
  invoiceBusy,
  onDownloadInvoice,
  onShareInvoice,
  onSendBookingEmail,
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
  invoiceBusy: { id: string; action: InvoiceAction } | null;
  onDownloadInvoice: (e: Enquiry) => void;
  onShareInvoice: (e: Enquiry) => void;
  onSendBookingEmail: (e: Enquiry) => void;
  completingId: string | null;
  onMarkCompleted: (e: Enquiry) => void;
  detailsInvoices: Payment[];
  detailsInvoicesLoading: boolean;
  // Opens the single, consolidated Payment flow (kept the
  // onOpenGenerateInvoice prop name to avoid a churny rename across
  // callers) — a standalone "Add Invoice" modal no longer exists; this now
  // matches the enquiry's full CRM page, same as the row's "Payment" action.
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
                  className="inline-flex items-center gap-0.5 text-2xs font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted"
                >
                  <Users size={10} aria-hidden="true" /> {groupLabel(detailsTarget)} · {detailsTarget.group_seq}/{detailsTarget.group_size}
                </span>
              ) : (
                <span
                  title="Booked individually, not part of a group"
                  className="inline-flex items-center gap-0.5 text-2xs font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-slate-100 text-dark-muted"
                >
                  <User size={10} aria-hidden="true" /> Solo
                </span>
              )}
              <span className={`inline-flex items-center gap-0.5 text-2xs font-button font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${food.color}`}>
                <FoodMark type={foodPreferenceKey(detailsTarget)} size={10} aria-hidden="true" /> {food.label}
              </span>
            </div>
            {detailsTarget.booking_id && (
              <div className="flex items-center justify-between bg-background-warm rounded-md px-3 py-2">
                <div className="min-w-0">
                  <p className="text-dark-muted text-xs">Booking ID</p>
                  <p className="text-dark text-sm font-mono truncate">{detailsTarget.booking_id}</p>
                </div>
                {/* Icon-only on purpose: three labelled buttons didn't fit
                    beside the Booking ID on a phone and overlapped it. Each
                    button's disabled check is scoped to its own action. */}
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => onDownloadInvoice(detailsTarget)}
                    disabled={invoiceBusy?.id === detailsTarget.id && invoiceBusy.action === 'download'}
                    title="Download invoice"
                    aria-label="Download invoice"
                    className="p-2 -m-1 text-primary hover:text-primary-dark disabled:opacity-50"
                  >
                    <FileText size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onShareInvoice(detailsTarget)}
                    disabled={invoiceBusy?.id === detailsTarget.id && invoiceBusy.action === 'share'}
                    title="Share invoice"
                    aria-label="Share invoice"
                    className="p-2 -m-1 text-primary hover:text-primary-dark disabled:opacity-50"
                  >
                    <Share2 size={18} aria-hidden="true" />
                  </button>
                  {detailsTarget.email && (
                    <button
                      type="button"
                      onClick={() => onSendBookingEmail(detailsTarget)}
                      disabled={invoiceBusy?.id === detailsTarget.id && invoiceBusy.action === 'email'}
                      title="Email booking confirmation"
                      aria-label="Email booking confirmation"
                      className="p-2 -m-1 text-primary hover:text-primary-dark disabled:opacity-50"
                    >
                      <EnvelopeSimple size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}
            {detailsTarget.booking_id && (
              <div className="space-y-2.5">
                {/* Booking lifecycle — New Enquiry → Contacted → Confirmed
                    → Fully Paid → Completed, with Cancelled as a terminal
                    off-ramp. */}
                <BookingLifecycleStepper enquiry={detailsTarget} />

                {/* Booking Summary — Total / Paid / Pending, mirrors the
                    price-summary strip on the PDF invoice itself. Pending
                    here is simply what's left of the total, which stays
                    correct whether it came from a not-yet-collected
                    installment/balance invoice or from money nobody's
                    raised an invoice for yet. */}
                <div className="grid grid-cols-3 gap-2 bg-background-warm rounded-md px-3 py-2.5">
                  <div>
                    <p className="text-dark-muted text-2xs">Total</p>
                    <p className="text-dark text-sm font-semibold">{formatPrice(detailsTarget.total_amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-dark-muted text-2xs">Paid</p>
                    <p className="text-green-700 text-sm font-semibold">{formatPrice(detailsTarget.amount_paid || 0)}</p>
                  </div>
                  <div>
                    <p className="text-dark-muted text-2xs">Pending</p>
                    <p className="text-amber-600 text-sm font-semibold">
                      {formatPrice(Math.max(0, (detailsTarget.total_amount || 0) - (detailsTarget.amount_paid || 0)))}
                    </p>
                  </div>
                </div>

                {detailsTarget.discount_amount > 0 && (
                  <p className="text-xs text-dark-muted bg-background-warm rounded-md px-3 py-2">
                    Discount applied: <span className="font-semibold text-dark">{formatPrice(detailsTarget.discount_amount)}</span>
                    {detailsTarget.discount_reason ? ` — ${detailsTarget.discount_reason}` : ''}
                  </p>
                )}

                {detailsTarget.booking_status && detailsTarget.booking_status !== 'cancelled' && detailsTarget.booking_status !== 'completed' && (
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onMarkCompleted(detailsTarget)}
                      disabled={completingId === detailsTarget.id}
                    >
                      <CheckCircle2 size={13} aria-hidden="true" /> Complete Trip
                    </Button>
                  </div>
                )}

                {/* Invoices — every payments row for this booking, each
                    with its own invoice number/type/status. */}
                <div className="bg-white border border-background-warm rounded-md">
                  <div className="flex flex-col gap-2 px-3 py-2 border-b border-background-warm">
                    <p className="text-dark text-xs font-button font-semibold flex items-center gap-1.5">
                      <Receipt size={13} className="shrink-0" aria-hidden="true" /> Invoices
                    </p>
                    <Button variant="primary" size="sm" className="self-start" onClick={() => onOpenGenerateInvoice(detailsTarget)}>
                      <Plus size={13} aria-hidden="true" /> Payment
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
                              <p className="text-dark-muted text-2xs">
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
                                className={`inline-flex items-center gap-0.5 text-2xs font-button font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                  isPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                }`}
                              >
                                <BadgeCheck size={10} aria-hidden="true" /> {isPending ? 'Pending' : 'Paid'}
                              </span>
                              {isPending && (
                                <Button
                                  variant="primary"
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
            {/* Traveller & Trip details — same theme as the card on the
                full enquiry page. */}
            <div className="divide-y divide-background-warm">
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 pb-4">
                <InfoItem
                  icon={<PhoneIcon size={15} aria-hidden="true" />}
                  label="Phone"
                  href={detailsTarget.phone ? `tel:${detailsTarget.phone}` : undefined}
                  linkTitle={`Call ${detailsTarget.full_name}`}
                >
                  <p className="text-dark text-sm font-semibold whitespace-nowrap">{detailsTarget.phone ? formatPhone(detailsTarget.phone) : '—'}</p>
                </InfoItem>
                <InfoItem
                  icon={<EnvelopeSimple size={15} aria-hidden="true" />}
                  label="Email"
                  href={detailsTarget.email ? `mailto:${detailsTarget.email}` : undefined}
                  linkTitle={`Email ${detailsTarget.full_name}`}
                >
                  <p title={detailsTarget.email || undefined} className="text-dark text-sm font-semibold truncate">{detailsTarget.email || '—'}</p>
                </InfoItem>
              </div>

              {/* Trip — spelled out explicitly, including the no-trip
                  case, instead of only being inferable from which Trip
                  filter group the admin happens to be scoped to. */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
                <InfoItem icon={<Briefcase size={15} aria-hidden="true" />} label="Trip">
                  <p title={detailsTarget.trip_id ? detailsTarget.trip_title : undefined} className="text-dark text-sm font-semibold truncate">
                    {detailsTarget.trip_id ? detailsTarget.trip_title : (
                      <span className="text-dark-muted italic font-normal">
                        {isGeneralContactMessage(detailsTarget) ? 'None — Contact Us message' : 'None — logged without a trip'}
                      </span>
                    )}
                  </p>
                </InfoItem>
                <InfoItem icon={<User size={15} aria-hidden="true" />} label="Age">
                  <p className="text-dark text-sm font-semibold truncate">{detailsTarget.age ?? '—'}</p>
                </InfoItem>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
                <InfoItem icon={<Building2 size={15} aria-hidden="true" />} label="City">
                  <p className="text-dark text-sm font-semibold truncate">{detailsTarget.city || '—'}</p>
                </InfoItem>
                <InfoItem
                  icon={<FoodMark type={detailsTarget.food_preference === 'veg' || detailsTarget.food_preference === 'non_veg' ? detailsTarget.food_preference : 'not_set'} size={12} />}
                  label="Food Preference"
                >
                  <p className={`text-sm font-semibold truncate flex items-center gap-1 ${
                    detailsTarget.food_preference === 'veg' ? 'text-green-700' : detailsTarget.food_preference === 'non_veg' ? 'text-red-700' : 'text-dark'
                  }`}>
                    {(detailsTarget.food_preference === 'veg' || detailsTarget.food_preference === 'non_veg') && <FoodMark type={detailsTarget.food_preference} size={11} />}
                    {detailsTarget.food_preference === 'veg' ? 'Veg' : detailsTarget.food_preference === 'non_veg' ? 'Non-veg' : '—'}
                  </p>
                </InfoItem>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-4">
                <InfoItem icon={<CalendarDays size={15} aria-hidden="true" />} label="Date & Time">
                  <p className="text-dark text-sm font-semibold truncate">{formatDate(detailsTarget.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p className="text-dark-muted text-xs truncate">{formatTime(detailsTarget.created_at)}</p>
                </InfoItem>
                <InfoItem icon={<Globe size={15} aria-hidden="true" />} label="Source">
                  <p className="text-dark text-sm font-semibold truncate">{srcCfg.label}</p>
                </InfoItem>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-4 items-center">
                {/* One Package item, same logic as the CRM list: the trip
                    package the traveller chose (Basic / Premium / ...) on
                    top, price tier (Early Bird / Normal) underneath. Trips
                    without packages just show the tier. */}
                <InfoItem
                  icon={detailsTarget.package_type === 'early_bird' ? <Bird size={15} aria-hidden="true" /> : <Package size={15} aria-hidden="true" />}
                  label="Package"
                >
                  {detailsTarget.package_name && (
                    <p
                      title="Trip package this traveller chose"
                      className={`text-sm font-semibold truncate ${isPremiumPackage(detailsTarget.package_name) ? 'premium-gold-text' : 'text-primary'}`}
                    >
                      {detailsTarget.package_name}
                    </p>
                  )}
                  <p className={`truncate ${
                    detailsTarget.package_name
                      ? `text-xs ${detailsTarget.package_type === 'early_bird' ? 'text-purple-700 font-semibold' : 'text-dark-muted'}`
                      : `text-sm font-semibold ${detailsTarget.package_type === 'early_bird' ? 'text-purple-700' : 'text-dark'}`
                  }`}>
                    {PACKAGE_CONFIG[detailsTarget.package_type || 'normal'].label}
                  </p>
                </InfoItem>
                {detailsTarget.phone && (
                  <InfoItem
                    icon={<WhatsAppIcon size={15} aria-hidden="true" />}
                    label="WhatsApp"
                    href={getWhatsAppLink(detailsTarget.phone, `Hi ${detailsTarget.full_name.trim().split(/\s+/)[0]}, following up on your ${detailsTarget.trip_title ? `${detailsTarget.trip_title} ` : ''}enquiry with Ulaa — `)}
                    linkTitle={`Message ${detailsTarget.full_name} on WhatsApp`}
                    external
                  >
                    <p className="text-dark text-sm font-semibold whitespace-nowrap">{formatPhone(detailsTarget.phone)}</p>
                  </InfoItem>
                )}
              </div>
            </div>
            {detailsTarget.message && (
              <div className="pt-4 border-t border-background-warm">
                <p className="text-dark-muted text-xs mb-1">Message</p>
                <p className="text-dark text-sm whitespace-pre-wrap">{detailsTarget.message}</p>
              </div>
            )}
          </div>
        );
      })()}
    </Modal>
  );
}
