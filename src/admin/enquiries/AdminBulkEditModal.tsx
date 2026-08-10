import type { Dispatch, SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import type { Enquiry } from '../../types/types-index';
import {
  BULK_NO_CHANGE, BULK_FOOD_OPTIONS, BULK_PACKAGE_OPTIONS, BULK_STATUS_OPTIONS,
  inputClass, validateBulkEditForm,
} from './AdminEnquiriesShared';
import type { BulkEditForm } from './AdminEnquiriesShared';
import { parseNonNegative } from './AdminEnquiryCommon';

export default function BulkEditModal({
  isOpen,
  onClose,
  selectedCount,
  selectedTripName,
  targets,
  bulkForm,
  setBulkForm,
  activeGroupTripId,
  getTripPrice,
  onSave,
  bulkSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  selectedTripName: string | null;
  // The actual selected rows, only needed to check each one's total_amount
  // fallback for the "amount paid can't exceed total" rule live — see
  // validateBulkEditForm.
  targets: Enquiry[];
  bulkForm: BulkEditForm;
  setBulkForm: Dispatch<SetStateAction<BulkEditForm>>;
  activeGroupTripId: string | undefined;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
  onSave: () => void;
  bulkSaving: boolean;
}) {
  const errorClass = 'text-red-500 text-xs mt-1';
  // Live version of handleBulkSave's two save-time checks — recomputed on
  // every render so "nothing changed yet" / "this would overpay someone"
  // show up as the admin fills the form, instead of only behind an
  // alert() after Bulk Save.
  const { hasChanges, overpaid } = validateBulkEditForm(bulkForm, targets);
  const hasBulkErrors = !hasChanges || !!overpaid;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Bulk Edit — ${selectedCount} selected`} size="sm">
      <div className="space-y-4">
        {selectedTripName && (
          <p className="text-xs font-medium text-primary bg-primary/10 rounded-md px-3 py-2">
            Trip: {selectedTripName}
          </p>
        )}
        <p className="text-xs text-dark-muted bg-background-warm rounded-md px-3 py-2">
          Only fields you change here are applied — anything left on "No change" is left exactly as it is for every selected enquiry.
        </p>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Food Preference</label>
          <Select
            value={bulkForm.food_preference}
            onChange={val => setBulkForm(f => ({ ...f, food_preference: val as BulkEditForm['food_preference'] }))}
            options={BULK_FOOD_OPTIONS}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Package</label>
          <Select
            value={bulkForm.package_type}
            onChange={val => {
              const packageType = val as BulkEditForm['package_type'];
              // Mirrors the single-row Track Payment modal: picking a
              // package pulls in that package's configured trip price as
              // the suggested Total Amount, so picking "Normal Price"
              // actually sets a price instead of just relabeling the row.
              const suggested = packageType !== BULK_NO_CHANGE && activeGroupTripId
                ? getTripPrice(activeGroupTripId, packageType)
                : undefined;
              setBulkForm(f => ({
                ...f,
                package_type: packageType,
                total_amount: suggested ?? f.total_amount,
              }));
            }}
            options={BULK_PACKAGE_OPTIONS}
          />
          {bulkForm.package_type !== BULK_NO_CHANGE && !activeGroupTripId && (
            <p className="text-amber-600 text-[11px] mt-1">
              These enquiries aren't linked to a trip, so there's no configured price to pull in — enter the amount manually below.
            </p>
          )}
          {bulkForm.package_type !== BULK_NO_CHANGE && activeGroupTripId && getTripPrice(activeGroupTripId, bulkForm.package_type) == null && (
            <p className="text-amber-600 text-[11px] mt-1">
              This trip's price for this package isn't set yet — enter the amount manually below, or add it under Upcoming Trips first.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Enter Money — Total Amount (₹)</label>
          <input
            type="number"
            min={0}
            value={bulkForm.total_amount}
            onChange={ev => setBulkForm(f => ({ ...f, total_amount: parseNonNegative(ev.target.value) }))}
            className={inputClass}
            placeholder="Leave blank to leave unchanged"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
          <input
            type="number"
            min={0}
            value={bulkForm.amount_paid}
            onChange={ev => setBulkForm(f => ({ ...f, amount_paid: parseNonNegative(ev.target.value) }))}
            className={inputClass}
            placeholder="Leave blank to leave unchanged"
          />
          <p className="text-[11px] text-dark-muted mt-1">
            Sets what's been collected so far for every selected enquiry, as a new total — not added on top of what's already recorded. Leave blank to leave each one's amount paid as-is.
          </p>
          {overpaid && (
            <p className={errorClass}>
              Amount paid can't exceed the total amount — this would overpay {overpaid.full_name}. Adjust the amount or set a matching total amount for the selection.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Status</label>
          <Select
            value={bulkForm.status}
            onChange={val => setBulkForm(f => ({ ...f, status: val as BulkEditForm['status'] }))}
            options={BULK_STATUS_OPTIONS}
          />
          {bulkForm.status === 'contacted' && (
            <p className="text-[11px] text-dark-muted mt-1">
              The Payment popup only appears for single-record updates, so it won't open here.
            </p>
          )}
        </div>

        {!hasChanges && (
          <p className={errorClass}>Pick at least one field to change before saving — everything is still set to "No change".</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
            onClick={onSave}
            loading={bulkSaving}
            disabled={hasBulkErrors}
            title={hasBulkErrors ? 'Fix the highlighted fields before saving' : undefined}
          >
            Bulk Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
