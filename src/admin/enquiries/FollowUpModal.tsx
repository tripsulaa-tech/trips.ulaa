import type { Dispatch, SetStateAction } from 'react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import DatePicker from '../../../components/ui/DatePicker';
import type { Enquiry } from '../../../types/types-index';

export default function FollowUpModal({
  followUpTarget,
  onClose,
  followUpDate,
  setFollowUpDate,
  onSave,
  updating,
}: {
  followUpTarget: Enquiry | null;
  onClose: () => void;
  followUpDate: string;
  setFollowUpDate: Dispatch<SetStateAction<string>>;
  onSave: () => void;
  updating: string | null;
}) {
  return (
    <Modal isOpen={!!followUpTarget} onClose={onClose} title="Set Follow-up Reminder" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-dark-muted">
          {followUpTarget?.follow_up_at
            ? 'This lead is still warm — update when to check back in.'
            : "This lead is still warm but not ready to close either way — pick a date to check back in. It'll show as due on that day, and clears automatically once this lead moves past Contacted."}
        </p>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
          <DatePicker value={followUpDate} onChange={setFollowUpDate} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={onSave} disabled={!followUpDate} loading={!!followUpTarget && updating === followUpTarget.id}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
