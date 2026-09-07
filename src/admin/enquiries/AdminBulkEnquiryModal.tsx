import type { Dispatch, SetStateAction } from 'react';
import { Info } from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import type { UpcomingTrip } from '../../types/types-index';
import { inputClass, SOURCE_OPTIONS } from './AdminEnquiriesShared';
import type { BulkEnquiryForm } from './useBulkEnquiry';

export default function BulkEnquiryModal({
  isOpen,
  onClose,
  form,
  setForm,
  activeTrips,
  names,
  onSave,
  saving,
}: {
  isOpen: boolean;
  onClose: () => void;
  form: BulkEnquiryForm;
  setForm: Dispatch<SetStateAction<BulkEnquiryForm>>;
  activeTrips: UpcomingTrip[];
  names: string[];
  onSave: () => void;
  saving: boolean;
}) {
  const canSave = !!form.trip_id && names.length > 0 && !saving;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Enquiry" size="md">
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5 mb-4 text-sm text-blue-800">
        <Info size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Log a whole batch of leads — e.g. everyone who commented "interested" on a post — against one trip and one
          source in a single pass. Each name becomes its own enquiry; phone/email/payment can be filled in later from
          that person's row.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="bulk-trip" className="block text-sm font-medium text-dark mb-1">Trip *</label>
          <Select
            inputId="bulk-trip"
            value={form.trip_id}
            onChange={val => setForm(f => ({ ...f, trip_id: val }))}
            options={[{ value: '', label: activeTrips.length ? 'Select a trip' : 'No active trips available' }, ...activeTrips.map(t => ({ value: t.id, label: t.title }))]}
            placeholder="Select a trip"
          />
          <p className="text-[11px] text-dark-muted mt-1">Only published and coming-soon trips are shown.</p>
        </div>

        <div>
          <label htmlFor="bulk-source" className="block text-sm font-medium text-dark mb-1">How did they reach out? *</label>
          <Select
            inputId="bulk-source"
            value={form.source}
            onChange={val => setForm(f => ({ ...f, source: val as BulkEnquiryForm['source'] }))}
            options={SOURCE_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="bulk-names" className="block text-sm font-medium text-dark mb-1">Names — one per line *</label>
          <textarea
            id="bulk-names"
            value={form.namesText}
            onChange={e => setForm(f => ({ ...f, namesText: e.target.value }))}
            rows={10}
            className={`${inputClass} resize-none font-mono text-sm`}
            placeholder={'Meena Athithan\nPriya\nDhruv\n...'}
          />
          <p className="text-[11px] text-dark-muted mt-1">
            {names.length === 0
              ? 'Paste or type names, one per line.'
              : `${names.length} name${names.length === 1 ? '' : 's'} detected.`}
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
          title={!canSave && !saving ? 'Pick a trip and enter at least one name' : undefined}
        >
          {names.length > 0 ? `Add ${names.length} Enquir${names.length === 1 ? 'y' : 'ies'}` : 'Add Enquiries'}
        </Button>
      </div>
    </Modal>
  );
}
