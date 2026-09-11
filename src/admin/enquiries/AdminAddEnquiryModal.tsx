import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Warning as AlertTriangle,
  Confetti as PartyPopper,
  Users,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import { useConfirm } from '../../components/ui/useConfirm';
import MethodReferenceFields from './MethodReferenceFields';
import { parseNonNegative, PACKAGE_OPTIONS, FOOD_PREFERENCE_OPTIONS, PAYMENT_METHOD_OPTIONS, journeyBadge } from './AdminEnquiryCommon';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import {
  inputClass, validateEnquiryForm, validateWaitlistPersonForm, getCitySuggestions, getEmailSuggestions,
  type EnquiryForm, type WaitlistPersonForm,
} from './AdminEnquiriesShared';
import { SOURCE_OPTIONS } from './AdminEnquiriesShared';
import { DEFAULT_MIN_AGE, DEFAULT_MAX_AGE } from '../../utils/formValidation';
import type { TravellerContact } from '../travellers/travellerContacts';

// Small shared dropdown for the City / Email-domain quick-help below —
// same look and mousedown-before-blur trick as BookingForm's own
// SuggestionDropdown (public enquiry form), just themed for the admin
// panel's plainer inputs instead of the public site's rounded-2xl style.
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
            // onMouseDown (not onClick) fires before the input's onBlur, and
            // preventDefault stops that blur from firing at all — so picking
            // a suggestion never races with the dropdown closing itself out
            // from under the click.
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

type ConvertingWaitlist = { id: string; name: string; groupId: string | null; groupSize: number | null; groupSeq: number; slots: number };

