import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import DatePicker from '../../components/ui/DatePicker';
import TimePicker from '../../components/ui/TimePicker';
import { useConfirm } from '../../components/ui/useConfirm';
import {
  CONTACT_OUTCOME_CONFIG, CONTACT_OUTCOME_OPTIONS, NOT_INTERESTED_REASON_OPTIONS,
} from './AdminEnquiryCommon';
import type { ClosedReason, ContactOutcome, Enquiry } from '../../types/types-index';
import { inputClass } from './AdminEnquiriesShared';

export interface ContactOutcomeResult {
  outcome: ContactOutcome;
  notes: string;
  followUpAt: string;
  followUpTime: string;
  closedReason: ClosedReason;
}

// The "Record Contact Outcome" popup — the one way a lead moves from New to
// Contacted (or logs its next call attempt while already Contacted). Status
// never changes until this saves; closing without saving leaves the lead
// exactly where it was, and closing with unsaved input asks first (see the
// "Status must NEVER become Contacted until popup is successfully saved"
// rule this implements).
export default function ContactOutcomeModal({
  target,
  onClose,
  onSave,
  saving,
}: {
  target: Enquiry | null;
  onClose: () => void;
  onSave: (result: ContactOutcomeResult) => void | Promise<void>;
  saving: boolean;
}) {
  const confirm = useConfirm();
  const [outcome, setOutcome] = useState<ContactOutcome>('interested');
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [closedReason, setClosedReason] = useState<ClosedReason>('no_response');

  // Reset to a blank slate each time a different lead is opened — never
  // carry over a previous target's half-filled form. Only target?.id is
  // read here (the reset values themselves are fixed constants), so that's
  // the only real dependency.
  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting local form state to match a newly-opened target, not syncing an external system
    setOutcome('interested');
    setNotes('');
    setFollowUpAt('');
    setFollowUpTime('');
    setClosedReason('no_response');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only target?.id is read; reset values below are fixed constants, not derived from target
  }, [target?.id]);

  const config = CONTACT_OUTCOME_CONFIG[outcome];
  const needsFollowUp = config.effect === 'stays_contacted';
  const needsClosedReason = outcome === 'not_interested';
  const isDirty = notes.trim() !== '' || followUpAt !== '' || outcome !== 'interested';

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: "You've entered details for this call that haven't been saved yet.",
        confirmLabel: 'Discard',
        cancelLabel: 'Continue Editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  const canSave = needsFollowUp ? !!followUpAt : true;

  return (
    <Modal isOpen={!!target} onClose={requestClose} title="Log Call Outcome" size="sm">
      {target && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3">
            <p className="font-medium text-dark">{target.full_name}</p>
            <p className="text-dark-muted text-xs">{target.trip_title || 'No trip linked'}</p>
          </div>

          <div>
            <label htmlFor="co-outcome" className="block text-sm font-medium text-dark mb-1">Contact Outcome</label>
            <Select
              inputId="co-outcome"
              value={outcome}
              onChange={val => setOutcome(val as ContactOutcome)}
              options={CONTACT_OUTCOME_OPTIONS}
            />
            <p className="text-[11px] text-dark-muted mt-1">{config.description}</p>
          </div>

          {needsClosedReason && (
            <div>
              <label htmlFor="co-closed-reason" className="block text-sm font-medium text-dark mb-1">Closed Reason</label>
              <Select
                inputId="co-closed-reason"
                value={closedReason}
                onChange={val => setClosedReason(val as ClosedReason)}
                options={NOT_INTERESTED_REASON_OPTIONS}
              />
            </div>
          )}

          <div>
            <label htmlFor="co-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea
              id="co-notes"
              value={notes}
              onChange={ev => setNotes(ev.target.value)}
              className={inputClass}
              rows={3}
              placeholder="What was discussed on the call — optional"
            />
          </div>

          {needsFollowUp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="co-followup-date" className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
                <DatePicker id="co-followup-date" value={followUpAt} onChange={setFollowUpAt} />
              </div>
              <div>
                <label htmlFor="co-followup-time" className="block text-sm font-medium text-dark mb-1">Follow-up Time</label>
                <TimePicker id="co-followup-time" value={followUpTime} onChange={setFollowUpTime} />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              disabled={!canSave}
              loading={saving}
              onClick={() => onSave({ outcome, notes, followUpAt, followUpTime, closedReason })}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
