import type { Dispatch, SetStateAction } from 'react';
import { Users } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { parseNonNegative } from '../../enquiryShared';
import type { Enquiry } from '../../../types/types-index';
import { formatPrice } from '../../../utils/utils-index';
import { inputClass } from '../adminEnquiriesShared';

export default function CancelModal({
  cancelTarget,
  onClose,
  cancelCharges,
  setCancelCharges,
  cancelIsNoShow,
  setCancelIsNoShow,
  waitlistWaitingCounts,
  describeWaiting,
  onConfirm,
  cancelling,
}: {
  cancelTarget: Enquiry | null;
  onClose: () => void;
  cancelCharges: number | '';
  setCancelCharges: Dispatch<SetStateAction<number | ''>>;
  cancelIsNoShow: boolean;
  setCancelIsNoShow: Dispatch<SetStateAction<boolean>>;
  waitlistWaitingCounts: Record<string, { entries: number; people: number }>;
  describeWaiting: (summary: { entries: number; people: number }) => string;
  onConfirm: () => void;
  cancelling: boolean;
}) {
  return (
    <Modal isOpen={!!cancelTarget} onClose={onClose} title="Cancel Booking" size="sm">
      {cancelTarget && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3">
            <p className="font-medium text-dark">{cancelTarget.full_name}</p>
            <p className="text-dark-muted text-xs">{cancelTarget.trip_title || 'No trip linked'}</p>
          </div>

          <p className="text-sm text-dark-muted">
            This frees up their seat right away. {cancelTarget.amount_paid > 0 && `They've paid ${formatPrice(cancelTarget.amount_paid)} so far — `}
            amount paid stays on record; refunds are tracked separately from the Payment screen.
          </p>

          {cancelTarget.trip_id && waitlistWaitingCounts[cancelTarget.trip_id]?.entries > 0 && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-md px-3 py-2.5 text-sm text-orange-800">
              <Users size={16} className="shrink-0 mt-0.5" />
              <p>
                <span className="font-semibold">
                  {describeWaiting(waitlistWaitingCounts[cancelTarget.trip_id])} {waitlistWaitingCounts[cancelTarget.trip_id].entries === 1 ? 'is' : 'are'} waiting
                </span>{' '}
                for a seat on this trip. Once you cancel, that freed seat is bookable by anyone on the website — convert
                them first if you want to give them priority.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Third-Party Charges (₹)</label>
            <input
              type="number"
              min={0}
              value={cancelCharges}
              onChange={ev => setCancelCharges(parseNonNegative(ev.target.value))}
              className={inputClass}
              placeholder="Airline/hotel penalties, if known — optional"
            />
            <p className="text-[11px] text-dark-muted mt-1">
              Used to compute the suggested refund estimate. You can leave this blank and add it later.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-dark cursor-pointer">
            <input
              type="checkbox"
              checked={cancelIsNoShow}
              onChange={ev => setCancelIsNoShow(ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              This is a <span className="font-medium">no-show</span> (didn't report at the meeting point/date/time).
              <span className="block text-[11px] text-dark-muted">Per policy, no-shows forfeit the full amount paid — the refund amount will be locked at ₹0.</span>
            </span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Back</Button>
            <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onConfirm} loading={cancelling}>Confirm Cancellation</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