export default function AddEnquiryModal({
  isOpen,
  onClose,
  convertingWaitlist,
  form,
  setForm,
  trips,
  waitlistPeople,
  updateWaitlistPerson,
  possibleDuplicates,
  applySuggestedAmount,
  applyDuplicate,
  onSave,
  saving,
}: {
  isOpen: boolean;
  onClose: () => void;
  convertingWaitlist: ConvertingWaitlist | null;
  form: EnquiryForm;
  setForm: Dispatch<SetStateAction<EnquiryForm>>;
  trips: UpcomingTrip[];
  waitlistPeople: WaitlistPersonForm[];
  updateWaitlistPerson: (index: number, patch: Partial<WaitlistPersonForm>) => void;
  possibleDuplicates: TravellerContact[];
  applySuggestedAmount: (tripId: string, packageType: Enquiry['package_type']) => void;
  applyDuplicate: (contact: TravellerContact) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const confirm = useConfirm();
  const errorClass = 'text-red-500 text-xs mt-1';
  const isDirty = form.full_name.trim() !== '' || form.phone.trim() !== '' || (form.amount_paid !== '' && Number(form.amount_paid) > 0);

  // Trip-specific age eligibility for whichever trip is currently picked —
  // same fallback-to-app-default behaviour as the public BookingForm (see
  // its minAge/maxAge props), just resolved here from the trip list
  // instead of being passed in as a prop, since this modal (unlike
  // BookingForm) picks its own trip via the Trip select below.
  const selectedTrip = trips.find(t => t.id === form.trip_id);
  const effectiveMinAge = selectedTrip?.min_age ?? DEFAULT_MIN_AGE;
  const effectiveMaxAge = selectedTrip?.max_age ?? DEFAULT_MAX_AGE;

  // City / email-domain suggestion dropdown state for the solo form —
  // same purpose as BookingForm's own citySuggestions*/emailSuggestions*
  // state, just local to this modal instead of the public form.
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
    setForm(f => ({ ...f, city }));
    setCitySuggestionsOpen(false);
    touch('city');
  };
  const handleEmailInput = (value: string) => {
    const matches = getEmailSuggestions(value);
    setEmailSuggestions(matches);
    setEmailSuggestionsOpen(matches.length > 0);
  };
  const selectEmailSuggestion = (email: string) => {
    setForm(f => ({ ...f, email }));
    setEmailSuggestionsOpen(false);
    touch('email');
  };

  // Same idea, per row, for the group (multi-seat waitlist conversion)
  // form — only one row's dropdown is ever open at a time, so a single
  // "which row" index is enough rather than per-row state.
  const [personCitySuggestFor, setPersonCitySuggestFor] = useState<number | null>(null);
  const [personCitySuggestions, setPersonCitySuggestions] = useState<string[]>([]);
  const [personEmailSuggestFor, setPersonEmailSuggestFor] = useState<number | null>(null);
  const [personEmailSuggestions, setPersonEmailSuggestions] = useState<string[]>([]);
  const handlePersonCityInput = (i: number, value: string) => {
    const matches = getCitySuggestions(value);
    setPersonCitySuggestions(matches);
    setPersonCitySuggestFor(matches.length > 0 ? i : null);
  };
  const selectPersonCitySuggestion = (i: number, city: string) => {
    updateWaitlistPerson(i, { city });
    setPersonCitySuggestFor(null);
    touchPerson(i, 'city');
  };
  const handlePersonEmailInput = (i: number, value: string) => {
    const matches = getEmailSuggestions(value);
    setPersonEmailSuggestions(matches);
    setPersonEmailSuggestFor(matches.length > 0 ? i : null);
  };
  const selectPersonEmailSuggestion = (i: number, email: string) => {
    updateWaitlistPerson(i, { email });
    setPersonEmailSuggestFor(null);
    touchPerson(i, 'email');
  };

  // Which fields have been blurred yet — required-field errors (name,
  // phone, and the "advance required to convert" amount check) would
  // otherwise fire the instant the modal opens, since these all start
  // blank/zero. Resets whenever the modal is (re)opened. A plain Set keyed
  // by field name for the solo form; a Set of `${index}:${field}` for the
  // per-seat group form below, since each row needs its own touched state.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [touchedPeople, setTouchedPeople] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting local "touched" tracking to match a newly-opened modal, not syncing an external system
      setTouched(new Set());
      setTouchedPeople(new Set());
    }
  }, [isOpen, convertingWaitlist?.id]);
  const touch = (field: string) => setTouched(prev => new Set(prev).add(field));
  const touchPerson = (i: number, field: string) => setTouchedPeople(prev => new Set(prev).add(`${i}:${field}`));

  // Live, field-level errors for the solo form — recomputed on every
  // render so a missing name/phone or an amount that doesn't qualify for
  // a waitlist conversion show up as the admin fills the form, instead of
  // only surfacing behind an alert() after Save.
  const soloErrors = validateEnquiryForm(form, !!convertingWaitlist, selectedTrip?.min_age, selectedTrip?.max_age);
  const soloErrorsVisible = {
    full_name: touched.has('full_name') ? soloErrors.full_name : undefined,
    phone: touched.has('phone') ? soloErrors.phone : undefined,
    email: touched.has('email') ? soloErrors.email : undefined,
    city: touched.has('city') ? soloErrors.city : undefined,
    age: touched.has('age') ? soloErrors.age : undefined,
    amount_paid: touched.has('amount_paid') ? soloErrors.amount_paid : undefined,
  };
  const hasSoloErrors = Object.keys(soloErrors).length > 0;

  // Same, per row, for the group (multi-seat waitlist conversion) form.
  const groupErrors = waitlistPeople.map(p => validateWaitlistPersonForm(p, form.total_amount, selectedTrip?.min_age, selectedTrip?.max_age));
  const hasGroupErrors = groupErrors.some(e => Object.keys(e).length > 0);

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: "You've entered enquiry details that haven't been saved yet.",
        confirmLabel: 'Discard',
        cancelLabel: 'Continue Editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={convertingWaitlist ? 'Convert Waitlist Signup' : 'Log an Enquiry'} size="md">
      {convertingWaitlist && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2.5 mb-4 text-sm text-green-800">
          <PartyPopper size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            {convertingWaitlist.slots > 1 ? (
              <>
                <span className="font-semibold">{convertingWaitlist.slots} seats</span> just opened up for{' '}
                <span className="font-semibold">{convertingWaitlist.name}</span>'s group. Fill in each person below and
                record their payment — all {convertingWaitlist.slots} will be booked and marked "converted" on the
                waitlist together.
              </>
            ) : (
              <>
                A seat opened up for <span className="font-semibold">{convertingWaitlist.name}</span>. Confirm the details
                below and record their payment to book the seat — they'll be marked "converted" on the waitlist automatically.
              </>
            )}
          </p>
        </div>
      )}

      {convertingWaitlist && convertingWaitlist.slots > 1 ? (
        <>
          {/* Shared trip/package/pricing — one trip, one price, several people */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="ge-g-trip" className="block text-sm font-medium text-dark mb-1">Trip</label>
              <Select
                inputId="ge-g-trip"
                value={form.trip_id}
                onChange={val => {
                  setForm(f => ({ ...f, trip_id: val }));
                  applySuggestedAmount(val, form.package_type);
                }}
                options={[{ value: '', label: '— No trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
              />
            </div>
            <div>
              <label htmlFor="ge-g-package" className="block text-sm font-medium text-dark mb-1">Package</label>
              <Select
                inputId="ge-g-package"
                value={form.package_type}
                onChange={val => {
                  const packageType = val as Enquiry['package_type'];
                  setForm(f => ({ ...f, package_type: packageType }));
                  applySuggestedAmount(form.trip_id, packageType);
                }}
                options={PACKAGE_OPTIONS}
              />
            </div>
            <div>
              <label htmlFor="ge-g-total" className="block text-sm font-medium text-dark mb-1">Total Amount (₹) <span className="text-dark-muted font-normal">— per person</span></label>
              <input
                id="ge-g-total"
                type="number"
                min={0}
                value={form.total_amount}
                onChange={e => setForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                className={inputClass}
                placeholder="e.g. 15000"
              />
            </div>
            <div>
              <label htmlFor="ge-g-source" className="block text-sm font-medium text-dark mb-1">Source *</label>
              <Select
                inputId="ge-g-source"
                value={form.source}
                onChange={val => setForm(f => ({ ...f, source: val as Enquiry['source'] }))}
                options={SOURCE_OPTIONS}
              />
            </div>
            <MethodReferenceFields
              idPrefix="ge-g"
              methodLabel={<>Payment Method <span className="text-dark-muted font-normal">— for everyone's advance</span></>}
              value={form.payment_method}
              onChange={val => setForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
              utrValue={form.payment_utr}
              onUtrChange={val => setForm(f => ({ ...f, payment_utr: val }))}
              options={PAYMENT_METHOD_OPTIONS}
              utrPlaceholderExample="e.g. 426817XXXXXX"
              inputClassName={inputClass}
            />
          </div>

          {/* One card per seat being filled this pass */}
          <div className="space-y-4">
            {waitlistPeople.map((p, i) => (
              <div key={i} className="border-2 border-background-warm rounded-md p-3">
                <p className="text-xs font-button font-semibold text-dark-muted mb-2 flex items-center gap-1.5">
                  <Users size={12} aria-hidden="true" /> Seat {convertingWaitlist.groupSeq + i} of {convertingWaitlist.groupSize}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label htmlFor={`ge-p-name-${i}`} className="block text-xs font-medium text-dark mb-1">Full Name *</label>
                    <input
                      id={`ge-p-name-${i}`}
                      value={p.full_name}
                      onChange={e => updateWaitlistPerson(i, { full_name: e.target.value })}
                      onBlur={() => touchPerson(i, 'full_name')}
                      aria-describedby={touchedPeople.has(`${i}:full_name`) && groupErrors[i].full_name ? `ge-p-name-${i}-error` : undefined}
                      className={inputClass}
                      placeholder="e.g. Priya Sharma"
                    />
                    {touchedPeople.has(`${i}:full_name`) && groupErrors[i].full_name && <p id={`ge-p-name-${i}-error`} role="alert" className={errorClass}>{groupErrors[i].full_name}</p>}
                  </div>
                  <div>
                    <label htmlFor={`ge-p-phone-${i}`} className="block text-xs font-medium text-dark mb-1">Phone *</label>
                    <input
                      id={`ge-p-phone-${i}`}
                      value={p.phone}
                      onChange={e => updateWaitlistPerson(i, { phone: e.target.value })}
                      onBlur={() => touchPerson(i, 'phone')}
                      aria-describedby={touchedPeople.has(`${i}:phone`) && groupErrors[i].phone ? `ge-p-phone-${i}-error` : undefined}
                      className={inputClass}
                      placeholder="e.g. 98765 43210"
                    />
                    {touchedPeople.has(`${i}:phone`) && groupErrors[i].phone && <p id={`ge-p-phone-${i}-error`} role="alert" className={errorClass}>{groupErrors[i].phone}</p>}
                  </div>
                  <div className="relative">
                    <label htmlFor={`ge-p-email-${i}`} className="block text-xs font-medium text-dark mb-1">Email</label>
                    <input
                      id={`ge-p-email-${i}`}
                      type="email"
                      value={p.email}
                      onChange={e => { updateWaitlistPerson(i, { email: e.target.value }); handlePersonEmailInput(i, e.target.value); }}
                      onBlur={() => { touchPerson(i, 'email'); setPersonEmailSuggestFor(null); }}
                      aria-describedby={touchedPeople.has(`${i}:email`) && groupErrors[i].email ? `ge-p-email-${i}-error` : undefined}
                      className={inputClass}
                      placeholder="Optional"
                    />
                    {touchedPeople.has(`${i}:email`) && groupErrors[i].email && <p id={`ge-p-email-${i}-error`} role="alert" className={errorClass}>{groupErrors[i].email}</p>}
                    {personEmailSuggestFor === i && <SuggestionDropdown items={personEmailSuggestions} onSelect={email => selectPersonEmailSuggestion(i, email)} />}
                  </div>
                  <div>
                    <label htmlFor={`ge-p-age-${i}`} className="block text-xs font-medium text-dark mb-1">Age</label>
                    <input
                      id={`ge-p-age-${i}`}
                      type="number"
                      min={0}
                      value={p.age}
                      onChange={e => updateWaitlistPerson(i, { age: e.target.value === '' ? '' : +e.target.value })}
                      onBlur={() => touchPerson(i, 'age')}
                      aria-describedby={touchedPeople.has(`${i}:age`) && groupErrors[i].age ? `ge-p-age-${i}-error` : `ge-p-age-${i}-hint`}
                      className={inputClass}
                      placeholder="Optional"
                    />
                    {!(touchedPeople.has(`${i}:age`) && groupErrors[i].age) && form.trip_id && (
                      <p id={`ge-p-age-${i}-hint`} className="text-[11px] text-dark-muted mt-1">Ages {effectiveMinAge}–{effectiveMaxAge}.</p>
                    )}
                    {touchedPeople.has(`${i}:age`) && groupErrors[i].age && <p id={`ge-p-age-${i}-error`} role="alert" className={errorClass}>{groupErrors[i].age}</p>}
                  </div>
                  <div className="relative">
                    <label htmlFor={`ge-p-city-${i}`} className="block text-xs font-medium text-dark mb-1">City</label>
                    <input
                      id={`ge-p-city-${i}`}
                      value={p.city}
                      onChange={e => { updateWaitlistPerson(i, { city: e.target.value }); handlePersonCityInput(i, e.target.value); }}
                      onBlur={() => { touchPerson(i, 'city'); setPersonCitySuggestFor(null); }}
                      aria-describedby={touchedPeople.has(`${i}:city`) && groupErrors[i].city ? `ge-p-city-${i}-error` : undefined}
                      className={inputClass}
                      placeholder="Optional"
                    />
                    {touchedPeople.has(`${i}:city`) && groupErrors[i].city && <p id={`ge-p-city-${i}-error`} role="alert" className={errorClass}>{groupErrors[i].city}</p>}
                    {personCitySuggestFor === i && <SuggestionDropdown items={personCitySuggestions} onSelect={city => selectPersonCitySuggestion(i, city)} />}
                  </div>
                  <div>
                    <label htmlFor={`ge-p-food-${i}`} className="block text-xs font-medium text-dark mb-1">Food Preference</label>
                    <Select
                      inputId={`ge-p-food-${i}`}
                      value={p.food_preference}
                      onChange={val => updateWaitlistPerson(i, { food_preference: val as WaitlistPersonForm['food_preference'] })}
                      options={FOOD_PREFERENCE_OPTIONS}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`ge-p-amount-${i}`} className="block text-xs font-medium text-dark mb-1">Amount Paid (₹) *</label>
                    <input
                      id={`ge-p-amount-${i}`}
                      type="number"
                      min={0}
                      value={p.amount_paid}
                      onChange={e => updateWaitlistPerson(i, { amount_paid: parseNonNegative(e.target.value) })}
                      onBlur={() => touchPerson(i, 'amount_paid')}
                      aria-describedby={touchedPeople.has(`${i}:amount_paid`) && groupErrors[i].amount_paid ? `ge-p-amount-${i}-error` : undefined}
                      className={inputClass}
                      placeholder="e.g. 5000 (advance)"
                    />
                    {touchedPeople.has(`${i}:amount_paid`) && groupErrors[i].amount_paid && <p id={`ge-p-amount-${i}-error`} role="alert" className={errorClass}>{groupErrors[i].amount_paid}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <label htmlFor="ge-g-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea id="ge-g-notes" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this group" />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="col-span-2">
            <label htmlFor="ge-name" className="block text-sm font-medium text-dark mb-1">Full Name *</label>
            <input
              id="ge-name"
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              onBlur={() => touch('full_name')}
              aria-describedby={soloErrorsVisible.full_name ? 'ge-name-error' : undefined}
              className={inputClass}
              placeholder="e.g. Priya Sharma"
            />
            {soloErrorsVisible.full_name && <p id="ge-name-error" role="alert" className={errorClass}>{soloErrorsVisible.full_name}</p>}
          </div>
          <div>
            <label htmlFor="ge-phone" className="block text-sm font-medium text-dark mb-1">Phone *</label>
            <input
              id="ge-phone"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              onBlur={() => touch('phone')}
              aria-describedby={soloErrorsVisible.phone ? 'ge-phone-error' : undefined}
              className={inputClass}
              placeholder="e.g. 98765 43210"
            />
            {soloErrorsVisible.phone && <p id="ge-phone-error" role="alert" className={errorClass}>{soloErrorsVisible.phone}</p>}
          </div>
          <div className="relative">
            <label htmlFor="ge-email" className="block text-sm font-medium text-dark mb-1">Email</label>
            <input
              id="ge-email"
              type="email"
              value={form.email}
              onChange={e => { setForm(f => ({ ...f, email: e.target.value })); handleEmailInput(e.target.value); }}
              onBlur={() => { touch('email'); setEmailSuggestionsOpen(false); }}
              aria-describedby={soloErrorsVisible.email ? 'ge-email-error' : undefined}
              className={inputClass}
              placeholder="Optional"
            />
            {soloErrorsVisible.email && <p id="ge-email-error" role="alert" className={errorClass}>{soloErrorsVisible.email}</p>}
            {emailSuggestionsOpen && <SuggestionDropdown items={emailSuggestions} onSelect={selectEmailSuggestion} />}
          </div>

          {/* Possible-duplicate soft warning (3.5) — fuzzy phone/email
              match against every enquiry already in the system, not just
              this trip. Advisory only; doesn't block Save. Grouped one
              entry per matched *person* (via buildTravellerContacts, same
              as the Contact Book), with their trip history listed
              underneath — not one line per raw enquiry row or even per
              trip, so a repeat traveller doesn't show up several times
              over. */}
          {possibleDuplicates.length > 0 && (
            <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Possible duplicate{possibleDuplicates.length > 1 ? 's' : ''} — matches this phone or email
                  </p>
                  <p className="text-xs text-amber-700/80">Double-check this isn't the same traveler.</p>
                </div>
              </div>
              <ul className="mt-2 border-t border-amber-200/70 divide-y divide-amber-200/70">
                {possibleDuplicates.slice(0, 5).map(contact => (
                  <li key={contact.key} className="py-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate">{contact.fullName}</p>
                      <button
                        type="button"
                        onClick={() => applyDuplicate(contact)}
                        className="shrink-0 text-xs font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950"
                      >
                        Use details
                      </button>
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {contact.trips.map(trip => (
                        <li key={trip.key} className="text-xs text-amber-700/80 truncate">
                          {trip.tripTitle} · {journeyBadge(trip.representative).label}{trip.seatCount > 1 ? ` · ${trip.seatCount} seats` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {possibleDuplicates.length > 5 && (
                  <li className="py-1.5 text-xs text-amber-700/80">+ {possibleDuplicates.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="ge-age" className="block text-sm font-medium text-dark mb-1">Age</label>
            <input
              id="ge-age"
              type="number"
              min={0}
              value={form.age}
              onChange={e => setForm(f => ({ ...f, age: e.target.value === '' ? '' : +e.target.value }))}
              onBlur={() => touch('age')}
              aria-describedby={soloErrorsVisible.age ? 'ge-age-error' : 'ge-age-hint'}
              className={inputClass}
              placeholder="Optional"
            />
            {!soloErrorsVisible.age && form.trip_id && (
              <p id="ge-age-hint" className="text-[11px] text-dark-muted mt-1">This trip is open to ages {effectiveMinAge}–{effectiveMaxAge}.</p>
            )}
            {soloErrorsVisible.age && <p id="ge-age-error" role="alert" className={errorClass}>{soloErrorsVisible.age}</p>}
          </div>
          <div className="relative">
            <label htmlFor="ge-city" className="block text-sm font-medium text-dark mb-1">City</label>
            <input
              id="ge-city"
              value={form.city}
              onChange={e => { setForm(f => ({ ...f, city: e.target.value })); handleCityInput(e.target.value); }}
              onBlur={() => { touch('city'); setCitySuggestionsOpen(false); }}
              aria-describedby={soloErrorsVisible.city ? 'ge-city-error' : undefined}
              className={inputClass}
              placeholder="Optional"
            />
            {soloErrorsVisible.city && <p id="ge-city-error" role="alert" className={errorClass}>{soloErrorsVisible.city}</p>}
            {citySuggestionsOpen && <SuggestionDropdown items={citySuggestions} onSelect={selectCitySuggestion} />}
          </div>
          <div>
            <label htmlFor="ge-source" className="block text-sm font-medium text-dark mb-1">Source *</label>
            <Select
              inputId="ge-source"
              value={form.source}
              onChange={val => setForm(f => ({ ...f, source: val as Enquiry['source'] }))}
              options={SOURCE_OPTIONS}
            />
          </div>
          <div>
            <label htmlFor="ge-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              inputId="ge-food"
              value={form.food_preference}
              onChange={val => setForm(f => ({ ...f, food_preference: val as EnquiryForm['food_preference'] }))}
              options={FOOD_PREFERENCE_OPTIONS}
            />
          </div>
          <div>
            <label htmlFor="ge-trip" className="block text-sm font-medium text-dark mb-1">Trip</label>
            <Select
              inputId="ge-trip"
              value={form.trip_id}
              onChange={val => {
                setForm(f => ({ ...f, trip_id: val }));
                applySuggestedAmount(val, form.package_type);
              }}
              options={[{ value: '', label: '— No trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
            />
          </div>
          <div>
            <label htmlFor="ge-package" className="block text-sm font-medium text-dark mb-1">Package</label>
            <Select
              inputId="ge-package"
              value={form.package_type}
              onChange={val => {
                const packageType = val as Enquiry['package_type'];
                setForm(f => ({ ...f, package_type: packageType }));
                applySuggestedAmount(form.trip_id, packageType);
              }}
              options={PACKAGE_OPTIONS}
            />
          </div>
          <div>
            <label htmlFor="ge-total" className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
            <input
              id="ge-total"
              type="number"
              min={0}
              value={form.total_amount}
              onChange={e => setForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
              className={inputClass}
              placeholder="e.g. 15000"
            />
          </div>
          <div>
            <label htmlFor="ge-amount-paid" className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
            <input
              id="ge-amount-paid"
              type="number"
              min={0}
              value={form.amount_paid}
              onChange={e => setForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
              onBlur={() => touch('amount_paid')}
              aria-describedby={soloErrorsVisible.amount_paid ? 'ge-amount-paid-error' : 'ge-amount-paid-hint'}
              className={inputClass}
              placeholder="e.g. 5000 (advance) — leave blank if unpaid"
            />
            <p id="ge-amount-paid-hint" className="text-[11px] text-dark-muted mt-1">Any amount here books a seat right away. Full amount auto-closes the enquiry.</p>
            {soloErrorsVisible.amount_paid && <p id="ge-amount-paid-error" role="alert" className={errorClass}>{soloErrorsVisible.amount_paid}</p>}
          </div>
          {(Number(form.amount_paid) || 0) > 0 && (
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <MethodReferenceFields
                idPrefix="ge"
                methodLabel="Payment Method"
                value={form.payment_method}
                onChange={val => setForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
                utrValue={form.payment_utr}
                onUtrChange={val => setForm(f => ({ ...f, payment_utr: val }))}
                options={PAYMENT_METHOD_OPTIONS}
                utrPlaceholderExample="e.g. 426817XXXXXX"
                inputClassName={inputClass}
                selectSize="sm"
              />
            </div>
          )}
          <div className="col-span-2">
            <label htmlFor="ge-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea id="ge-notes" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this enquiry" />
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <Button variant="outline" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="md"
          className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
          onClick={() => {
            if (convertingWaitlist && convertingWaitlist.slots > 1) {
              setTouchedPeople(prev => {
                const next = new Set(prev);
                waitlistPeople.forEach((_, i) => {
                  next.add(`${i}:full_name`); next.add(`${i}:phone`); next.add(`${i}:email`);
                  next.add(`${i}:city`); next.add(`${i}:age`); next.add(`${i}:amount_paid`);
                });
                return next;
              });
            } else {
              setTouched(new Set(['full_name', 'phone', 'email', 'city', 'age', 'amount_paid']));
            }
            onSave();
          }}
          loading={saving}
          disabled={convertingWaitlist && convertingWaitlist.slots > 1 ? hasGroupErrors : hasSoloErrors}
          title={(convertingWaitlist && convertingWaitlist.slots > 1 ? hasGroupErrors : hasSoloErrors) ? 'Fix the highlighted fields before saving' : undefined}
        >
          {convertingWaitlist
            ? convertingWaitlist.slots > 1
              ? `Convert ${convertingWaitlist.slots} & Save`
              : 'Convert & Save'
            : 'Save Enquiry'}
        </Button>
      </div>
    </Modal>
  );
}
