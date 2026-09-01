// Booking Journey card — split out of AdminEnquiryDetail.tsx. Shows the
// lifecycle stepper + ledger once a booking exists, or a "no payment yet"
// prompt with the trip's current live price beforehand.
import { CheckCircle as CheckCircle2, CurrencyInr as IndianRupee, Bird, Wallet } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import type { Enquiry } from '../../types/types-index';
import { formatDate, formatPrice } from '../../utils/utils-index';
import { BookingLifecycleStepper } from './AdminEnquiryLifecycle';
import type { getTripActivePricing } from './AdminEnquiryCommon';

type ActivePricing = ReturnType<typeof getTripActivePricing>;

interface AdminEnquiryJourneyCardProps {
  enquiry: Enquiry;
  activePricing: ActivePricing;
  busyAction: boolean;
  onOpenPayment: () => void;
  onMarkCompleted: () => void;
}

export default function AdminEnquiryJourneyCard({
  enquiry, activePricing, busyAction, onOpenPayment, onMarkCompleted,
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

        {/* Kids fee — independent Total/Paid/Pending, tracked separately
            from the adult booking above. See add_kids_payment_tracking.sql. */}
        {enquiry.kids_count > 0 && (
          <div className="grid grid-cols-3 gap-2 bg-amber-50/60 rounded-md px-3 py-2.5">
            <div>
              <p className="text-amber-800 text-[11px]">Kids Total</p>
              <p className="text-dark text-sm font-semibold">{formatPrice(enquiry.kids_amount || 0)}</p>
            </div>
            <div>
              <p className="text-amber-800 text-[11px]">Kids Paid</p>
              <p className="text-green-700 text-sm font-semibold">{formatPrice(enquiry.kids_amount_paid || 0)}</p>
            </div>
            <div>
              <p className="text-amber-800 text-[11px]">Kids Pending</p>
              <p className="text-amber-600 text-sm font-semibold">
                {formatPrice(Math.max(0, (enquiry.kids_amount || 0) - (enquiry.kids_amount_paid || 0)))}
              </p>
            </div>
          </div>
        )}

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
    <div className="bg-white rounded-lg shadow-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
          <Wallet size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-dark text-sm font-semibold">No Payment Yet</p>
          <p className="text-dark-muted text-xs mt-0.5">No booking exists on this enquiry yet.</p>
        </div>
      </div>

      {activePricing ? (
        <div className="mt-3 bg-background-warm rounded-md px-3 py-2.5">
          <p className="text-dark-muted text-[11px] flex items-center gap-1">
            {activePricing.isEarlyBird && <Bird size={11} className="shrink-0 text-purple-600" aria-hidden="true" />}
            Current price for this trip
          </p>
          <p className="text-dark text-sm font-semibold mt-0.5">
            {formatPrice(activePricing.amount)}
            <span className="text-dark-muted text-xs font-normal">
              {' '}({activePricing.isEarlyBird ? 'Early Bird' : 'Normal'}
              {activePricing.isEarlyBird && activePricing.deadline ? ` · ends ${formatDate(activePricing.deadline, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''})
            </span>
          </p>
          <p className="text-dark-muted text-[11px] mt-1">Auto-filled when you track payment.</p>
        </div>
      ) : enquiry.trip_id && (
        <p className="text-xs text-dark-muted mt-3">This trip has no price set yet — set one in Admin → Trips first.</p>
      )}

      <Button variant="primary" size="sm" onClick={onOpenPayment} className="w-full sm:w-auto mt-4">
        <IndianRupee size={13} aria-hidden="true" /> Track Payment
      </Button>
    </div>
  );
}
