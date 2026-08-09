import type { Dispatch, SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import { useConfirm } from '../../components/ui/useConfirm';
import { NOT_INTERESTED_REASON_OPTIONS } from '../enquiryShared';
import type { ClosedReason, Enquiry } from '../../types/types-index';

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
  const confirm = useConfirm();
  const isDirty = closedReason !== 'no_response';

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: "You've selected a reason that hasn't been saved yet.",
        confirmLabel: 'Discard',
        cancelLabel: 'Continue Editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal isOpen={!!notInterestedTarget} onClose={requestClose} title="Mark as Not Interested" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-dark-muted">
          This closes the enquiry as a query that went nowhere — no booking was made. You can reopen it later if they get back in touch.
        </p>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Reason</label>
          <Select
            value={closedReason}
            onChange={val => setClosedReason(val as ClosedReason)}
            options={NOT_INTERESTED_REASON_OPTIONS}
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
