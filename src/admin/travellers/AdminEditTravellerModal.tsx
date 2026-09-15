// Edit modal for a Traveller Contact card. A contact isn't its own
// database row — it's every enquiry row that fuzzy-matched to the same
// person (see travellerContacts.ts) — so Save fans the same
// name/phone/email/city patch out across all of `contact.rows` via
// updateEnquiryDetails, one call per row, the same endpoint
// AdminEnquiryTravellerCard's inline edit uses. Trip/payment/status
// fields aren't touched here; this only fixes who the contact actually is.
import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import type { TravellerContact } from './travellerContacts';
import {
  validateFullName, validatePhone, validateOptionalEmail, validateOptionalCity,
} from '../../utils/formValidation';
import { getCitySuggestions, getEmailSuggestions } from '../enquiries/AdminEnquiriesShared';
import SuggestionDropdown from '../../components/ui/SuggestionDropdown';
import { useSuggestionField } from '../useSuggestionField';

export type TravellerEditForm = {
  full_name: string;
  phone: string;
  email: string;
  city: string;
};

function seedForm(contact: TravellerContact | null): TravellerEditForm {
  if (!contact) return { full_name: '', phone: '', email: '', city: '' };
  return {
    full_name: contact.fullName === 'Unnamed traveller' ? '' : contact.fullName,
    phone: contact.phone,
    email: contact.email,
    city: contact.city || '',
  };
}

const inputClass =
  'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none';

// Keyed on target.key by the parent (AdminTravellers.tsx) so this whole
// component remounts — and its form/touched state resets cleanly — every
// time a different contact is opened, instead of syncing form state to a
// changing prop via an effect.
export default function AdminEditTravellerModal({
  target,
  onClose,
  onSave,
  saving,
}: {
  target: TravellerContact | null;
  onClose: () => void;
  onSave: (form: TravellerEditForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<TravellerEditForm>(() => seedForm(target));
  const [touched, setTouched] = useState(false);

  // Same validators (and error copy) as the public BookingForm — see
  // src/utils/formValidation.ts — with email/city kept optional here,
  // same reasoning as AdminAddEnquiryModal's validateEnquiryForm. This
  // modal has no trip context (a contact can span several trips), so
  // there's no age field and no trip-specific bounds to apply anywhere.
  const nameError = (() => {
    if (!form.full_name.trim()) return 'Full name is required.';
    const err = validateFullName(form.full_name);
    return err === true ? undefined : err;
  })();
  const phoneError = (() => {
    if (!form.phone.trim()) return 'Phone number is required.';
    const err = validatePhone(form.phone);
    return err === true ? undefined : err;
  })();
  const emailErrorRaw = validateOptionalEmail(form.email);
  const emailError = emailErrorRaw === true ? undefined : emailErrorRaw;
  const cityErrorRaw = validateOptionalCity(form.city);
  const cityError = cityErrorRaw === true ? undefined : cityErrorRaw;
  const hasErrors = !!(nameError || phoneError || emailError || cityError);

  const citySuggestField = useSuggestionField(getCitySuggestions, city => {
    setForm(f => ({ ...f, city }));
    setTouched(true);
  });
  const emailSuggestField = useSuggestionField(getEmailSuggestions, email => {
    setForm(f => ({ ...f, email }));
    setTouched(true);
  });

  const handleSaveClick = () => {
    setTouched(true);
    if (!hasErrors) onSave(form);
  };

  return (
    <Modal isOpen={!!target} onClose={onClose} title="Edit Traveller" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-dark-muted -mt-1">
          {target && target.tripCount > 1
            ? `Updates these details across all ${target.tripCount} of this traveller's trips. Doesn't touch payments, status, or booking history.`
            : "Fixes who this contact actually is. Doesn't touch payments, status, or booking history."}
        </p>
        <div>
          <label htmlFor="tc-edit-name" className="block text-sm font-medium text-dark mb-1">Full Name</label>
          <input
            id="tc-edit-name"
            type="text"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            onBlur={() => setTouched(true)}
            aria-describedby={touched && nameError ? 'tc-edit-name-error' : undefined}
            className={inputClass}
            placeholder="e.g. Priya Sharma"
          />
          {touched && nameError && <p id="tc-edit-name-error" role="alert" className="text-red-500 text-xs mt-1">{nameError}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="tc-edit-phone" className="block text-sm font-medium text-dark mb-1">Phone</label>
            <input
              id="tc-edit-phone"
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              onBlur={() => setTouched(true)}
              aria-describedby={touched && phoneError ? 'tc-edit-phone-error' : undefined}
              className={inputClass}
              placeholder="e.g. 98765 43210"
            />
            {touched && phoneError && <p id="tc-edit-phone-error" role="alert" className="text-red-500 text-xs mt-1">{phoneError}</p>}
          </div>
          <div className="relative">
            <label htmlFor="tc-edit-email" className="block text-sm font-medium text-dark mb-1">Email</label>
            <input
              id="tc-edit-email"
              type="email"
              value={form.email}
              onChange={e => { setForm(f => ({ ...f, email: e.target.value })); emailSuggestField.handleInput(e.target.value); }}
              onBlur={() => { setTouched(true); emailSuggestField.close(); }}
              aria-describedby={touched && emailError ? 'tc-edit-email-error' : undefined}
              className={inputClass}
              placeholder="Optional"
            />
            {touched && emailError && <p id="tc-edit-email-error" role="alert" className="text-red-500 text-xs mt-1">{emailError}</p>}
            {emailSuggestField.open && <SuggestionDropdown items={emailSuggestField.suggestions} onSelect={emailSuggestField.select} />}
          </div>
        </div>
        <div className="relative">
          <label htmlFor="tc-edit-city" className="block text-sm font-medium text-dark mb-1">City</label>
          <input
            id="tc-edit-city"
            type="text"
            value={form.city}
            onChange={e => { setForm(f => ({ ...f, city: e.target.value })); citySuggestField.handleInput(e.target.value); }}
            onBlur={() => { setTouched(true); citySuggestField.close(); }}
            aria-describedby={touched && cityError ? 'tc-edit-city-error' : undefined}
            className={inputClass}
            placeholder="Optional"
          />
          {touched && cityError && <p id="tc-edit-city-error" role="alert" className="text-red-500 text-xs mt-1">{cityError}</p>}
          {citySuggestField.open && <SuggestionDropdown items={citySuggestField.suggestions} onSelect={citySuggestField.select} />}
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={handleSaveClick}
            loading={saving}
            disabled={hasErrors}
            title={hasErrors ? 'Fix the highlighted fields before saving' : undefined}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
