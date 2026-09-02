import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import DatePicker from '../../components/ui/DatePicker';
import { useConfirm } from '../../components/ui/useConfirm';
import {
  CONTACT_OUTCOME_CONFIG, CONTACT_OUTCOME_OPTIONS, NOT_INTERESTED_REASON_OPTIONS,
} from './AdminEnquiryCommon';
import type { ClosedReason, ContactOutcome, Kid } from '../../types/types-index';
import { inputClass } from './AdminEnquiriesShared';

export interface KidContactOutcomeTarget {
  kid: Kid;
  /** "Kid N" fallback or the kid's own name — see useKidsForEnquiry/AdminEnquiries' kidRowLabel. */
  label: string;
  parentName: string;
  tripTitle?: string | null;
  /** Threaded through purely so the caller can open this kid's own Payment
   *  modal (openKidPayment) right after an 'interested' save, same as the
   *  adult modal's auto-open-Track-Payment — not read by this component. */
  tripId?: string;
}

export interface KidContactOutcomeResult {
  outcome: ContactOutcome;
  notes: string;
  followUpAt: string;
  closedReason: ClosedReason;
}

// The kid-scoped equivalent of AdminContactOutcomeModal — the one way a
// kid's own record moves from Pending to Contacted (or logs its next call
// attempt while already Contacted), mirroring the adult "Status must NEVER
// become Contacted until this popup is successfully saved" rule. See
// nextKidManualAction() in AdminEnquiryCommon.ts and
// recordKidContactOutcome() in services/api/enquiries/kids.ts.
//
// Deliberately no Follow-up Time field, unlike the adult modal — kids.
// (add_kids_table.sql) has no follow_up_time column of its own to write
// one to, only follow_up_at/follow_up_notes.
export default function AdminKidContactOutcomeModal({
  target,
  onClose,
  onSave,
  saving,
}: {
  target: KidContactOutcomeTarget | null;
  onClose: () => void;
  onSave: (result: KidContactOutcomeResult) => void | Promise<void>;
  saving: boolean;
}) {
  const confirm = useConfirm();
  const [outcome, setOutcome] = useState<ContactOutcome>('interested');
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [closedReason, setClosedReason] = useState<ClosedReason>('no_response');

  // Reset to a blank slate each time a different kid is opened — same
  // reasoning as AdminContactOutcomeModal's own reset effect.
  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting local form state to match a newly-opened target, not syncing an external system
    setOutcome('interested');
    setNotes('');
    setFollowUpAt('');
    setClosedReason('no_response');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only target?.kid.id is read; reset values below are fixed constants, not derived from target
  }, [target?.kid.id]);

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
            <p className="font-medium text-dark">{target.label}</p>
            <p className="text-dark-muted text-xs">of {target.parentName} — {target.tripTitle || 'No trip linked'}</p>
          </div>

          <div>
            <label htmlFor="kco-outcome" className="block text-sm font-medium text-dark mb-1">Contact Outcome</label>
            <Select
              inputId="kco-outcome"
              value={outcome}
              onChange={val => setOutcome(val as ContactOutcome)}
              options={CONTACT_OUTCOME_OPTIONS}
            />
            <p className="text-[11px] text-dark-muted mt-1">{config.description}</p>
          </div>

          {needsClosedReason && (
            <div>
              <label htmlFor="kco-closed-reason" className="block text-sm font-medium text-dark mb-1">Closed Reason</label>
              <Select
                inputId="kco-closed-reason"
                value={closedReason}
                onChange={val => setClosedReason(val as ClosedReason)}
                options={NOT_INTERESTED_REASON_OPTIONS}
              />
            </div>
          )}

          <div>
            <label htmlFor="kco-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea
              id="kco-notes"
              value={notes}
              onChange={ev => setNotes(ev.target.value)}
              className={inputClass}
              rows={3}
              placeholder="What was discussed on the call — optional"
            />
          </div>

          {needsFollowUp && (
            <div>
              <label htmlFor="kco-followup-date" className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
              <DatePicker id="kco-followup-date" value={followUpAt} onChange={setFollowUpAt} />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              disabled={!canSave}
              loading={saving}
              onClick={() => onSave({ outcome, notes, followUpAt, closedReason })}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
