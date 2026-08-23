// Not Interested reason picker — split out of AdminEnquiryDetail.tsx.
// See handleMarkNotInterested in the parent for why this is a separate
// modal instead of an instant status flip.
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import type { ClosedReason } from '../../types/types-index';
import { NOT_INTERESTED_REASON_OPTIONS } from './AdminEnquiryCommon';

interface AdminEnquiryNotInterestedModalProps {
  isOpen: boolean;
  onClose: () => void;
  closedReason: ClosedReason;
  setClosedReason: (reason: ClosedReason) => void;
  busy: boolean;
  onConfirm: () => void;
}

export default function AdminEnquiryNotInterestedModal({
  isOpen, onClose, closedReason, setClosedReason, busy, onConfirm,
}: AdminEnquiryNotInterestedModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mark as Not Interested" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-dark-muted">
          This closes the enquiry as a query that went nowhere — no booking was made. You can reopen it later if they get back in touch.
        </p>
        <div>
          <label htmlFor="ed-not-interested-reason" className="block text-sm font-medium text-dark mb-1">Reason</label>
          <Select
            inputId="ed-not-interested-reason"
            value={closedReason}
            onChange={val => setClosedReason(val as ClosedReason)}
            options={NOT_INTERESTED_REASON_OPTIONS}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={onConfirm} loading={busy}>Mark Not Interested</Button>
        </div>
      </div>
    </Modal>
  );
}
