import type { Dispatch, SetStateAction } from 'react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import Select from '../../../components/ui/Select';
import { CLOSED_REASON_OPTIONS } from '../../enquiryShared';
import type { ClosedReason, Enquiry } from '../../../types/types-index';

export default function NotInterestedModal({
  notInterestedTarget,
  onClose,
  closedReason,
  setClosedReason,
  onConfirm,
  updating,
}: {
  notInterestedTarget: Enquiry | null;
  onClose: () => void;
  closedReason: ClosedReason;
  setClosedReason: Dispatch<SetStateAction<ClosedReason>>;
  onConfirm: () => void;
  updating: string | null;
}) {
  return (
    <Modal isOpen={!!notInterestedTarget} onClose={onClose} title="Mark as Not Interested" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-dark-muted">
          This closes the enquiry as a query that went nowhere — no booking was made. You can reopen it later if they get back in touch.
        </p>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Reason</label>
          <Select
            value={closedReason}
            onChange={val => setClosedReason(val as ClosedReason)}
            options={CLOSED_REASON_OPTIONS}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={onConfirm} loading={!!notInterestedTarget && updating === notInterestedTarget.id}>Mark Not Interested</Button>
        </div>
      </div>
    </Modal>
  );
}
