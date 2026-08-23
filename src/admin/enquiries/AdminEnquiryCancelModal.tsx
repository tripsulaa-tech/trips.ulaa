// Cancel Booking modal — split out of AdminEnquiryDetail.tsx.
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import type { CancellationReason } from '../../types/types-index';
import { parseNonNegative, CANCELLATION_REASON_OPTIONS } from './AdminEnquiryCommon';

interface AdminEnquiryCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  cancelReason: CancellationReason | '';
  setCancelReason: (reason: CancellationReason | '') => void;
  cancelCharges: number | '';
  setCancelCharges: (charges: number | '') => void;
  cancelIsNoShow: boolean;
  setCancelIsNoShow: (val: boolean) => void;
  cancelNotes: string;
  setCancelNotes: (notes: string) => void;
  cancelling: boolean;
  onConfirm: () => void;
}

export default function AdminEnquiryCancelModal({
  isOpen, onClose, cancelReason, setCancelReason, cancelCharges, setCancelCharges,
  cancelIsNoShow, setCancelIsNoShow, cancelNotes, setCancelNotes, cancelling, onConfirm,
}: AdminEnquiryCancelModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancel Booking" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-dark-muted">This frees up the seat immediately. Amount paid stays on record — track any refund via Payment afterwards.</p>
        <div>
          <label htmlFor="ed-cancel-reason" className="block text-sm font-medium text-dark mb-1">Cancellation Reason</label>
          <Select
            inputId="ed-cancel-reason"
            value={cancelReason}
            onChange={val => setCancelReason(val as CancellationReason | '')}
            options={CANCELLATION_REASON_OPTIONS}
            placeholder="Select a reason — optional"
          />
        </div>
        <div>
          <label htmlFor="ed-cancel-charges" className="block text-sm font-medium text-dark mb-1">Third-Party Charges (₹, optional)</label>
          <input
            id="ed-cancel-charges"
            type="number"
            min={0}
            value={cancelCharges}
            onChange={e => setCancelCharges(parseNonNegative(e.target.value))}
            className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
            placeholder="e.g. airline/hotel penalty"
          />
        </div>
        <label className="flex items-start gap-2 text-xs text-dark cursor-pointer bg-background-warm rounded px-2 py-1.5">
          <input type="checkbox" checked={cancelIsNoShow} onChange={e => setCancelIsNoShow(e.target.checked)} className="mt-0.5" />
          <span>
            This is a <span className="font-medium">no-show</span>
            <span className="block text-[11px] text-dark-muted">No refund is given for no-shows, per policy.</span>
          </span>
        </label>
        <div>
          <label htmlFor="ed-cancel-notes" className="block text-sm font-medium text-dark mb-1">Notes (optional)</label>
          <textarea
            id="ed-cancel-notes"
            value={cancelNotes}
            onChange={e => setCancelNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none resize-none"
            placeholder="Anything worth recording about this cancellation"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Back</Button>
          <Button variant="primary" size="md" onClick={onConfirm} loading={cancelling}>Confirm Cancellation</Button>
        </div>
      </div>
    </Modal>
  );
}
