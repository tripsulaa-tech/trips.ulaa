// Not Interested reason picker for a kid — same shape as
// AdminNotInterestedModal.tsx (adult side), just scoped to a Kid instead
// of an Enquiry, and using the shared NOT_INTERESTED_REASON_OPTIONS list
// so the picker never drifts from the adult version. Used by both
// AdminEnquiries.tsx's list-view row action and AdminEnquiryKidsCard.tsx's
// detail-page row action, so a kid marked Not Interested captures a reason
// the same way regardless of where the action was triggered from. See
// add_kid_not_interested_reason.sql.
import type { Dispatch, SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import { useConfirm } from '../../components/ui/useConfirm';
import { NOT_INTERESTED_REASON_OPTIONS } from './AdminEnquiryCommon';
import type { ClosedReason, Kid } from '../../types/types-index';

export default function AdminKidNotInterestedModal({
  kidNotInterestedTarget,
  targetLabel,
  onClose,
  closedReason,
  setClosedReason,
  onConfirm,
  updating,
}: {
  kidNotInterestedTarget: Kid | null;
  /** Display name for the modal copy — kids don't always have a name on
   *  record, so the caller passes the same "Kid N" fallback label it
   *  already uses elsewhere (kidLabel/kidRowLabel). */
  targetLabel: string;
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
    <Modal isOpen={!!kidNotInterestedTarget} onClose={requestClose} title={`Mark ${targetLabel} as Not Interested`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-dark-muted">
          This marks {targetLabel} as not coming on this trip — independent of the rest of the booking. You can change this later from the Kids card.
        </p>
        <div>
          <label htmlFor="kid-not-interested-reason" className="block text-sm font-medium text-dark mb-1">Reason</label>
          <Select
            inputId="kid-not-interested-reason"
            value={closedReason}
            onChange={val => setClosedReason(val as ClosedReason)}
            options={NOT_INTERESTED_REASON_OPTIONS}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            onClick={onConfirm}
            loading={!!kidNotInterestedTarget && updating === kidNotInterestedTarget.id}
          >
            Mark Not Interested
          </Button>
        </div>
      </div>
    </Modal>
  );
}
