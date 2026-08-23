// Edit Details modal — split out of AdminEnquiryDetail.tsx. Fixes who this
// enquiry is actually about (name/contact/trip); deliberately doesn't touch
// payments, status, or booking journey.
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';

export type EditDetailsForm = {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  age: number | '';
  trip_id: string;
};

interface AdminEnquiryEditDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry;
  trips: UpcomingTrip[];
  editForm: EditDetailsForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditDetailsForm>>;
  editTouched: Set<string>;
  setEditTouched: React.Dispatch<React.SetStateAction<Set<string>>>;
  editErrors: { full_name?: string; phone?: string };
  hasEditErrors: boolean;
  savingEdit: boolean;
  onSave: () => void;
}

export default function AdminEnquiryEditDetailsModal({
  isOpen, onClose, enquiry, trips, editForm, setEditForm, editTouched, setEditTouched,
  editErrors, hasEditErrors, savingEdit, onSave,
}: AdminEnquiryEditDetailsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Details" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-dark-muted -mt-1">
          Fixes who this enquiry is actually about. Doesn't affect payments, status, or booking journey.
        </p>
        <div>
          <label htmlFor="ed-edit-name" className="block text-sm font-medium text-dark mb-1">Full Name</label>
          <input
            id="ed-edit-name"
            type="text"
            value={editForm.full_name}
            onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
            onBlur={() => setEditTouched(prev => new Set(prev).add('full_name'))}
            aria-describedby={editTouched.has('full_name') && editErrors.full_name ? 'ed-edit-name-error' : undefined}
            className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
            placeholder="e.g. Priya Sharma"
          />
          {editTouched.has('full_name') && editErrors.full_name && <p id="ed-edit-name-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.full_name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ed-edit-phone" className="block text-sm font-medium text-dark mb-1">Phone</label>
            <input
              id="ed-edit-phone"
              type="tel"
              value={editForm.phone}
              onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
              onBlur={() => setEditTouched(prev => new Set(prev).add('phone'))}
              aria-describedby={editTouched.has('phone') && editErrors.phone ? 'ed-edit-phone-error' : undefined}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="e.g. 98765 43210"
            />
            {editTouched.has('phone') && editErrors.phone && <p id="ed-edit-phone-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.phone}</p>}
          </div>
          <div>
            <label htmlFor="ed-edit-email" className="block text-sm font-medium text-dark mb-1">Email</label>
            <input
              id="ed-edit-email"
              type="email"
              value={editForm.email}
              onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ed-edit-city" className="block text-sm font-medium text-dark mb-1">City</label>
            <input
              id="ed-edit-city"
              type="text"
              value={editForm.city}
              onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="Optional"
            />
          </div>
          <div>
            <label htmlFor="ed-edit-age" className="block text-sm font-medium text-dark mb-1">Age</label>
            <input
              id="ed-edit-age"
              type="number"
              min={0}
              value={editForm.age}
              onChange={e => setEditForm(f => ({ ...f, age: e.target.value === '' ? '' : Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="Optional"
            />
          </div>
        </div>
        <div>
          <label htmlFor="ed-edit-trip" className="block text-sm font-medium text-dark mb-1">Trip</label>
          <Select
            inputId="ed-edit-trip"
            value={editForm.trip_id}
            onChange={val => setEditForm(f => ({ ...f, trip_id: val }))}
            options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
          />
          {editForm.trip_id !== (enquiry.trip_id || '') && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 mt-1.5">
              Changing the trip doesn't update an already-tracked total amount — open Payment afterwards to re-check the price for the new trip.
            </p>
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setEditTouched(new Set(['full_name', 'phone']));
              onSave();
            }}
            loading={savingEdit}
            disabled={hasEditErrors}
            title={hasEditErrors ? 'Fix the highlighted fields before saving' : undefined}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
