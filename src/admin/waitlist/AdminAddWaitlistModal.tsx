import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import type { UpcomingTrip } from '../../types/types-index';
import { FOOD_PREFERENCE_OPTIONS, type WaitlistForm } from './waitlistShared';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

interface AdminAddWaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: WaitlistForm;
  setForm: React.Dispatch<React.SetStateAction<WaitlistForm>>;
  formTouched: Set<string>;
  setFormTouched: React.Dispatch<React.SetStateAction<Set<string>>>;
  formErrors: { full_name?: string; phone?: string; trip_id?: string };
  hasFormErrors: boolean;
  saving: boolean;
  allTrips: UpcomingTrip[];
  onSave: () => void;
}

/** The "Add to Waitlist" modal — lets an admin log a signup taken over the
 *  phone/WhatsApp directly. Purely presentational; all state and the save
 *  call live in useAddWaitlistModal.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export default function AdminAddWaitlistModal({
  isOpen, onClose, form, setForm, formTouched, setFormTouched,
  formErrors, hasFormErrors, saving, allTrips, onSave,
}: AdminAddWaitlistModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add to Waitlist" size="md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="wl-add-name" className="block text-sm font-medium text-dark mb-1">Full Name *</label>
          <input
            id="wl-add-name"
            type="text"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            onBlur={() => setFormTouched(prev => new Set(prev).add('full_name'))}
            aria-describedby={formTouched.has('full_name') && formErrors.full_name ? 'wl-add-name-error' : undefined}
            className={inputClass}
            placeholder="e.g. Priya Sharma"
          />
          {formTouched.has('full_name') && formErrors.full_name && <p id="wl-add-name-error" role="alert" className="text-red-500 text-xs mt-1">{formErrors.full_name}</p>}
        </div>
        <div>
          <label htmlFor="wl-add-phone" className="block text-sm font-medium text-dark mb-1">Phone *</label>
          <input
            id="wl-add-phone"
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            onBlur={() => setFormTouched(prev => new Set(prev).add('phone'))}
            aria-describedby={formTouched.has('phone') && formErrors.phone ? 'wl-add-phone-error' : undefined}
            className={inputClass}
            placeholder="e.g. 98765 43210"
          />
          {formTouched.has('phone') && formErrors.phone && <p id="wl-add-phone-error" role="alert" className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
        </div>
        <div>
          <label htmlFor="wl-add-email" className="block text-sm font-medium text-dark mb-1">Email</label>
          <input
            id="wl-add-email"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className={inputClass}
            placeholder="Leave blank if unknown"
          />
        </div>
        <div>
          <label htmlFor="wl-add-age" className="block text-sm font-medium text-dark mb-1">Age</label>
          <input
            id="wl-add-age"
            type="number"
            min={0}
            value={form.age}
            onChange={e => setForm(f => ({ ...f, age: e.target.value === '' ? '' : +e.target.value }))}
            className={inputClass}
            placeholder="e.g. 28"
          />
        </div>
        <div>
          <label htmlFor="wl-add-city" className="block text-sm font-medium text-dark mb-1">City</label>
          <input
            id="wl-add-city"
            type="text"
            value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
            className={inputClass}
            placeholder="e.g. Mumbai"
          />
        </div>
        <div>
          <label htmlFor="wl-add-emergency" className="block text-sm font-medium text-dark mb-1">Emergency Contact</label>
          <input
            id="wl-add-emergency"
            type="text"
            value={form.emergency_contact}
            onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))}
            className={inputClass}
            placeholder="Optional"
          />
        </div>
        <div>
          <label htmlFor="wl-add-trip" className="block text-sm font-medium text-dark mb-1">Trip *</label>
          <Select
            inputId="wl-add-trip"
            value={form.trip_id}
            onChange={val => {
              setForm(f => ({ ...f, trip_id: val }));
              setFormTouched(prev => new Set(prev).add('trip_id'));
            }}
            options={[{ value: '', label: '— Select a trip —' }, ...allTrips.map(t => ({ value: t.id, label: t.title }))]}
          />
          {formTouched.has('trip_id') && formErrors.trip_id && <p role="alert" className="text-red-500 text-xs mt-1">{formErrors.trip_id}</p>}
        </div>
        <div>
          <label htmlFor="wl-add-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
          <Select
            inputId="wl-add-food"
            value={form.food_preference}
            onChange={val => setForm(f => ({ ...f, food_preference: val as WaitlistForm['food_preference'] }))}
            options={FOOD_PREFERENCE_OPTIONS}
          />
        </div>
        <div>
          <label htmlFor="wl-add-group-size" className="block text-sm font-medium text-dark mb-1">Group Size</label>
          <input
            id="wl-add-group-size"
            type="number"
            min={1}
            value={form.group_size}
            onChange={e => setForm(f => ({ ...f, group_size: e.target.value === '' ? '' : +e.target.value }))}
            aria-describedby="wl-add-group-size-hint"
            className={inputClass}
            placeholder="Leave blank for solo"
          />
          <p id="wl-add-group-size-hint" className="text-[11px] text-dark-muted mt-1">
            Only how many seats they need together — not the number of separate people they're asking on behalf of.
          </p>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="wl-add-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
          <textarea
            id="wl-add-notes"
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            className={`${inputClass} min-h-[80px] resize-none`}
            placeholder="Anything else worth noting"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-5">
        <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="md"
          className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
          onClick={() => {
            setFormTouched(new Set(['full_name', 'phone', 'trip_id']));
            onSave();
          }}
          loading={saving}
          disabled={hasFormErrors}
          title={hasFormErrors ? 'Fix the highlighted fields before saving' : undefined}
        >
          <span className="hidden sm:inline">Save Changes</span>
          <span className="sm:hidden">Save</span>
        </Button>
      </div>
    </Modal>
  );
}
