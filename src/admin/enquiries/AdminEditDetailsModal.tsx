// Edit Details modal for the Enquiries list page — same fields/behaviour as
// the one on the single-enquiry detail page (AdminEnquiryDetail.tsx), just
// reachable from the row's kebab menu instead. Deliberately doesn't touch
// money/status/journey, only who the enquiry is actually about.
import { useState, type Dispatch, type SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { PACKAGE_OPTIONS, SOURCE_OPTIONS_ALL } from './AdminEnquiryCommon';
import { FOOD_PREFERENCE_OPTIONS } from '../../constants/foodPreference';
import {
  validateFullName, validatePhone, validateOptionalEmail, validateOptionalCity, validateOptionalAge,
  DEFAULT_MIN_AGE, DEFAULT_MAX_AGE,
} from '../../utils/formValidation';
import { getCitySuggestions, getEmailSuggestions } from './AdminEnquiriesShared';

// Same quick-help dropdown as AdminAddEnquiryModal's "Log an Enquiry"
// form — duplicated locally (rather than imported) since these two modals
// don't otherwise share a component file and this is the only other spot
// City/Email suggestions are offered.
function SuggestionDropdown({ items, onSelect }: { items: string[]; onSelect: (value: string) => void }) {
  return (
    <ul
      role="listbox"
      className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-md border-2 border-background-warm bg-white shadow-lg py-1"
    >
      {items.map(item => (
        <li key={item} role="option">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onSelect(item); }}
            className="w-full px-3 py-1.5 text-sm text-left text-dark hover:bg-background-warm transition-colors"
          >
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}

export type EditDetailsForm = {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  age: number | '';
  trip_id: string;
  food_preference: 'veg' | 'non_veg' | '';
  source: Enquiry['source'];
  package_type: 'early_bird' | 'normal';
};

// eslint-disable-next-line react-refresh/only-export-components -- tiny form-shape constant only ever imported alongside this modal's default export; not worth a dedicated file
export const emptyEditDetailsForm: EditDetailsForm = {
  full_name: '', email: '', phone: '', city: '', age: '', trip_id: '',
  food_preference: '', source: 'website', package_type: 'normal',
};

export default function EditDetailsModal({
  editTarget,
  onClose,
  editForm,
  setEditForm,
  editTouched,
  setEditTouched,
  trips,
  onSave,
  saving,
}: {
  editTarget: Enquiry | null;
  onClose: () => void;
  editForm: EditDetailsForm;
  setEditForm: Dispatch<SetStateAction<EditDetailsForm>>;
  editTouched: Set<string>;
  setEditTouched: Dispatch<SetStateAction<Set<string>>>;
  trips: UpcomingTrip[];
  onSave: () => void;
  saving: boolean;
}) {
  // Same validators (and error copy) as the public BookingForm — see
  // src/utils/formValidation.ts — with email/city/age kept optional here,
  // same reasoning as AdminAddEnquiryModal's validateEnquiryForm.
  const selectedTrip = editForm.trip_id ? trips.find(t => t.id === editForm.trip_id) : undefined;
  const effectiveMinAge = selectedTrip?.min_age ?? DEFAULT_MIN_AGE;
  const effectiveMaxAge = selectedTrip?.max_age ?? DEFAULT_MAX_AGE;
  const editErrors: { full_name?: string; phone?: string; email?: string; city?: string; age?: string } = {};
  if (!editForm.full_name.trim()) editErrors.full_name = 'Full name is required.';
  else {
    const nameError = validateFullName(editForm.full_name);
    if (nameError !== true) editErrors.full_name = nameError;
  }
  if (!editForm.phone.trim()) editErrors.phone = 'Phone number is required.';
  else {
    const phoneError = validatePhone(editForm.phone);
    if (phoneError !== true) editErrors.phone = phoneError;
  }
  const emailError = validateOptionalEmail(editForm.email);
  if (emailError !== true) editErrors.email = emailError;
  const cityError = validateOptionalCity(editForm.city);
  if (cityError !== true) editErrors.city = cityError;
  const ageError = validateOptionalAge(editForm.age, selectedTrip?.min_age, selectedTrip?.max_age);
  if (ageError !== true) editErrors.age = ageError;
  const hasEditErrors = !!(editErrors.full_name || editErrors.phone || editErrors.email || editErrors.city || editErrors.age);

  const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [emailSuggestionsOpen, setEmailSuggestionsOpen] = useState(false);
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const handleCityInput = (value: string) => {
    const matches = getCitySuggestions(value);
    setCitySuggestions(matches);
    setCitySuggestionsOpen(matches.length > 0);
  };
  const selectCitySuggestion = (city: string) => {
    setEditForm(f => ({ ...f, city }));
    setCitySuggestionsOpen(false);
    setEditTouched(prev => new Set(prev).add('city'));
  };
  const handleEmailInput = (value: string) => {
    const matches = getEmailSuggestions(value);
    setEmailSuggestions(matches);
    setEmailSuggestionsOpen(matches.length > 0);
  };
  const selectEmailSuggestion = (email: string) => {
    setEditForm(f => ({ ...f, email }));
    setEmailSuggestionsOpen(false);
    setEditTouched(prev => new Set(prev).add('email'));
  };

  return (
    <Modal isOpen={!!editTarget} onClose={onClose} title="Edit Details" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-dark-muted -mt-1">
          Fixes who this enquiry is actually about. Doesn't affect payments, status, or booking journey.
        </p>
        <div>
          <label htmlFor="eq-edit-name" className="block text-sm font-medium text-dark mb-1">Full Name</label>
          <input
            id="eq-edit-name"
            type="text"
            value={editForm.full_name}
            onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
            onBlur={() => setEditTouched(prev => new Set(prev).add('full_name'))}
            aria-describedby={editTouched.has('full_name') && editErrors.full_name ? 'eq-edit-name-error' : undefined}
            className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
            placeholder="e.g. Priya Sharma"
          />
          {editTouched.has('full_name') && editErrors.full_name && <p id="eq-edit-name-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.full_name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="eq-edit-phone" className="block text-sm font-medium text-dark mb-1">Phone</label>
            <input
              id="eq-edit-phone"
              type="tel"
              value={editForm.phone}
              onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
              onBlur={() => setEditTouched(prev => new Set(prev).add('phone'))}
              aria-describedby={editTouched.has('phone') && editErrors.phone ? 'eq-edit-phone-error' : undefined}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="e.g. 98765 43210"
            />
            {editTouched.has('phone') && editErrors.phone && <p id="eq-edit-phone-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.phone}</p>}
          </div>
          <div className="relative">
            <label htmlFor="eq-edit-email" className="block text-sm font-medium text-dark mb-1">Email</label>
            <input
              id="eq-edit-email"
              type="email"
              value={editForm.email}
              onChange={e => { setEditForm(f => ({ ...f, email: e.target.value })); handleEmailInput(e.target.value); }}
              onBlur={() => { setEditTouched(prev => new Set(prev).add('email')); setEmailSuggestionsOpen(false); }}
              aria-describedby={editTouched.has('email') && editErrors.email ? 'eq-edit-email-error' : undefined}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="Optional"
            />
            {editTouched.has('email') && editErrors.email && <p id="eq-edit-email-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.email}</p>}
            {emailSuggestionsOpen && <SuggestionDropdown items={emailSuggestions} onSelect={selectEmailSuggestion} />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label htmlFor="eq-edit-city" className="block text-sm font-medium text-dark mb-1">City</label>
            <input
              id="eq-edit-city"
              type="text"
              value={editForm.city}
              onChange={e => { setEditForm(f => ({ ...f, city: e.target.value })); handleCityInput(e.target.value); }}
              onBlur={() => { setEditTouched(prev => new Set(prev).add('city')); setCitySuggestionsOpen(false); }}
              aria-describedby={editTouched.has('city') && editErrors.city ? 'eq-edit-city-error' : undefined}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="Optional"
            />
            {editTouched.has('city') && editErrors.city && <p id="eq-edit-city-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.city}</p>}
            {citySuggestionsOpen && <SuggestionDropdown items={citySuggestions} onSelect={selectCitySuggestion} />}
          </div>
          <div>
            <label htmlFor="eq-edit-age" className="block text-sm font-medium text-dark mb-1">Age</label>
            <input
              id="eq-edit-age"
              type="number"
              min={0}
              value={editForm.age}
              onChange={e => setEditForm(f => ({ ...f, age: e.target.value === '' ? '' : Number(e.target.value) }))}
              onBlur={() => setEditTouched(prev => new Set(prev).add('age'))}
              aria-describedby={editTouched.has('age') && editErrors.age ? 'eq-edit-age-error' : 'eq-edit-age-hint'}
              className="w-full px-3 py-2 rounded-md border-2 border-background-warm bg-white text-sm focus:border-primary outline-none"
              placeholder="Optional"
            />
            {!(editTouched.has('age') && editErrors.age) && editForm.trip_id && (
              <p id="eq-edit-age-hint" className="text-[11px] text-dark-muted mt-1">Ages {effectiveMinAge}–{effectiveMaxAge}.</p>
            )}
            {editTouched.has('age') && editErrors.age && <p id="eq-edit-age-error" role="alert" className="text-red-500 text-xs mt-1">{editErrors.age}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="eq-edit-trip" className="block text-sm font-medium text-dark mb-1">Trip</label>
          <Select
            inputId="eq-edit-trip"
            value={editForm.trip_id}
            onChange={val => setEditForm(f => ({ ...f, trip_id: val }))}
            options={[{ value: '', label: '— No trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
          />
          {editTarget && editForm.trip_id !== (editTarget.trip_id || '') && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 mt-1.5">
              Changing the trip doesn't update an already-tracked total amount — open Payment afterwards to re-check the price for the new trip.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="eq-edit-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              inputId="eq-edit-food"
              value={editForm.food_preference}
              onChange={val => setEditForm(f => ({ ...f, food_preference: val as 'veg' | 'non_veg' | '' }))}
              options={FOOD_PREFERENCE_OPTIONS}
            />
          </div>
          <div>
            <label htmlFor="eq-edit-source" className="block text-sm font-medium text-dark mb-1">Source</label>
            <Select
              inputId="eq-edit-source"
              value={editForm.source}
              onChange={val => setEditForm(f => ({ ...f, source: val as Enquiry['source'] }))}
              options={SOURCE_OPTIONS_ALL}
            />
          </div>
        </div>
        <div>
          <label htmlFor="eq-edit-package" className="block text-sm font-medium text-dark mb-1">Package</label>
          <Select
            inputId="eq-edit-package"
            value={editForm.package_type}
            onChange={val => setEditForm(f => ({ ...f, package_type: val as 'early_bird' | 'normal' }))}
            options={PACKAGE_OPTIONS}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => { setEditTouched(new Set(['full_name', 'phone', 'email', 'city', 'age'])); onSave(); }}
            loading={saving}
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
