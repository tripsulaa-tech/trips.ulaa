import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import DatePicker from '../../components/ui/DatePicker';
import { useConfirm } from '../../components/ui/useConfirm';
import { BOOKING_FOLLOW_UP_TYPE_CONFIG } from './AdminEnquiryCommon';
import type { BookingFollowUpType, Enquiry } from '../../types/types-index';
import { inputClass } from './AdminEnquiriesShared';

export interface BookingFollowUpResult {
  at: string;
  time: string;
  type: BookingFollowUpType;
  notes: string;
}

const BOOKING_FOLLOW_UP_TYPE_OPTIONS = (Object.keys(BOOKING_FOLLOW_UP_TYPE_CONFIG) as BookingFollowUpType[])
  .map(value => ({ value, label: BOOKING_FOLLOW_UP_TYPE_CONFIG[value].label }));

// Booking Follow-up popup (CRM spec section 8B) — the post-booking
// counterpart to ContactOutcomeModal's Lead Follow-up date, for reminders
// like a balance payment or passport chase that come with their own type
// and notes rather than a bare date. Same "discard unsaved changes?"
// protection as every other business-data modal (spec's Unsaved Changes
// Protection section) — nothing saves until Save is explicitly pressed.
export default function BookingFollowUpModal({
  target,
  onClose,
  onSave,
  saving,
}: {
  target: Enquiry | null;
  onClose: () => void;
  onSave: (result: BookingFollowUpResult) => void | Promise<void>;
  saving: boolean;
}) {
  const confirm = useConfirm();
  const [type, setType] = useState<BookingFollowUpType>('balance_payment');
  const [at, setAt] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  // Pre-fill from any existing reminder when reopening this booking, blank
  // slate otherwise — never carry over a previous target's half-filled form.
  useEffect(() => {
    if (!target) return;
    setType(target.booking_follow_up_type || 'balance_payment');
    setAt(target.booking_follow_up_at || '');
    setTime(target.booking_follow_up_time || '');
    setNotes(target.booking_follow_up_notes || '');
  }, [target?.id]);

  const isDirty = at !== (target?.booking_follow_up_at || '')
    || time !== (target?.booking_follow_up_time || '')
    || type !== (target?.booking_follow_up_type || 'balance_payment')
    || notes !== (target?.booking_follow_up_notes || '');

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: "You've entered a follow-up reminder that hasn't been saved yet.",
        confirmLabel: 'Discard',
        cancelLabel: 'Continue Editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal isOpen={!!target} onClose={requestClose} title="Booking Follow-up" size="sm">
      {target && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3">
            <p className="font-medium text-dark">{target.full_name}</p>
            <p className="text-dark-muted text-xs">{target.trip_title || 'No trip linked'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Reminder Type</label>
            <Select value={type} onChange={val => setType(val as BookingFollowUpType)} options={BOOKING_FOLLOW_UP_TYPE_OPTIONS} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
              <DatePicker value={at} onChange={setAt} />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Follow-up Time</label>
              <input type="time" value={time} onChange={ev => setTime(ev.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={ev => setNotes(ev.target.value)}
              className={inputClass}
              rows={3}
              placeholder="e.g. which document is still pending — optional"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              disabled={!at}
              loading={saving}
              onClick={() => onSave({ at, time, type, notes })}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
