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
import { parseNonNegative, PACKAGE_OPTIONS, FOOD_PREFERENCE_OPTIONS, PAYMENT_METHOD_OPTIONS } from './AdminEnquiryCommon';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { inputClass, validateEnquiryForm, validateWaitlistPersonForm, type EnquiryForm, type WaitlistPersonForm } from './AdminEnquiriesShared';
import { SOURCE_OPTIONS } from './AdminEnquiriesShared';

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
  possibleDuplicates: Enquiry[];
  applySuggestedAmount: (tripId: string, packageType: Enquiry['package_type']) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const confirm = useConfirm();
  const errorClass = 'text-red-500 text-xs mt-1';
  const isDirty = form.full_name.trim() !== '' || form.phone.trim() !== '' || (form.amount_paid !== '' && Number(form.amount_paid) > 0);

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
  const soloErrors = validateEnquiryForm(form, !!convertingWaitlist);
  const soloErrorsVisible = {
    full_name: touched.has('full_name') ? soloErrors.full_name : undefined,
    phone: touched.has('phone') ? soloErrors.phone : undefined,
    amount_paid: touched.has('amount_paid') ? soloErrors.amount_paid : undefined,
  };
  const hasSoloErrors = Object.keys(soloErrors).length > 0;

  // Same, per row, for the group (multi-seat waitlist conversion) form.
  const groupErrors = waitlistPeople.map(p => validateWaitlistPersonForm(p, form.total_amount));
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
                options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
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
              <label htmlFor="ge-g-source" className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
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
                  <div>
                    <label htmlFor={`ge-p-email-${i}`} className="block text-xs font-medium text-dark mb-1">Email</label>
                    <input id={`ge-p-email-${i}`} value={p.email} onChange={e => updateWaitlistPerson(i, { email: e.target.value })} className={inputClass} placeholder="Optional" />
                  </div>
                  <div>
                    <label htmlFor={`ge-p-age-${i}`} className="block text-xs font-medium text-dark mb-1">Age</label>
                    <input id={`ge-p-age-${i}`} type="number" min={0} value={p.age} onChange={e => updateWaitlistPerson(i, { age: e.target.value === '' ? '' : +e.target.value })} className={inputClass} placeholder="Optional" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
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
          <div>
            <label htmlFor="ge-email" className="block text-sm font-medium text-dark mb-1">Email</label>
            <input id="ge-email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>

          {/* Possible-duplicate soft warning (3.5) — fuzzy phone/email
              match against every enquiry already in the system, not just
              this trip. Advisory only; doesn't block Save. */}
          {possibleDuplicates.length > 0 && (
            <div className="md:col-span-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 text-amber-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Possible duplicate{possibleDuplicates.length > 1 ? 's' : ''} — {possibleDuplicates.length === 1 ? 'someone' : `${possibleDuplicates.length} people`} already in the system {possibleDuplicates.length === 1 ? 'shares' : 'share'} this phone or email
                </p>
                <p className="text-xs mt-0.5 text-amber-700">Double-check this isn't the same traveler before saving a new entry.</p>
                <ul className="mt-1.5 space-y-1">
                  {possibleDuplicates.slice(0, 5).map(d => (
                    <li key={d.id} className="text-xs flex items-center gap-1 flex-wrap">
                      <span className="font-medium">{d.full_name}</span>
                      <span className="text-amber-700/80">
                        — {d.trip_title || 'No trip linked'} · {d.status}{d.cancelled_at ? ' · cancelled' : ''}
                      </span>
                    </li>
                  ))}
                  {possibleDuplicates.length > 5 && (
                    <li className="text-xs text-amber-700/80">+ {possibleDuplicates.length - 5} more</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="ge-age" className="block text-sm font-medium text-dark mb-1">Age</label>
            <input id="ge-age" type="number" min={0} value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value === '' ? '' : +e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label htmlFor="ge-city" className="block text-sm font-medium text-dark mb-1">City</label>
            <input id="ge-city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label htmlFor="ge-source" className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
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
              options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
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
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
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
          <div className="md:col-span-2">
            <label htmlFor="ge-notes" className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea id="ge-notes" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this enquiry" />
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="md"
          className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
          onClick={() => {
            if (convertingWaitlist && convertingWaitlist.slots > 1) {
              setTouchedPeople(prev => {
                const next = new Set(prev);
                waitlistPeople.forEach((_, i) => { next.add(`${i}:full_name`); next.add(`${i}:phone`); next.add(`${i}:amount_paid`); });
                return next;
              });
            } else {
              setTouched(new Set(['full_name', 'phone', 'amount_paid']));
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
