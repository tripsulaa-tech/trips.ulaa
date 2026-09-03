// Edit Details modal for a kid — same "fixes who this record is actually
// about, doesn't touch money/status" idea as AdminEditDetailsModal.tsx on
// the adult side, just scoped to the three fields a kid actually has of
// its own (name/age/food_preference — see Kid in types-index.ts; a kid has
// no phone/email/trip/source of its own to edit). Used by both
// AdminEnquiryKidsCard.tsx's detail-page row action and AdminEnquiries.tsx's
// list-view row action, so editing a kid looks the same regardless of
// where it was triggered from — same convention AdminKidNotInterestedModal
// already follows for its own reason picker.
import type { Dispatch, SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import type { Kid } from '../../types/types-index';
import { FOOD_PREFERENCE_OPTIONS } from '../../constants/foodPreference';

export type KidEditForm = {
  name: string;
  age: number | '';
  food_preference: 'veg' | 'non_veg' | '';
};

// eslint-disable-next-line react-refresh/only-export-components -- tiny form-shape helper only ever imported alongside this modal's default export; not worth a dedicated file
export const kidEditFormFromKid = (kid: Kid): KidEditForm => ({
  name: kid.name ?? '',
  age: kid.age != null ? kid.age : '',
  food_preference: kid.food_preference === 'veg' || kid.food_preference === 'non_veg' ? kid.food_preference : '',
});

export default function AdminKidEditModal({
  kidEditTarget,
  targetLabel,
  onClose,
  editForm,
  setEditForm,
  onSave,
  saving,
}: {
  kidEditTarget: Kid | null;
  /** Display name for the modal title/copy — same "Kid N" fallback label
   *  every other kid-scoped modal already takes (kidLabel/kidRowLabel). */
  targetLabel: string;
  onClose: () => void;
  editForm: KidEditForm;
  setEditForm: Dispatch<SetStateAction<KidEditForm>>;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Modal isOpen={!!kidEditTarget} onClose={onClose} title={`Edit ${targetLabel}`} size="sm">
      <div className="space-y-4">
        <p className="text-xs text-dark-muted -mt-1">
          Name, age, and food preference — all optional. Doesn't affect payment, status, or follow-up.
        </p>
        <div>
          <label htmlFor="kid-edit-name" className="block text-sm font-medium text-dark mb-1">Name</label>
          <input
            id="kid-edit-name"
            type="text"
            value={editForm.name}
            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
            placeholder="Optional"
          />
        </div>
        <div>
          <label htmlFor="kid-edit-age" className="block text-sm font-medium text-dark mb-1">Age</label>
          <input
            id="kid-edit-age"
            type="number"
            inputMode="numeric"
            min={0}
            max={17}
            value={editForm.age}
            onChange={e => setEditForm(f => ({ ...f, age: e.target.value === '' ? '' : Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
            placeholder="Optional"
          />
        </div>
        <div>
          <label htmlFor="kid-edit-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
          <Select
            inputId="kid-edit-food"
            value={editForm.food_preference}
            onChange={val => setEditForm(f => ({ ...f, food_preference: val as 'veg' | 'non_veg' | '' }))}
            options={FOOD_PREFERENCE_OPTIONS}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            onClick={onSave}
            loading={!!kidEditTarget && saving}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
