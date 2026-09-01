// A kid's own CRM detail view — split out as a modal (same pattern as
// AdminEnquiryFollowUpModal/AdminDetailsModal) rather than a full routed
// page, since a kid only ever makes sense in the context of its parent
// enquiry, not as a standalone URL. Still a genuine "own detail page" in
// every way that matters: editable name/age, its own status, its own
// follow-up reminder + notes, and a delete action — independent of
// whatever's showing on the parent enquiry around it.
import { useEffect, useState } from 'react';
import { Baby, Trash as Trash2 } from '@phosphor-icons/react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import DatePicker from '../../components/ui/DatePicker';
import { useConfirm } from '../../components/ui/useConfirm';
import type { Kid, KidStatus } from '../../types/types-index';

const STATUS_OPTIONS: { value: KidStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface AdminKidDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  kid: Kid | null;
  fallbackLabel: string;
  busy: boolean;
  onSave: (patch: Partial<Pick<Kid, 'name' | 'age'>>) => Promise<void>;
  onStatusChange: (status: KidStatus) => Promise<void>;
  onFollowUpChange: (followUpAt: string | null, notes?: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function AdminKidDetailModal({
  isOpen, onClose, kid, fallbackLabel, busy, onSave, onStatusChange, onFollowUpChange, onDelete,
}: AdminKidDetailModalProps) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');

  // Reset the editable fields to whatever this kid actually holds every
  // time the modal opens for a (possibly different) kid — same pattern as
  // AdminEditDetailsModal's field sync.
  useEffect(() => {
    if (!isOpen || !kid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting local editable fields to match a newly-opened (possibly different) kid, not syncing an external system
    setName(kid.name ?? '');
    setAge(kid.age != null ? String(kid.age) : '');
    setFollowUpDate(kid.follow_up_at ?? '');
    setFollowUpNotes(kid.follow_up_notes ?? '');
  }, [isOpen, kid]);

  if (!kid) return null;

  const handleSaveDetails = async () => {
    const trimmedName = name.trim();
    const parsedAge = age.trim() === '' ? null : Math.max(0, Math.min(17, Math.round(Number(age))));
    await onSave({ name: trimmedName || null, age: parsedAge != null && Number.isNaN(parsedAge) ? null : parsedAge });
  };

  const handleSaveFollowUp = async () => {
    await onFollowUpChange(followUpDate || null, followUpNotes.trim() || null);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Remove this kid record?',
      message: `This removes ${fallbackLabel}'s record from this booking. It won't change the booking's kids count or pricing — adjust those separately if this kid is no longer coming.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    await onDelete();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={fallbackLabel} size="sm">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-dark-muted text-xs">
          <Baby size={14} aria-hidden="true" /> Kid record — independent of the parent enquiry's own status/follow-up.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="kid-name" className="block text-sm font-medium text-dark mb-1">Name</label>
            <input
              id="kid-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-md border border-background-warm focus:border-primary focus:outline-none text-sm"
            />
          </div>
          <div>
            <label htmlFor="kid-age" className="block text-sm font-medium text-dark mb-1">Age</label>
            <input
              id="kid-age"
              type="number"
              inputMode="numeric"
              min={0}
              max={17}
              value={age}
              onChange={e => setAge(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-md border border-background-warm focus:border-primary focus:outline-none text-sm"
            />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSaveDetails} loading={busy}>Save Name &amp; Age</Button>

        <div className="pt-3 border-t border-background-warm">
          <label className="block text-sm font-medium text-dark mb-1">Status</label>
          <Select
            value={kid.status}
            onChange={v => onStatusChange(v as KidStatus)}
            options={STATUS_OPTIONS}
            size="md"
          />
        </div>

        {kid.status === 'pending' && (
          <div className="pt-3 border-t border-background-warm space-y-3">
            <div>
              <label htmlFor="kid-followup-date" className="block text-sm font-medium text-dark mb-1">Follow-up Date</label>
              <DatePicker id="kid-followup-date" value={followUpDate} onChange={setFollowUpDate} />
            </div>
            <div>
              <label htmlFor="kid-followup-notes" className="block text-sm font-medium text-dark mb-1">Notes (Optional)</label>
              <textarea
                id="kid-followup-notes"
                value={followUpNotes}
                onChange={e => setFollowUpNotes(e.target.value)}
                rows={2}
                placeholder="e.g. need birth certificate copy before departure"
                className="w-full px-3 py-2 rounded-md border border-background-warm focus:border-primary focus:outline-none text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveFollowUp} loading={busy}>
                {followUpDate ? 'Save Follow-up' : 'Clear Follow-up'}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-background-warm">
          <Button variant="outlineDanger" size="sm" onClick={handleDelete} disabled={busy}>
            <Trash2 size={13} aria-hidden="true" /> Remove
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
