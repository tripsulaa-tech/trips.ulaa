// Follow-up reminder date picker — split out of AdminEnquiryDetail.tsx.
// See handleOpenFollowUp in the parent.
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import DatePicker from '../../components/ui/DatePicker';
import type { Enquiry } from '../../types/types-index';

interface AdminEnquiryFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry;
  followUpDate: string;
  setFollowUpDate: (date: string) => void;
  busy: boolean;
  onSave: () => void;
}

export default function AdminEnquiryFollowUpModal({
  isOpen, onClose, enquiry, followUpDate, setFollowUpDate, busy, onSave,
}: AdminEnquiryFollowUpModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Follow-up Reminder" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-dark-muted">
          {enquiry.follow_up_at
            ? 'This lead is still warm — update when to check back in.'
            : "This lead is still warm but not ready to close either way — pick a date to check back in. It'll show as due on that day, and clears automatically once this lead moves past Contacted."}
        </p>
        <div>
          <label htmlFor="ed-followup-date" className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
          <DatePicker id="ed-followup-date" value={followUpDate} onChange={setFollowUpDate} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={onSave} disabled={!followUpDate} loading={busy}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
