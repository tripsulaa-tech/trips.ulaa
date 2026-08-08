import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, PartyPopper, Users } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import { useConfirm } from '../../components/ui/useConfirm';
import { parseNonNegative, PACKAGE_OPTIONS, FOOD_PREFERENCE_OPTIONS, PAYMENT_METHOD_OPTIONS } from '../enquiryShared';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { inputClass, type EnquiryForm, type WaitlistPersonForm } from './adminEnquiriesShared';
import { SOURCE_OPTIONS } from './adminEnquiriesShared';

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
  const isDirty = form.full_name.trim() !== '' || form.phone.trim() !== '' || (form.amount_paid !== '' && Number(form.amount_paid) > 0);

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
          <PartyPopper size={16} className="shrink-0 mt-0.5" />
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
              <label className="block text-sm font-medium text-dark mb-1">Trip</label>
              <Select
                value={form.trip_id}
                onChange={val => {
                  setForm(f => ({ ...f, trip_id: val }));
                  applySuggestedAmount(val, form.package_type);
                }}
                options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Package</label>
              <Select
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
              <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹) <span className="text-dark-muted font-normal">— per person</span></label>
              <input
                type="number"
                min={0}
                value={form.total_amount}
                onChange={e => setForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
                className={inputClass}
                placeholder="e.g. 15000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
              <Select
                value={form.source}
                onChange={val => setForm(f => ({ ...f, source: val as Enquiry['source'] }))}
                options={SOURCE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Payment Method <span className="text-dark-muted font-normal">— for everyone's advance</span></label>
              <Select
                value={form.payment_method}
                onChange={val => setForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
                options={PAYMENT_METHOD_OPTIONS}
                placeholder="Select method"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">UTR / Reference</label>
              <input
                type="text"
                value={form.payment_utr}
                disabled={form.payment_method === 'Cash'}
                onChange={e => setForm(f => ({ ...f, payment_utr: e.target.value }))}
                className={`${inputClass} ${form.payment_method === 'Cash' ? 'opacity-60 cursor-not-allowed' : ''}`}
                placeholder={form.payment_method === 'Cash' ? 'N/A for cash' : 'e.g. 426817XXXXXX'}
              />
            </div>
          </div>

          {/* One card per seat being filled this pass */}
          <div className="space-y-4">
            {waitlistPeople.map((p, i) => (
              <div key={i} className="border-2 border-background-warm rounded-md p-3">
                <p className="text-xs font-button font-semibold text-dark-muted mb-2 flex items-center gap-1.5">
                  <Users size={12} /> Seat {convertingWaitlist.groupSeq + i} of {convertingWaitlist.groupSize}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-dark mb-1">Full Name *</label>
                    <input value={p.full_name} onChange={e => updateWaitlistPerson(i, { full_name: e.target.value })} className={inputClass} placeholder="e.g. Priya Sharma" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">Phone *</label>
                    <input value={p.phone} onChange={e => updateWaitlistPerson(i, { phone: e.target.value })} className={inputClass} placeholder="e.g. 98765 43210" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">Email</label>
                    <input value={p.email} onChange={e => updateWaitlistPerson(i, { email: e.target.value })} className={inputClass} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">Age</label>
                    <input type="number" min={0} value={p.age} onChange={e => updateWaitlistPerson(i, { age: e.target.value === '' ? '' : +e.target.value })} className={inputClass} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">Food Preference</label>
                    <Select
                      value={p.food_preference}
                      onChange={val => updateWaitlistPerson(i, { food_preference: val as WaitlistPersonForm['food_preference'] })}
                      options={FOOD_PREFERENCE_OPTIONS}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-dark mb-1">Amount Paid (₹) *</label>
                    <input
                      type="number"
                      min={0}
                      value={p.amount_paid}
                      onChange={e => updateWaitlistPerson(i, { amount_paid: parseNonNegative(e.target.value) })}
                      className={inputClass}
                      placeholder="e.g. 5000 (advance)"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this group" />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Full Name *</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputClass} placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Phone *</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} placeholder="e.g. 98765 43210" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Email</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>

          {/* Possible-duplicate soft warning (3.5) — fuzzy phone/email
              match against every enquiry already in the system, not just
              this trip. Advisory only; doesn't block Save. */}
          {possibleDuplicates.length > 0 && (
            <div className="md:col-span-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 text-amber-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
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
            <label className="block text-sm font-medium text-dark mb-1">Age</label>
            <input type="number" min={0} value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value === '' ? '' : +e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">City</label>
            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputClass} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
            <Select
              value={form.source}
              onChange={val => setForm(f => ({ ...f, source: val as Enquiry['source'] }))}
              options={SOURCE_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Food Preference</label>
            <Select
              value={form.food_preference}
              onChange={val => setForm(f => ({ ...f, food_preference: val as EnquiryForm['food_preference'] }))}
              options={FOOD_PREFERENCE_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Trip</label>
            <Select
              value={form.trip_id}
              onChange={val => {
                setForm(f => ({ ...f, trip_id: val }));
                applySuggestedAmount(val, form.package_type);
              }}
              options={[{ value: '', label: '— No specific trip —' }, ...trips.map(t => ({ value: t.id, label: t.title }))]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Package</label>
            <Select
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
            <label className="block text-sm font-medium text-dark mb-1">Total Amount (₹)</label>
            <input
              type="number"
              min={0}
              value={form.total_amount}
              onChange={e => setForm(f => ({ ...f, total_amount: parseNonNegative(e.target.value) }))}
              className={inputClass}
              placeholder="e.g. 15000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
            <input
              type="number"
              min={0}
              value={form.amount_paid}
              onChange={e => setForm(f => ({ ...f, amount_paid: parseNonNegative(e.target.value) }))}
              className={inputClass}
              placeholder="e.g. 5000 (advance) — leave blank if unpaid"
            />
            <p className="text-[11px] text-dark-muted mt-1">Any amount here books a seat right away. Full amount auto-closes the enquiry.</p>
          </div>
          {(Number(form.amount_paid) || 0) > 0 && (
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Payment Method</label>
                <Select
                  value={form.payment_method}
                  onChange={val => setForm(f => ({ ...f, payment_method: val, payment_utr: val === 'Cash' ? '' : f.payment_utr }))}
                  options={PAYMENT_METHOD_OPTIONS}
                  placeholder="Select method"
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">UTR / Reference</label>
                <input
                  type="text"
                  value={form.payment_utr}
                  disabled={form.payment_method === 'Cash'}
                  onChange={e => setForm(f => ({ ...f, payment_utr: e.target.value }))}
                  className={`${inputClass} ${form.payment_method === 'Cash' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  placeholder={form.payment_method === 'Cash' ? 'N/A for cash' : 'e.g. 426817XXXXXX'}
                />
              </div>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-dark mb-1">Notes</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className={`${inputClass} resize-none`} placeholder="Anything worth remembering about this enquiry" />
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onSave} loading={saving}>
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
