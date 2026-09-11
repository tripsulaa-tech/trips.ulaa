import type { Dispatch, SetStateAction } from 'react';
import { Info } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import type { CompletedTrip, UpcomingTrip } from '../../types/types-index';
import { inputClass, SOURCE_OPTIONS } from './AdminEnquiriesShared';
import { OTHER_TRIP_VALUE } from './useBulkEnquiry';
import type { BulkEnquiryEntry, BulkEnquiryForm } from './useBulkEnquiry';
import { formatBatchLabel, formatDate } from '../../utils/utils-index';

export default function BulkEnquiryModal({
  isOpen,
  onClose,
  form,
  setForm,
  activeTrips,
  pastTrips,
  entries,
  onSave,
  saving,
}: {
  isOpen: boolean;
  onClose: () => void;
  form: BulkEnquiryForm;
  setForm: Dispatch<SetStateAction<BulkEnquiryForm>>;
  activeTrips: UpcomingTrip[];
  pastTrips: CompletedTrip[];
  entries: BulkEnquiryEntry[];
  onSave: () => void;
  saving: boolean;
}) {
  const isOtherTrip = form.trip_id === OTHER_TRIP_VALUE;
  const canSave = !!form.trip_id && (!isOtherTrip || !!form.otherTripTitle.trim()) && entries.length > 0 && !saving;
  const withPhone = entries.filter(e => e.phone.trim()).length;

  // The same trip can run more than once (e.g. "Sri Lanka: Girls-Only
  // Luxury Escape" as Batch 1 and Batch 2), each its own completed_trips
  // row with the same title — so the title alone can't tell two options
  // in the dropdown apart. Append the batch when it's set; if it isn't
  // (or two rows still share the exact same title+batch), fall back to
  // the trip date so every option stays distinguishable.
  const pastTripLabel = (trip: CompletedTrip): string => {
    if (trip.batch?.trim()) return `${trip.title} \u2014 ${formatBatchLabel(trip.batch)} (Completed)`;
    const sameTitle = pastTrips.filter(t => t.title === trip.title);
    if (sameTitle.length > 1) return `${trip.title} \u2014 ${formatDate(trip.trip_date, { month: 'short' })} (Completed)`;
    return `${trip.title} (Completed)`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Enquiry" size="md">
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 mb-4 text-sm text-blue-800">
        <Info size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Log a whole batch of leads — e.g. everyone who commented "interested" on a post, or a backlog of old
          contacts this app never had a record of — against one trip and one source in a single pass. Add a phone
          number per person and they show up in the Contact Book right away.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="bulk-trip" className="block text-sm font-medium text-dark mb-1">Trip *</label>
          <Select
            inputId="bulk-trip"
            value={form.trip_id}
            onChange={val => setForm(f => ({ ...f, trip_id: val }))}
            options={[
              { value: '', label: (activeTrips.length || pastTrips.length) ? 'Select a trip' : 'No trips available' },
              ...activeTrips.map(t => ({ value: t.id, label: t.title })),
              ...pastTrips.map(t => ({ value: t.id, label: pastTripLabel(t) })),
              { value: OTHER_TRIP_VALUE, label: 'Other / past trip\u2026' },
            ]}
            placeholder="Select a trip"
          />
          <p className="text-[11px] text-dark-muted mt-1">
            {isOtherTrip
              ? "For a trip with no record anywhere in the app — name it below."
              : 'Active trips and trips with a Completed Trips album are listed above. Pick "Other / past trip" only if it\u2019s not in either.'}
          </p>
        </div>

        {isOtherTrip && (
          <div>
            <label htmlFor="bulk-other-trip" className="block text-sm font-medium text-dark mb-1">Past Trip Name *</label>
            <input
              id="bulk-other-trip"
              type="text"
              value={form.otherTripTitle}
              onChange={e => setForm(f => ({ ...f, otherTripTitle: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Goa Beach Escape 2024"
            />
          </div>
        )}

        <div>
          <label htmlFor="bulk-source" className="block text-sm font-medium text-dark mb-1">Source *</label>
          <Select
            inputId="bulk-source"
            value={form.source}
            onChange={val => setForm(f => ({ ...f, source: val as BulkEnquiryForm['source'] }))}
            options={SOURCE_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="bulk-names" className="block text-sm font-medium text-dark mb-1">People — one per line *</label>
          <textarea
            id="bulk-names"
            value={form.namesText}
            onChange={e => setForm(f => ({ ...f, namesText: e.target.value }))}
            rows={10}
            className={`${inputClass} resize-none font-mono text-sm`}
            placeholder={'Meena Athithan, 9876543210\nPriya, 9123456780, priya@example.com\nDhruv\n...'}
          />
          <p className="text-[11px] text-dark-muted mt-1">
            {entries.length === 0
              ? 'Just a name works fine, or add a phone (and email) after a comma — e.g. "Priya, 9876543210" — so they show up in the Contact Book too.'
              : `${entries.length} ${entries.length === 1 ? 'person' : 'people'} detected${withPhone > 0 ? `, ${withPhone} with a phone number` : ''}.`}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <Button variant="outline" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
          onClick={onSave}
          loading={saving}
          disabled={!canSave}
          title={!canSave && !saving ? 'Pick a trip, name it if it\u2019s a past trip, and enter at least one person' : undefined}
        >
          {entries.length > 0 ? `Add ${entries.length} Enquir${entries.length === 1 ? 'y' : 'ies'}` : 'Add Enquiries'}
        </Button>
      </div>
    </Modal>
  );
}
